'use strict';
// Parses plain and boxed Age 117 rule text for the existing bot age parser.
const RULE = /^\s*[=-]{20,}\s*$/;
function looksBoxed(s) { return /^\s*={20,}\s*$/m.test(s) && /^\s*\d+\.\s+(?:dragons|rituals|races|personalities)\b/im.test(s); }
function looksPlain(s) { return /^races$/im.test(s) && /^[A-Z][A-Za-z' ]{1,28}\s+[\u2014\u2013]\s+\S/m.test(s) && /^bonuses$/im.test(s); }
function looksLike117(s) { return looksBoxed(s) || looksPlain(s); }
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());
function splitCommas(text) {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1); if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map((x) => x.trim()).filter(Boolean);
}
function unitLine(t) {
  let m;
  if ((m = t.match(/^(Offensive|Defensive) Specialist\s+(\d+)\/(\d+)/i))) return m[1] + ' Specialist: ' + m[2] + '/' + m[3];
  if ((m = t.match(/^Elite\s+(\d+)\/(\d+)\s+([\d,]+)\s*gc\s*,\s*([\d.]+)\s*nw/i))) return 'Elite Unit (' + m[1] + '/' + m[2] + ', ' + m[3] + 'gc, ' + m[4] + 'nw)';
  if ((m = t.match(/^War Horse\s+(\d+)\/(\d+)/i))) return 'War horse (' + m[1] + '/' + m[2] + ')';
  if (/^War Horse\s+n\/a/i.test(t)) return 'War horse (n/a)';
  return null;
}
function boxedToPlain(input) {
  const src = String(input).replace(/\r/g, '').split('\n');
  const indent = (s) => s.match(/^\s*/)[0].length;
  const lines = [];
  for (const l of src) {
    const prev = lines.length ? lines[lines.length - 1] : '';
    if (lines.length && /^\s*-\s/.test(prev) && l.trim() && !/^\s*-\s/.test(l) && !RULE.test(l) && indent(l) > indent(prev)) lines[lines.length - 1] = prev.replace(/\s+$/, '') + ' ' + l.trim();
    else lines.push(l);
  }
  const notes = [], out = [];
  let sec = 'none', inEntity = false, mode = '', label = '', abilityName = '', abilityText = [];
  const flushAbility = () => { if (abilityName) out.push(abilityName + ': ' + abilityText.join(' ')); abilityName = ''; abilityText = []; };
  const startEntity = (name) => { flushAbility(); mode = ''; label = ''; inEntity = true; out.push(''); out.push(sec === 'races' || sec === 'personalities' ? name + ' — (boxed text)' : name); };
  const setLabel = (name, m) => { flushAbility(); label = name; mode = m; out.push(name); };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim();
    if (RULE.test(l)) {
      const title = (lines[i + 1] || '').trim();
      if (title && i + 2 < lines.length && RULE.test(lines[i + 2])) {
        if (t[0] === '=') {
          const name = title.replace(/^\d+\.\s*/, '').toLowerCase();
          flushAbility(); inEntity = false; mode = '';
          if (/^core mechanics/.test(name)) sec = 'general';
          else if (name === 'dragons') { sec = 'dragons'; out.push('', 'Dragons'); }
          else if (name === 'rituals') { sec = 'rituals'; out.push('', 'Rituals'); }
          else if (name === 'races') { sec = 'races'; out.push('', 'Races'); }
          else if (name === 'personalities') { sec = 'personalities'; out.push('', 'Personalities'); }
          else if (sec !== 'none') break;
        } else if (sec === 'races' || sec === 'personalities') startEntity(titleCase(title.replace(/^the\s+/i, '')));
        i += 2;
      }
      continue;
    }
    if (!t) continue;
    if (sec === 'general') {
      if (/^(relations & hostility|spells|science|war doctrines?)$/i.test(t)) continue;
      const n = t.replace(/^-\s+/, ''); if (n) notes.push(n); continue;
    }
    if (sec === 'dragons' || sec === 'rituals') {
      if (/^[A-Z][A-Z' ]+$/.test(t)) startEntity(titleCase(t));
      else if (!inEntity) notes.push(t);
      else out.push('- ' + t.replace(/^-\s+/, ''));
      continue;
    }
    if ((sec === 'races' || sec === 'personalities') && inEntity) {
      let m;
      if (/^bonuses$/i.test(t)) setLabel('Bonuses', 'bullets');
      else if (/^penalties$/i.test(t)) setLabel('Penalties', 'bullets');
      else if (/^war doctrine/i.test(t)) setLabel('Doctrine', 'bullets');
      else if (/^spells$/i.test(t)) setLabel('Unique Spells', 'bullets');
      else if (/^units$/i.test(t)) setLabel('Military', 'units');
      else if ((m = t.match(/^unique\s+(?:passive|active)\s*-\s*(.+)$/i))) { setLabel('Unique Ability', 'ability'); abilityName = m[1].trim(); }
      else if ((m = t.match(/^access:\s*(.*)$/i))) { setLabel('Unique Spells', ''); for (const s of splitCommas(m[1])) out.push('- ' + s); }
      else if ((m = t.match(/^starts with:\s*(.*)$/i))) { setLabel('Starting Units', ''); for (const s of splitCommas(m[1])) out.push('- ' + s); }
      else if (mode === 'ability') abilityText.push(t.replace(/^-\s+/, ''));
      else if (mode === 'units') { const u = unitLine(t); if (u) out.push('- ' + u); }
      else if (mode === 'bullets') { let b = t.replace(/^-\s+/, ''); if (label === 'Doctrine') b = b.replace(/^up to\s+/i, ''); out.push('- ' + b); }
    }
  }
  flushAbility();
  const head = notes.length ? ['General Changes'].concat(notes.map((n) => '- ' + n)) : [];
  return head.concat(out).join('\n');
}
const stripBullet = (s) => s.replace(/^(?:[\u2022\u00b7*]\s*|[-\u2013\u2014]\s+)+/, '').replace(/^[-+]([-+]\d)/, '$1').replace(/^[-+](?=[A-Za-z])/, '').trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const dragonKey = (n) => (/^sapphire$/i.test(n) ? 'Sapphire Dragons' : n + ' Dragon');
const personalityKey = (n) => (/^the\s/i.test(n) ? n : 'The ' + n);
function readPlain(text) {
  const result = { races: {}, personalities: {}, buildings: {}, spells: {}, thievery: {}, game_rules: {}, dragons: {}, science: {}, rituals: {} };
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.replace(/[\u00a0\u200b]/g, ' ').trim());
  const ZONES = { 'general changes': 'general', races: 'races', personalities: 'personalities', rituals: 'rituals', dragons: 'dragons' };
  const LABELS = { bonuses: 'bonuses', penalties: 'penalties', 'unique spells': 'spells', spells: 'spells', doctrine: 'doctrine', military: 'military', 'unique ability': 'ability', 'starting units': 'starts' };
  let zone = null, cur = null, kind = null, label = null, noteN = 0;
  const startsWith = new Map();
  for (const line of lines) {
    if (!line) continue;
    const head = line.replace(/[:.]+$/, '').toLowerCase();
    if (ZONES[head]) { zone = ZONES[head]; cur = null; label = null; continue; }
    if (!zone) continue;
    if (zone === 'general') { result.game_rules['rule_' + (++noteN)] = stripBullet(line); continue; }
    if (cur && LABELS[head] && !/^[-\u2022*]/.test(line)) { label = LABELS[head]; continue; }
    let m;
    if (zone === 'races' || zone === 'personalities') {
      if ((m = line.match(/^(?![-\u2022*\u00b7])([A-Z][A-Za-z' ]{1,28}?)\s+[\u2014\u2013]\s+(.+)$/))) {
        const name = m[1].trim(), tag = /^\(boxed text\)$/i.test(m[2].trim()) ? null : m[2].trim();
        if (zone === 'races') { cur = result.races[name] = { emoji: null, archetype: tag, war_doctrine: null, unique_name: null, unique_passive: null, bonuses: [], penalties: [], units: {}, spells: [] }; kind = 'race'; }
        else { cur = result.personalities[personalityKey(name)] = { unique_name: null, unique_passive: null, bonuses: [], starts_with: [], spells: [] }; kind = 'personality'; startsWith.set(cur, []); }
        label = null; continue;
      }
      if (!cur || !label) continue;
      const text1 = stripBullet(line);
      if (label === 'bonuses') cur.bonuses.push(text1);
      else if (label === 'penalties' && kind === 'race') cur.penalties.push(text1);
      else if (label === 'spells') cur.spells.push(...splitCommas(text1));
      else if (label === 'doctrine' && kind === 'race') cur.war_doctrine = cur.war_doctrine ? cur.war_doctrine + '; ' + text1 : 'War Doctrine (In War): ' + text1;
      else if (label === 'starts' && kind === 'personality') startsWith.get(cur).push(text1);
      else if (label === 'military' && kind === 'race') {
        if ((m = text1.match(/^offensive specialists?\s*:?\s*\(?\s*(\d+\s*\/\s*\d+)/i))) cur.units['Offensive Specialist'] = m[1].replace(/\s+/g, '');
        else if ((m = text1.match(/^defensive specialists?\s*:?\s*\(?\s*(\d+\s*\/\s*\d+)/i))) cur.units['Defensive Specialist'] = m[1].replace(/\s+/g, '');
        else if ((m = text1.match(/^elite unit\s*\(([^)]+)\)/i))) cur.units['Elite Unit'] = m[1].trim();
        else if ((m = text1.match(/^war horse\s*\(([^)]+)\)/i))) cur.units['War Horse'] = m[1].trim();
        else if ((m = text1.match(/^horses?\s*:?\s*(\d+)/i))) cur.units['War Horse'] = m[1];
      } else if (label === 'ability') {
        if (!cur.unique_name && (m = text1.match(/^([A-Z][A-Za-z' ]{2,40}):\s*(.*)$/))) { cur.unique_name = m[1].trim(); cur.unique_passive = 'Unique Passive - ' + m[1].trim() + ': ' + m[2]; }
        else if (cur.unique_passive) cur.unique_passive += ' ' + text1;
      }
      continue;
    }
    if (/^[A-Z][A-Za-z']+(?: [A-Z][A-Za-z']+)?$/.test(line) && !LABELS[head]) {
      if (zone === 'rituals') cur = result.rituals[line] = { effects: [] };
      else cur = result.dragons[dragonKey(line)] = { effects: [] };
      label = 'effects'; continue;
    }
    if (cur && cur.effects) cur.effects.push(stripBullet(line));
  }
  for (const [p, list] of startsWith) if (list.length) p.starts_with = ['Starts with ' + list.join(', ')];
  for (const [name, r] of Object.entries(result.rituals)) result.game_rules['ritual_' + slug(name)] = name + ': ' + r.effects.join('; ');
  return result;
}
function parse117(rawText) {
  let text = String(rawText).replace(/^\uFEFF/, '').replace(/\u000C/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (looksBoxed(text)) text = boxedToPlain(text);
  return readPlain(text);
}
module.exports = { looksLike117, parse117, boxedToPlain };
