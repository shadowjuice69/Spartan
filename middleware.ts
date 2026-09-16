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

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const response = await updateSession(request)

  if (response.redirected || path === '/login' || path.startsWith('/auth')) return response

  const discordUserId = response.headers.get('x-spartan-discord-id')
  const authUserId = response.headers.get('x-spartan-auth-user-id')

  if (PUBLIC_PATHS.has(path)) return response

  if (!authUserId) return login(request)

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
  } catch {
    return deny(request, 'security')
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
