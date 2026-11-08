import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { describeRecord } from '@/lib/spartan/describe-record'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Spartan Intel service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const kinds: Record<string, string[]> = {
  // Intel is the complete classified feed. Nothing that has been classified
  // by the live capture/bot pipeline should disappear simply because a
  // dedicated page does not exist for that kind yet.
  intel: [
    'intel', 'utopiaintel', 'bot_event', 'news', 'attack', 'aid', 'military',
    'som', 'magic', 'ritual', 'dragon', 'thievery', 'science', 'buildings',
    'survey', 'throne', 'kingdom', 'universal', 'exploration', 'war',
    'council_history', 'council_spells', 'council_state', 'council_military',
    'council_science', 'council_internal', 'province_state', 'age_stats', 'unknown'
  ],
  military: ['military', 'som', 'attack', 'council_military', 'war'],
  magic: ['magic', 'ritual', 'dragon', 'council_spells', 'bot_event'],
  thievery: ['thievery', 'bot_event'],
  science: ['science', 'council_science'],
  buildings: ['survey', 'buildings', 'council_internal'],
  throne: ['throne', 'province_state', 'province_logs'],
  kingdom: ['kingdom', 'council_state'],
  'war-room': ['attack', 'war', 'military', 'thievery', 'magic', 'ritual', 'dragon', 'aid', 'exploration', 'bot_event'],
  aid: ['aid', 'bot_event'],
  news: ['news', 'council_history', 'province_logs', 'bot_event'],
  exploration: ['exploration'],
  operations: ['attack', 'thievery', 'magic', 'ritual', 'aid', 'exploration'],
}

function payload(row: any) {
  if (row.parsed_payload && typeof row.parsed_payload === 'object') return row.parsed_payload
  if (typeof row.parsed_payload === 'string') {
    try { return JSON.parse(row.parsed_payload) } catch {}
  }
  return row.raw_payload ?? {}
}

function botEventBelongsToSection(row: any, section: string) {
  if (row.source !== 'discord-bot' || row.page_kind !== 'bot_event') return true
  const parsed = payload(row)
  const classified = String(parsed?.classification?.page_kind || '').toLowerCase()
  if (classified && classified !== 'bot_event') return classified === section
  const text = String(row.raw_text || '')
  if (section === 'thievery') return /<<__[^_]{2,80}__\s*\*\*?\|[^|]{1,120}\(\d+:\d+\)\*\*?>>\s*\|.{0,180}\bsent\b/i.test(text)
  if (section === 'magic') return /<<__[^_]{2,80}__\s*(?:\*\*?\|[^|]{1,120}\(\d+:\d+\)\*\*?>>)?\s*(?:\*\*)?\d+|\bspell succeeds\b|\bspell fails\b/i.test(text)
  if (section === 'news') return /NEW KDNEWS:|\battacked\s+__|\binvaded\s+\d+\s*-|\bambushed armies from\b/i.test(text)
  if (section === 'war-room') return /NEW KDNEWS:|\battacked\s+__|\binvaded\s+\d+\s*-|\bambushed armies from\b|<<__[^_]{2,80}__\s*\*\*?\|[^|]{1,120}\(\d+:\d+\)\*\*?>>\s*\|.{0,180}\bsent\b|We have sent\s+[\d,]+\s+.+?\s+to\s+.+?\(\d+:\d+\)/i.test(text)
  if (section === 'aid') return /\bWe have sent\s+[\d,]+\s+.+?\s+to\s+.+?\(\d+:\d+\)/i.test(text)
  return false
}

