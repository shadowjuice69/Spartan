import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan welcome service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const number = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const discordId = extractDiscordId(user)
    if (!discordId) return NextResponse.json({ error: 'Security identity unavailable.' }, { status: 403 })

    const db = adminClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('screen_name,discord_user_id,province_name,province_location,previous_login_at,last_login_at,created_at,role')
      .eq('auth_user_id', user.id)
      .eq('discord_user_id', discordId)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return NextResponse.json({ error: 'Spartan account identity not found.' }, { status: 404 })

    const { data: province, error: provinceError } = await db
      .from('provinces')
      .select('*')
      .eq('discord_id', discordId)
      .limit(1)
      .maybeSingle()
    if (provinceError) throw provinceError

    if (!province) return NextResponse.json({ error: 'Your Spartan account is verified, but your province record is not currently available.' }, { status: 404 })

    const since = account.previous_login_at || account.created_at
    const { data: snapshots, error: snapshotError } = await db
      .from('spartan_province_history')
      .select('*')
      .eq('province_id', province.id)
      .order('observed_at', { ascending: false })
      .limit(2)
    if (snapshotError) throw snapshotError

    const { data: events, error: eventError } = await db
      .from('spartan_event_history')
      .select('id,occurred_at,event_type,raw_text,acres_change,troops_lost,thieves_lost,wizards_lost,peasants_change,gold_change,food_change,runes_change,mana_change,attacker,defender,target_kingdom,payload')
      .eq('province_id', province.id)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(100)
    if (eventError) throw eventError

    const latest = snapshots?.[0] ?? null
    const previous = snapshots?.[1] ?? null
    const delta = (key: string) => {
      const a = number(latest?.[key])
      const b = number(previous?.[key])
      return a != null && b != null ? a - b : null
    }

    const totals = (key: string) => (events ?? []).reduce((sum, event) => sum + (number(event[key]) ?? 0), 0)
    const changes = {
      acres: delta('acres'),
      networth: delta('networth'),
      population: delta('population'),
      soldiers: delta('soldiers'),
      off_specs: delta('off_specs'),
      def_specs: delta('def_specs'),
      elites: delta('elites'),
      thieves: delta('thieves'),
      wizards: delta('wizards'),
      offense: delta('offense'),
      defense: delta('defense'),
      mana: delta('mana'),
      stealth: delta('stealth'),
    }

    const criticalEvents = (events ?? []).filter((event) => /attack|war|ambush|plague|failed|loss|destroy|raze/i.test(`${event.event_type} ${event.raw_text ?? ''}`))
    const alerts: string[] = []
    if (number(latest?.defense) != null && number(latest?.defense) < 0) alerts.push('Your current defensive state needs attention.')
    if (criticalEvents.length) alerts.push(`${criticalEvents.length} combat or loss event${criticalEvents.length === 1 ? '' : 's'} occurred while you were away.`)

    return NextResponse.json({
      ok: true,
      firstLogin: !account.previous_login_at,
      identity: {
        screenName: account.screen_name,
        discordId,
        role: account.role,
        provinceId: province.id,
        provinceName: province.name,
        provinceLocation: province.location || province.slot || account.province_location,
        kingdom: province.kd_code,
        race: province.race,
        personality: province.personality,
        lastLoginAt: account.previous_login_at,
        currentLoginAt: account.last_login_at,
      },
      province,
      latest,
      changes,
      away: {
        since,
        eventCount: events?.length ?? 0,
        acresChange: totals('acres_change'),
        troopsLost: totals('troops_lost'),
        thievesLost: totals('thieves_lost'),
        wizardsLost: totals('wizards_lost'),
        peasantsChange: totals('peasants_change'),
        goldChange: totals('gold_change'),
        foodChange: totals('food_change'),
        runesChange: totals('runes_change'),
        manaChange: totals('mana_change'),
        events: events ?? [],
        alerts,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Welcome briefing failed' }, { status: 500 })
  }
}
