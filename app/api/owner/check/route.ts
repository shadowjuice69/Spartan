import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractDiscordId, isOwner, resolveDashboardIdentity } from '@/lib/spartan/security'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  const identity = user ? await resolveDashboardIdentity(user.id, extractDiscordId(user)) : null
  const discordId = identity?.discordUserId ?? extractDiscordId(user)
  return Response.json(
    { owner: isOwner(discordId) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