function enrichBotPayload(row: any, parsed: any) {
  if (row.source !== 'discord-bot') return parsed
  const root = parsed && typeof parsed === 'object' ? { ...parsed } : {}
  const data = root.data && typeof root.data === 'object' ? { ...root.data } : {}
  const text = String(row.raw_text || data.content || '')
  const events: any[] = []
  const thievery = /<<__([^_]{2,80})__\s*\*\*?\|\s*(.+?)\s*\((\d+:\d+)\)\*\*?>>\s*\|\s*([\d,]+)\s*sent\s*\(([\d.]+)\)/gi
  for (const match of text.matchAll(thievery)) {
    const lineStart = text.slice(0, match.index || 0).split(/\r?\n/).length - 1
    const line = text.split(/\r?\n/)[lineStart] || ''
    const failed = /__FAIL__/i.test(line)
    events.push({
      kind: 'thievery', operation: match[1].replace(/_/g, ' ').trim(),
      targetProvince: match[2].trim(), targetKingdom: match[3],
      thievesSent: Number(match[4].replace(/,/g, '')), tpa: Number(match[5]),
      outcome: failed ? 'failed' : /success/i.test(line) ? 'success' : 'unknown',
    })
  }
  const magic = /<<__([^_]{2,80})__(?:\s*\*\*?\|\s*(.+?)\s*\((\d+:\d+)\)\*\*?>>)?([^\n]*)/gi
  for (const match of text.matchAll(magic)) {
    const tail = String(match[4] || '')
    const duration = tail.match(/^\s*\*{0,2}([\d,]+)\*{0,2}\s*\|/)
    if (!duration && !/\bFAIL\b|spell fails|spell succeeds/i.test(tail)) continue
    events.push({
      kind: 'magic', spellName: match[1].replace(/_/g, ' ').trim(),
      targetProvince: match[2]?.trim() || null, targetKingdom: match[3] || null,
      duration: duration ? Number(duration[1].replace(/,/g, '')) : null,
      outcome: /\bFAIL\b|spell fails/i.test(tail) ? 'failed' : duration || /spell succeeds/i.test(tail) ? 'success' : 'unknown',
    })
  }
  const kdnews = /(?:NEW KDNEWS:\s*)?(\d+\s*-\s*.+?)\s*\((\d+:\d+)\)\s+(?:invaded|attacked and pillaged|ambushed armies from)\s+(.+?)\s*\((\d+:\d+)\)(?:\s+and captured\s+([\d,]+) acres|\s+and took\s+([\d,]+) acres)?/gi
  for (const match of text.matchAll(kdnews)) {
    events.push({
      kind: 'news', attacker: match[1].replace(/^\d+\s*-\s*/, '').trim(), attackerKingdom: match[2],
      targetProvince: match[3].replace(/^the lands of\s+/i, '').replace(/^\d+\s*-\s*/, '').trim(), targetKingdom: match[4],
      acresCaptured: Number(String(match[5] || match[6] || '0').replace(/,/g, '')),
    })
  }
  const aid = text.match(/We have sent\s+([\d,]+)\s+([a-z ]+?)\s+to\s+(.+?)\s+\((\d+:\d+)\)/i)
  if (aid) events.push({ kind: 'aid', amount: Number(aid[1].replace(/,/g, '')), resource: aid[2].trim(), targetProvince: aid[3].trim(), targetKingdom: aid[4] })

  if (events.length) {
    data.events = events
    const first = events[0]
    for (const key of ['operation','spellName','targetProvince','targetKingdom','thievesSent','tpa','outcome','duration','attacker','attackerKingdom','acresCaptured','amount','resource']) {
      if (first[key] !== undefined) data[key] = first[key]
    }
    if (first.kind === 'thievery') data.operation = first.operation
    if (first.kind === 'magic') data.spellName = first.spellName
    if (first.kind === 'news') data.attacker = first.attacker
    if (first.kind === 'aid') data.shipment = `${first.amount.toLocaleString()} ${first.resource} to ${first.targetProvince} (${first.targetKingdom})`
  }
  root.data = data
  return root
}

