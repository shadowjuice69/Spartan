import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runCaptureStewards, runSnapshotSteward } from '@/lib/spartan/stewards'
import { resolveWikiKnowledge } from '@/lib/spartan/wiki-knowledge'
import { enrichKingdomPayload } from '@/lib/spartan/kingdom-data'
import type { ProvinceSnapshot, SpartanEvent } from '@/lib/spartan/history'

export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

type CaptureOwner = {
  accountId: string
  authUserId: string
  provinceName: string
  kingdomCode: string
}

// Scraper requests authenticate with a per-device capture token (256-bit, stored
// hashed in spartan_capture_devices). No shared key is required as proof of identity;
// the token is validated in resolveCaptureDeviceOwner below.
function isServiceRequest(request: Request) {
  return Boolean(request.headers.get('x-spartan-capture-token')?.trim())
}

function hashCaptureToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function resolveCaptureDeviceOwner(supabase: any, captureToken: string): Promise<CaptureOwner | null> {
  const tokenHash = hashCaptureToken(captureToken)
  const device = await supabase.from('spartan_capture_devices').select('id,owner_id').eq('token_hash', tokenHash).maybeSingle()
  if (device.error) throw new Error(device.error.message)
  if (!device.data?.owner_id) return null

  const account = await supabase
    .from('spartan_accounts')
    .select('id,auth_user_id,province_name,province_location,account_status')
    .eq('id', device.data.owner_id)
    .maybeSingle()
  if (account.error) throw new Error(account.error.message)
  if (!account.data || account.data.account_status !== 'active' || !account.data.auth_user_id) return null
  if (!account.data.province_name || !account.data.province_location) return null

  await supabase.from('spartan_capture_devices').update({
    last_seen_at: new Date().toISOString(),
    last_province_id: account.data.id,
    last_province_name: account.data.province_name,
    last_kingdom_code: account.data.province_location,
  }).eq('id', device.data.id)

  return {
    accountId: account.data.id,
    authUserId: account.data.auth_user_id,
    provinceName: account.data.province_name,
    kingdomCode: account.data.province_location,
  }
}

function object(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {}
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = number(value)
    if (parsed !== null) return parsed
  }
  return null
}

