import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export type StewardSnapshot = {
  generation: number
  captured_at: string | null
  source: string | null
  status: string
  snapshot: Record<string, unknown>
  published_for: Record<string, unknown>
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan steward bus is not configured.')
  return createSupabaseAdmin(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Read the single published steward snapshot. Consumers should use this
 * instead of independently scanning the raw capture/data-flow tables.
 */
export async function getStewardSnapshot(): Promise<StewardSnapshot | null> {
  const db = adminClient()
  const { data, error } = await db.rpc('get_spartan_steward_snapshot')
  if (error) throw error
  if (!data) return null
  return data as StewardSnapshot
}

/**
 * Returns true when the shared bus contains a usable published snapshot.
 */
export function isReadyStewardSnapshot(snapshot: StewardSnapshot | null): snapshot is StewardSnapshot {
  return Boolean(snapshot && snapshot.status === 'ready' && snapshot.snapshot && typeof snapshot.snapshot === 'object')
}