function dedupeDiscordMessages(rows: any[]) {
  const seen = new Set<string>()
  return rows.filter(row => {
    if (row.source !== 'discord-bot') return true
    const parsed = payload(row)
    const messageId = String(row.source_id || parsed?.data?.discord?.message_id || '')
    if (!messageId) return true
    const key = `${row.source}:${messageId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function GET(request: Request) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = new URL(request.url).searchParams
    const section = params.get('section') || 'kingdom'
    const summary = params.get('summary') === '1'
    const db = adminClient()
    const { data: account, error: accountError } = await db
      .from('spartan_accounts')
      .select('id,province_name,province_location')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account?.province_name || !account?.province_location) return NextResponse.json({ error: 'Your Spartan account identity is not linked.' }, { status: 403 })

    const { data: registry, error: registryError } = await db
      .from('spartan_province_registry')
      .select('province_id,province_name,kingdom_code')
      .eq('user_id', user.id)
      .eq('province_name', account.province_name)
      .eq('kingdom_code', account.province_location)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (registryError) throw registryError

    const selectedKinds = kinds[section] || [section]
    // Cross-province data is intentional only on shared Intel/Kingdom/News/War Room views.
    // Private views intersect the ownership match with the current kingdom so an old province
    // that reused the account UUID cannot leak into the current age.
    const sharedSections = new Set(['intel', 'kingdom', 'news', 'war-room'])
    const isSharedSection = sharedSections.has(section)
    const recordScope = isSharedSection
      ? `kingdom_id.eq.${account.province_location},kingdom_id.is.null`
      : `province_id.eq.${account.id},province_id.eq.${registry?.province_id || account.id},user_id.eq.${account.id},user_id.eq.${user.id}`
    const scopeQuery = (query: any) => isSharedSection
      ? query.or(recordScope)
      : query.eq('kingdom_id', account.province_location).or(recordScope)
    let data: any[] | null = null
    let error: any = null
    if (summary && section === 'intel') {
      const result = await scopeQuery(db
        .from('spartan_intel_records_with_archive')
        .select('id,capture_id,user_id,province_id,kingdom_id,target_province_id,target_kingdom_id,captured_at,created_at,source,url,page_kind,classification_confidence,classification_reason,classification_source,intel_type,visibility,metrics,parsed_payload,expires_at,archived,archived_at')
        .in('page_kind', selectedKinds))
        .order('created_at', { ascending: false })
        .limit(120)
      data = result.data as any[] | null
      error = result.error
    } else {
      const result = await scopeQuery(db
        .from('spartan_intel_records_with_archive')
        .select('id,capture_id,source_vault_id,user_id,province_id,kingdom_id,captured_at,created_at,updated_at,source,source_id,url,page_kind,classification_confidence,classification_reason,age,game_year,game_tick,retention_class,expires_at,raw_text,classification_source,parsed_payload,raw_payload,target_province_id,target_kingdom_id,intel_type,visibility,metrics,archived,archived_at')
        .in('page_kind', selectedKinds))
        .order('created_at', { ascending: false })
        .limit(500)
      data = result.data as any[] | null
      error = result.error
    }
    if (error) throw error

    const rows = dedupeDiscordMessages((data || []).filter((row: any) =>
      !(sharedSections.has(section) && row.visibility === 'own' && row.user_id !== user.id) &&
      botEventBelongsToSection(row, section)
    ))
    const provinceIds = [...new Set(rows.map((row: any) => row.province_id).filter(Boolean))]
    const registryById = new Map<string, { name: string | null; kingdom: string | null; slot: number | null }>()

    if (provinceIds.length) {
      const { data: registry, error: registryError } = await db
        .from('spartan_province_registry')
        .select('province_id,province_name,kingdom_code,slot,updated_at')
        .in('province_id', provinceIds)
        .order('updated_at', { ascending: false })
      if (registryError) throw registryError
      for (const entry of registry || []) {
        if (!registryById.has(String(entry.province_id))) {
          registryById.set(String(entry.province_id), {
            name: entry.province_name || null,
            kingdom: entry.kingdom_code || null,
            slot: entry.slot ?? null,
          })
        }
      }
    }

    const records = rows.map((row: any) => {
      const registry = row.province_id ? registryById.get(String(row.province_id)) : null
      const parsed = enrichBotPayload(row, payload(row))
      const payloadProvince = parsed?.province || parsed?.provinceName || parsed?.attackerProvince || parsed?.targetProvince || null
      const payloadKingdom = parsed?.kingdom || parsed?.kingdomCode || parsed?.attackerKingdom || parsed?.targetKingdom || null
      return {
        id: row.id,
        capture_id: row.capture_id,
        source_vault_id: row.source_vault_id,
        user_id: row.user_id,
        province_id: row.province_id,
        province_name: registry?.name || payloadProvince || null,
        province_slot: registry?.slot ?? null,
        kingdom_id: row.kingdom_id || registry?.kingdom || payloadKingdom || null,
        target_province_id: row.target_province_id,
        target_kingdom_id: row.target_kingdom_id,
        intel_type: row.intel_type,
        visibility: row.visibility,
        metrics: row.metrics || {},
        captured_at: row.captured_at,
        created_at: row.created_at,
        expires_at: row.expires_at || null,
        archived: row.archived === true,
        archived_at: row.archived_at || null,
        updated_at: row.updated_at,
        source: row.source,
        source_id: row.source_id,
        url: row.url,
        page_kind: row.page_kind,
        classification_source: row.classification_source,
        classification_confidence: row.classification_confidence,
        classification_reason: row.classification_reason,
        age: row.age,
        game_year: row.game_year,
        game_tick: row.game_tick,
        retention_class: row.retention_class,
        raw_text: row.raw_text,
        payload: parsed,
        summary: describeRecord(row, parsed),
        raw_payload: row.raw_payload,
      }
    })

    const counts: Record<string, number> = {}
    for (const row of records) counts[row.page_kind] = (counts[row.page_kind] || 0) + 1

    return NextResponse.json({
      ok: true,
      section,
      province: account.province_name,
      kingdom: account.province_location,
      count: records.length,
      counts,
      records,
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Intel query failed' }, { status: 500 })
  }
}
