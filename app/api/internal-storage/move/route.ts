import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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
  const body = await request.json().catch(() => ({})) as { limit?: number }
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 25)

  const { data: vaultRows, error } = await auth.db.from('spartan_capture_vault').select('*').order('created_at', { ascending: true }).limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const moved: any[] = []
  const failed: any[] = []
  for (const vault of vaultRows ?? []) {
    const captureId = vault.capture_id || `vault-${vault.id}`
    try {
      const result = await auth.db.from('spartan_internal_storage').upsert({
        capture_id: captureId,
        source_vault_id: vault.id,
        user_id: vault.user_id,
        province_id: vault.province_id,
        kingdom_id: vault.kingdom_id,
        captured_at: vault.captured_at,
        source: vault.source,
        source_id: vault.source_id,
        url: vault.url,
        scraper_page_kind: vault.page_kind,
        raw_text: vault.raw_text,
        raw_payload: vault.raw_payload,
        parsed_payload: vault.parsed_payload,
        content_hash: vault.content_hash,
        processing_status: 'stored',
        steward_status: 'awaiting_processing',
        processing_attempts: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'capture_id' }).select('id,capture_id').single()
      if (result.error) throw new Error(result.error.message)
      moved.push({ captureId, sourceVaultId: vault.id, internalStorageId: result.data.id })
    } catch (error) {
      failed.push({ sourceVaultId: vault.id, captureId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  return NextResponse.json({ ok: true, requested: limit, moved: moved.length, failed: failed.length, results: moved, failures: failed })
}
