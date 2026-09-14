import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runCaptureStewards, runSnapshotSteward } from '@/lib/spartan/stewards'
import { resolveWikiKnowledge } from '@/lib/spartan/wiki-knowledge'
import type { ProvinceSnapshot, SpartanEvent } from '@/lib/spartan/history'

export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

function isServiceRequest(request: Request) {
  const configured = process.env.SPARTAN_CAPTURE_KEY
  return Boolean(configured && request.headers.get('x-spartan-capture-key') === configured)
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
    const next = object(
      current.data ??
        current.payload ??
        current.throne ??
        current.state ??
        current.parsed ??
        current.page ??
        current.identity
    )
    if (!Object.keys(next).length) break
    current = next
  }
  return current
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const result = text(value)
    if (result) return result
  }
  return ''
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function extractKingdomCode(value: unknown) {
  const candidate = text(value)
  const coordinate = candidate.match(/\b\d{1,3}:\d{1,3}\b/)
  return coordinate?.[0] ?? ''
}

function collectIdentityObjects(capture: AnyRecord) {
  const parsed = unwrapPayload(capture.parsedPayload ?? capture.rawPayload)
  const state = unwrapPayload(parsed.throne ?? parsed.state ?? parsed.data ?? parsed)
  const nested = [
    object(capture.identity),
    object(capture.province),
    object(capture.currentProvince),
    object(capture.current_province),
    object(parsed.identity),
    object(parsed.province),
    object(parsed.currentProvince),
    object(parsed.current_province),
    object(state.identity),
    object(state.province),
    object(state.currentProvince),
    object(state.current_province),
  ]
  return { parsed, state, nested }
}

function extractCaptureIdentity(capture: AnyRecord) {
  const { parsed, state, nested } = collectIdentityObjects(capture)

  const provinceName = firstText(
    capture.provinceName,
    capture.province_name,
    capture.name,
    typeof capture.province === 'string' ? capture.province : null,
    state.provinceName,
    state.province_name,
    state.name,
    typeof state.province === 'string' ? state.province : null,
    parsed.provinceName,
    parsed.province_name,
    parsed.name,
    typeof parsed.province === 'string' ? parsed.province : null,
    ...nested.flatMap((item) => [item.name, item.provinceName, item.province_name, item.currentProvinceName])
  )

  const kingdomCandidate = firstText(
    capture.kingdomId,
    capture.kingdom_id,
    capture.kingdomCode,
    capture.kingdom_code,
    capture.coordinates,
    capture.location,
    state.kingdomId,
    state.kingdom_id,
    state.kd_code,
    state.kingdomCode,
    state.kingdom_code,
    state.coordinates,
    state.location,
    parsed.kingdomId,
    parsed.kingdom_id,
    parsed.kd_code,
    parsed.kingdomCode,
    parsed.kingdom_code,
    parsed.coordinates,
    parsed.location,
    ...nested.flatMap((item) => [
      item.kingdomId,
      item.kingdom_id,
      item.kd_code,
      item.kingdomCode,
      item.kingdom_code,
      item.coordinates,
      item.location,
    ])
  )

  const kingdomCode = extractKingdomCode(kingdomCandidate)
  if (kingdomCode) return { provinceName, kingdomCode, parsed, state }

  const rawText = text(capture.rawText)
  const headingCoordinate = rawText.match(/\b(?:kingdom|kingdom of)[^\n]{0,180}\((\d{1,3}:\d{1,3})\)/i)
  if (headingCoordinate) return { provinceName, kingdomCode: headingCoordinate[1], parsed, state }

  const anyCoordinate = rawText.match(/\b(\d{1,3}:\d{1,3})\b/)
  return { provinceName, kingdomCode: anyCoordinate?.[1] ?? '', parsed, state }
}

