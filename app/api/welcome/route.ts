import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

type HistoryRow = Record<string, unknown>
type EventRow = Record<string, unknown>

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan welcome service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function verifiedAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const discordId = extractDiscordId(user)
  if (!discordId) return { error: NextResponse.json({ error: 'Security identity unavailable.' }, { status: 403 }) }
  const db = adminClient()
  const { data: account, error } = await db.from('spartan_accounts').select('screen_name,discord_user_id,province_name,province_location,previous_login_at,last_login_at,created_at,role').eq('auth_user_id', user.id).eq('discord_user_id', discordId).maybeSingle()
  if (error) throw error
  if (!account) return { error: NextResponse.json({ error: 'Spartan account identity not found.' }, { status: 404 }) }
  const { data: jeeves, error: jeevesError } = await db.from('spartan_jeeves_profiles').select('*').eq('auth_user_id', user.id).maybeSingle()
  if (jeevesError) throw jeevesError
  return { db, account, discordId, authUserId: user.id, jeeves }
}

export async function POST(request: Request) {
  try {
    const verified = await verifiedAccount()
    if ('error' in verified) return verified.error
    const body = await request.json().catch(() => ({}))
    const screenName = typeof body.screenName === 'string' ? body.screenName.trim().replace(/\s+/g, ' ') : ''
    if (!screenName) return NextResponse.json({ error: 'A Spartan name is required.' }, { status: 400 })
    if (screenName.length > 40) return NextResponse.json({ error: 'Keep your Spartan name to 40 characters or fewer.' }, { status: 400 })

    const { data: province, error: provinceError } = await verified.db.from('provinces').select('id').eq('discord_id', verified.discordId).limit(1).maybeSingle()
    if (provinceError) throw provinceError

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

    const { error: accountError } = await verified.db.from('spartan_accounts').update({ screen_name: screenName }).eq('auth_user_id', verified.authUserId).eq('discord_user_id', verified.discordId)
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
    const { data: province, error: provinceError } = await db.from('provinces').select('*').eq('discord_id', discordId).limit(1).maybeSingle()
    if (provinceError) throw provinceError
    if (!province) return NextResponse.json({ error: 'Your Spartan account is verified, but your province record is not currently available.' }, { status: 404 })

    const since = jeeves?.last_briefing_at || account.previous_login_at || account.created_at
    const { data: snapshots, error: snapshotError } = await db.from('spartan_province_history').select('*').eq('province_id', province.id).order('observed_at', { ascending: false }).limit(2)
    if (snapshotError) throw snapshotError
    const { data: events, error: eventError } = await db.from('spartan_event_history').select('id,occurred_at,event_type,raw_text,acres_change,troops_lost,thieves_lost,wizards_lost,peasants_change,gold_change,food_change,runes_change,mana_change,attacker,defender,target_kingdom,payload').eq('province_id', province.id).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(100)
    if (eventError) throw eventError

    const number = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : null }
    const historyRows = (snapshots ?? []) as HistoryRow[]
    const historyAvailable = historyRows.length > 0
    const latest = (historyRows[0] ?? null) as HistoryRow | null
    const previous = (historyRows[1] ?? null) as HistoryRow | null
    const eventRows = (events ?? []) as EventRow[]

    // History may legitimately be empty for a newly connected province. Jeeves must
    // still report the real canonical province state instead of rendering an empty briefing.
    const currentState: HistoryRow = {
      observed_at: province.updated_at,
      province_id: province.id,
      kingdom_id: province.kingdom_id,
      acres: number(province.acres),
      networth: number(province.nw),
      population: number(province.peons),
      soldiers: number(province.soldiers),
      off_specs: number(province.off_specs),
      def_specs: number(province.def_specs),
      elites: number(province.elites),
      thieves: number(province.thieves),
      wizards: number(province.wizards),
      offense: number(province.off),
      defense: number(province.def),
      mana: number(province.mana),
      stealth: number(province.stlth),
      build_efficiency: number(province.be),
      wages: number(province.wages),
      source: 'canonical_province',
    }
    const reportLatest = latest ?? currentState
    const delta = (key: string) => { const a = number(latest?.[key]); const b = number(previous?.[key]); return a != null && b != null ? a - b : null }
    const totals = (key: string) => eventRows.reduce((sum, event) => sum + (number(event[key]) ?? 0), 0)
    const criticalEvents = eventRows.filter((event) => /attack|war|ambush|plague|failed|loss|destroy|raze/i.test(`${event.event_type ?? ''} ${event.raw_text ?? ''}`))
    const alerts: string[] = []
    const currentDefense = number(reportLatest.defense)
    if (currentDefense != null && currentDefense < 0) alerts.push('Your current defensive state needs attention.')
    if (criticalEvents.length) alerts.push(`${criticalEvents.length} combat or loss event${criticalEvents.length === 1 ? '' : 's'} occurred while you were away.`)

    const firstArrival = !jeeves?.introduced_at
    const currentName = jeeves?.preferred_name || account.screen_name || ''
    return NextResponse.json({
      ok: true,
      firstArrival,
      jeeves: {
        name: 'Jeeves',
        title: 'Personal Steward',
        introducedAt: jeeves?.introduced_at ?? null,
        preferredName: currentName,
        lastBriefingAt: jeeves?.last_briefing_at ?? null,
        briefingCount: jeeves?.briefing_count ?? 0,
      },
      firstLogin: firstArrival,
      identity: { screenName: currentName, discordId, role: account.role, provinceId: province.id, provinceName: province.name, provinceLocation: province.location || province.slot || account.province_location, kingdom: province.kd_code, race: province.race, personality: province.personality, lastLoginAt: account.previous_login_at, currentLoginAt: account.last_login_at },
      province,
      latest: reportLatest,
      historyAvailable,
      changes: { acres: delta('acres'), networth: delta('networth'), population: delta('population'), soldiers: delta('soldiers'), off_specs: delta('off_specs'), def_specs: delta('def_specs'), elites: delta('elites'), thieves: delta('thieves'), wizards: delta('wizards'), offense: delta('offense'), defense: delta('defense'), mana: delta('mana'), stealth: delta('stealth') },
      away: { since, eventCount: eventRows.length, acresChange: totals('acres_change'), troopsLost: totals('troops_lost'), thievesLost: totals('thieves_lost'), wizardsLost: totals('wizards_lost'), peasantsChange: totals('peasants_change'), goldChange: totals('gold_change'), foodChange: totals('food_change'), runesChange: totals('runes_change'), manaChange: totals('mana_change'), events: eventRows, alerts },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Jeeves briefing failed' }, { status: 500 })
  }
}
