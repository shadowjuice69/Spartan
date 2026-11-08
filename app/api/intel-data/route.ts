import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { describeRecord } from '@/lib/spartan/describe-record'

const { parseBotMagicReports, parseBotThieveryReports, parseBotAidTransfers } = require('../../../lib/spartan/bot-intel-parsers.cjs')

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
  if (row.source !== 'discord-bot' || row.page_kind !== 'bot_event' || section === 'intel') return true
  const parsed = payload(row)
  const classified = String(parsed?.classification?.page_kind || '').toLowerCase()
  const text = String(row.raw_text || '')
  const magic = /:(?:star2|comet):[\s\S]*?<<__[^_]{2,80}__[\s\S]*?(?:\*\*[\d,]+\*\*|__FAIL__|spell succeeds|spell fails)/i.test(text)
  const thievery = /<<__[^_]{2,80}__\s*\*\*\|\s*[^|]{1,120}\(\d+:\d+\)\*\*>>[\s\S]{0,180}\bsent\b/i.test(text)
  const aid = /:moneybag:\s*.+?\[[^\]]+\]\s+sent\s+__[^\n]{1,140}?__\s+to\s+.+?\[[^\]]+\]/i.test(text)
    || /\bWe have sent\s+[\d,]+\s+.+?\s+to\s+.+?\(\d+:\d+\)/i.test(text)
  const news = /NEW KDNEWS:|\battacked\s+__|\binvaded\s+\d+\s*-|\bambushed armies from\b/i.test(text)
  const ritual = /(?:—|-)\s*Ritual:\s*.+\bcast\s+\*\*\d+\/\d+\*\*/i.test(text)
  const dragon = /(?:dragon_face:|🐉)\s*__DRAGON__|\bDragon at us\s*[—-]/i.test(text)
  if (classified && classified !== 'bot_event') {
    if (section === 'war-room') return ['attack', 'news', 'magic', 'thievery', 'aid', 'ritual', 'dragon'].includes(classified) || magic || thievery || aid || news || ritual || dragon
    if (section === 'news') return ['news', 'attack'].includes(classified) || news
    if (section === 'magic') return ['magic', 'ritual', 'dragon', 'council_spells'].includes(classified) || magic || ritual || dragon
    if (section === 'thievery') return classified === 'thievery' || thievery
    if (section === 'aid') return classified === 'aid' || aid
    return classified === section
  }
  if (section === 'thievery') return thievery
  if (section === 'magic') return magic || ritual || dragon
  if (section === 'news') return news
  if (section === 'war-room') return news || magic || thievery || aid || ritual || dragon
  if (section === 'aid') return aid
  return false
}

function isStructuredBotVaultRecord(row: any) {
  const parsed = payload(row)
  const metadata = parsed?.data?.metadata || {}
  if (metadata.author_bot !== true && metadata.author_bot !== 'true') return false
  return ['magic', 'thievery', 'aid', 'news', 'war-room'].some(section => botEventBelongsToSection(row, section))
}

