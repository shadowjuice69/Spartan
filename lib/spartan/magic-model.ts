// Magic model
import { clean, toNum, pathOf, parseThrone } from './page-models'
const { parseBotMagicReports } = require('./bot-intel-parsers.cjs')

type Rec = { id?: string; source_id?: string | null; source?: string | null; url: string | null; raw_text: string | null; captured_at: string | null; created_at: string }

const norm = (t: string | null | undefined) => String(t ?? '').replace(/\r/g, '')
const when = (r: Rec) => r.captured_at || r.created_at
const num = (v: unknown) => toNum(v) ?? 0
const ts = (r: Rec) => Date.parse(when(r)) || 0

function activeSegment(t: string) {
  const i = t.indexOf('Spell Name')
  if (i < 0) return ''
  let seg = t.slice(i)
  for (const stop of ['Uniques', 'Copyright', 'Select a spell']) {
    const j = seg.indexOf(stop)
    if (j > 0) seg = seg.slice(0, j)
  }
  return seg
}

export function parseActiveSpells(text: string) {
  const out: Array<{ name: string; days: number; effect: string }> = []
  for (const m of activeSegment(norm(text)).matchAll(/^([^\n\t]+)\n\t(\d+) days?\t([^\n]*)/gm)) out.push({ name: m[1].trim(), days: num(m[2]), effect: clean(m[3]) })
  return out
}

export function parseMagicHeader(text: string) {
  const b = clean(text)
  const w = b.match(/Wizards ([\d,]+) \(([\d.]+) Wizards Per Acre\)/)
  const g = b.match(/Guilds ([\d,]+) \(([\d.]+)% of all buildings\)/)
  return { wizards: w ? toNum(w[1]) : null, wpa: w ? toNum(w[2]) : null, runes: toNum((b.match(/Runes ([\d,]+) Guilds/) || [])[1]), guilds: g ? toNum(g[1]) : null, guildPct: g ? toNum(g[2]) : null, mana: toNum((b.match(/Mana (\d+)%/) || [])[1]) }
}

export function parseCastable(text: string) {
  const t = norm(text), start = t.lastIndexOf('Select a spell:')
  if (start < 0) return []
  let seg = t.slice(start), end = t.slice(start).indexOf('Copyright')
  if (end > 0) seg = seg.slice(0, end)
  seg = seg.replace(/\t/g, '\n')
  const out: Array<{ name: string; cost: number; days: number | null }> = []
  for (const m of seg.matchAll(/^([^\n]+)\nCast:([\d,]+) runes/gm)) { const d = m[1].match(/^(.*?)\s*\((\d+) days?\)\s*$/); out.push({ name: (d ? d[1] : m[1]).trim(), cost: num(m[2]), days: d ? num(d[2]) : null }) }
  return out
}

export function parseUnknownSpells(text: string) { const m = norm(text).match(/^([^\n.]*?) (?:are|is) not known to our culture/m); return m ? m[1].split(/, | and /).map(clean).filter(Boolean) : [] }
export function parseUniques(text: string) { return [...norm(text).matchAll(/^(.+?) - (Race|Personality) Passive Effect/gm)].map(m => ({ name: clean(m[1]), kind: m[2] })) }

export function parseRitualStatus(text: string) {
  const b = clean(text), m = b.match(/covered by the (.+?) ritual\. It was started (\d+) days? ago and will be lifted in (\d+) days?/)
  if (!m) return null
  return { name: clean(m[1]), startedDaysAgo: num(m[2]), liftedInDays: num(m[3]), effectiveness: toNum((b.match(/([\d.]+)% effectiveness is left/) || [])[1]), destroyed: toNum((b.match(/([\d.]+)% destroyed/) || [])[1]), base: clean((b.match(/Base: (.+?) Here is the effects/) || [])[1]) || null }
}

export function parseRitualCast(text: string) {
  const b = clean(text), m = b.match(/development of the (.+?) ritual\. It was started (\d+) days? ago and we have (\d+) days? to complete it/)
  if (!m) return null
  const c = b.match(/(\d+) casts have been performed out of (\d+)/), cost = b.match(/Rune Cost: ([\d,]+) Mana: (\d+)%/)
  return { name: clean(m[1]), startedDaysAgo: num(m[2]), daysLeft: num(m[3]), casts: c ? num(c[1]) : null, castsNeeded: c ? num(c[2]) : null, startEffectiveness: toNum((b.match(/start at ([\d.]+)% effectiveness/) || [])[1]), castCost: cost ? num(cost[1]) : null, castMana: cost ? num(cost[2]) : null, effect: clean((b.match(/effectiveness\. (.+?) Spells - Rune Cost/) || [])[1]) || null }
}

