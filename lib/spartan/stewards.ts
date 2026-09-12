import crypto from 'crypto'

type Severity = 'low' | 'medium' | 'high' | 'critical'

type StewardResult = {
  steward: string
  ok: boolean
  severity: Severity
  reason?: string
  fieldName?: string
  details?: Record<string, unknown>
}

export type CaptureForStewardship = {
  captureId?: string
  capturedAt?: string
  source?: string
  sourceId?: string
  pageKind?: string
  url?: string
  provinceId?: string | null
  kingdomId?: string | null
  rawText?: string
  rawPayload?: unknown
  parsedPayload?: unknown
}

const ID_RE = /^[^\s]{1,120}$/
const MAX_FUTURE_MS = 5 * 60 * 1000
const MAX_PLAUSIBLE_ACRES = 1000000

function result(steward: string, ok: boolean, severity: Severity = 'low', extra: Partial<StewardResult> = {}): StewardResult {
  return { steward, ok, severity, ...extra }
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function fingerprintCapture(capture: CaptureForStewardship): string {
  return crypto.createHash('sha256').update(JSON.stringify([
    capture.captureId ?? null, capture.source ?? null, capture.sourceId ?? null,
    capture.url ?? null, capture.provinceId ?? null, capture.kingdomId ?? null,
    capture.rawText ?? '', capture.rawPayload ?? {}, capture.parsedPayload ?? {},
  ])).digest('hex')
}

export function runCaptureStewards(capture: CaptureForStewardship) {
  const results: StewardResult[] = []
  const parsed = getObject(capture.parsedPayload)
  const raw = getObject(capture.rawPayload)

  if (capture.provinceId && !ID_RE.test(capture.provinceId)) {
    results.push(result('identity', false, 'critical', { reason: 'Malformed province identity', fieldName: 'provinceId' }))
  } else if (capture.kingdomId && !ID_RE.test(capture.kingdomId)) {
    results.push(result('identity', false, 'critical', { reason: 'Malformed kingdom identity', fieldName: 'kingdomId' }))
  } else results.push(result('identity', true))

  if (!capture.source && !capture.captureId && !capture.url) {
    results.push(result('provenance', false, 'high', { reason: 'No traceable capture provenance' }))
  } else results.push(result('provenance', true))

  if (capture.capturedAt) {
    const ts = Date.parse(capture.capturedAt)
    if (!Number.isFinite(ts)) results.push(result('temporal', false, 'high', { reason: 'Invalid capture timestamp', fieldName: 'capturedAt' }))
    else if (ts > Date.now() + MAX_FUTURE_MS) results.push(result('temporal', false, 'high', { reason: 'Capture timestamp is materially in the future', fieldName: 'capturedAt' }))
    else results.push(result('temporal', true))
  } else results.push(result('temporal', true, 'low', { reason: 'Timestamp absent; server time will be used' }))

  const rawValid = capture.rawPayload === undefined || capture.rawPayload === null || typeof capture.rawPayload === 'object'
  const parsedValid = capture.parsedPayload === undefined || capture.parsedPayload === null || typeof capture.parsedPayload === 'object'
  if (!rawValid || !parsedValid) results.push(result('shape', false, 'high', { reason: 'Payload is not JSON-structured data' }))
  else results.push(result('shape', true))

  const parsedProvince = parsed?.provinceId ?? parsed?.province ?? parsed?.province_name
  const parsedKingdom = parsed?.kingdomId ?? parsed?.kingdom ?? parsed?.kd_code
  const provinceConflict = capture.provinceId && parsedProvince && String(parsedProvince) !== String(capture.provinceId)
  const kingdomConflict = capture.kingdomId && parsedKingdom && String(parsedKingdom) !== String(capture.kingdomId)
  if (provinceConflict || kingdomConflict) {
    results.push(result('consistency', false, 'critical', {
      reason: 'Capture envelope identity conflicts with parsed identity',
      details: { envelopeProvince: capture.provinceId, parsedProvince, envelopeKingdom: capture.kingdomId, parsedKingdom },
    }))
  } else results.push(result('consistency', true))

  const candidates = [
    ['acres', parsed?.acres ?? raw?.acres], ['land', parsed?.land ?? raw?.land],
    ['population', parsed?.population ?? raw?.population], ['peasants', parsed?.peasants ?? raw?.peasants],
    ['soldiers', parsed?.soldiers ?? raw?.soldiers], ['off_specs', parsed?.offSpecs ?? parsed?.off_specs],
    ['def_specs', parsed?.defSpecs ?? parsed?.def_specs], ['elites', parsed?.elites],
    ['thieves', parsed?.thieves], ['wizards', parsed?.wizards],
  ] as const
  const invalid = candidates.find(([name, value]) => {
    const n = numeric(value)
    if (n === null) return false
    if (n < 0) return true
    return (name === 'acres' || name === 'land') && n > MAX_PLAUSIBLE_ACRES
  })
  if (invalid) results.push(result('plausibility', false, 'critical', { reason: 'Impossible numeric state value', fieldName: invalid[0], details: { observed: invalid[1] } }))
  else results.push(result('plausibility', true))

  const failed = results.filter((r) => !r.ok)
  const critical = failed.some((r) => r.severity === 'critical')
  const high = failed.some((r) => r.severity === 'high')
  return {
    decision: critical || high ? 'quarantine' as const : 'accept' as const,
    confidence: failed.length === 0 ? 1 : Math.max(0, 1 - failed.length * 0.2),
    fingerprint: fingerprintCapture(capture),
    results,
  }
}

export function runSnapshotSteward(snapshot: Record<string, unknown>) {
  const results: StewardResult[] = []
  const numericFields = ['acres','networth','population','peons','soldiers','offSpecs','defSpecs','elites','thieves','wizards','generals','prisoners','warHorses','offense','defense','defenseHome','mana','stealth','rTpa','oTpa','dTpa','rWpa','oWpa','dWpa','buildEfficiency','wages']
  for (const field of numericFields) {
    const value = numeric(snapshot[field])
    if (value !== null && value < 0) results.push(result('snapshot_plausibility', false, 'critical', { reason: 'Negative numeric state value', fieldName: field }))
  }
  return { decision: results.length ? 'quarantine' as const : 'accept' as const, confidence: results.length ? 0 : 1, results }
}
