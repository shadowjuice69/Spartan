import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runCaptureStewards } from '@/lib/spartan/stewards'
import { resolveWikiKnowledge } from '@/lib/spartan/wiki-knowledge'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

function text(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function inferPageKind(url: string) {
  const value = url.toLowerCase()
  if (value.includes('throne')) return 'throne'
  if (value.includes('military')) return 'military'
  if (value.includes('science')) return 'science'
  if (value.includes('magic')) return 'magic'
  if (value.includes('thievery')) return 'thievery'
  if (value.includes('kingdom_intel')) return 'intel'
  if (value.includes('/stats')) return 'intel'
  if (value.includes('news')) return 'news'
  return 'utopiaintel'
}

function normalizeName(value: unknown) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
}

function decodeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseKingdomIntelGrid(html: string, url: string, dataSimple: string) {
  const kdMatch = url.match(/\/kingdom_intel\/(\d+)\/(\d+)(?:\/|$|[?#])/i)
  const kingdomCode = kdMatch ? kdMatch[1] + ':' + kdMatch[2] : ''
  const rows: Array<{ id: string; cells: Record<string, any> }> = []
  const table = html.match(/<table\b[^>]*class=["'][^"']*tablesorter[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || html
  for (const rowMatch of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => decodeHtml(match[1]))
    const slot = Number(cells[0])
    if (!Number.isInteger(slot) || slot < 1 || slot > 25 || !cells[1]) continue
    const identity = cells[1].match(/^(.*?)\s+\(([^()]+)\)$/)
    const name = (identity?.[1] || cells[1]).trim()
    const race = (identity?.[2] || '').trim()
    const spells = (cells[2] || '').trim()
    rows.push({
      id: String(slot),
      cells: {
        id: String(slot), slot: String(slot), name, race, location: kingdomCode,
        goodSpells: { text: spells, labels: spells ? [spells] : [] },
      },
    })
  }

  // Some capture clients omit HTML. The text table still carries the roster names and races.
  if (!rows.length && dataSimple) {
    const lines = dataSimple.split(/\r?\n/)
    const header = lines.findIndex(line => /Slot\s+Province/i.test(line))
    for (const line of lines.slice(header + 1)) {
      const parts = line.split(/\t+/).map(value => value.trim())
      const slot = Number(parts[0])
      if (!Number.isInteger(slot) || slot < 1 || slot > 25 || !parts[1]) continue
      const identity = parts[1].match(/^(.*?)\s+\(([^()]+)\)$/)
      rows.push({ id: String(slot), cells: { id: String(slot), slot: String(slot), name: (identity?.[1] || parts[1]).trim(), race: (identity?.[2] || '').trim(), location: kingdomCode } })
    }
  }
  return { kingdomCode, grid: rows.length ? { rows } : null }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  try {
    // UtopiaIntel authenticates with its own shared key. It must not depend on
    // a Universal Capture device token or the scraper's pairing/identity flow.
    const expectedKey = process.env.UTOPIA_INTEL_KEY?.trim()
    if (!expectedKey) {
      return response({ success: false, error: 'UtopiaIntel receiver is not configured: UTOPIA_INTEL_KEY is missing.' }, 503)
    }

    const form = await request.formData()
    const key = text(form.get('key'))
    const expectedBytes = Buffer.from(expectedKey)
    const suppliedBytes = Buffer.from(key)
    if (!key || suppliedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(suppliedBytes, expectedBytes)) {
      return response({ success: false, error: 'Invalid key.' }, 401)
    }

    const dataHtml = text(form.get('data_html'))
    const dataSimple = text(form.get('data_simple'))
    const sourceUrl = text(form.get('url'))
    const province = text(form.get('prov'))

    if (!dataHtml && !dataSimple) {
      return response({ success: false, error: 'No intel payload received.' }, 400)
    }
    if (!province) {
      return response({ success: false, error: 'UtopiaIntel did not include a province name (prov).' }, 400)
    }

    const supabase = createServiceClient()
    const { data: accounts, error: accountsError } = await supabase
      .from('spartan_accounts')
      .select('id,auth_user_id,province_name,province_location,account_status')
      .eq('account_status', 'active')

    if (accountsError) throw new Error(accountsError.message)

    const matches = (accounts ?? []).filter((account: {
      id: string
      auth_user_id: string | null
      province_name: string | null
      province_location: string | null
      account_status: string | null
    }) => normalizeName(account.province_name) === normalizeName(province))

    if (matches.length === 0) {
      return response({ success: false, error: 'No active Spartan account matches the province name sent by UtopiaIntel.', province }, 404)
    }
    if (matches.length > 1) {
      return response({ success: false, error: 'More than one active Spartan account matches this province name. Province mapping must be unambiguous before storing intel.', province }, 409)
    }

    const account = matches[0]
    if (!account.auth_user_id || !account.province_location) {
      return response({ success: false, error: 'The matching Spartan account is missing its linked user or kingdom location.' }, 409)
    }

    const receivedAt = new Date().toISOString()
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify([sourceUrl, province, dataHtml, dataSimple]))
      .digest('hex')

    const capture = {
      captureId: `utopiaintel-${fingerprint}`,
      capturedAt: receivedAt,
      source: 'utopiaintel',
      sourceId: fingerprint,
      pageKind: inferPageKind(sourceUrl),
      url: sourceUrl || undefined,
      provinceName: account.province_name,
      province: account.province_name,
      provinceId: account.id,
      kingdomId: account.province_location,
      canonicalKingdomId: account.province_location,
      canonicalProvinceName: account.province_name,
      canonicalProvinceKingdomCode: account.province_location,
      identitySource: 'spartan_account',
      rawText: dataSimple || dataHtml,
      rawPayload: {
        data_html: dataHtml,
        data_simple: dataSimple,
        url: sourceUrl,
        prov: province,
      },
      parsedPayload: {
        url: sourceUrl,
        prov: province,
        data_simple: dataSimple,
      },
    }

    // Register the receipt in the vault before running any downstream stewards.
    // This preserves the original UtopiaIntel payload even if validation or a later
    // processing step fails, and gives us a reliable receipt record to verify.
    const rawText = capture.rawText
    const rawPayload = capture.rawPayload
    const parsedPayload = capture.parsedPayload
    const contentHash = crypto.createHash('sha256').update(JSON.stringify([
      capture.url ?? '',
      capture.provinceId,
      capture.kingdomId,
      capture.pageKind ?? null,
      rawText,
      rawPayload,
      parsedPayload,
    ])).digest('hex')

    const { error: vaultError } = await supabase.from('spartan_capture_vault').upsert({
      user_id: account.id,
      province_id: account.id,
      kingdom_id: account.province_location,
      captured_at: receivedAt,
      source: 'utopiaintel',
      source_id: fingerprint,
      page_kind: capture.pageKind,
      url: capture.url,
      capture_id: capture.captureId,
      raw_text: rawText || null,
      raw_payload: rawPayload,
      parsed_payload: parsedPayload,
      content_hash: contentHash,
    }, { onConflict: 'content_hash' })

    if (vaultError) throw new Error(vaultError.message)

    console.info('[UTOPIAINTEL] Receipt stored in spartan_capture_vault', {
      captureId: capture.captureId,
      province: account.province_name,
      pageKind: capture.pageKind,
      contentHash,
    })

    const knowledge = await resolveWikiKnowledge(supabase, { provinceId: account.id })
    const stewardship = runCaptureStewards(capture, knowledge)
    const failed = stewardship.results.filter((result) => !result.ok && result.severity !== 'medium')
    if (failed.length) {
      const { error } = await supabase.from('spartan_data_quarantine').insert({
        capture_id: capture.captureId,
        source: 'utopiaintel',
        source_id: fingerprint,
        page_kind: capture.pageKind,
        url: capture.url,
        province_id: account.id,
        kingdom_id: account.province_location,
        steward: failed.map((result) => result.steward).join(','),
        severity: failed.some((result) => result.severity === 'critical') ? 'critical' : 'high',
        reason: failed.map((result) => result.reason ?? 'validation failure').join('; '),
        field_name: failed.find((result) => result.fieldName)?.fieldName ?? null,
        observed_value: failed.find((result) => result.details?.observed !== undefined)?.details?.observed ?? null,
        raw_payload: rawPayload,
        parsed_payload: parsedPayload,
        validation_details: { results: stewardship.results, confidence: stewardship.confidence, wikiKnowledge: knowledge },
        fingerprint: stewardship.fingerprint,
      })
      if (error) throw new Error(error.message)
    }

    const { error: stewardError } = await supabase.from('spartan_steward_runs').insert({
      capture_id: capture.captureId,
      source: 'utopiaintel',
      page_kind: capture.pageKind,
      province_id: account.id,
      kingdom_id: account.province_location,
      decision: stewardship.decision,
      confidence: stewardship.confidence,
      steward_results: stewardship.results,
      canonical_payload: stewardship.decision === 'accept' ? parsedPayload : {},
      knowledge_source: knowledge.sourceKey,
      knowledge_age: knowledge.age,
      knowledge_refs: knowledge.refs,
    })
    if (stewardError) throw new Error(stewardError.message)

    // Accepted UtopiaIntel captures must be projected from the receipt vault into
    // spartan_intel_records immediately; otherwise they can remain invisible to
    // the site's page models until a separate storage cycle happens.
    if (stewardship.decision === 'accept' && process.env.SPARTAN_STEWARD_KEY?.trim()) {
      try {
        const processUrl = new URL('/api/internal-storage/process', request.url)
        const processed = await fetch(processUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-spartan-steward-key': process.env.SPARTAN_STEWARD_KEY.trim(),
          },
          body: JSON.stringify({ captureId: capture.captureId, limit: 1 }),
          cache: 'no-store',
        })
        const result = await processed.json().catch(() => ({}))
        if (!processed.ok || !result?.ok || Number(result?.processed ?? 0) !== 1) {
          console.error('[UTOPIAINTEL] Accepted capture was saved, but site projection did not complete', {
            captureId: capture.captureId,
            status: processed.status,
            result,
          })
        } else {
          console.info('[UTOPIAINTEL] Accepted capture parsed and projected into site records', {
            captureId: capture.captureId,
            pageKind: result.results?.[0]?.pageKind ?? capture.pageKind,
          })
        }
      } catch (processingError) {
        console.error('[UTOPIAINTEL] Accepted capture remains in the vault; automatic projection failed', {
          captureId: capture.captureId,
          error: processingError instanceof Error ? processingError.message : String(processingError),
        })
      }
    }

    return response({
      success: true,
      captured: true,
      storedInVault: true,
      stewardDecision: stewardship.decision === 'quarantine' ? 'quarantine' : 'accepted',
      province: account.province_name,
    }, stewardship.decision === 'quarantine' ? 202 : 200)
  } catch (error) {
    return response({
      success: false,
      error: error instanceof Error ? error.message : 'UtopiaIntel receiver failed.',
    }, 500)
  }
}
