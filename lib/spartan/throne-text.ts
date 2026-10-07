// Pulls the extras out of a captured Throne page that the numeric payload does not carry:
// active spells, armies out, ritual, dragon, notices, trade balance and the game date.

const flatten = (t: unknown) => String(t ?? '').replace(/\s+/g, ' ').trim()
const n = (s: string | undefined) => (s === undefined ? null : Number(s.replace(/,/g, '')))

export type Spell = { name: string; daysLeft: number | null; permanent: boolean }
export type ThroneArmy = { daysLeft: number; acres: number }
export type ThroneExtras = {
  province: string | null; kd: string | null; gameDate: string | null; nextTickMinutes: number | null
  race: string | null; ruler: string | null
  tradeBalance: number | null
  offPoints: number | null; offAvailable: number | null; defPoints: number | null; defHome: number | null
  thievesReadyPct: number | null; wizardsReadyPct: number | null
  spells: Spell[]; armies: ThroneArmy[]
  ritual: { name: string; effectiveness: number; daysLeft: number } | null
  dragon: string | null
  notices: string | null; news: string | null
}

export function parseThroneText(raw: string | null | undefined): ThroneExtras {
  const t = flatten(raw)
  const head = t.match(/The Province of (.+?) \((\d+:\d+)\) ([A-Za-z]+ \d+ of YR\d+)(?: \(next tick: (\d+) minutes?\))?/)
  const race = t.match(/\bRace ([A-Za-z' ]+?) (?:Soldiers|Ruler)\b/)?.[1] ?? null
  const ruler = t.match(/\bRuler (.+?) (?=[A-Z][a-z]+ [\d,]+ [\d.]+ospa)/)?.[1] ?? null
  const off = t.match(/Off\. Points ([\d,]+)(?: \(([\d,]+)\))?/)
  const def = t.match(/Def\. Points ([\d,]+)(?: \(([\d,]+)\))?/)

  const spellBlock = t.match(/Info Duration: (.+?)(?= Armies :| Recent News|$)/)?.[1] ?? ''
  const spells: Spell[] = []
  for (const m of spellBlock.matchAll(/([A-Z][A-Za-z'’ ]*?) \( ([\d.]+) days? \)|([A-Z][A-Za-z'’ ]*?) \( - \)/g)) {
    if (m[1]) spells.push({ name: m[1].trim(), daysLeft: Number(m[2]), permanent: false })
    else spells.push({ name: m[3].trim(), daysLeft: null, permanent: true })
  }

  const armyBlock = t.match(/Armies : (.+?)(?= Recent News|$)/)?.[1] ?? ''
  const armies: ThroneArmy[] = [...armyBlock.matchAll(/\(([\d.]+) days left\) \((\d+)\)/g)].map(m => ({ daysLeft: Number(m[1]), acres: Number(m[2]) }))

  const rit = t.match(/covered by the (.+?) ritual with ([\d.]+)% effectiveness left! The ritual will be lifted in (\d+) days/)
  const dragon = t.match(/\bAn? ([A-Z][a-z]+ Dragon [a-z ]+?)!/)?.[1] ?? null
  const notices = t.match(/Notices (.+?)(?= Info Duration| Recent News|$)/)?.[1] ?? null
  const news = t.match(/Recent News (.+?)(?= See all news|$)/)?.[1] ?? null

  return {
    province: head?.[1] ?? null, kd: head?.[2] ?? null, gameDate: head?.[3] ?? null, nextTickMinutes: head?.[4] ? Number(head[4]) : null,
    race, ruler,
    tradeBalance: n(t.match(/Trade Balance (-?[\d,]+)/)?.[1]),
    offPoints: n(off?.[1]), offAvailable: n(off?.[2]), defPoints: n(def?.[1]), defHome: n(def?.[2]),
    thievesReadyPct: n(t.match(/Thieves [\d,]+ \((\d+)%\)/)?.[1]), wizardsReadyPct: n(t.match(/Wizards [\d,]+ \((\d+)%\)/)?.[1]),
    spells, armies,
    ritual: rit ? { name: rit[1], effectiveness: Number(rit[2]), daysLeft: Number(rit[3]) } : null,
    dragon, notices, news,
  }
}
