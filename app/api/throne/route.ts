import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan throne service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const discordId = extractDiscordId(user)
    const db = adminClient()

    // The Spartan account is the authoritative identity link. Discord remains
    // the primary identity signal, while the account's stored province name /
    // location makes the link durable across every dashboard page.
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('auth_user_id,discord_user_id,screen_name,province_name,province_location,role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError

    const accountDiscordId = account?.discord_user_id ? String(account.discord_user_id) : discordId
    if (!accountDiscordId) return NextResponse.json({ error: 'Security identity unavailable.' }, { status: 403 })

    let province = null
    let provinceError = null

    // Prefer the account's explicit province link.
    if (account?.province_name) {
      const result = await db
        .from('provinces')
        .select('*')
        .eq('name', account.province_name)
        .eq('kd_code', account.province_location)
        .limit(1)
        .maybeSingle()
      province = result.data
      provinceError = result.error
    }

    // Fall back to the Discord-linked province for accounts created before
    // province_location was populated.
    if (!province && !provinceError) {
      const result = await db
        .from('provinces')
        .select('*')
        .eq('discord_id', accountDiscordId)
        .limit(1)
        .maybeSingle()
      province = result.data
      provinceError = result.error
    }

    if (provinceError) throw provinceError
    if (!province) return NextResponse.json({ error: 'Your Spartan account is not linked to a province yet.' }, { status: 404 })

    const canonicalThrone = province.state_data?.throne ?? null
    const canonicalCapturedAt = province.state_data?.throne_captured_at ?? province.updated_at ?? null

    const { data: throneRow, error: throneError } = await db
      .from('intel_throne')
      .select('*')
      .eq('kd_code', province.kd_code)
      .eq('province', province.name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (throneError) throw throneError

    // Canonical state wins when it is newer. This prevents an older intel_throne
    // row from masking the freshly processed Throne capture.
    const throneDate = throneRow?.created_at ? new Date(throneRow.created_at).getTime() : 0
    const canonicalDate = canonicalCapturedAt ? new Date(canonicalCapturedAt).getTime() : 0
    const useCanonical = canonicalThrone && canonicalDate >= throneDate

    const throne = useCanonical
      ? {
          ...throneRow,
          province: canonicalThrone.name ?? province.name,
          kd_code: canonicalThrone.coordinates ?? province.kd_code,
          ruler: canonicalThrone.ruler ?? province.ruler,
          race: canonicalThrone.race ?? province.race,
          land: canonicalThrone.acres ?? province.acres,
          networth: canonicalThrone.nw ?? province.nw,
          offense: canonicalThrone.off ?? province.off,
          defense: canonicalThrone.def ?? province.def,
          be: canonicalThrone.be ?? province.be,
          peasants: canonicalThrone.peons ?? province.peons,
          thieves: canonicalThrone.thieves ?? province.thieves,
          wizards: canonicalThrone.wizards ?? province.wizards,
          tpa: canonicalThrone.o_tpa ?? province.o_tpa,
          wpa: canonicalThrone.o_wpa ?? province.o_wpa,
          created_at: canonicalCapturedAt,
          troops: {
            ...(throneRow?.troops ?? {}),
            soldiers: canonicalThrone.soldiers ?? province.soldiers,
            war_horses: canonicalThrone.war_horses ?? province.war_horses,
            prisoners: canonicalThrone.prisoners ?? province.prisoners,
          },
          good_spells: canonicalThrone.good_spells ?? province.good_spells,
        }
      : throneRow

    return NextResponse.json({
      ok: true,
      source: useCanonical ? 'provinces.state_data.throne' : throne ? 'intel_throne' : 'provinces',
      capturedAt: throne?.created_at ?? canonicalCapturedAt ?? province.updated_at ?? null,
      identity: {
        screenName: account?.screen_name ?? null,
        discordUserId: accountDiscordId,
        provinceId: province.id,
        provinceName: province.name,
        kingdomId: province.kd_code,
        role: account?.role ?? null,
      },
      throne,
      province,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Throne data unavailable' }, { status: 500 })
  }
}
