import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { authorizeDashboardForAuthUser } from '@/lib/spartan/security'

const PUBLIC_PATHS = new Set(['/access-denied'])

function deny(request: NextRequest, reason: string) {
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
  const response = await updateSession(request)

  // API routes authenticate themselves with the Supabase session inside each
  // handler. Do not run the full IPinfo/security audit on every polling request
  // (history, Jeeves, command data, etc.). That would turn a 15-second dashboard
  // refresh into repeated external reputation checks and security-event writes.
  if (response.redirected || path === '/login' || path.startsWith('/auth') || path.startsWith('/api/')) return response

  const discordUserId = response.headers.get('x-spartan-discord-id')
  const authUserId = response.headers.get('x-spartan-auth-user-id')

  if (PUBLIC_PATHS.has(path)) return response
  if (!authUserId) return login(request)

  // Page navigation gets the full security checkpoint once. The Supabase auth
  // user is the durable identity; Discord metadata is supplemental.
  try {
    const security = await authorizeDashboardForAuthUser(request, authUserId, discordUserId)
    if (!security.allowed) return deny(request, security.reason ?? 'security')
    response.headers.set('x-spartan-role', security.access?.role ?? (security.protectedIdentity ? 'protected' : 'member'))
    response.headers.set('x-spartan-access', 'active')
    return response
  } catch {
    return deny(request, 'security')
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