function unwrapPayload(payload: unknown): AnyRecord {
  let current = object(payload)
  for (let i = 0; i < 6; i += 1) {
    const next = object(current.data ?? current.payload ?? current.throne ?? current.state ?? current.parsed ?? current.page ?? current.identity)
    if (!Object.keys(next).length) break
    current = next
  }
  return current
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractKingdomCode(value: unknown) {
  const candidate = text(value)
  const coordinate = candidate.match(/\b\d{1,3}:\d{1,3}\b/)
  return coordinate?.[0] ?? ''
}

function extractCaptureIdentity(capture: AnyRecord) {
  const parsed = unwrapPayload(capture.parsedPayload ?? capture.rawPayload)
  const state = unwrapPayload(parsed.throne ?? parsed.state ?? parsed.data ?? parsed)
  const provinceName = text(capture.provinceName ?? capture.province_name ?? capture.name ?? state.provinceName ?? state.province_name ?? state.name ?? parsed.provinceName ?? parsed.province_name ?? parsed.name)
  const kingdomCandidate = text(capture.kingdomCode ?? capture.kingdom_code ?? capture.kingdomId ?? capture.kingdom_id ?? capture.coordinates ?? capture.location ?? state.kd_code ?? state.kingdomCode ?? state.kingdom_code ?? state.coordinates ?? state.location ?? parsed.kd_code ?? parsed.kingdomCode ?? parsed.kingdom_code ?? parsed.coordinates ?? parsed.location)
  const kingdomCode = extractKingdomCode(kingdomCandidate)
  const rawText = text(capture.rawText)
  const headingCoordinate = rawText.match(/\b(?:kingdom|kingdom of)[^\n]{0,180}\((\d{1,3}:\d{1,3})\)/i)
  const anyCoordinate = rawText.match(/\b(\d{1,3}:\d{1,3})\b/)
  return { provinceName, kingdomCode: kingdomCode || headingCoordinate?.[1] || anyCoordinate?.[1] || '', parsed, state }
}

/**
 * Identity is never taken from scraped page text.
 * The capture token authenticates a device, the device identifies the Spartan
 * account, and the account is the source of truth for province identity.
 */
async function canonicalCaptureIdentity(supabase: any, capture: AnyRecord, owner: CaptureOwner) {
  const registry = await supabase
    .from('spartan_province_registry')
    .select('province_id,province_name,kingdom_code,user_id')
    .eq('province_id', owner.accountId)
    .eq('user_id', owner.authUserId)
    .maybeSingle()
  if (registry.error) throw new Error(registry.error.message)

  return {
    ...capture,
    provinceId: owner.accountId,
    kingdomId: owner.kingdomCode,
    canonicalKingdomId: owner.kingdomCode,
    provinceName: owner.provinceName,
    canonicalProvinceName: owner.provinceName,
    canonicalProvinceKingdomCode: owner.kingdomCode,
    identitySource: 'spartan_account',
    registryPresent: Boolean(registry.data),
  }
}

function normalizeSnapshotFromCapture(capture: AnyRecord, provinceId: string | null, canonicalKingdomId: string | null): ProvinceSnapshot | null {
  if (!provinceId) return null
  const parsed = unwrapPayload(capture.parsedPayload ?? capture.rawPayload)
  const state = unwrapPayload(parsed.throne ?? parsed.state ?? parsed.data ?? parsed)
  const value = (...keys: string[]) => firstNumber(...keys.flatMap((key) => [state[key], parsed[key], capture[key]]))
  return {
    provinceId,
    kingdomId: canonicalKingdomId,
    observedAt: capture.capturedAt ?? new Date().toISOString(),
    age: number(state.age ?? parsed.age ?? capture.age),
    gameYear: number(state.gameYear ?? state.year ?? parsed.gameYear ?? parsed.year ?? capture.gameYear ?? capture.year),
    gameTick: (number(state.gameTick ?? state.tick ?? parsed.gameTick ?? parsed.tick ?? capture.gameTick ?? capture.tick) ?? null)?.toString() ?? null,
    source: capture.source ?? 'universal_capture',
    sourceId: capture.sourceId ?? capture.captureId ?? null,
    acres: value('acres', 'land'), networth: value('networth', 'nw'), population: value('population'), peons: value('peons', 'peasants'),
    soldiers: value('soldiers'), offSpecs: value('offSpecs', 'off_specs'), defSpecs: value('defSpecs', 'def_specs'), elites: value('elites'),
    thieves: value('thieves'), wizards: value('wizards'), generals: value('generals'), prisoners: value('prisoners'), warHorses: value('warHorses', 'war_horses'),
    offense: value('offense', 'offence', 'off'), defense: value('defense', 'defence', 'def'), defenseHome: value('defenseHome', 'defense_home'),
    mana: value('mana'), stealth: value('stealth'), rTpa: value('rTpa', 'r_tpa'), oTpa: value('oTpa', 'o_tpa'), dTpa: value('dTpa', 'd_tpa'),
    rWpa: value('rWpa', 'r_wpa'), oWpa: value('oWpa', 'o_wpa'), dWpa: value('dWpa', 'd_wpa'), buildEfficiency: value('buildEfficiency', 'build_efficiency', 'be'),
    wages: value('wages'), rawState: capture.rawPayload ?? {}, changes: {},
  }
}

function buildSnapshotRow(snapshot: ProvinceSnapshot, authUserId: string, canonicalKingdomId: string | null) {
  return {
    user_id: authUserId,
    province_id: snapshot.provinceId ?? null,
    kingdom_id: canonicalKingdomId,
    observed_at: snapshot.observedAt ?? new Date().toISOString(), age: snapshot.age ?? null, game_year: snapshot.gameYear ?? null, game_tick: snapshot.gameTick ?? null,
    source: snapshot.source ?? 'universal_capture', source_id: snapshot.sourceId ?? null, acres: snapshot.acres ?? null, networth: snapshot.networth ?? null,
    population: snapshot.population ?? null, peons: snapshot.peons ?? null, soldiers: snapshot.soldiers ?? null, off_specs: snapshot.offSpecs ?? null,
    def_specs: snapshot.defSpecs ?? null, elites: snapshot.elites ?? null, thieves: snapshot.thieves ?? null, wizards: snapshot.wizards ?? null,
    generals: snapshot.generals ?? null, prisoners: snapshot.prisoners ?? null, war_horses: snapshot.warHorses ?? null, offense: snapshot.offense ?? null,
    defense: snapshot.defense ?? null, defense_home: snapshot.defenseHome ?? null, mana: snapshot.mana ?? null, stealth: snapshot.stealth ?? null,
    r_tpa: snapshot.rTpa ?? null, o_tpa: snapshot.oTpa ?? null, d_tpa: snapshot.dTpa ?? null, r_wpa: snapshot.rWpa ?? null, o_wpa: snapshot.oWpa ?? null,
    d_wpa: snapshot.dWpa ?? null, build_efficiency: snapshot.buildEfficiency ?? null, wages: snapshot.wages ?? null, raw_state: snapshot.rawState ?? {}, changes: snapshot.changes ?? {},
  }
}

export async function POST(request: Request) {
  try {
    const serviceRequest = isServiceRequest(request)
    const supabase = serviceRequest ? createServiceClient() : await createClient()
    let authUserId: string | null = null
    let captureOwner: CaptureOwner | null = null

    if (!serviceRequest) {
      const auth = await supabase.auth.getUser()
      authUserId = auth.data.user?.id ?? null
      if (!authUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const account = await supabase.from('spartan_accounts').select('id,auth_user_id,province_name,province_location,account_status').eq('auth_user_id', authUserId).maybeSingle()
      if (account.error) throw new Error(account.error.message)
      if (!account.data || account.data.account_status !== 'active') return NextResponse.json({ error: 'Active Spartan account not found.' }, { status: 403 })
      captureOwner = { accountId: account.data.id, authUserId, provinceName: account.data.province_name ?? '', kingdomCode: account.data.province_location ?? '' }
    }

    const body = (await request.json()) as { snapshot?: ProvinceSnapshot; events?: SpartanEvent[]; capture?: AnyRecord; userId?: string }

    if (serviceRequest) {
      const captureToken = text(request.headers.get('x-spartan-capture-token'))
      if (!captureToken) return NextResponse.json({ error: 'Scraper capture token is required.' }, { status: 401 })
      captureOwner = await resolveCaptureDeviceOwner(supabase, captureToken)
      if (!captureOwner) return NextResponse.json({ error: 'Invalid or inactive scraper capture token.' }, { status: 401 })
      authUserId = captureOwner.authUserId
    }

    let capture = body.capture
    let captureSteward: ReturnType<typeof runCaptureStewards> | null = null
    let captureKnowledge: Awaited<ReturnType<typeof resolveWikiKnowledge>> | null = null
    let canonicalKingdomId: string | null = null

    if (capture) {
      if (!captureOwner) return NextResponse.json({ error: 'Spartan account could not be resolved for this capture.' }, { status: 400 })
      capture = await canonicalCaptureIdentity(supabase, capture, captureOwner)
      body.capture = capture
      canonicalKingdomId = capture.canonicalKingdomId ?? null

      captureKnowledge = await resolveWikiKnowledge(supabase, { provinceId: capture.provinceId })
      captureSteward = runCaptureStewards(capture, captureKnowledge)

      const rawText = capture.rawText ?? ''
      const rawPayload = capture.rawPayload ?? {}
      let parsedPayload = capture.parsedPayload ?? {}
      if (String(capture.pageKind ?? '').toLowerCase() === 'kingdom') {
        parsedPayload = enrichKingdomPayload(rawText, rawPayload, parsedPayload)
        capture.parsedPayload = parsedPayload
      }
      const contentHash = crypto.createHash('sha256').update(JSON.stringify([
        capture.url ?? '', capture.provinceId, capture.kingdomId, capture.pageKind ?? null, rawText, rawPayload, parsedPayload,
      ])).digest('hex')

      const { error: vaultError } = await supabase.from('spartan_capture_vault').upsert({
        user_id: captureOwner.accountId,
        province_id: captureOwner.accountId,
        kingdom_id: captureOwner.kingdomCode,
        captured_at: capture.capturedAt ?? new Date().toISOString(),
        source: capture.source ?? 'universal_capture',
        source_id: capture.sourceId ?? null,
        page_kind: capture.pageKind ?? null,
        url: capture.url ?? null,
        capture_id: capture.captureId ?? null,
        raw_text: rawText || null,
        raw_payload: rawPayload,
        parsed_payload: parsedPayload,
        content_hash: contentHash,
      }, { onConflict: 'content_hash' })
      if (vaultError) return NextResponse.json({ error: vaultError.message }, { status: 500 })

      const failed = captureSteward.results.filter((result) => !result.ok && result.severity !== 'medium')
      if (failed.length) {
        const { error } = await supabase.from('spartan_data_quarantine').insert({
          capture_id: capture.captureId ?? null, source: capture.source ?? 'universal_capture', source_id: capture.sourceId ?? null,
          page_kind: capture.pageKind ?? null, url: capture.url ?? null, province_id: captureOwner.accountId, kingdom_id: captureOwner.kingdomCode,
          steward: failed.map((result) => result.steward).join(','), severity: failed.some((result) => result.severity === 'critical') ? 'critical' : 'high',
          reason: failed.map((result) => result.reason ?? 'validation failure').join('; '), field_name: failed.find((result) => result.fieldName)?.fieldName ?? null,
          observed_value: failed.find((result) => result.details?.observed !== undefined)?.details?.observed ?? null,
          raw_payload: rawPayload, parsed_payload: parsedPayload,
          validation_details: { results: captureSteward.results, confidence: captureSteward.confidence, wikiKnowledge: captureKnowledge },
          fingerprint: captureSteward.fingerprint,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const { error: stewardError } = await supabase.from('spartan_steward_runs').insert({
        capture_id: capture.captureId ?? null, source: capture.source ?? 'universal_capture', page_kind: capture.pageKind ?? null,
        province_id: captureOwner.accountId, kingdom_id: captureOwner.kingdomCode, decision: captureSteward.decision,
        confidence: captureSteward.confidence, steward_results: captureSteward.results,
        canonical_payload: captureSteward.decision === 'accept' ? parsedPayload : {}, knowledge_source: captureKnowledge?.sourceKey ?? 'utopia_wiki_age_116',
        knowledge_age: captureKnowledge?.age ?? 116, knowledge_refs: captureKnowledge?.refs ?? [],
      })
      if (stewardError) return NextResponse.json({ error: stewardError.message }, { status: 500 })

      if (captureSteward.decision === 'quarantine') return NextResponse.json({ ok: true, captured: true, storedInVault: true, stewardDecision: 'quarantine', historyWritten: false }, { status: 202 })

      if (['throne', 'throne-room', 'province', 'overview', 'state'].includes(String(capture.pageKind ?? '').toLowerCase())) {
        const derived = normalizeSnapshotFromCapture(capture, captureOwner.accountId, canonicalKingdomId)
        if (derived) body.snapshot = derived
      }
    }

    const snapshot = body.snapshot
    if (!snapshot) return NextResponse.json({ ok: true, captured: Boolean(capture), storedInVault: Boolean(capture), events: 0, snapshotStored: false, stewardDecision: captureSteward?.decision ?? 'not_applicable' })
    if (!captureOwner) return NextResponse.json({ error: 'A Spartan account is required for history snapshots.' }, { status: 400 })

    const snapshotForPersistence: ProvinceSnapshot = {
      ...snapshot,
      provinceId: captureOwner.accountId,
      kingdomId: captureOwner.kingdomCode,
    }
    const snapshotKnowledge = captureKnowledge ?? await resolveWikiKnowledge(supabase, { provinceId: snapshotForPersistence.provinceId, snapshot: snapshotForPersistence as unknown as Record<string, unknown> })
    const snapshotSteward = runSnapshotSteward(snapshotForPersistence as unknown as Record<string, unknown>, snapshotKnowledge)
    if (snapshotSteward.decision === 'quarantine') return NextResponse.json({ ok: true, captured: Boolean(capture), storedInVault: Boolean(capture), snapshotStored: false, stewardDecision: 'quarantine', stewardResults: snapshotSteward.results }, { status: 202 })

    const { error: snapshotError } = await supabase.from('spartan_province_history').insert(buildSnapshotRow(snapshotForPersistence, captureOwner.authUserId, captureOwner.kingdomCode))
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })

    if (body.events?.length) {
      const eventRows = body.events.map((event) => ({
        user_id: captureOwner!.authUserId,
        province_id: captureOwner!.accountId,
        kingdom_id: captureOwner!.kingdomCode,
        occurred_at: event.occurredAt ?? new Date().toISOString(),
        age: event.age ?? snapshotForPersistence.age ?? null, game_year: event.gameYear ?? snapshotForPersistence.gameYear ?? null,
        game_tick: event.gameTick ?? snapshotForPersistence.gameTick ?? null, event_type: event.eventType,
        source: event.source ?? snapshotForPersistence.source ?? 'universal_capture', source_id: event.sourceId ?? null,
        attacker: event.attacker ?? null, defender: event.defender ?? null, target_kingdom: event.targetKingdom ?? null,
        acres_change: event.acresChange ?? 0, troops_lost: event.troopsLost ?? 0, thieves_lost: event.thievesLost ?? 0, wizards_lost: event.wizardsLost ?? 0,
        peasants_change: event.peasantsChange ?? 0, gold_change: event.goldChange ?? 0, food_change: event.foodChange ?? 0, runes_change: event.runesChange ?? 0,
        mana_change: event.manaChange ?? 0, payload: event.payload ?? {}, raw_text: event.rawText ?? null,
      }))
      const { error: eventError } = await supabase.from('spartan_event_history').insert(eventRows)
      if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, captured: Boolean(capture), events: body.events?.length ?? 0, snapshotStored: true, storedInVault: Boolean(capture), stewardDecision: captureSteward?.decision ?? snapshotSteward.decision, knowledgeSource: snapshotKnowledge.sourceKey, knowledgeAge: snapshotKnowledge.age })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Capture failed' }, { status: 500 })
  }
}
