import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { authorizeDashboard } from '@/lib/spartan/security'

const PUBLIC_PATHS = new Set(['/','/access-denied'])

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const response = await updateSession(request)

  if (response.redirected || path === '/login' || path.startsWith('/auth')) return response

  // The command landing page is always visible. It is the public Spartan shell.
  // Everything beyond it is protected by the registered Discord identity.
  if (PUBLIC_PATHS.has(path)) {
    const discordUserId = response.headers.get('x-spartan-discord-id')
    if (!discordUserId) return response
    try {
      const security = await authorizeDashboard(request, discordUserId)
      response.headers.set('x-spartan-access', security.allowed ? 'active' : 'denied')
      response.headers.set('x-spartan-role', security.access?.role ?? (security.protectedIdentity ? 'protected' : 'member'))
    } catch {
      response.headers.set('x-spartan-access', 'denied')
    }
    return response
  }

  const discordUserId = response.headers.get('x-spartan-discord-id')
  if (!discordUserId) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'discord-required')
    return NextResponse.redirect(url)
  }

  try {
    const security = await authorizeDashboard(request, discordUserId)
    if (!security.allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/access-denied'
      return NextResponse.redirect(url)
    }

    response.headers.set('x-spartan-role', security.access?.role ?? (security.protectedIdentity ? 'protected' : 'member'))
    response.headers.set('x-spartan-access', 'active')
    return response
  } catch {
    const url = request.nextUrl.clone()
    url.pathname = '/access-denied'
    url.searchParams.set('error', 'security')
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