export function parseRitualTable(text: string) {
  const t = norm(text), i = t.indexOf('Here is the effects of all possible rituals')
  if (i < 0) return []
  let seg = t.slice(i), e = seg.indexOf('Copyright'); if (e > 0) seg = seg.slice(0, e)
  return [...seg.matchAll(/^([A-Z][a-z]+)\t([^\n]+)$/gm)].map(m => ({ name: m[1], effects: clean(m[2]) }))
}

export function buildMagicModel(records: Rec[]) {
  const botResults = parseBotMagicReports(records)
  const at = (path: string) => records.filter(r => r.raw_text && pathOf(r.url) === path).sort((a, b) => ts(b) - ts(a))
  const ench = at('/wol/game/enchantment'), council = at('/wol/game/council_spells'), wiz = [...ench, ...at('/wol/game/sorcery'), ...at('/wol/game/wizards')].sort((a, b) => ts(b) - ts(a))
  const throneRows = at('/wol/game/throne')
  const throne = throneRows[0] || null
  const throneData = throne ? parseThrone(throne.raw_text || '') : null
  const acres = throneData?.acres ?? null
  const wizardCount = throneData?.wizards ?? null
  // Spartan Utopia wiki → All Formulas → Magic: Raw WPA = Wizards / Land.
  // Modified WPA is intentionally null until every required modifier is sourced.
  const rawWpa = acres != null && acres > 0 && wizardCount != null ? wizardCount / acres : null
  const statusR = at('/wol/game/status_ritual')[0] || null, castR = at('/wol/game/cast_ritual')[0] || null
  const activeSrc = [ench[0], council[0]].filter((r): r is Rec => !!r).sort((a, b) => ts(b) - ts(a))[0] || null
  const castSrc = ench.find(r => parseCastable(r.raw_text || '').length > 0) || null, uniqSrc = ench[0] || null, ritualSrc = statusR || castR, tableSrc = ritualSrc ? (ritualSrc.raw_text || '') : ''
  const pageHeader = wiz[0] ? parseMagicHeader(wiz[0].raw_text || '') : null
  const throneIsNewer = Boolean(throne && (!wiz[0] || ts(throne) >= ts(wiz[0])))
  const header = (pageHeader || throneData) ? {
    ...(pageHeader || {}),
    wizards: throneIsNewer ? wizardCount ?? pageHeader?.wizards : pageHeader?.wizards ?? wizardCount,
    runes: throneIsNewer ? throneData?.runes ?? pageHeader?.runes : pageHeader?.runes ?? throneData?.runes,
    mana: throneIsNewer ? null : pageHeader?.mana ?? null,
    rawWpa: rawWpa ?? pageHeader?.wpa ?? null, wpa: rawWpa ?? pageHeader?.wpa ?? null,
    modifiedWpa: null, acres,
    ratioSource: throne ? 'Throne capture · wiki raw WPA formula' : pageHeader ? 'Enchantment capture' : null,
    ratioAt: throne ? when(throne) : wiz[0] ? when(wiz[0]) : null,
  } : null
  const active = throneIsNewer
    ? { at: when(throne!), spells: (throneData?.spells || []).map(s => ({ ...s, effect: '' })) }
    : activeSrc ? { at: when(activeSrc), spells: parseActiveSpells(activeSrc.raw_text || '') } : null
  return { botResults, capturedAt: throneIsNewer ? when(throne!) : wiz[0] ? when(wiz[0]) : throne ? when(throne) : null, header, active, castable: castSrc ? parseCastable(castSrc.raw_text || '') : [], castableAt: castSrc ? when(castSrc) : null, unknown: castSrc ? parseUnknownSpells(castSrc.raw_text || '') : [], uniques: uniqSrc ? parseUniques(uniqSrc.raw_text || '') : [], ritual: statusR ? { ...parseRitualStatus(statusR.raw_text || ''), at: when(statusR) } : null, ritualProject: castR ? { ...parseRitualCast(castR.raw_text || ''), at: when(castR) } : null, ritualEffects: parseRitualTable(tableSrc), series: [...ench.slice(0, 40).map(r => ({ r, h: parseMagicHeader(r.raw_text || ''), t: null as ReturnType<typeof parseThrone> | null })), ...throneRows.slice(0, 40).map(r => ({ r, h: null, t: parseThrone(r.raw_text || '') }))].sort((a, b) => ts(a.r) - ts(b.r)).slice(-60).map(x => ({ at: when(x.r), runes: x.h?.runes ?? x.t?.runes ?? null, wizards: x.h?.wizards ?? x.t?.wizards ?? null, mana: x.h?.mana ?? null, rawWpa: x.t?.acres != null && x.t.acres > 0 && x.t.wizards != null ? x.t.wizards / x.t.acres : x.h?.wpa ?? null })), captures: { enchantment: ench.length, council: council.length } }
}
