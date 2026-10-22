import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { processStorageQueue } from '@/lib/spartan/internal-storage'
import { isOwner, isTrustedAdmin } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

async function authorized(request: Request) {
  const key = process.env.SPARTAN_STEWARD_KEY
  if (key && request.headers.get('x-spartan-steward-key') === key) return { ok: true, db: createServiceClient() }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  const { data: account } = await db.from('spartan_accounts').select('discord_user_id,role').eq('auth_user_id', user.id).maybeSingle()
  const discordId = account?.discord_user_id ? String(account.discord_user_id) : null
  const role = String(account?.role ?? '')
  const ok = isOwner(discordId) || isTrustedAdmin(discordId) || ['owner', 'admin', 'jeeves', 'steward'].includes(role)
  return ok ? { ok: true, db } : { ok: false as const }
}

export async function POST(request: Request) {
  const auth = await authorized(request)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({})) as { limit?: number; captureId?: string }
  const captureId = typeof body.captureId === 'string' ? body.captureId.trim() : ''
  try {
    const result = await processStorageQueue(auth.db, body.limit, captureId || undefined)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