async function findProvinceByCaptureIdentity(supabase: any, capture: AnyRecord) {
  const identity = extractCaptureIdentity(capture)
  const provinceName = identity.provinceName
  const kingdomCode = identity.kingdomCode

  if (capture.provinceId && isUuid(capture.provinceId)) {
    const byId = await supabase
      .from('provinces')
      .select('id,name,kd_code,kingdom_id')
      .eq('id', capture.provinceId)
      .maybeSingle()
    if (byId.error) throw new Error(byId.error.message)
    if (byId.data) return byId.data
  }

  if (provinceName && kingdomCode) {
    const byIdentity = await supabase
      .from('provinces')
      .select('id,name,kd_code,kingdom_id')
      .ilike('name', provinceName)
      .eq('kd_code', kingdomCode)
      .limit(1)
      .maybeSingle()
    if (byIdentity.error) throw new Error(byIdentity.error.message)
    if (byIdentity.data) return byIdentity.data
  }

  if (provinceName) {
    const byName = await supabase
      .from('provinces')
      .select('id,name,kd_code,kingdom_id')
      .ilike('name', provinceName)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (byName.error) throw new Error(byName.error.message)
    if (byName.data) return byName.data
  }

  return null
}

async function resolveCanonicalKingdomId(
  supabase: any,
  kingdomValue: unknown,
  provinceId?: string | null,
  kingdomCodeHint?: string | null,
) {
  const value = text(kingdomValue)
  if (isUuid(value)) return value

  if (provinceId && isUuid(provinceId)) {
    const provinceQuery = await supabase
      .from('provinces')
      .select('kingdom_id')
      .eq('id', provinceId)
      .maybeSingle()
    if (provinceQuery.error) throw new Error(provinceQuery.error.message)
    if (provinceQuery.data?.kingdom_id) return provinceQuery.data.kingdom_id
  }

  const kingdomCode = extractKingdomCode(kingdomCodeHint) || extractKingdomCode(value)
  if (!kingdomCode) return null

  const kingdomQuery = await supabase
    .from('kingdoms')
    .select('id')
    .eq('kd_code', kingdomCode)
    .limit(1)
    .maybeSingle()
  if (kingdomQuery.error) throw new Error(kingdomQuery.error.message)
  return kingdomQuery.data?.id ?? null
}

function normalizeSnapshotFromCapture(
  capture: AnyRecord,
  provinceId: string | null,
  canonicalKingdomId: string | null,
): ProvinceSnapshot | null {
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
    acres: value('acres', 'land'),
    networth: value('networth', 'nw'),
    population: value('population'),
    peons: value('peons', 'peasants'),
    soldiers: value('soldiers'),
    offSpecs: value('offSpecs', 'off_specs'),
    defSpecs: value('defSpecs', 'def_specs'),
    elites: value('elites'),
    thieves: value('thieves'),
    wizards: value('wizards'),
    generals: value('generals'),
    prisoners: value('prisoners'),
    warHorses: value('warHorses', 'war_horses'),
    offense: value('offense', 'offence', 'off'),
    defense: value('defense', 'defence', 'def'),
    defenseHome: value('defenseHome', 'defense_home'),
    mana: value('mana'),
    stealth: value('stealth'),
    rTpa: value('rTpa', 'r_tpa'),
    oTpa: value('oTpa', 'o_tpa'),
    dTpa: value('dTpa', 'd_tpa'),
    rWpa: value('rWpa', 'r_wpa'),
    oWpa: value('oWpa', 'o_wpa'),
    dWpa: value('dWpa', 'd_wpa'),
    buildEfficiency: value('buildEfficiency', 'build_efficiency', 'be'),
    wages: value('wages'),
    rawState: capture.rawPayload ?? {},
    changes: {},
  }
}

async function canonicalCaptureIdentity(supabase: any, capture: AnyRecord) {
  const identity = extractCaptureIdentity(capture)
  const province = await findProvinceByCaptureIdentity(supabase, capture)
  const canonicalProvinceId = province?.id ?? (isUuid(capture.provinceId) ? capture.provinceId : null)
  const canonicalKingdomId = await resolveCanonicalKingdomId(
    supabase,
    province?.kingdom_id ?? null,
    canonicalProvinceId,
    identity.kingdomCode,
  )

  return {
    ...capture,
    provinceId: canonicalProvinceId,
    kingdomId: identity.kingdomCode || extractKingdomCode(capture.kingdomId) || null,
    canonicalKingdomId,
    provinceName: firstText(province?.name, identity.provinceName, capture.provinceName) || null,
    canonicalProvinceName: province?.name ?? null,
    canonicalProvinceKingdomCode: province?.kd_code ?? identity.kingdomCode ?? null,
  }
}

