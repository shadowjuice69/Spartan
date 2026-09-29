import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseKingdomStructured, type KingdomProvince } from '@/lib/spartan/kingdom-data'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan Kingdom service is not configured.')
  return createServiceClient()
}

type CaptureRow = {
  capture_id: string | null
  captured_at: string
  kingdom_id: string | null
  parsed_payload: any
}

function details(row: CaptureRow) {
  const existing = row.parsed_payload?.kingdom_details
  if (existing && Array.isArray(existing.provinces)) return existing
  return parseKingdomStructured('', {}, row.parsed_payload || {})
}

function delta(current: number | null, previous: number | null) {
  if (current == null || previous == null) return null
  return current - previous
}

export async function GET() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = adminClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('province_name,province_location')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (accountError) throw accountError
    if (!account?.province_location) {
      return NextResponse.json({ error: 'Your Spartan account is not linked to a kingdom.' }, { status: 403 })
    }

    // The capture vault is evidence storage and may be compacted by retention.
    // Kingdom intelligence is also canonicalized into spartan_intel_records, so
    // the page must remain populated after vault cleanup.
    const { data: captures, error: captureError } = await db
      .from('spartan_capture_vault')
      .select('capture_id,captured_at,kingdom_id,parsed_payload')
      .eq('kingdom_id', account.province_location)
      .eq('page_kind', 'kingdom')
      .order('captured_at', { ascending: false })
      .limit(60)

    if (captureError) throw captureError

    let sourceRows: CaptureRow[] = (captures || []) as CaptureRow[]

    if (!sourceRows.length) {
      const { data: intelRows, error: intelError } = await db
        .from('spartan_intel_records')
        .select('id,captured_at,kingdom_id,parsed_payload')
        .eq('kingdom_id', account.province_location)
        .eq('page_kind', 'kingdom')
        .order('captured_at', { ascending: false })
        .limit(60)

      if (intelError) throw intelError

      sourceRows = (intelRows || []).map((row: any) => ({
        capture_id: row.id,
        captured_at: row.captured_at,
        kingdom_id: row.kingdom_id,
        parsed_payload: row.parsed_payload,
      }))
    }

    const snapshots = sourceRows
      .map((row: any) => {
        const d = details(row as CaptureRow)
        return {
          capturedAt: row.captured_at,
          captureId: row.capture_id,
          kdCode: d.kdCode || account.province_location,
          kingdomName: d.kingdomName || null,
          totalProvinces: d.totalProvinces || d.provinces?.length || 0,
          totalNw: d.totalNw,
          totalLand: d.totalLand,
          nwRank: d.nwRank,
          landRank: d.landRank,
          provinces: Array.isArray(d.provinces) ? d.provinces : [],
        }
      })
      .filter((snapshot: any) => snapshot.provinces.length > 0)

    const latest = snapshots[0] || null
    const previous = snapshots[1] || null
    const previousBySlot = new Map<number, KingdomProvince>()
    for (const p of previous?.provinces || []) previousBySlot.set(p.slot, p)

    const members = (latest?.provinces || []).map((p: KingdomProvince) => {
      const before = previousBySlot.get(p.slot)
      return {
        ...p,
        deltaLand: delta(p.land, before?.land ?? null),
        deltaNw: delta(p.nw, before?.nw ?? null),
        deltaNwpa: delta(p.nwpa, before?.nwpa ?? null),
        deltaGains: delta(p.gains, before?.gains ?? null),
      }
    })

    const trend = [...snapshots].reverse().map((s: any) => {
      const totalLand = s.totalLand ?? s.provinces.reduce((n: number, p: KingdomProvince) => n + p.land, 0)
      const totalNw = s.totalNw ?? s.provinces.reduce((n: number, p: KingdomProvince) => n + p.nw, 0)
      const avgNwpa = s.provinces.length ? s.provinces.reduce((n: number, p: KingdomProvince) => n + p.nwpa, 0) / s.provinces.length : null
      const totalGains = s.provinces.reduce((n: number, p: KingdomProvince) => n + p.gains, 0)
      return { capturedAt: s.capturedAt, totalLand, totalNw, avgNwpa, totalGains, provinceCount: s.provinces.length }
    })

    const memberHistory: Record<string, any[]> = {}
    for (const snapshot of [...snapshots].reverse()) {
      for (const p of snapshot.provinces) {
        const key = String(p.slot)
        if (!memberHistory[key]) memberHistory[key] = []
        memberHistory[key].push({
          capturedAt: snapshot.capturedAt,
          land: p.land,
          nw: p.nw,
          nwpa: p.nwpa,
          gains: p.gains,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      kingdom: {
        code: latest?.kdCode || account.province_location,
        name: latest?.kingdomName || null,
        yourProvince: account.province_name,
      },
      latest: latest ? {
        capturedAt: latest.capturedAt,
        captureId: latest.captureId,
        totalProvinces: latest.totalProvinces,
        totalNw: latest.totalNw,
        totalLand: latest.totalLand,
        nwRank: latest.nwRank,
        landRank: latest.landRank,
        members,
      } : null,
      trend,
      memberHistory,
      capturesAvailable: snapshots.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kingdom data query failed' }, { status: 500 })
  }
}
