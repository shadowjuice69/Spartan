import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { authorizeDashboardForAuthUser } from '@/lib/spartan/security'

const PUBLIC_PATHS = new Set(['/access-denied', '/wiki'])

function deny(request: NextRequest, reason: string) {
  // API callers need structured errors; browser navigation keeps its redirect.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const unavailable = reason === 'system_error'
    return NextResponse.json(
      {
        error: unavailable ? 'Service temporarily unavailable' : 'Access denied',
        code: unavailable ? 'SYSTEM_ERROR' : 'ACCESS_DENIED',
        reason,
      },
      { status: unavailable ? 503 : 403, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const url = request.nextUrl.clone()
  url.pathname = '/access-denied'
  url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}

function login(request: NextRequest, reason = 'discord-required') {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const stewardKey = request.headers.get('x-spartan-steward-key')

  // Capture ingestion and the internal Storage Steward both authenticate with
  // their own header-based secret. They do not have a Supabase browser session,
  // so the dashboard auth/session redirect must not intercept these requests.
  if (path.startsWith('/api/capture')) return NextResponse.next()
  // UtopiaIntel authenticates with UTOPIA_INTEL_KEY inside its route, not a browser session.
  if (path === '/api/intel') return NextResponse.next()
  if (path === '/api/internal-storage/process' && stewardKey && stewardKey === process.env.SPARTAN_STEWARD_KEY) {
    return NextResponse.next()
  }

  const response = await updateSession(request)

  if (response.redirected || path === '/login' || path.startsWith('/auth')) return response

  const discordUserId = response.headers.get('x-spartan-discord-id')
  const authUserId = response.headers.get('x-spartan-auth-user-id')

  if (PUBLIC_PATHS.has(path)) return response

  // API callers must receive a machine-readable auth failure, never an HTML
  // login redirect. A redirect here makes fetch('/api/...').json() fail and
  // leaves every dashboard page looking empty instead of showing the real
  // authentication problem. Browser navigation still gets the normal login UI.
  if (!authUserId && path.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  if (!authUserId) return login(request)

  // Build Library APIs authenticate against the Spartan account themselves.
  // Do not run the browser IP/reputation gate a second time on these API
  // requests: a denied API request can otherwise become an HTML redirect and
  // make a valid Build Library look empty to fetch().
  if (path.startsWith('/api/builds')) return response

  // The Supabase auth user is the durable session identity. Discord metadata is
  // useful for authorization, but provider/session refreshes can legitimately
  // omit it. Resolve the stored Spartan account by auth_user_id first, then use
  // its canonical Discord ID for access checks.
  try {
    const security = await authorizeDashboardForAuthUser(request, authUserId, discordUserId)
    if (!security.allowed) return deny(request, security.reason ?? 'security')
    response.headers.set('x-spartan-role', security.access?.role ?? (security.protectedIdentity ? 'protected' : 'member'))
    response.headers.set('x-spartan-access', 'active')
    return response
  } catch (error) {
    // A failure here is a system problem (database unreachable, misconfiguration), not a decision
    // about this user. Log the real cause and show a distinct reason instead of "not authorized".
    console.error('[SPARTAN PROXY] access check failed:', error instanceof Error ? error.message : error)
    return deny(request, 'system_error')
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