async function resolveServiceOwner(supabase: any, capture: AnyRecord) {
  if (process.env.SPARTAN_CAPTURE_USER_ID) return process.env.SPARTAN_CAPTURE_USER_ID

  const identity = extractCaptureIdentity(capture)
  const province = await findProvinceByCaptureIdentity(supabase, capture)
  const provinceId = province?.id ?? (isUuid(capture.provinceId) ? capture.provinceId : null)
  const provinceName = firstText(province?.name, capture.provinceName, identity.provinceName)
  const kingdomCode = firstText(province?.kd_code, identity.kingdomCode, capture.kingdomId)

  if (provinceId) {
    const linked = await supabase
      .from('spartan_accounts')
      .select('auth_user_id')
      .ilike('province_name', provinceName || '')
      .eq('province_location', kingdomCode || '')
      .limit(1)
      .maybeSingle()
    if (linked.error) throw new Error(linked.error.message)
    if (linked.data?.auth_user_id) return linked.data.auth_user_id
  }

  if (provinceName && kingdomCode) {
    const exact = await supabase
      .from('spartan_accounts')
      .select('auth_user_id')
      .ilike('province_name', provinceName)
      .eq('province_location', kingdomCode)
      .limit(1)
      .maybeSingle()
    if (exact.error) throw new Error(exact.error.message)
    if (exact.data?.auth_user_id) return exact.data.auth_user_id
  }

  if (provinceName) {
    const byName = await supabase
      .from('spartan_accounts')
      .select('auth_user_id')
      .ilike('province_name', provinceName)
      .limit(1)
      .maybeSingle()
    if (byName.error) throw new Error(byName.error.message)
    if (byName.data?.auth_user_id) return byName.data.auth_user_id
  }

  return null
}

function buildSnapshotRow(snapshot: ProvinceSnapshot, ownerId: string, canonicalKingdomId: string | null) {
  return {
    user_id: ownerId,
    province_id: snapshot.provinceId ?? null,
    kingdom_id: canonicalKingdomId,
    observed_at: snapshot.observedAt ?? new Date().toISOString(),
    age: snapshot.age ?? null,
    game_year: snapshot.gameYear ?? null,
    game_tick: snapshot.gameTick ?? null,
    source: snapshot.source ?? 'universal_capture',
    source_id: snapshot.sourceId ?? null,
    acres: snapshot.acres ?? null,
    networth: snapshot.networth ?? null,
    population: snapshot.population ?? null,
    peons: snapshot.peons ?? null,
    soldiers: snapshot.soldiers ?? null,
    off_specs: snapshot.offSpecs ?? null,
    def_specs: snapshot.defSpecs ?? null,
    elites: snapshot.elites ?? null,
    thieves: snapshot.thieves ?? null,
    wizards: snapshot.wizards ?? null,
    generals: snapshot.generals ?? null,
    prisoners: snapshot.prisoners ?? null,
    war_horses: snapshot.warHorses ?? null,
    offense: snapshot.offense ?? null,
    defense: snapshot.defense ?? null,
    defense_home: snapshot.defenseHome ?? null,
    mana: snapshot.mana ?? null,
    stealth: snapshot.stealth ?? null,
    r_tpa: snapshot.rTpa ?? null,
    o_tpa: snapshot.oTpa ?? null,
    d_tpa: snapshot.dTpa ?? null,
    r_wpa: snapshot.rWpa ?? null,
    o_wpa: snapshot.oWpa ?? null,
    d_wpa: snapshot.dWpa ?? null,
    build_efficiency: snapshot.buildEfficiency ?? null,
    wages: snapshot.wages ?? null,
    raw_state: snapshot.rawState ?? {},
    changes: snapshot.changes ?? {},
  }
}

