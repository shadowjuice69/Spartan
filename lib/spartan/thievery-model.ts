// Turns the Thievery captures (the Guild of Thieves page and operation result pages) into one model.
// Pure functions: no React, no database. Works on raw_text only; nothing is invented.
import { clean, toNum, pathOf, parseThrone } from './page-models'

type Rec = { url: string | null; raw_text: string | null; captured_at: string | null; created_at: string }

const norm = (t: string | null | undefined) => String(t ?? '').replace(/\r/g, '')
const when = (r: Rec) => r.captured_at || r.created_at
const num = (v: unknown) => toNum(v) ?? 0
const ts = (r: Rec) => Date.parse(when(r)) || 0

export function parseThieveryHeader(text: string) {
  const m = clean(text).match(/Number of thieves ([\d,]+) \(([\d.]+) per acre\) Stealth (\d+)%/)
  return m ? { thieves: toNum(m[1]), tpa: toNum(m[2]), stealth: toNum(m[3]) } : null
}

export function parseThieveryOps(text: string) {
  const t = norm(text)
  const a = t.indexOf('Select operation:')
  const z = t.indexOf('Number of thieves to send')
  if (a < 0 || z < a) return []
  return t.slice(a + 'Select operation:'.length, z).split('\n').map(s => s.trim()).filter(s => s && !/^-+$/.test(s))
}

const isIntel = (name: string) => /^(Infiltrate|Snatch|Spy on|Survey)/i.test(name)

function noteList(t: string, re: RegExp) {
  const m = t.match(re)
  return m ? m[1].split(/, | and /).map(clean).filter(Boolean) : []
}

export function parseThieveryTargets(text: string) {
  const t = norm(text)
  const k = t.match(/Target kingdom is (.+?) \((\d+:\d+)\)/)
  const provinces = [...t.matchAll(/^(\d+) (.+?) --- \( ?(\d+)% ?\)\s*$/gm)].map(m => ({ slot: num(m[1]), name: clean(m[2]), size: num(m[3]) }))
  return {
    kingdom: k ? clean(k[1]) : null,
    code: k ? k[2] : null,
    own: /targeting your own Kingdom/i.test(t),
    provinces,
  }
}

const prettyOp = (code: string) => code.split('_').map((w, i) => (i > 0 && /^(ON|OF|THE)$/.test(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(' ')

export function parseThieveryResult(url: string | null, text: string) {
  const o = (String(url || '').match(/[?&]o=([A-Z_]+)/) || [])[1]
  if (!o) return null
  const t = norm(text)
  const b = clean(t)
  const lost = b.match(/We lost ([\d,]+) thie(?:f|ves) in the operation/)
  const conf = b.match(/we have (\d+)% confidence/)
  const outcome = /operation was a success/i.test(b) ? 'success' : /(operation|attempt)[^.]*\b(failed|unsuccessful)\b|were (caught|captured)/i.test(b) ? 'failed' : 'unknown'
  const tg = parseThieveryTargets(t)
  return {
    op: prettyOp(o),
    outcome,
    confidence: conf ? num(conf[1]) : null,
    thievesLost: lost ? num(lost[1]) : 0,
    kingdom: tg.code,
    province: tg.provinces[0] ? tg.provinces[0].name : null,
  }
}

export function buildThieveryModel(records: Rec[]) {
  const pages = records
    .filter(r => r.raw_text && pathOf(r.url) === '/wol/game/thievery')
    .sort((a, b) => ts(b) - ts(a))
  const isOp = (r: Rec) => /[?&]o=[A-Z_]+/.test(String(r.url || ''))
  const plain = pages.filter(r => !isOp(r))

  const latest = pages.find(r => parseThieveryHeader(r.raw_text || '')) || null
  const throne = records.filter(r => r.raw_text && pathOf(r.url) === '/wol/game/throne').sort((a, b) => ts(b) - ts(a))[0] || null
  const throneData = throne ? parseThrone(throne.raw_text || '') : null
  const acres = throneData?.acres ?? null
  const thiefCount = throneData?.thieves ?? null
  // Spartan Utopia wiki → All Formulas → Thievery: Raw TPA = Thieves / Land.
  // Modified TPA is intentionally null until every required modifier is sourced.
  const rawTpa = acres != null && acres > 0 && thiefCount != null ? thiefCount / acres : null
  const opsSrc = plain.find(r => parseThieveryOps(r.raw_text || '').length > 3) || null
  const targetSrc = plain.find(r => parseThieveryTargets(r.raw_text || '').provinces.length > 1) || null
  const noteSrc = opsSrc || plain[0] || null
  const ops = opsSrc ? parseThieveryOps(opsSrc.raw_text || '') : []

  const results = pages.filter(isOp)
    .map(r => ({ at: when(r), ...parseThieveryResult(r.url, r.raw_text || '') }))
    .filter((x): x is NonNullable<ReturnType<typeof parseThieveryResult>> & { at: string } => !!x.op)
    .slice(0, 25)

  const uniques = latest ? [...norm(latest.raw_text).matchAll(/^(.+?) - (Race|Personality) Passive Effect/gm)].map(m => ({ name: clean(m[1]), kind: m[2] })) : []

  const pageHeader = latest ? parseThieveryHeader(latest.raw_text || '') : null
  const header = (pageHeader || throneData) ? { ...pageHeader, thieves: pageHeader?.thieves ?? thiefCount, tpa: rawTpa ?? pageHeader?.tpa ?? null, rawTpa: rawTpa ?? pageHeader?.tpa ?? null, modifiedTpa: null, acres, ratioSource: throne ? 'Throne capture · wiki raw TPA formula' : pageHeader ? 'Thievery capture' : null, ratioAt: throne ? when(throne) : latest ? when(latest) : null } : null
  return {
    capturedAt: latest ? when(latest) : throne ? when(throne) : null,
    header,
    uniques,
    ops: opsSrc ? { at: when(opsSrc), intel: ops.filter(isIntel), hostile: ops.filter(o => !isIntel(o)) } : null,
    unknown: noteSrc ? noteList(norm(noteSrc.raw_text), /^([^\n.]*?) (?:are|is) not known to our culture/m) : [],
    forbidden: noteSrc ? noteList(norm(noteSrc.raw_text), /^([^\n.]*?) operations? (?:are|is) forbidden for diplomatic reasons/m) : [],
    targets: targetSrc ? { at: when(targetSrc), ...parseThieveryTargets(targetSrc.raw_text || '') } : null,
    results,
    series: pages.map(r => ({ r, h: parseThieveryHeader(r.raw_text || '') })).filter(x => x.h).slice(0, 60).reverse()
      .map(x => ({ at: when(x.r), thieves: x.h!.thieves, tpa: x.h!.tpa, stealth: x.h!.stealth })),
    captures: { pages: plain.length, ops: results.length },
  }
}
