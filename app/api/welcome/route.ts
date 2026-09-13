import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

type HistoryRow = Record<string, any>
type EventRow = Record<string, any>

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan welcome service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function number(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function canonicalState(province: any): HistoryRow {
  const throne = province?.state_data?.throne ?? {}
  return {
    observed_at: province?.state_data?.throne_captured_at ?? province?.updated_at ?? new Date().toISOString(),
    province_id: province?.id,
    kingdom_id: province?.kd_code,
    acres: number(throne.acres ?? province?.acres),
    networth: number(throne.nw ?? province?.nw),
    population: number(throne.peons ?? province?.peons),
    soldiers: number(throne.soldiers ?? province?.soldiers),
    off_specs: number(throne.off_specs ?? province?.off_specs),
    def_specs: number(throne.def_specs ?? province?.def_specs),
    elites: number(throne.elites ?? province?.elites),
    thieves: number(throne.thieves ?? province?.thieves),
    wizards: number(throne.wizards ?? province?.wizards),
    offense: number(throne.off ?? province?.off),
    defense: number(throne.def ?? province?.def),
    mana: number(throne.mana ?? province?.mana),
    stealth: number(throne.stlth ?? province?.stlth),
    build_efficiency: number(throne.be ?? province?.be),
    wages: number(throne.wages ?? province?.wages),
    source: 'canonical_province',
  }
}

function normalizeSnapshot(row: HistoryRow, fallback: HistoryRow) {
  const out = { ...fallback, ...row }
  for (const key of ['acres','networth','population','soldiers','off_specs','def_specs','elites','thieves','wizards','offense','defense','mana','stealth','build_efficiency','wages']) {
    if (out[key] == null) out[key] = fallback[key]
  }
  return out
}

async function verifiedAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const discordId = extractDiscordId(user)
  const db = adminClient()
  const { data: account, error } = await db.from('spartan_accounts')
    .select('screen_name,discord_user_id,province_name,province_location,previous_login_at,last_login_at,created_at,role')
    .eq('auth_user_id', user.id).maybeSingle()
  if (error) throw error
  if (!account) return { error: NextResponse.json({ error: 'Spartan account identity not found.' }, { status: 404 }) }
  const effectiveDiscordId = String(account.discord_user_id || discordId || '') || null
  const { data: jeeves, error: jeevesError } = await db.from('spartan_jeeves_profiles').select('*').eq('auth_user_id', user.id).maybeSingle()
  if (jeevesError) throw jeevesError
  return { db, account, discordId: effectiveDiscordId, authUserId: user.id, jeeves }
}

