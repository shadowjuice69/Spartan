import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runCaptureStewards, runSnapshotSteward } from '@/lib/spartan/stewards'
import { resolveWikiKnowledge } from '@/lib/spartan/wiki-knowledge'
import type { ProvinceSnapshot, SpartanEvent } from '@/lib/spartan/history'

export const dynamic = 'force-dynamic'

function isServiceRequest(request: Request) {
  const configured = process.env.SPARTAN_CAPTURE_KEY
  return Boolean(configured && request.headers.get('x-spartan-capture-key') === configured)
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const n = number(value)
    if (n !== null) return n
  }
  return null
}

function unwrapPayload(payload: unknown): Record<string, any> {
  let current = object(payload)
  for (let i = 0; i < 4; i++) {
    const next = object(current.data ?? current.payload ?? current.throne ?? current.state ?? current.parsed)
    if (!Object.keys(next).length) break
    current = next
  }
  return current
}

function normalizeSnapshotFromCapture(capture: any, fallbackProvinceId: string | null, fallbackKingdomId: string | null): ProvinceSnapshot | null {
  const p = unwrapPayload(capture?.parsedPayload ?? capture?.rawPayload)
  const state = unwrapPayload(p.throne ?? p.state ?? p.data ?? p)
  const provinceId = String(capture?.provinceId ?? state.provinceId ?? state.province ?? fallbackProvinceId ?? '') || null
  if (!provinceId) return null
  const kingdomId = String(capture?.kingdomId ?? state.kingdomId ?? state.kingdom ?? state.kd_code ?? fallbackKingdomId ?? '') || null
  const v = (...keys: string[]) => firstNumber(...keys.flatMap((key) => [state[key], p[key]]))
  return {
    provinceId,
    kingdomId,
    observedAt: capture?.capturedAt ?? new Date().toISOString(),
    age: number(state.age ?? p.age) ?? null,
    gameYear: number(state.gameYear ?? state.year ?? p.gameYear ?? p.year) ?? null,
    gameTick: number(state.gameTick ?? state.tick ?? p.gameTick ?? p.tick) ?? null,
    source: capture?.source ?? 'universal_capture',
    sourceId: capture?.sourceId ?? capture?.captureId ?? null,
    acres: v('acres','land'), networth: v('networth','nw'), population: v('population'), peons: v('peons','peasants'),
    soldiers: v('soldiers'), offSpecs: v('offSpecs','off_specs'), defSpecs: v('defSpecs','def_specs'), elites: v('elites'),
    thieves: v('thieves'), wizards: v('wizards'), generals: v('generals'), prisoners: v('prisoners'), warHorses: v('warHorses','war_horses'),
    offense: v('offense','offence'), defense: v('defense','defence'), defenseHome: v('defenseHome','defense_home'),
    mana: v('mana'), stealth: v('stealth'), rTpa: v('rTpa','r_tpa'), oTpa: v('oTpa','o_tpa'), dTpa: v('dTpa','d_tpa'),
    rWpa: v('rWpa','r_wpa'), oWpa: v('oWpa','o_wpa'), dWpa: v('dWpa','d_wpa'), buildEfficiency: v('buildEfficiency','build_efficiency'),
    wages: v('wages'), rawState: capture?.rawPayload ?? {}, changes: {},
  }
}

