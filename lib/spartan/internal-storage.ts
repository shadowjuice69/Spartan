import { classifyCapture } from '@/lib/spartan/capture-classifier'
import { runPageSteward } from '@/lib/spartan/page-stewards'

type Db = any
type ProcessingResult = {
  requested: number
  staged: number
  processed: number
  failed: number
  results: any[]
  failures: any[]
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}
function numberValue(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

async function stageVault(db: Db, limit: number, captureId?: string) {
  // Discord-bot captures have their own queue; never let the web storage worker
  // race the bot processor and delete a source before its projection completes.
  let query = db.from('spartan_capture_vault').select('*').neq('source', 'discord-bot')
  if (captureId) query = query.eq('capture_id', captureId)
  const { data: rows, error } = await query.order('created_at', { ascending: true }).limit(limit)
  if (error) throw new Error(error.message)

  const ids = (rows ?? []).map((row: any) => row.capture_id).filter(Boolean)
  const quarantinedIds = new Set<string>()
  if (ids.length) {
    const quarantined = await db.from('spartan_data_quarantine').select('capture_id').in('capture_id', ids)
    if (quarantined.error) throw new Error(quarantined.error.message)
    for (const row of quarantined.data ?? []) if (row.capture_id) quarantinedIds.add(String(row.capture_id))
  }

  let staged = 0
  for (const vault of rows ?? []) {
    if (vault.capture_id && quarantinedIds.has(String(vault.capture_id))) continue
    const id = vault.capture_id || `vault-${vault.id}`
    const result = await db.from('spartan_internal_storage').upsert({
      capture_id: id, source_vault_id: vault.id, user_id: vault.user_id, province_id: vault.province_id, kingdom_id: vault.kingdom_id,
      captured_at: vault.captured_at, source: vault.source, source_id: vault.source_id, url: vault.url, scraper_page_kind: vault.page_kind,
      raw_text: vault.raw_text, raw_payload: vault.raw_payload, parsed_payload: vault.parsed_payload, content_hash: vault.content_hash,
      processing_status: 'stored', steward_status: 'awaiting_processing', updated_at: new Date().toISOString(),
    }, { onConflict: 'capture_id' })
    if (result.error) throw new Error(result.error.message)
    staged += 1
  }
  return staged
}

async function processOne(db: Db, item: any) {
  const now = new Date().toISOString()
  const claim = await db.from('spartan_internal_storage').update({
    processing_status: 'processing', steward_status: 'claimed', claimed_by: 'storage-steward',
    claimed_at: now, processing_attempts: Number(item.processing_attempts ?? 0) + 1, updated_at: now,
  }).eq('id', item.id).eq('processing_status', 'stored').select('*').maybeSingle()
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) return { skipped: true, captureId: item.capture_id, reason: 'already claimed by another Steward' }

  const work = claim.data
  const classification = classifyCapture(work.url, work.raw_text, work.scraper_page_kind)
  const pageSteward = runPageSteward(classification.pageKind, work.parsed_payload, work.raw_payload)
  const capturedAt = work.captured_at || work.created_at || new Date().toISOString()
  const expiresAt = classification.retentionClass === 'intel_48h'
    ? new Date(new Date(capturedAt).getTime() + 48 * 60 * 60 * 1000).toISOString()
    : null
  const existing = await db.from('spartan_intel_records').select('id').eq('capture_id', work.capture_id).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  const parsed = {
    ...jsonObject(work.parsed_payload),
    pageSteward: { handled: pageSteward.handled, fields: pageSteward.fields, payload: pageSteward.payload },
  }
  if (!existing.data) {
    const durable = await db.from('spartan_intel_records').insert({
      capture_id: work.capture_id, source_vault_id: work.source_vault_id, user_id: work.user_id,
      province_id: work.province_id, kingdom_id: work.kingdom_id, captured_at: capturedAt,
      source: work.source, source_id: work.source_id, url: work.url, page_kind: classification.pageKind,
      classification_source: classification.source, classification_confidence: classification.confidence,
      classification_reason: classification.reason,
      age: numberValue(work.raw_payload?.age ?? work.parsed_payload?.age),
      game_year: numberValue(work.raw_payload?.gameYear ?? work.parsed_payload?.gameYear ?? work.raw_payload?.year ?? work.parsed_payload?.year),
      game_tick: String(work.raw_payload?.gameTick ?? work.parsed_payload?.gameTick ?? work.raw_payload?.tick ?? work.parsed_payload?.tick ?? '') || null,
      retention_class: classification.retentionClass, expires_at: expiresAt, raw_text: work.raw_text,
      raw_payload: jsonObject(work.raw_payload), parsed_payload: parsed, content_hash: work.content_hash,
    }).select('id').single()
    if (durable.error) throw new Error(durable.error.message)
  }

  const verifiedAt = new Date().toISOString()
  const updated = await db.from('spartan_internal_storage').update({
    verified_page_kind: classification.pageKind, classification_source: classification.source,
    classification_confidence: classification.confidence, classification_reason: classification.reason,
    steward_status: 'verified', processing_status: 'processed', destination: 'spartan_intel_records',
    routed_at: verifiedAt, verified_at: verifiedAt, processed_at: verifiedAt, updated_at: verifiedAt,
  }).eq('id', work.id).select('id').maybeSingle()
  if (updated.error || !updated.data) throw new Error(updated.error?.message || 'Internal Storage verification update failed.')

  const audit = await db.from('spartan_steward_events').insert({
    steward_key: 'storage', capture_id: work.capture_id, decision: 'pass', confidence: classification.confidence,
    reason: 'Routed and verified before source deletion.',
    details: { sourceVaultId: work.source_vault_id, destination: 'spartan_intel_records',
      verifiedPageKind: classification.pageKind, classificationSource: classification.source,
      sourceUrl: work.url, pageStewardHandled: pageSteward.handled, pageStewardFields: pageSteward.fields },
  })
  if (audit.error) throw new Error(audit.error.message)

  const deleted = await db.from('spartan_capture_vault').delete().eq('id', work.source_vault_id).select('id')
  if (deleted.error) throw new Error(deleted.error.message)
  if (!deleted.data?.length) {
    // A prior attempt may already have removed the temporary source after the
    // destination was written. Treat that as idempotent success only when the
    // source really is absent; a remaining source is still a hard failure.
    const sourceCheck = await db.from('spartan_capture_vault').select('id').eq('id', work.source_vault_id).maybeSingle()
    if (sourceCheck.error) throw new Error(sourceCheck.error.message)
    if (sourceCheck.data) throw new Error('Vault source could not be deleted after destination verification.')
  }
  const removed = await db.from('spartan_internal_storage').delete().eq('id', work.id)
  if (removed.error) throw new Error(removed.error.message)

  return { captureId: work.capture_id, sourceVaultId: work.source_vault_id, destination: 'spartan_intel_records',
    pageKind: classification.pageKind, classificationSource: classification.source,
    confidence: classification.confidence, pageStewardHandled: pageSteward.handled, pageStewardFields: pageSteward.fields }
}