export async function POST(request: Request) {
  try {
    const verified = await verifiedAccount()
    if ('error' in verified) return verified.error
    const body = await request.json().catch(() => ({}))
    const screenName = typeof body.screenName === 'string' ? body.screenName.trim().replace(/\s+/g, ' ') : ''
    if (!screenName) return NextResponse.json({ error: 'A Spartan name is required.' }, { status: 400 })
    if (screenName.length > 40) return NextResponse.json({ error: 'Keep your Spartan name to 40 characters or fewer.' }, { status: 400 })
    let provinceQuery = verified.db.from('provinces').select('id').eq('name', verified.account.province_name || '')
    if (verified.account.province_location) provinceQuery = provinceQuery.eq('kd_code', verified.account.province_location)
    let { data: province, error: provinceError } = await provinceQuery.limit(1).maybeSingle()
    if (provinceError) throw provinceError
    if (!province && verified.discordId) {
      const fallback = await verified.db.from('provinces').select('id').eq('discord_id', verified.discordId).limit(1).maybeSingle()
      if (fallback.error) throw fallback.error
      province = fallback.data
    }
    const now = new Date().toISOString()
    const { data: profile, error: profileError } = await verified.db.from('spartan_jeeves_profiles').upsert({
      auth_user_id: verified.authUserId,
      discord_user_id: verified.discordId,
      province_id: province?.id ?? null,
      preferred_name: screenName,
      introduced_at: verified.jeeves?.introduced_at ?? now,
      last_briefing_at: now,
      briefing_count: (verified.jeeves?.briefing_count ?? 0) + 1,
      updated_at: now,
    }, { onConflict: 'auth_user_id' }).select('*').single()
    if (profileError) throw profileError
    const { error: accountError } = await verified.db.from('spartan_accounts').update({ screen_name: screenName }).eq('auth_user_id', verified.authUserId)
    if (accountError) throw accountError
    return NextResponse.json({ ok: true, jeeves: profile, screenName })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to establish Jeeves.' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const verified = await verifiedAccount()
    if ('error' in verified) return verified.error
    const { db, account, discordId, jeeves } = verified
    let provinceQuery = db.from('provinces').select('*').eq('name', account.province_name || '')
    if (account.province_location) provinceQuery = provinceQuery.eq('kd_code', account.province_location)
    let { data: province, error: provinceError } = await provinceQuery.limit(1).maybeSingle()
    if (provinceError) throw provinceError
    if (!province && discordId) {
      const fallback = await db.from('provinces').select('*').eq('discord_id', discordId).limit(1).maybeSingle()
      if (fallback.error) throw fallback.error
      province = fallback.data
    }
    if (!province) return NextResponse.json({ error: 'Your Spartan account is verified, but your province record is not currently available.' }, { status: 404 })

    const since = jeeves?.last_briefing_at || account.previous_login_at || account.created_at
    const { data: snapshots, error: snapshotError } = await db.from('spartan_province_history').select('*').eq('province_id', province.id).order('observed_at', { ascending: false }).limit(2)
    if (snapshotError) throw snapshotError
    const { data: events, error: eventError } = await db.from('spartan_event_history')
      .select('id,occurred_at,event_type,raw_text,acres_change,troops_lost,thieves_lost,wizards_lost,peasants_change,gold_change,food_change,runes_change,mana_change,attacker,defender,target_kingdom,payload')
      .eq('province_id', province.id).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(100)
    if (eventError) throw eventError

    const fallback = canonicalState(province)
    const historyRows = (snapshots ?? []) as HistoryRow[]
    const latest = normalizeSnapshot(historyRows[0] ?? {}, fallback)
    const previous = historyRows[1] ? normalizeSnapshot(historyRows[1], fallback) : null
    const historyAvailable = Boolean(previous)
    const eventRows = (events ?? []) as EventRow[]
    const delta = (key: string) => {
      const a = number(latest[key]); const b = previous ? number(previous[key]) : null
      return a != null && b != null ? a - b : null
    }
    const totals = (key: string) => eventRows.reduce((sum, event) => sum + (number(event[key]) ?? 0), 0)
    const criticalEvents = eventRows.filter(event => /attack|war|ambush|plague|failed|loss|destroy|raze/i.test(`${event.event_type ?? ''} ${event.raw_text ?? ''}`))
    const alerts: string[] = []
    if (number(latest.defense) != null && number(latest.defense) < 0) alerts.push('Your current defensive state needs attention.')
    if (criticalEvents.length) alerts.push(`${criticalEvents.length} combat or loss event${criticalEvents.length === 1 ? '' : 's'} occurred while you were away.`)
    const firstArrival = !jeeves?.introduced_at
    const currentName = jeeves?.preferred_name || account.screen_name || ''

    return NextResponse.json({
      ok: true,
      firstArrival,
      firstLogin: firstArrival,
      historyAvailable,
      jeeves: { name: 'Jeeves', title: 'Personal Steward', introducedAt: jeeves?.introduced_at ?? null, preferredName: currentName, lastBriefingAt: jeeves?.last_briefing_at ?? null, briefingCount: jeeves?.briefing_count ?? 0 },
      identity: { screenName: currentName, discordId, role: account.role, provinceId: province.id, provinceName: province.name, provinceLocation: province.location || province.slot || account.province_location, kingdom: province.kd_code, race: province.race, personality: province.personality, lastLoginAt: account.previous_login_at, currentLoginAt: account.last_login_at },
      province,
      latest,
      changes: { acres: delta('acres'), networth: delta('networth'), population: delta('population'), soldiers: delta('soldiers'), off_specs: delta('off_specs'), def_specs: delta('def_specs'), elites: delta('elites'), thieves: delta('thieves'), wizards: delta('wizards'), offense: delta('offense'), defense: delta('defense'), mana: delta('mana'), stealth: delta('stealth') },
      away: { since, eventCount: eventRows.length, acresChange: totals('acres_change'), troopsLost: totals('troops_lost'), thievesLost: totals('thieves_lost'), wizardsLost: totals('wizards_lost'), peasantsChange: totals('peasants_change'), goldChange: totals('gold_change'), foodChange: totals('food_change'), runesChange: totals('runes_change'), manaChange: totals('mana_change'), events: eventRows, alerts },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Jeeves briefing failed' }, { status: 500 })
  }
}
