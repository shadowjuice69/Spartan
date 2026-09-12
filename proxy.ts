import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { authorizeDashboard } from '@/lib/spartan/security'

const PUBLIC_PATHS = new Set(['/access-denied'])

function deny(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone()
  url.pathname = '/access-denied'
  url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const response = await updateSession(request)

  if (response.redirected || path === '/login' || path.startsWith('/auth')) return response

  const discordUserId = response.headers.get('x-spartan-discord-id')

  // The command root is protected too. Discord OAuth must complete before the
  // command shell can be viewed; the OAuth callback performs the first
  // authoritative IP/session checkpoint.
  if (path === '/') {
    if (!discordUserId) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'discord-required')
      return NextResponse.redirect(url)
    }

    try {
      const security = await authorizeDashboard(request, discordUserId)
      if (!security.allowed) return deny(request, security.reason ?? 'security')
      response.headers.set('x-spartan-role', security.access?.role ?? (security.protectedIdentity ? 'protected' : 'member'))
      response.headers.set('x-spartan-access', 'active')
      return response
    } catch {
      return deny(request, 'security')
    }
  }

  if (PUBLIC_PATHS.has(path)) return response

  if (!discordUserId) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'discord-required')
    return NextResponse.redirect(url)
  }

  try {
    const security = await authorizeDashboard(request, discordUserId)
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
