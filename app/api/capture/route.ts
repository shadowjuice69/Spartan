import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ProvinceSnapshot, SpartanEvent } from '@/lib/spartan/history'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      snapshot?: ProvinceSnapshot
      events?: SpartanEvent[]
    }

    const snapshot = body.snapshot
    if (!snapshot) return NextResponse.json({ error: 'snapshot is required' }, { status: 400 })

    const snapshotRow = {
      user_id: user.id,
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

    const { error: snapshotError } = await supabase.from('spartan_province_history').insert(snapshotRow)
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })

    if (body.events?.length) {
      const eventRows = body.events.map((event) => ({
        user_id: user.id,
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

    return NextResponse.json({ ok: true, captured: true, events: body.events?.length ?? 0 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Capture failed' }, { status: 500 })
  }
}
