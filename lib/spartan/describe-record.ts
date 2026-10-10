// One plain-language line for a captured intel record, used by the activity feed.
// Built only from what the record itself carries (page type, URL, parsed numbers); nothing is guessed.

type Row = { page_kind?: string | null; source?: string | null; url?: string | null }

const PAGES: Record<string, string> = {
  throne: 'Throne',
  thievery: 'Thievery',
  enchantment: 'Enchantment (self spells)',
  sorcery: 'Sorcery',
  wizards: 'Wizards',
  train_army: 'Military training',
  send_armies: 'Send armies',
  council_internal: 'Council: Internal',
  council_military: 'Council: Military',
  council_state: 'Council: State',
  council_science: 'Council: Science',
  council_spells: 'Council: Spells',
  council_history: 'Council: History',
  province_news: 'Province news',
  kingdom_news: 'Kingdom news',
  province_logs: 'Province logs',
  build: 'Construction',
  science: 'Science',
  explore: 'Exploration',
  status_ritual: 'Ritual status',
  cast_ritual: 'Ritual project',
  info_dragon: 'Dragon info',
  aid: 'Aid',
  kingdom_details: 'Kingdom details',
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) && String(v ?? '') !== '' ? n : null
}
const fmt = (n: number) => n.toLocaleString('en-US')
const pretty = (code: string) => code.split('_').map((w, i) => (i > 0 && /^(ON|OF|THE)$/.test(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(' ')
const tidy = (s: string) => s.replace(/[*_`~]+/g, '').replace(/\s+/g, ' ').trim()

export function describeRecord(row: Row, parsed: any): string {
  const url = String(row.url || '')
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '')
  const kind = String(row.page_kind || 'intel')

  // Discord bot events carry their message in the payload.
  if (row.source === 'discord-bot' || !path) {
    const d = parsed?.data
    const text = [d?.content, d?.message, d?.text, parsed?.content, parsed?.message].find(v => typeof v === 'string' && v.trim())
    if (text) {
      const t = tidy(text)
      return t.length > 150 ? t.slice(0, 147) + '...' : t
    }
    return `Bot event: ${kind.replace(/_/g, ' ')}`
  }

  const seg = path.split('/').filter(Boolean)
  const isGame = seg[0] === 'wol' && seg[1] === 'game'
  const page = isGame ? seg[2] || '' : seg[0] || ''
  const label = PAGES[page]

  if (page === 'kingdom_details' && seg[3] && seg[4]) return `Kingdom ${seg[3]}:${seg[4]} details`

  if (page === 'thievery') {
    const op = (url.match(/[?&]o=([A-Z_]+)/) || [])[1]
    return op ? `Thievery operation: ${pretty(op)}` : 'Guild of Thieves page'
  }

  const parts: string[] = []
  if (page === 'throne') {
    const a = num(parsed?.acres)
    const nw = num(parsed?.networth)
    if (a != null) parts.push(`${fmt(a)} acres`)
    if (nw != null) parts.push(`${fmt(nw)} NW`)
  }
  if (page === 'enchantment') {
    const m = num(parsed?.mana)
    if (m != null) parts.push(`${m}% mana`)
  }

  if (label) return [label, ...parts].join(' · ')
  if (seg[0] === 'wol' && !isGame) return `Utopia: ${seg.slice(1).join('/') || 'home'}`
  if (!isGame) return `Intel site: ${path === '/' ? 'home' : path.replace(/^\//, '')}`
  return `${kind.replace(/_/g, ' ')} page`
}