function enrichBotPayload(row: any, parsed: any) {
  if (row.source !== 'discord-bot') return parsed
  const root = parsed && typeof parsed === 'object' ? { ...parsed } : {}
  const data = root.data && typeof root.data === 'object' ? { ...root.data } : {}
  const text = String(row.raw_text || data.content || '')
  const events: any[] = []
  const botRecord = {
    id: row.id, source: row.source, source_id: row.source_id || parsed?.data?.discord?.message_id,
    captured_at: row.captured_at || row.created_at, raw_text: text,
    source_vault_id: row.source_vault_id, archived: row.archived === true, expires_at: row.expires_at,
  }
  for (const report of parseBotThieveryReports([botRecord])) events.push({
    kind: 'thievery', operation: report.op, actor: report.actor,
    targetProvince: report.province, targetKingdom: report.kingdom,
    thievesSent: report.thievesSent, tpa: report.ownTpa,
    targetTpa: report.targetTpa, targetModifiedTpa: report.targetModifiedTpa,
    thievesLost: report.thievesLost, outcome: report.outcome,
    sourceId: report.sourceId, occurrences: report.occurrences,
  })
  for (const report of parseBotMagicReports([botRecord])) events.push({
    kind: 'magic', spellName: report.spell, caster: report.caster,
    targetProvince: report.targetProvince, targetKingdom: report.targetKingdom,
    duration: report.durationDays, wizardsLost: report.wizardsLost,
    outcome: report.outcome, sourceId: report.sourceId, occurrences: report.occurrences,
  })
  const aid = text.match(/We have sent\s+([\d,]+)\s+([a-z ]+?)\s+to\s+(.+?)\s+\((\d+:\d+)\)/i)
  if (aid) events.push({ kind: 'aid', amount: Number(aid[1].replace(/,/g, '')), resource: aid[2].trim(), targetProvince: aid[3].trim(), targetKingdom: aid[4] })
  for (const transfer of parseBotAidTransfers([botRecord])) events.push({
    kind: 'aid', amount: transfer.amount, resource: transfer.resource,
    sender: transfer.sender, senderHandle: transfer.senderHandle,
    targetProvince: transfer.recipient, targetHandle: transfer.recipientHandle,
    outcome: 'sent', sourceId: transfer.sourceId, occurrences: transfer.occurrences,
  })

  if (events.length) {
    data.events = events
    const first = events[0]
    for (const key of ['operation','spellName','targetProvince','targetKingdom','thievesSent','tpa','outcome','duration','attacker','attackerKingdom','acresCaptured','amount','resource']) {
      if (first[key] !== undefined) data[key] = first[key]
    }
    if (first.kind === 'thievery') data.operation = first.operation
    if (first.kind === 'magic') data.spellName = first.spellName
    if (first.kind === 'news') data.attacker = first.attacker
    if (first.kind === 'aid') data.shipment = first.sender ? first.amount.toLocaleString() + ' ' + first.resource + ' from ' + first.sender + ' to ' + first.targetProvince : first.amount.toLocaleString() + ' ' + first.resource + ' to ' + first.targetProvince + (first.targetKingdom ? ' (' + first.targetKingdom + ')' : '')
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

    let rows = dedupeDiscordMessages((data || []).filter((row: any) =>
      !(sharedSections.has(section) && row.visibility === 'own' && row.user_id !== user.id && row.user_id !== account.id) &&
      botEventBelongsToSection(row, section)
    ))

    // Raw bot captures that predate their Intel projection remain valid evidence.
    // Read them through without replaying or mutating the capture/processing pipeline.
    if (!summary && ['intel', 'magic', 'thievery', 'aid', 'news', 'war-room'].includes(section)) {
      let vaultQuery = db.from('spartan_capture_vault')
        .select('id,capture_id,user_id,province_id,kingdom_id,captured_at,created_at,source,source_id,url,page_kind,raw_text,raw_payload,parsed_payload')
        .eq('source', 'discord-bot').eq('page_kind', 'bot_event')
        .eq('user_id', account.id).eq('kingdom_id', account.province_location)
        .eq('parsed_payload->data->metadata->>author_bot', 'true')
      if (section === 'magic') vaultQuery = vaultQuery.or('raw_text.like.%:star2:%,raw_text.like.%:comet:%,raw_text.like.%Ritual:%,raw_text.like.%__DRAGON__%')
      else if (section === 'thievery') vaultQuery = vaultQuery.like('raw_text', '%:detective:%')
      else if (section === 'aid') vaultQuery = vaultQuery.or('raw_text.like.%:moneybag:%,raw_text.ilike.%We have sent%')
      else if (section === 'news') vaultQuery = vaultQuery.or('raw_text.ilike.%NEW KDNEWS:%,raw_text.ilike.%attacked%,raw_text.ilike.%invaded%')
      else if (section === 'war-room') vaultQuery = vaultQuery.or('raw_text.like.%:star2:%,raw_text.like.%:comet:%,raw_text.like.%:detective:%,raw_text.like.%:moneybag:%,raw_text.ilike.%NEW KDNEWS:%,raw_text.ilike.%Ritual:%,raw_text.ilike.%Dragon at us%,raw_text.like.%:dragon_face:%')
      const vaultResult = await vaultQuery.order('captured_at', { ascending: false }).limit(500)
      if (vaultResult.error) throw vaultResult.error
      const projectedCaptureIds = new Set((data || []).map((row: any) => row.capture_id).filter(Boolean))
      const vaultOnlyRows = (vaultResult.data || [])
        .filter((row: any) => row.capture_id && !projectedCaptureIds.has(row.capture_id)
          && isStructuredBotVaultRecord(row)
          && (section === 'intel' || botEventBelongsToSection(row, section)))
        .map((row: any) => {
          const expiresAt = new Date(Date.parse(row.captured_at) + 48 * 60 * 60 * 1000).toISOString()
          const archived = Date.parse(expiresAt) < Date.now()
          return {
            ...row, id: 'vault:' + row.id, source_vault_id: row.id, page_kind: section === 'intel' ? 'bot_event' : section,
            classification_source: 'vault-readthrough',
            classification_reason: 'Raw Discord bot capture displayed read-only; no Intel projection exists',
            classification_confidence: null, intel_type: 'province', visibility: null,
            metrics: {}, retention_class: 'intel_48h', expires_at: expiresAt,
            archived, archived_at: archived ? expiresAt : null,
            projection_status: 'vault_only',
          }
        })
      rows = dedupeDiscordMessages([...rows, ...vaultOnlyRows])
    }
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
        summary: row.projection_status === 'vault_only' ? 'VAULT ONLY · ' + describeRecord(row, parsed) : describeRecord(row, parsed),
        projection_status: row.projection_status || 'projected',
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
