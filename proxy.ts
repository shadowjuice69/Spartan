import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { authorizeDashboard } from '@/lib/spartan/security'

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)
  if (response.redirected || request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/auth')) return response

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
      url.pathname = '/login'
      url.searchParams.set('error', 'access-denied')
      return NextResponse.redirect(url)
    }

    response.headers.set('x-spartan-role', security.access?.role ?? (security.protectedIdentity ? 'protected' : 'member'))
    return response
  } catch {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'security')
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