export async function POST(request: Request) {
  try {
    const serviceRequest = isServiceRequest(request)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user && !serviceRequest) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      snapshot?: ProvinceSnapshot
      events?: SpartanEvent[]
      capture?: Record<string, any>
      userId?: string
    }
    const ownerId = user?.id ?? (serviceRequest ? body.userId ?? process.env.SPARTAN_CAPTURE_USER_ID ?? null : null)
    const capture = body.capture
    let captureSteward: ReturnType<typeof runCaptureStewards> | null = null
    let captureKnowledge: Awaited<ReturnType<typeof resolveWikiKnowledge>> | null = null

    if (capture) {
      captureKnowledge = await resolveWikiKnowledge(supabase, { provinceId: capture.provinceId })
      captureSteward = runCaptureStewards(capture, captureKnowledge)
      const rawText = capture.rawText ?? ''
      const rawPayload = capture.rawPayload ?? {}
      const parsedPayload = capture.parsedPayload ?? {}
      const contentHash = crypto.createHash('sha256').update(JSON.stringify([capture.url ?? '', capture.provinceId ?? null, capture.kingdomId ?? null, rawText, rawPayload, parsedPayload])).digest('hex')
      const { error } = await supabase.from('spartan_capture_vault').upsert({
        user_id: ownerId, province_id: capture.provinceId ?? null, kingdom_id: capture.kingdomId ?? null,
        captured_at: capture.capturedAt ?? new Date().toISOString(), source: capture.source ?? 'universal_capture',
        source_id: capture.sourceId ?? null, page_kind: capture.pageKind ?? null, url: capture.url ?? null,
        capture_id: capture.captureId ?? null, raw_text: rawText || null, raw_payload: rawPayload,
        parsed_payload: parsedPayload, content_hash: contentHash,
      }, { onConflict: 'content_hash' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const failed = captureSteward.results.filter((r) => !r.ok && r.severity !== 'medium')
      if (failed.length) {
        const { error: quarantineError } = await supabase.from('spartan_data_quarantine').insert({
          capture_id: capture.captureId ?? null, source: capture.source ?? 'universal_capture', source_id: capture.sourceId ?? null,
          page_kind: capture.pageKind ?? null, url: capture.url ?? null, province_id: capture.provinceId ?? null,
          kingdom_id: capture.kingdomId ?? null, steward: failed.map((r) => r.steward).join(','),
          severity: failed.some((r) => r.severity === 'critical') ? 'critical' : 'high',
          reason: failed.map((r) => r.reason ?? 'validation failure').join('; '),
          field_name: failed.find((r) => r.fieldName)?.fieldName ?? null,
          observed_value: failed.find((r) => r.details?.observed !== undefined)?.details?.observed ?? null,
          raw_payload: rawPayload, parsed_payload: parsedPayload,
          validation_details: { results: captureSteward.results, confidence: captureSteward.confidence, wikiKnowledge: captureKnowledge },
          fingerprint: captureSteward.fingerprint,
        })
        if (quarantineError) return NextResponse.json({ error: quarantineError.message }, { status: 500 })
      }

      await supabase.from('spartan_steward_runs').insert({
        capture_id: capture.captureId ?? null, source: capture.source ?? 'universal_capture', page_kind: capture.pageKind ?? null,
        province_id: capture.provinceId ?? null, kingdom_id: capture.kingdomId ?? null, decision: captureSteward.decision,
        confidence: captureSteward.confidence, steward_results: captureSteward.results,
        canonical_payload: captureSteward.decision === 'accept' ? parsedPayload : {},
        knowledge_source: captureKnowledge?.sourceKey ?? 'utopia_wiki_age_116', knowledge_age: captureKnowledge?.age ?? 116,
        knowledge_refs: captureKnowledge?.refs ?? [],
      })

      if (captureSteward.decision === 'quarantine') return NextResponse.json({ ok: true, captured: true, storedInVault: true, stewardDecision: 'quarantine', historyWritten: false }, { status: 202 })

      // Throne captures are the canonical live state. When the scraper supplies only a capture
      // envelope, materialize the structured fields here so Command Center/Jeeves do not depend
      // on legacy NULL columns or a later projection job.
      const pageKind = String(capture.pageKind ?? '').toLowerCase()
      if (pageKind === 'throne' || pageKind === 'throne-room' || pageKind === 'province' || pageKind === 'overview') {
        const derived = normalizeSnapshotFromCapture(capture, capture.provinceId ?? null, capture.kingdomId ?? null)
        if (derived) body.snapshot = derived
      }
    }

    const snapshot = body.snapshot
    if (!snapshot) return NextResponse.json({ ok: true, captured: Boolean(capture), storedInVault: Boolean(capture), events: 0, snapshotStored: false, stewardDecision: captureSteward?.decision ?? 'not_applicable' })
    if (!ownerId) return NextResponse.json({ error: 'A userId is required for service-authenticated history snapshots' }, { status: 400 })

    const snapshotKnowledge = captureKnowledge ?? await resolveWikiKnowledge(supabase, { provinceId: snapshot.provinceId ?? null, snapshot: snapshot as unknown as Record<string, unknown> })
    const snapshotSteward = runSnapshotSteward(snapshot as unknown as Record<string, unknown>, snapshotKnowledge)
    if (snapshotSteward.decision === 'quarantine') return NextResponse.json({ ok: true, captured: Boolean(capture), storedInVault: Boolean(capture), snapshotStored: false, stewardDecision: 'quarantine', stewardResults: snapshotSteward.results }, { status: 202 })

    const snapshotRow = {
      user_id: ownerId, province_id: snapshot.provinceId ?? null, kingdom_id: snapshot.kingdomId ?? null,
      observed_at: snapshot.observedAt ?? new Date().toISOString(), age: snapshot.age ?? null, game_year: snapshot.gameYear ?? null,
      game_tick: snapshot.gameTick ?? null, source: snapshot.source ?? 'universal_capture', source_id: snapshot.sourceId ?? null,
      acres: snapshot.acres ?? null, networth: snapshot.networth ?? null, population: snapshot.population ?? null, peons: snapshot.peons ?? null,
      soldiers: snapshot.soldiers ?? null, off_specs: snapshot.offSpecs ?? null, def_specs: snapshot.defSpecs ?? null, elites: snapshot.elites ?? null,
      thieves: snapshot.thieves ?? null, wizards: snapshot.wizards ?? null, generals: snapshot.generals ?? null, prisoners: snapshot.prisoners ?? null,
      war_horses: snapshot.warHorses ?? null, offense: snapshot.offense ?? null, defense: snapshot.defense ?? null, defense_home: snapshot.defenseHome ?? null,
      mana: snapshot.mana ?? null, stealth: snapshot.stealth ?? null, r_tpa: snapshot.rTpa ?? null, o_tpa: snapshot.oTpa ?? null, d_tpa: snapshot.dTpa ?? null,
      r_wpa: snapshot.rWpa ?? null, o_wpa: snapshot.oWpa ?? null, d_wpa: snapshot.dWpa ?? null, build_efficiency: snapshot.buildEfficiency ?? null,
      wages: snapshot.wages ?? null, raw_state: snapshot.rawState ?? {}, changes: snapshot.changes ?? {},
    }
    const { error: snapshotError } = await supabase.from('spartan_province_history').insert(snapshotRow)
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })

    if (body.events?.length) {
      const eventRows = body.events.map((event) => ({
        user_id: ownerId, province_id: event.provinceId ?? snapshot.provinceId ?? null, kingdom_id: event.kingdomId ?? snapshot.kingdomId ?? null,
        occurred_at: event.occurredAt ?? new Date().toISOString(), age: event.age ?? snapshot.age ?? null,
        game_year: event.gameYear ?? snapshot.gameYear ?? null, game_tick: event.gameTick ?? snapshot.gameTick ?? null,
        event_type: event.eventType, source: event.source ?? snapshot.source ?? 'universal_capture', source_id: event.sourceId ?? null,
        attacker: event.attacker ?? null, defender: event.defender ?? null, target_kingdom: event.targetKingdom ?? null,
        acres_change: event.acresChange ?? 0, troops_lost: event.troopsLost ?? 0, thieves_lost: event.thievesLost ?? 0,
        wizards_lost: event.wizardsLost ?? 0, peasants_change: event.peasantsChange ?? 0, gold_change: event.goldChange ?? 0,
        food_change: event.foodChange ?? 0, runes_change: event.runesChange ?? 0, mana_change: event.manaChange ?? 0,
        payload: event.payload ?? {}, raw_text: event.rawText ?? null,
      }))
      const { error: eventError } = await supabase.from('spartan_event_history').insert(eventRows)
      if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, captured: true, events: body.events?.length ?? 0, snapshotStored: true, storedInVault: Boolean(capture), stewardDecision: captureSteward?.decision ?? snapshotSteward.decision, knowledgeSource: snapshotKnowledge.sourceKey, knowledgeAge: snapshotKnowledge.age })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Capture failed' }, { status: 500 })
  }
}
