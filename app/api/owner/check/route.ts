import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { canAccessOwnerConsole, extractDiscordId, isOwner, resolveDashboardIdentity } from '@/lib/spartan/security'

export async function GET() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Match the public-key fallback used by the owner accounts API and the
  // current Supabase publishable-key naming convention.
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ owner: false, error: 'Supabase public configuration is unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  const identity = user ? await resolveDashboardIdentity(user.id, extractDiscordId(user)) : null
  const discordId = identity?.discordUserId ?? extractDiscordId(user)
  return Response.json(
    { owner: canAccessOwnerConsole(discordId), primaryOwner: isOwner(discordId) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
