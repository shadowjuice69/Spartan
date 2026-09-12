import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authorizeDashboard, extractDiscordId } from '@/lib/spartan/security'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!code) return NextResponse.redirect(new URL('/login?error=oauth', request.url))

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=oauth', request.url))

  const { data } = await supabase.auth.getUser()
  const discordId = extractDiscordId(data.user)
  if (!discordId) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=discord-required', request.url))
  }

  // Record and authorize the dashboard connection immediately after Discord
  // authentication. This is the authoritative IP/session checkpoint.
  const security = await authorizeDashboard(request, discordId)
  if (!security.allowed) {
    return NextResponse.redirect(new URL(`/access-denied?reason=${encodeURIComponent(security.reason ?? 'security')}`, request.url))
  }

  return NextResponse.redirect(new URL('/', request.url))
}
