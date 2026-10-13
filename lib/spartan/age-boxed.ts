const RULE = /^\s*[=-]{20,}\s*$/
export function looksBoxed(s: string): boolean {
  return /^\s*={20,}\s*$/m.test(s) && /^\s*\d+\.\s+(?:dragons|rituals|races|personalities)\b/im.test(s)
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
function splitCommas(text: string): string[] {
  const out: string[] = []; let depth = 0; let cur = ''
  for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1); if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch }
  out.push(cur); return out.map((x) => x.trim()).filter(Boolean)
}
function unitLine(t: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(Soldier|Mercenary|Prisoner)\s+(\d+)\/(\d+)\s+\(?([\d.]+)\s*nw\)?/i))) return m[1] + ': ' + m[2] + '/' + m[3] + ' (' + m[4] + ' nw)'
  if ((m = t.match(/^(Offensive|Defensive) Specialist\s+(\d+)\/(\d+)/i))) return m[1] + ' Specialist: ' + m[2] + '/' + m[3]
  if ((m = t.match(/^Elite\s+(\d+)\/(\d+)\s+([\d,]+)\s*gc\s*,\s*([\d.]+)\s*nw/i))) return 'Elite Unit (' + m[1] + '/' + m[2] + ', ' + m[3] + 'gc, ' + m[4] + 'nw)'
  if ((m = t.match(/^War Horse\s+(\d+)\/(\d+)/i))) return 'War horse (' + m[1] + '/' + m[2] + ')'
  if (/^War Horse\s+n\/a/i.test(t)) return 'War horse (n/a)'
  return null
}
export function boxedTo117(input: string): string {
  const src = input.replace(/\r/g, '').split('\n')
  const indent = (s: string) => (s.match(/^\s*/) as RegExpMatchArray)[0].length
  const lines: string[] = []
  for (const l of src) {
    const prev = lines.length ? lines[lines.length - 1] : ''
    if (lines.length && /^\s*-\s/.test(prev) && l.trim() && !/^\s*-\s/.test(l) && !RULE.test(l) && indent(l) > indent(prev)) lines[lines.length - 1] = prev.replace(/\s+$/, '') + ' ' + l.trim()
    else lines.push(l)
  }
  type Sec = 'none' | 'general' | 'dragons' | 'rituals' | 'races' | 'personalities'
  const notes: string[] = [], out: string[] = []
  let sec: Sec = 'none', inEntity = false, mode = '', label = '', abilityName = '', abilityText: string[] = []
  const flushAbility = () => { if (abilityName) out.push(abilityName + ': ' + abilityText.join(' ')); abilityName = ''; abilityText = [] }
  const startEntity = (name: string) => { flushAbility(); mode = ''; label = ''; inEntity = true; out.push(''); out.push(sec === 'races' || sec === 'personalities' ? name + ' — (boxed text)' : name) }
  const setLabel = (name: string, m: string) => { flushAbility(); label = name; mode = m; out.push(name) }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim()
    if (RULE.test(l)) {
      const title = (lines[i + 1] || '').trim()
      if (title && i + 2 < lines.length && RULE.test(lines[i + 2])) {
        if (t[0] === '=') {
          const name = title.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase()
          flushAbility(); inEntity = false; mode = ''
          if (/^core mechanics/.test(name)) sec = 'general'
          else if (name === 'dragons') { sec = 'dragons'; out.push('', 'Dragons') }
          else if (name === 'rituals') { sec = 'rituals'; out.push('', 'Rituals') }
          else if (name === 'races') { sec = 'races'; out.push('', 'Races') }
          else if (name === 'personalities') { sec = 'personalities'; out.push('', 'Personalities') }
          else if (sec !== 'none') break
        } else if (sec === 'races' || sec === 'personalities') startEntity(titleCase(title.replace(/^the\s+/i, '')))
        i += 2
      }
      continue
    }
    if (!t) continue
    if (sec === 'general') { if (/^(relations & hostility|spells|science|war doctrines?)$/i.test(t)) continue; const n = t.replace(/^-\s+/, ''); if (n) notes.push(n); continue }
    if (sec === 'dragons' || sec === 'rituals') {
      if (/^[A-Z][A-Z' ]+$/.test(t)) startEntity(titleCase(t))
      else if (!inEntity) notes.push(t)
      else out.push('- ' + t.replace(/^-\s+/, ''))
      continue
    }
    if ((sec === 'races' || sec === 'personalities') && inEntity) {
      let m: RegExpMatchArray | null
      if (/^bonuses$/i.test(t)) setLabel('Bonuses', 'bullets')
      else if (/^penalties$/i.test(t)) setLabel('Penalties', 'bullets')
      else if (/^war doctrine/i.test(t)) setLabel('Doctrine', 'bullets')
      else if (/^spells$/i.test(t)) setLabel('Unique Spells', 'bullets')
      else if (/^units$/i.test(t)) setLabel('Military', 'units')
      else if ((m = t.match(/^unique\s+(?:passive|active)\s*-\s*(.+)$/i))) { setLabel('Unique Ability', 'ability'); abilityName = m[1].trim() }
      else if ((m = t.match(/^access:\s*(.*)$/i))) { setLabel('Unique Spells', ''); for (const s of splitCommas(m[1])) out.push('- ' + s) }
      else if ((m = t.match(/^starts with:\s*(.*)$/i))) { setLabel('Starting Units', ''); for (const s of splitCommas(m[1])) out.push('- ' + s) }
      else if (mode === 'ability') abilityText.push(t.replace(/^-\s+/, ''))
      else if (mode === 'units') { const u = unitLine(t); if (u) out.push('- ' + u) }
      else if (mode === 'bullets') { let b = t.replace(/^-\s+/, ''); if (label === 'Doctrine') b = b.replace(/^up to\s+/i, ''); out.push('- ' + b) }
    }
  }
  flushAbility()
  const head = notes.length ? ['General Changes'].concat(notes.map((n) => '- ' + n)) : []
  return head.concat(out).join('\n')
}
