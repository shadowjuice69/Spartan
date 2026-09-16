import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { classifyCapture } from '@/lib/spartan/capture-classifier'
import { isOwner, isTrustedAdmin } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

function serviceAuthorized(request: Request) {
  const key = process.env.SPARTAN_STEWARD_KEY
  return Boolean(key && request.headers.get('x-spartan-steward-key') === key)
}

async function authorized(request: Request) {
  if (serviceAuthorized(request)) return { ok: true, db: createServiceClient() }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false as const }
  const db = createServiceClient()
  const { data: account } = await db.from('spartan_accounts').select('discord_user_id,role').eq('auth_user_id', user.id).maybeSingle()
  const discordId = account?.discord_user_id ? String(account.discord_user_id) : null
  const role = String(account?.role ?? '')
  const ok = isOwner(discordId) || isTrustedAdmin(discordId) || role === 'owner' || role === 'admin' || role === 'jeeves' || role === 'steward'
  return ok ? { ok: true, db } : { ok: false as const }
}

function jsonObject(value: unknown) { return value && typeof value === 'object' ? value : {} }
function numberValue(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : null }

async function processOne(db: any, vault: any) {
  const captureId = vault.capture_id || `vault-${vault.id}`
  const existing = await db.from('spartan_intel_records').select('id').eq('capture_id', captureId).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  if (!existing.data) {
    const classification = classifyCapture(vault.url, vault.raw_text, vault.page_kind)
    const capturedAt = vault.captured_at || vault.created_at || new Date().toISOString()
    const expiresAt = classification.retentionClass === 'intel_48h'
      ? new Date(new Date(capturedAt).getTime() + 48 * 60 * 60 * 1000).toISOString()
      : null

    const durable = await db.from('spartan_intel_records').insert({
      capture_id: captureId,
      source_vault_id: vault.id,
      user_id: vault.user_id,
      province_id: vault.province_id,
      kingdom_id: vault.kingdom_id,
      captured_at: capturedAt,
      source: vault.source,
      source_id: vault.source_id,
      url: vault.url,
      page_kind: classification.pageKind,
      classification_source: classification.source,
      classification_confidence: classification.confidence,
      classification_reason: classification.reason,
      age: numberValue(vault.raw_payload?.age ?? vault.parsed_payload?.age),
      game_year: numberValue(vault.raw_payload?.gameYear ?? vault.parsed_payload?.gameYear ?? vault.raw_payload?.year ?? vault.parsed_payload?.year),
      game_tick: String(vault.raw_payload?.gameTick ?? vault.parsed_payload?.gameTick ?? vault.raw_payload?.tick ?? vault.parsed_payload?.tick ?? '') || null,
      retention_class: classification.retentionClass,
      expires_at: expiresAt,
      raw_text: vault.raw_text,
      raw_payload: jsonObject(vault.raw_payload),
      parsed_payload: jsonObject(vault.parsed_payload),
      content_hash: vault.content_hash,
    }).select('id').single()
    if (durable.error) throw new Error(durable.error.message)
  }

  const audit = await db.from('spartan_steward_events').insert({
    steward_key: 'storage',
    capture_id: captureId,
    decision: 'routed_and_verified',
    confidence: 1,
    reason: 'Capture preserved losslessly in canonical Spartan Intel Storage; source vault record is safe to remove.',
    details: { sourceVaultId: vault.id, destination: 'spartan_intel_records', sourceUrl: vault.url, scraperPageKind: vault.page_kind },
  })
  if (audit.error) throw new Error(audit.error.message)

  const internal = await db.from('spartan_internal_storage').upsert({
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
    processing_status: 'processed',
    steward_status: 'verified',
    destination: 'spartan_intel_records',
    processed_at: new Date().toISOString(),
    routed_at: new Date().toISOString(),
    verified_at: new Date().toISOString(),
    source_deleted_at: new Date().toISOString(),
    source_delete_reason: 'Steward verified durable destination write',
  }, { onConflict: 'capture_id' }).select('id').single()
  if (internal.error) throw new Error(internal.error.message)

  const deleted = await db.from('spartan_capture_vault').delete().eq('id', vault.id).select('id')
  if (deleted.error) throw new Error(deleted.error.message)
  if (!deleted.data?.length) throw new Error('Vault source could not be deleted after destination verification.')

  const removedInternal = await db.from('spartan_internal_storage').delete().eq('id', internal.data.id)
  if (removedInternal.error) throw new Error(removedInternal.error.message)

  return { captureId, sourceVaultId: vault.id, destination: 'spartan_intel_records', pageKind: existing.data ? 'already_stored' : 'classified' }
}

export async function POST(request: Request) {
  const auth = await authorized(request)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { limit?: number }
  const limit = Math.min(Math.max(numberValue(body.limit) ?? 10, 1), 25)
  const db = auth.db

  const { data: vaultRows, error: vaultError } = await db
    .from('spartan_capture_vault')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (vaultError) return NextResponse.json({ error: vaultError.message }, { status: 500 })

  const results: any[] = []
  const failures: any[] = []
  for (const vault of vaultRows ?? []) {
    try {
      results.push(await processOne(db, vault))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ sourceVaultId: vault.id, captureId: vault.capture_id, error: message })
      await db.from('spartan_internal_storage').upsert({
        capture_id: vault.capture_id || `vault-${vault.id}`,
        source_vault_id: vault.id,
        user_id: vault.user_id,
        province_id: vault.province_id,
        kingdom_id: vault.kingdom_id,
        captured_at: vault.captured_at,
        source: vault.source,
        source_id: vault.source_id,
        url: vault.url,
        scraper_page_kind: vault.page_kind,
        processing_status: 'failed',
        steward_status: 'failed',
        failure_reason: message,
        failed_at: new Date().toISOString(),
      }, { onConflict: 'capture_id' })
    }
  }

  return NextResponse.json({ ok: true, requested: limit, processed: results.length, failed: failures.length, results, failures })
}