async function recordStorageCycle(db: Db, cycle: { requested: number; staged: number; processed: number; failed: number; fatal?: boolean; reason?: string }) {
  try {
    const { data: current, error } = await db.from('spartan_steward_registry')
      .select('processed_count,error_count,quarantined_count,metadata')
      .eq('steward_key', 'storage').maybeSingle()
    if (error) throw new Error(error.message)
    const now = new Date().toISOString()
    const status = cycle.fatal ? 'fail' : cycle.failed > 0 ? 'warn' : 'pass'
    const metadata = {
      ...jsonObject(current?.metadata),
      system: 'spartan',
      last_cycle: { ...cycle, status, at: now },
    }
    const values = {
      last_run_at: now,
      last_status: status,
      processed_count: Number(current?.processed_count ?? 0) + cycle.processed,
      error_count: Number(current?.error_count ?? 0) + (cycle.fatal ? 1 : cycle.failed),
      metadata,
      updated_at: now,
    }
    const write = current
      ? await db.from('spartan_steward_registry').update(values).eq('steward_key', 'storage')
      : await db.from('spartan_steward_registry').insert({
          steward_key: 'storage', name: 'Storage Steward', role: 'capture routing and durable verification',
          enabled: true, interval_ms: 300000, quarantined_count: 0, ...values,
        })
    if (write.error) throw new Error(write.error.message)
  } catch (error) {
    console.error('[STORAGE STEWARD] registry health update failed:', error instanceof Error ? error.message : String(error))
  }
}

/** Shared worker used by both the HTTP steward endpoint and capture ingestion.
 * Calling it directly avoids a fragile self-HTTP request from inside Render.
 */
export async function processStorageQueue(db: Db, requestedLimit = 10, captureId?: string): Promise<ProcessingResult> {
  const limit = Math.min(Math.max(numberValue(requestedLimit) ?? 10, 1), 25)
  let staged = 0
  let items: any[] = []
  try {
    staged = await stageVault(db, limit, captureId)
    let query = db.from('spartan_internal_storage').select('*').eq('processing_status', 'stored')
    if (captureId) query = query.eq('capture_id', captureId)
    const { data, error } = await query.order('created_at', { ascending: true }).limit(limit)
    if (error) throw new Error(error.message)
    items = data ?? []
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordStorageCycle(db, { requested: limit, staged, processed: 0, failed: 1, fatal: true, reason: message })
    throw error
  }

  const results: any[] = []
  const failures: any[] = []
  for (const item of items) {
    try {
      const result = await processOne(db, item)
      if (!result.skipped) results.push(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ sourceVaultId: item.source_vault_id, captureId: item.capture_id, error: message })
      await db.from('spartan_internal_storage').update({
        processing_status: 'failed', steward_status: 'failed', failure_reason: message,
        failed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', item.id)
    }
  }
  await recordStorageCycle(db, { requested: limit, staged, processed: results.length, failed: failures.length })
  return { requested: limit, staged, processed: results.length, failed: failures.length, results, failures }
}
