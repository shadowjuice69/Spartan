import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { classifyCapture } from '@/lib/spartan/capture-classifier'
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

function jsonObject(value: unknown) { return value && typeof value === 'object' ? value : {} }
function numberValue(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : null }

async function processOne(db: any, item: any) {
  const claimed = await db.from('spartan_internal_storage').update({ processing_status: 'processing', steward_status: 'claimed', claimed_by: 'storage-steward', claimed_at: new Date().toISOString(), processing_attempts: Number(item.processing_attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', item.id).eq('processing_status', 'stored').select('*').maybeSingle()
  if (claimed.error) throw new Error(claimed.error.message)
  if (!claimed.data) return { skipped: true, captureId: item.capture_id, reason: 'already claimed by another Steward' }

  const work = claimed.data
  const classification = classifyCapture(work.url, work.raw_text, work.scraper_page_kind)
  const capturedAt = work.captured_at || work.created_at || new Date().toISOString()
  const expiresAt = classification.retentionClass === 'intel_48h' ? new Date(new Date(capturedAt).getTime() + 48 * 60 * 60 * 1000).toISOString() : null

  const existing = await db.from('spartan_intel_records').select('id').eq('capture_id', work.capture_id).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  if (!existing.data) {
    const durable = await db.from('spartan_intel_records').insert({
      capture_id: work.capture_id,
      source_vault_id: work.source_vault_id,
      user_id: work.user_id,
      province_id: work.province_id,
      kingdom_id: work.kingdom_id,
      captured_at: capturedAt,
      source: work.source,
      source_id: work.source_id,
      url: work.url,
      page_kind: classification.pageKind,
      classification_source: classification.source,
      classification_confidence: classification.confidence,
      classification_reason: classification.reason,
      age: numberValue(work.raw_payload?.age ?? work.parsed_payload?.age),
      game_year: numberValue(work.raw_payload?.gameYear ?? work.parsed_payload?.gameYear ?? work.raw_payload?.year ?? work.parsed_payload?.year),
      game_tick: String(work.raw_payload?.gameTick ?? work.parsed_payload?.gameTick ?? work.raw_payload?.tick ?? work.parsed_payload?.tick ?? '') || null,
      retention_class: classification.retentionClass,
      expires_at: expiresAt,
      raw_text: work.raw_text,
      raw_payload: jsonObject(work.raw_payload),
      parsed_payload: jsonObject(work.parsed_payload),
      content_hash: work.content_hash,
    }).select('id').single()
    if (durable.error) throw new Error(durable.error.message)
  }

  const verifiedAt = new Date().toISOString()
  const updated = await db.from('spartan_internal_storage').update({
    verified_page_kind: classification.pageKind,
    classification_source: classification.source,
    classification_confidence: classification.confidence,
    classification_reason: classification.reason,
    steward_status: 'verified',
    processing_status: 'processed',
    destination: 'spartan_intel_records',
    routed_at: verifiedAt,
    verified_at: verifiedAt,
    processed_at: verifiedAt,
    updated_at: verifiedAt,
  }).eq('id', work.id).select('id').maybeSingle()
  if (updated.error || !updated.data) throw new Error(updated.error?.message || 'Internal Storage verification update failed.')

  const audit = await db.from('spartan_steward_events').insert({
    steward_key: 'storage',
    capture_id: work.capture_id,
    decision: 'routed_and_verified',
    confidence: classification.confidence,
    reason: 'Canonical Intel destination verified before source deletion.',
    details: { sourceVaultId: work.source_vault_id, destination: 'spartan_intel_records', verifiedPageKind: classification.pageKind, classificationSource: classification.source, sourceUrl: work.url },
  })
  if (audit.error) throw new Error(audit.error.message)

  const deleted = await db.from('spartan_capture_vault').delete().eq('id', work.source_vault_id).select('id')
  if (deleted.error) throw new Error(deleted.error.message)
  if (!deleted.data?.length) throw new Error('Vault source could not be deleted after destination verification.')

  const removedInternal = await db.from('spartan_internal_storage').delete().eq('id', work.id)
  if (removedInternal.error) throw new Error(removedInternal.error.message)

  return { captureId: work.capture_id, sourceVaultId: work.source_vault_id, destination: 'spartan_intel_records', pageKind: classification.pageKind, classificationSource: classification.source, confidence: classification.confidence }
}

export async function POST(request: Request) {
  const auth = await authorized(request)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({})) as { limit?: number }
  const limit = Math.min(Math.max(numberValue(body.limit) ?? 10, 1), 25)

  const { data: items, error } = await auth.db.from('spartan_internal_storage').select('*').eq('processing_status', 'stored').order('created_at', { ascending: true }).limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: any[] = []
  const failures: any[] = []
  for (const item of items ?? []) {
    try {
      const result = await processOne(auth.db, item)
      if (!result.skipped) results.push(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ sourceVaultId: item.source_vault_id, captureId: item.capture_id, error: message })
      await auth.db.from('spartan_internal_storage').update({ processing_status: 'failed', steward_status: 'failed', failure_reason: message, failed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id)
    }
  }

  return NextResponse.json({ ok: true, requested: limit, processed: results.length, failed: failures.length, results, failures })
}
