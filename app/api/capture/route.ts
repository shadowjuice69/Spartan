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
  for (let i = 0; i < 4; i += 1) {
    const next = object(current.data ?? current.payload ?? current.throne ?? current.state ?? current.parsed)
    if (!Object.keys(next).length) break
    current = next
  }
  return current
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeSnapshotFromCapture(capture: AnyRecord, provinceId: string | null, kingdomId: string | null): ProvinceSnapshot | null {
  if (!provinceId) return null

  const parsed = unwrapPayload(capture.parsedPayload ?? capture.rawPayload)
  const state = unwrapPayload(parsed.throne ?? parsed.state ?? parsed.data ?? parsed)
  const value = (...keys: string[]) => firstNumber(...keys.flatMap((key) => [state[key], parsed[key]]))

  return {
    provinceId,
    kingdomId,
    observedAt: capture.capturedAt ?? new Date().toISOString(),
    age: number(state.age ?? parsed.age),
    gameYear: number(state.gameYear ?? state.year ?? parsed.gameYear ?? parsed.year),
    gameTick: (number(state.gameTick ?? state.tick ?? parsed.gameTick ?? parsed.tick) ?? null)?.toString() ?? null,
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
  const parsed = unwrapPayload(capture.parsedPayload ?? capture.rawPayload)
  const state = unwrapPayload(parsed.throne ?? parsed.state ?? parsed.data ?? parsed)
  const provinceName = text(state.name ?? state.province ?? state.province_name)
  const kingdomCode = text(state.coordinates ?? state.kd_code ?? state.kingdomId ?? capture.kingdomId)

  let province: AnyRecord | null = null

  if (provinceName && kingdomCode) {
    const query = await supabase
      .from('provinces')
      .select('id,name,kd_code')
      .eq('name', provinceName)
      .eq('kd_code', kingdomCode)
      .maybeSingle()
    if (query.error) throw new Error(query.error.message)
    province = query.data ?? null
  }

  if (!province && provinceName) {
    const query = await supabase
      .from('provinces')
      .select('id,name,kd_code')
      .eq('name', provinceName)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (query.error) throw new Error(query.error.message)
    province = query.data ?? null
  }

  if (!province && capture.provinceId) {
    const query = await supabase
      .from('provinces')
      .select('id,name,kd_code')
      .eq('id', capture.provinceId)
      .maybeSingle()
    if (query.error) throw new Error(query.error.message)
    province = query.data ?? null
  }

  return {
    ...capture,
    provinceId: province?.id ?? capture.provinceId ?? null,
    kingdomId: (province?.kd_code ?? kingdomCode) || capture.kingdomId || null,
    provinceName: (province?.name ?? provinceName) || null,
  }
}

async function resolveServiceOwner(supabase: any, capture: AnyRecord) {
  if (process.env.SPARTAN_CAPTURE_USER_ID) return process.env.SPARTAN_CAPTURE_USER_ID

  const provinceName = text(capture.provinceName)
  const kingdomCode = text(capture.kingdomId)

  if (!provinceName && !capture.provinceId) return null

  const queries: Promise<any>[] = []

  if (provinceName && kingdomCode) {
    queries.push(
      supabase
        .from('spartan_accounts')
        .select('auth_user_id')
        .ilike('province_name', provinceName)
        .eq('province_location', kingdomCode)
        .limit(1)
        .maybeSingle()
    )
  }

  if (provinceName) {
    queries.push(
      supabase
        .from('spartan_accounts')
        .select('auth_user_id')
        .ilike('province_name', provinceName)
        .limit(1)
        .maybeSingle()
    )
  }

  if (kingdomCode) {
    queries.push(
      supabase
        .from('spartan_accounts')
        .select('auth_user_id')
        .eq('province_location', kingdomCode)
        .limit(1)
        .maybeSingle()
    )
  }

  for (const pending of queries) {
    const result = await pending
    if (result.error) throw new Error(result.error.message)
    if (result.data?.auth_user_id) return result.data.auth_user_id
  }

  return null
}

function buildSnapshotRow(snapshot: ProvinceSnapshot, ownerId: string) {
  return {
    user_id: ownerId,
    province_id: snapshot.provinceId ?? null,
    kingdom_id: snapshot.kingdomId ?? null,
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

    if (serviceRequest) {
      ownerId = null
    } else {
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

    if (capture) {
      capture = await canonicalCaptureIdentity(supabase, capture)
      body.capture = capture

      if (!ownerId) ownerId = await resolveServiceOwner(supabase, capture)

      if (!ownerId) {
        return NextResponse.json(
          { error: 'Service capture is authenticated but no Spartan owner could be resolved. Link the captured province to a Spartan account or set SPARTAN_CAPTURE_USER_ID.' },
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

      if (['throne', 'throne-room', 'province', 'overview'].includes(String(capture.pageKind ?? '').toLowerCase())) {
        const derived = normalizeSnapshotFromCapture(capture, capture.provinceId ?? null, capture.kingdomId ?? null)
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

    const snapshotKnowledge = captureKnowledge ?? await resolveWikiKnowledge(supabase, {
      provinceId: snapshot.provinceId ?? null,
      snapshot: snapshot as unknown as Record<string, unknown>,
    })
    const snapshotSteward = runSnapshotSteward(snapshot as unknown as Record<string, unknown>, snapshotKnowledge)

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
      .insert(buildSnapshotRow(snapshot, ownerId))
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })

    if (body.events?.length) {
      const eventRows = body.events.map((event) => ({
        user_id: ownerId,
        province_id: event.provinceId ?? snapshot.provinceId ?? null,
        kingdom_id: event.kingdomId ?? snapshot.kingdomId ?? null,
        occurred_at: event.occurredAt ?? new Date().toISOString(),
        age: event.age ?? snapshot.age ?? null,
        game_year: event.gameYear ?? snapshot.gameYear ?? null,
        game_tick: event.gameTick ?? snapshot.gameTick ?? null,
        event_type: event.eventType,
        source: event.source ?? snapshot.source ?? 'universal_capture',
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
      }))

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
