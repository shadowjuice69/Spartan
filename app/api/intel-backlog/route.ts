import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DESTINATIONS: Record<string, { label: string; consumers: string[] }> = {
  magic: { label: 'Magic', consumers: ['Magic Intel', 'province magic data'] },
  thievery: { label: 'Thievery', consumers: ['Thievery Intel', 'operation history'] },
  news: { label: 'Attacks / News', consumers: ['News', 'War Room'] },
  attack: { label: 'Attacks / News', consumers: ['News', 'War Room', 'Military'] },
  military: { label: 'Military', consumers: ['Military Intel', 'War Room'] },
  science: { label: 'Science', consumers: ['Science Intel', 'science calculator inputs'] },
  buildings: { label: 'Buildings / Survey', consumers: ['Buildings', 'Build Lab inputs'] },
  survey: { label: 'Buildings / Survey', consumers: ['Buildings', 'Build Lab inputs'] },
  ritual: { label: 'Rituals', consumers: ['Magic / Ritual Intel'] },
  aid: { label: 'Aid', consumers: ['Aid Intel'] },
  dragon: { label: 'Dragons', consumers: ['Magic / Dragon Intel'] },
  exploration: { label: 'Exploration', consumers: ['Exploration Intel'] },
  throne: { label: 'Province state', consumers: ['Province', 'province history'] },
  som: { label: 'Military state', consumers: ['Military', 'province history'] },
  kingdom: { label: 'Kingdom', consumers: ['Kingdom Intel'] },
  universal: { label: 'Universal capture', consumers: ['classification review'] },
  bot_event: { label: 'Unclassified bot event', consumers: ['needs classification / review'] },
  unknown: { label: 'Unknown', consumers: ['needs classification / review'] },
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan Intel service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = admin()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('id,province_name,province_location')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account?.province_location) return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })

    const kingdom = String(account.province_location)
    const [{ data: flows, error: flowError }, { data: captures, error: captureError }, { data: records, error: recordError }] = await Promise.all([
      db.from('spartan_data_flow')
        .select('capture_id,source,page_kind,kingdom_id,province_id,created_at')
        .eq('source', 'discord-bot')
        .or(`kingdom_id.eq.${kingdom},kingdom_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(1000),
      db.from('spartan_capture_vault')
        .select('id,capture_id,source,page_kind,kingdom_id,province_id,captured_at,raw_text,parsed_payload')
        .eq('source', 'discord-bot')
        .or(`kingdom_id.eq.${kingdom},kingdom_id.is.null`)
        .order('captured_at', { ascending: false })
        .limit(1000),
      db.from('spartan_intel_records_with_archive')
        .select('id,capture_id,source_vault_id,page_kind,kingdom_id,captured_at,created_at,classification_confidence,classification_reason,parsed_payload')
        .eq('source', 'discord-bot')
        .or(`kingdom_id.eq.${kingdom},kingdom_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(1500),
    ])
    if (flowError) throw flowError
    if (captureError) throw captureError
    if (recordError) throw recordError

    const flowByCapture = new Map<string, any>()
    for (const flow of flows || []) if (flow.capture_id && !flowByCapture.has(String(flow.capture_id))) flowByCapture.set(String(flow.capture_id), flow)
    const recordByCapture = new Map<string, any>()
    const recordByVault = new Map<string, any>()
    for (const row of records || []) {
      if (row.capture_id && !recordByCapture.has(String(row.capture_id))) recordByCapture.set(String(row.capture_id), row)
      if (row.source_vault_id != null && !recordByVault.has(String(row.source_vault_id))) recordByVault.set(String(row.source_vault_id), row)
    }

    const rows = (captures || []).map((capture: any) => {
      const flow = flowByCapture.get(String(capture.capture_id))
      const intel = recordByVault.get(String(capture.id)) || recordByCapture.get(String(capture.capture_id))
      const parsed = capture.parsed_payload || {}
      const metadata = parsed?.data?.metadata || {}
      const markedOperation = /<<__[^_]+__>>/i.test(String(capture.raw_text || ''))
      const isBotAuthor = metadata.author_bot === true || metadata.author_bot === 'true'
      const kind = String(intel?.page_kind || (markedOperation && isBotAuthor ? 'bot_event' : flow?.page_kind || capture.page_kind || 'unknown'))
      const destination = DESTINATIONS[kind] || { label: kind, consumers: ['destination needs verification'] }
      const isOperation = markedOperation && isBotAuthor
      const status = !intel ? 'missing_projection'
        : kind === 'bot_event' || kind === 'unknown' ? 'needs_classification'
        : 'routed'
      return {
        vaultId: capture.id,
        captureId: capture.capture_id,
        capturedAt: capture.captured_at,
        rawText: String(capture.raw_text || '').slice(0, 600),
        hasFlow: Boolean(flow),
        hasIntel: Boolean(intel),
        intelId: intel?.id || null,
        pageKind: kind,
        status,
        isOperation,
        destination: destination.label,
        consumers: destination.consumers,
        confidence: intel?.classification_confidence ?? null,
        reason: intel?.classification_reason || (!flow ? 'No matching processing-flow row found' : !intel ? 'Capture exists but no Intel projection matched it' : 'Destination inferred from existing classification'),
      }
    }).filter((row: any) => row.status !== 'routed')

    const counts = {
      visible: rows.length,
      missingProjection: rows.filter((row: any) => row.status === 'missing_projection').length,
      needsClassification: rows.filter((row: any) => row.status === 'needs_classification').length,
      routed: (captures || []).filter((capture: any) => { const intel = recordByVault.get(String(capture.id)) || recordByCapture.get(String(capture.capture_id)); return Boolean(intel && !['bot_event', 'unknown'].includes(String(intel.page_kind || 'unknown'))); }).length,
      operationCaptures: (captures || []).filter((capture: any) => {
        const metadata = capture.parsed_payload?.data?.metadata || {}
        return /<<__[^_]+__>>/i.test(String(capture.raw_text || '')) && (metadata.author_bot === true || metadata.author_bot === 'true')
      }).length,
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      kingdom,
      province: account.province_name,
      counts,
      destinations: DESTINATIONS,
      rows,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Intel backlog query failed' }, { status: 500 })
  }
}