export async function POST(request: Request) {
  try {
    const serviceRequest = isServiceRequest(request)
    const supabase = serviceRequest ? createServiceClient() : await createClient()

    let ownerId: string | null = null

    if (!serviceRequest) {
      const auth = await supabase.auth.getUser()
      ownerId = auth.data.user?.id ?? null
      if (!ownerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      snapshot?: ProvinceSnapshot
      events?: SpartanEvent[]
      capture?: AnyRecord
      userId?: string
    }

    if (serviceRequest) ownerId = body.userId ?? null

    let capture = body.capture
    let captureSteward: ReturnType<typeof runCaptureStewards> | null = null
    let captureKnowledge: Awaited<ReturnType<typeof resolveWikiKnowledge>> | null = null
    let canonicalKingdomId: string | null = null

    if (capture) {
      capture = await canonicalCaptureIdentity(supabase, capture)
      body.capture = capture
      canonicalKingdomId = capture.canonicalKingdomId ?? null

      if (!ownerId) ownerId = await resolveServiceOwner(supabase, capture)

      if (!ownerId) {
        const identity = extractCaptureIdentity(capture)
        return NextResponse.json(
          {
            error: 'Service capture is authenticated but no Spartan owner could be resolved.',
            identity: {
              provinceId: capture.provinceId || null,
              provinceName: identity.provinceName || null,
              kingdomCode: identity.kingdomCode || null,
            },
          },
          { status: 400 }
        )
      }

      captureKnowledge = await resolveWikiKnowledge(supabase, { provinceId: capture.provinceId })
      captureSteward = runCaptureStewards(capture, captureKnowledge)

      const rawText = capture.rawText ?? ''
      const rawPayload = capture.rawPayload ?? {}
      const parsedPayload = capture.parsedPayload ?? {}
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify([
          capture.url ?? '',
          capture.provinceId ?? null,
          capture.kingdomId ?? null,
          rawText,
          rawPayload,
          parsedPayload,
        ]))
        .digest('hex')

      const { error: vaultError } = await supabase
        .from('spartan_capture_vault')
        .upsert({
          user_id: ownerId,
          province_id: capture.provinceId ?? null,
          kingdom_id: capture.kingdomId ?? null,
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
          capture_id: capture.captureId ?? null,
          source: capture.source ?? 'universal_capture',
          source_id: capture.sourceId ?? null,
          page_kind: capture.pageKind ?? null,
          url: capture.url ?? null,
          province_id: capture.provinceId ?? null,
          kingdom_id: capture.kingdomId ?? null,
          steward: failed.map((result) => result.steward).join(','),
          severity: failed.some((result) => result.severity === 'critical') ? 'critical' : 'high',
          reason: failed.map((result) => result.reason ?? 'validation failure').join('; '),
          field_name: failed.find((result) => result.fieldName)?.fieldName ?? null,
          observed_value: failed.find((result) => result.details?.observed !== undefined)?.details?.observed ?? null,
          raw_payload: rawPayload,
          parsed_payload: parsedPayload,
          validation_details: { results: captureSteward.results, confidence: captureSteward.confidence, wikiKnowledge: captureKnowledge },
          fingerprint: captureSteward.fingerprint,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const { error: stewardError } = await supabase.from('spartan_steward_runs').insert({
        capture_id: capture.captureId ?? null,
        source: capture.source ?? 'universal_capture',
        page_kind: capture.pageKind ?? null,
        province_id: capture.provinceId ?? null,
        kingdom_id: capture.kingdomId ?? null,
        decision: captureSteward.decision,
        confidence: captureSteward.confidence,
        steward_results: captureSteward.results,
        canonical_payload: captureSteward.decision === 'accept' ? parsedPayload : {},
        knowledge_source: captureKnowledge?.sourceKey ?? 'utopia_wiki_age_116',
        knowledge_age: captureKnowledge?.age ?? 116,
        knowledge_refs: captureKnowledge?.refs ?? [],
      })
      if (stewardError) return NextResponse.json({ error: stewardError.message }, { status: 500 })

      if (captureSteward.decision === 'quarantine') {
        return NextResponse.json({ ok: true, captured: true, storedInVault: true, stewardDecision: 'quarantine', historyWritten: false }, { status: 202 })
      }

      if (['throne', 'throne-room', 'province', 'overview', 'state'].includes(String(capture.pageKind ?? '').toLowerCase())) {
        const derived = normalizeSnapshotFromCapture(capture, capture.provinceId ?? null, canonicalKingdomId)
        if (derived) body.snapshot = derived
      }
    }

    const snapshot = body.snapshot
    if (!snapshot) {
      return NextResponse.json({
        ok: true,
        captured: Boolean(capture),
        storedInVault: Boolean(capture),
        events: 0,
        snapshotStored: false,
        stewardDecision: captureSteward?.decision ?? 'not_applicable',
      })
    }

    if (!ownerId) return NextResponse.json({ error: 'A userId is required for history snapshots' }, { status: 400 })

    const canonicalSnapshotKingdomId = await resolveCanonicalKingdomId(
      supabase,
      snapshot.kingdomId ?? canonicalKingdomId,
      snapshot.provinceId ?? null,
      capture ? extractCaptureIdentity(capture).kingdomCode : null,
    )

    const snapshotForPersistence: ProvinceSnapshot = {
      ...snapshot,
      kingdomId: canonicalSnapshotKingdomId,
    }

    const snapshotKnowledge = captureKnowledge ?? await resolveWikiKnowledge(supabase, {
      provinceId: snapshotForPersistence.provinceId ?? null,
      snapshot: snapshotForPersistence as unknown as Record<string, unknown>,
    })
    const snapshotSteward = runSnapshotSteward(snapshotForPersistence as unknown as Record<string, unknown>, snapshotKnowledge)

    if (snapshotSteward.decision === 'quarantine') {
      return NextResponse.json({
        ok: true,
        captured: Boolean(capture),
        storedInVault: Boolean(capture),
        snapshotStored: false,
        stewardDecision: 'quarantine',
        stewardResults: snapshotSteward.results,
      }, { status: 202 })
    }

    const { error: snapshotError } = await supabase
      .from('spartan_province_history')
      .insert(buildSnapshotRow(snapshotForPersistence, ownerId, canonicalSnapshotKingdomId))
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })

    if (body.events?.length) {
      const eventRows = await Promise.all(body.events.map(async (event) => ({
        user_id: ownerId,
        province_id: event.provinceId ?? snapshotForPersistence.provinceId ?? null,
        kingdom_id: await resolveCanonicalKingdomId(
          supabase,
          event.kingdomId ?? snapshotForPersistence.kingdomId,
          event.provinceId ?? snapshotForPersistence.provinceId ?? null,
          capture ? extractCaptureIdentity(capture).kingdomCode : null,
        ),
        occurred_at: event.occurredAt ?? new Date().toISOString(),
        age: event.age ?? snapshotForPersistence.age ?? null,
        game_year: event.gameYear ?? snapshotForPersistence.gameYear ?? null,
        game_tick: event.gameTick ?? snapshotForPersistence.gameTick ?? null,
        event_type: event.eventType,
        source: event.source ?? snapshotForPersistence.source ?? 'universal_capture',
        source_id: event.sourceId ?? null,
        attacker: event.attacker ?? null,
        defender: event.defender ?? null,
        target_kingdom: event.targetKingdom ?? null,
        acres_change: event.acresChange ?? 0,
        troops_lost: event.troopsLost ?? 0,
        thieves_lost: event.thievesLost ?? 0,
        wizards_lost: event.wizardsLost ?? 0,
        peasants_change: event.peasantsChange ?? 0,
        gold_change: event.goldChange ?? 0,
        food_change: event.foodChange ?? 0,
        runes_change: event.runesChange ?? 0,
        mana_change: event.manaChange ?? 0,
        payload: event.payload ?? {},
        raw_text: event.rawText ?? null,
      })))

      const { error: eventError } = await supabase.from('spartan_event_history').insert(eventRows)
      if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      captured: Boolean(capture),
      events: body.events?.length ?? 0,
      snapshotStored: true,
      storedInVault: Boolean(capture),
      stewardDecision: captureSteward?.decision ?? snapshotSteward.decision,
      knowledgeSource: snapshotKnowledge.sourceKey,
      knowledgeAge: snapshotKnowledge.age,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Capture failed' }, { status: 500 })
  }
}
