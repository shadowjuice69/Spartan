'use strict';

// Unified age-update parser: full-age documents and Age 117 boxed/plain/PDF table layouts.
// Kept in one module so intake, review and tests share the same parsing implementation.

// Parses plain and boxed Age 117 rule text for the existing bot age parser.
const RULE = /^\s*[=-]{20,}\s*$/;
function looksBoxed(s) { return /^\s*={20,}\s*$/m.test(s) && /^\s*\d+\.\s+(?:dragons|rituals|races|personalities)\b/im.test(s); }
function looksPlain(s) { return /^races$/im.test(s) && /^[A-Z][A-Za-z' ]{1,28}\s+[\u2014\u2013]\s+\S/m.test(s) && /^bonuses$/im.test(s); }
function looksLike117(s) {
  const source = String(s || '');
  const hasRaceTable = /\bRace\s+Archetype[\s\S]{0,160}?\bBonuses\b/i.test(source);
  const hasPersonalityTable = /\bPersonality\s+Archetype[\s\S]{0,160}?\bBonuses\b/i.test(source);
  const hasPrefinalSignature = /Age\s*117\s+General Changes/i.test(source) &&
    /Unique Abilty Programming Changes from Existing/i.test(source);
  return looksBoxed(source) || looksPlain(source) ||
    (hasRaceTable && hasPersonalityTable) || hasPrefinalSignature;
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a, b) => a + b.toUpperCase());
function splitCommas(text) {
  const out = []; let depth = 0, cur = '';
  for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1); if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map((x) => x.trim()).filter(Boolean);
}
function unitLine(t) {
  let m;
  if ((m = t.match(/^(Soldier|Mercenary|Prisoner)\s+(\d+)\/(\d+)\s+\(?([\d.]+)\s*nw\)?/i))) return m[1] + ': ' + m[2] + '/' + m[3] + ' (' + m[4] + ' nw)';
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
          const name = title.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
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
        else if ((m = text1.match(/^(Soldier|Mercenary|Prisoner):\s*(\d+)\/(\d+)\s*\(([\d.]+)\s*nw\)/i))) cur.units[m[1]] = m[2] + '/' + m[3] + ' / ' + m[4] + ' nw';
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

function readCanonicalTables(text) {
  const tables = { races: [], personalities: [], rituals: [], dragons: [] };
  let active = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = line.match(/^#TABLE\s+(RACES|PERSONALITIES|RITUALS|DRAGONS)\s*$/i);
    if (heading) { active = heading[1].toLowerCase(); continue; }
    if (/^#ENDTABLE\b/i.test(line)) { active = null; continue; }
    if (!active || !/^#ROW\s+/.test(line)) continue;
    try {
      const row = JSON.parse(line.replace(/^#ROW\s+/, ''));
      if (row && typeof row === 'object' && row.name) tables[active].push(row);
    } catch { /* malformed canonical rows are ignored and validation will block Apply */ }
  }
  return tables;
}

function splitTableSpells(value) {
  const raw = String(value || '');
  const parts = raw.includes(',')
    ? raw.replace(/\r/g, '').split(/\n+/).join(' ').split(/[,;]+/)
    : raw.split(/\r?\n/);
  return parts.map((item) => item.trim().replace(/[,;]+$/, '')).filter(Boolean);
}

function parseAge117Tables(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const result = { races:{}, personalities:{}, buildings:{}, spells:{}, thievery:{}, game_rules:{}, dragons:{}, science:{}, rituals:{} };
  const clean = s => s.replace(/\s+/g, ' ').trim();
  const bullets = s => s.split(/\n+|(?<=\.)\s+(?=[A-Z+%-])/).map(clean).filter(Boolean);
  let raceHeader = -1, personalityHeader = -1;
  for (let i=0;i<lines.length;i++) {
    if (raceHeader < 0 && /^\s*Race\s+Archetype\s+Bonuses\b/i.test(lines[i])) raceHeader=i;
    if (personalityHeader < 0 && /^\s*Personality\s+Archetype\s+Bonuses\b/i.test(lines[i])) personalityHeader=i;
  }
  function readTable(start, names, kind, end) {
    if (start < 0) return;
    const header = lines[start];
    const labels = kind === 'race'
      ? ['Race','Archetype','Bonuses','Penalties','Unique Spells','Doctrine','Ospec','Dspec','Elite O','Elite D','Elite Cost','Elite NW','Horse','Unique Ability','Unqiue Effect']
      : ['Personality','Archetype','Bonuses','Unique Spells','Starting Units/Credits','Unique Ability','Unqiue Effect'];
    // PDF text extractors sometimes insert a few tabs without preserving every table
    // column. Treat tabs as true columns only when every expected header maps to a
    // distinct cell; otherwise use the document's fixed-width header positions.
    const tabHeader = header.includes('\t') ? header.split('\t').map(clean) : null;
    const tabStarts = tabHeader
      ? labels.map(label => tabHeader.findIndex(cell => cell.toLowerCase().includes(label.toLowerCase())))
      : [];
    const useTabs = Boolean(
      tabHeader &&
      tabHeader.length >= labels.length &&
      tabStarts.every(index => index >= 0) &&
      new Set(tabStarts).size === labels.length
    );
    const expandTabs = value => {
      let out = '', column = 0;
      for (const ch of String(value)) {
        if (ch === '\t') {
          const spaces = 8 - (column % 8);
          out += ' '.repeat(spaces);
          column += spaces;
        } else {
          out += ch;
          column += 1;
        }
      }
      return out;
    };
    const layoutHeader = useTabs ? header : expandTabs(header);
    const starts = useTabs
      ? tabStarts
      : labels.map(label => layoutHeader.toLowerCase().indexOf(label.toLowerCase()));
    if (starts[0] < 0 || starts[1] < 0 || starts[2] < 0 || new Set(starts.filter(x => x >= 0)).size !== starts.filter(x => x >= 0).length) return;
    const cuts = starts.map((x,i)=>({x,i})).filter(v=>v.x>=0).sort((a,b)=>a.x-b.x);
    const tableLines = [];
    for (const line of lines.slice(start + 1, end)) {
      if (kind === 'personality' && /^\s*(?:Ritual\s+Effect|Dragons?\s+Effect)\b/i.test(line)) break;
      tableLines.push(line);
    }
    const hasSparseTabs = tableLines.some(line => line.trim() && line.includes('\t') && line.split('\t').length < labels.length);
    if (hasSparseTabs) return;
    let current = null, cells = null;
    const flush = () => {
      if (!current || !cells) return;
      const cell = i => String(cells[i] || '').replace(/[ \t]+/g, ' ').trim();
      if (kind === 'race') {
        const bonuses = bullets(cell(2)).filter(x=>!/^[-+]?\d+\s*$/.test(x));
        const penalties = bullets(cell(3));
        const spells = cell(4).split(/,\s*/).map(clean).filter(Boolean);
        const units = {};
        if (cell(6)) units['Offensive Specialist']=cell(6);
        if (cell(7)) units['Defensive Specialist']=cell(7);
        const elite = [cell(8),cell(9),cell(10),cell(11)].filter(Boolean);
        if (elite.length) units['Elite Unit']=elite.join(' / ') + (cell(12) ? ' / horse ' + cell(12) : '');
        result.races[current] = {
          emoji:null, archetype:cell(1)||null, bonuses, penalties, units, spells,
          war_doctrine:cell(5)||null, unique_name:cell(13)||null, unique_passive:cell(14)||null
        };
      } else {
        result.personalities['The ' + current] = {
          emoji:null, archetype:cell(1)||null, bonuses:bullets(cell(2)),
          spells:cell(3).split(/,\s*/).map(clean).filter(Boolean),
          starts_with:cell(4)?[cell(4)]:[],
          unique_name:cell(5)||null, unique_passive:cell(6)||null
        };
      }
    };
    for (let i=start+1; i<Math.min(lines.length,end); i++) {
      const line=lines[i];
      if (kind === 'personality' && /^\s*(?:Ritual\s+Effect|Dragons?\s+Effect)\b/i.test(line)) break;
      const rowCells = useTabs ? line.split('\t').map(clean) : null;
      const layoutLine = useTabs ? line : expandTabs(line);
      const first = rowCells ? rowCells[0] : clean(layoutLine.slice(0, starts[1] >= 0 ? starts[1] : 20));
      const name = first && first.length <= 50 && !/^(?:race|personality|ritual|dragons?)$/i.test(first) && !/^\d+(?:\.\d+)?$/.test(first) ? first : null;
      if (name) { flush(); current=name; cells={}; }
      else if (!current) continue;
      if (!cells) continue;

      if (rowCells) {
        for (const cut of cuts) {
          const value = rowCells[cut.x] || '';
          if (value) cells[cut.i] = cells[cut.i] ? cells[cut.i]+'\n'+value : value;
        }
      } else {
        const parts={};
        for (let c=0;c<cuts.length;c++) {
          const begin=cuts[c].x;
          const finish=c+1<cuts.length?cuts[c+1].x:undefined;
          const value=clean(layoutLine.slice(begin,finish));
          if (value) parts[cuts[c].i]=value;
        }
        for (const [idx,value] of Object.entries(parts)) {
          const k=Number(idx);
          cells[k]=cells[k] ? cells[k]+'\n'+value : value;
        }
      }
    }
    flush();
  }
  const canonical = readCanonicalTables(text);
  if (!canonical.races.length) readTable(raceHeader, [], 'race', personalityHeader >= 0 ? personalityHeader : lines.length);
  if (!canonical.personalities.length) readTable(personalityHeader, [], 'personality', lines.length);
  let inGeneral=false, inRituals=false, inDragons=false, n=0;
  for (const line of lines) {
    const t=clean(line);
    if (/^Age\s+\d+\s+General Changes:?$/i.test(t)) { inGeneral=true; inRituals=inDragons=false; continue; }
    if (/^Race\s+Archetype\s+Bonuses\b/i.test(t) || /^Personality\s+Archetype\s+Bonuses\b/i.test(t)) { inGeneral=inRituals=inDragons=false; continue; }
    if (/^Ritual\s+Effect$/i.test(t)) { inRituals=true; inGeneral=inDragons=false; continue; }
    if (/^Dragons?\s+Effect$/i.test(t)) { inDragons=true; inGeneral=inRituals=false; continue; }
    if (!t) continue;
    if (inGeneral && !/^(Race|Personality)\s+Archetype\b/i.test(t)) {
      result.game_rules['age117_general_'+(++n)] = t;
    } else if (inRituals) {
      const m=t.match(/^([A-Z][A-Za-z'’ -]*?)\s+([+\-−].+)$/);
      if (m) result.rituals[m[1].trim()]={effects:[m[2]]};
    } else if (inDragons) {
      const m=t.match(/^([A-Z][A-Za-z'’ -]*?)\s+([+\-−].+)$/);
      if (m) result.dragons[dragonKey(m[1].trim())]={effects:[m[2]]};
    }
  }
  result.complete_sections = [];
  result.complete_table_counts = {};
  if (canonical.races.length) {
    result.complete_sections.push('races');
    result.complete_table_counts.races = canonical.races.length;
    result.races = Object.fromEntries(canonical.races.map((row) => [row.name, {
      emoji: null, archetype: row.archetype || null, war_doctrine: row.doctrine || null,
      unique_name: row.unique_name || null, unique_passive: row.unique_passive || null,
      bonuses: Array.isArray(row.bonuses) ? row.bonuses : [],
      penalties: Array.isArray(row.penalties) ? row.penalties : [],
      units: row.units || '', spells: Array.isArray(row.spells) ? row.spells : []
    }]));
  }
  if (canonical.personalities.length) {
    result.personalities = Object.fromEntries(canonical.personalities.map((row) => [personalityKey(row.name), {
      emoji: null, archetype: row.archetype || null, unique_name: row.unique_name || null,
      unique_passive: row.unique_passive || null,
      bonuses: Array.isArray(row.bonuses) ? row.bonuses : [],
      starts_with: Array.isArray(row.starts_with) ? row.starts_with : [],
      spells: Array.isArray(row.spells) ? row.spells : []
    }]));
  }
  if (canonical.rituals.length) { result.complete_sections.push('rituals'); result.complete_table_counts.rituals = canonical.rituals.length; result.rituals = Object.fromEntries(canonical.rituals.map((row) => [row.name, { effects: row.effects || [] }])); }
  if (canonical.dragons.length) { result.complete_sections.push('dragons'); result.complete_table_counts.dragons = canonical.dragons.length; result.dragons = Object.fromEntries(canonical.dragons.map((row) => [dragonKey(row.name), { effects: row.effects || [] }])); }
  return result;
}


function classifyAgeChangeLine(line) {
  const value = String(line || '').trim().replace(/^[•*-]+\\s*/, '');
  if (!value) return null;
  const match = value.match(/^([^:]{2,100}):\\s*(.+)$/);
  const name = match ? match[1].trim() : value.slice(0, 90);
  const detail = match ? match[2].trim() : value;
  const haystack = (name + ' ' + detail).toLowerCase();
  let section = 'game_rules';
  if (/\\b(spell|rune|mana|wizard|wpa|fanaticism|instant magic|ritual effectiveness)\\b/.test(haystack)) section = 'spells';
  if (/\\b(thiev|thief|tpa|sabotage|stealth|espionage|guild effect)\\b/.test(haystack)) section = 'thievery';
  if (/\\b(building|construction|raze|architect)\\b/.test(haystack)) section = 'buildings';
  if (/\\b(science|scientist|bookkeeping|book generation|research)\\b/.test(haystack)) section = 'science';
  if (/\\b(dragon|hitpoints|recurring effects)\\b/.test(haystack)) section = 'game_rules';
  return { section, key: name, value };
}

function parseAge117ChangeLogs(text, result) {
  const lines = String(text || '').replace(/\\r/g, '').split('\\n');
  let mode = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^Change Log from Revised:?$/i.test(line)) { mode = 'revision'; continue; }
    if (/^Unique Abil(?:i)?ty Programming Changes from Existing:?$/i.test(line)) { mode = 'ability'; continue; }
    if (/^#TABLE\\s+/i.test(line) || /^Race\\s+Archetype\\s+Bonuses\\b/i.test(line) ||
        /^Personality\\s+Archetype\\s+Bonuses\\b/i.test(line)) { mode = null; continue; }
    if (!mode || !line || /^#ENDTABLE/i.test(line) || /^#ROW\\s+/i.test(line)) continue;
    if (/^(?:Age\\s+\\d+\\s+General Changes|Ritual\\s+Effect|Dragons?\\s+Effect)$/i.test(line)) { mode = null; continue; }
    const classified = classifyAgeChangeLine(line);
    if (!classified) continue;
    const target = result[classified.section] || result.game_rules;
    target[classified.key] = classified.value;
  }
}

function parse117(rawText) {
  let text = String(rawText).replace(/^\\uFEFF/, '').replace(/\\u000C/g, '').replace(/<PARSED TEXT FOR PAGE:\\s*\\d+\\s*\\/\\s*\\d+>/gi, '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  const hasAge117Structure = /Age\\s*\\d+\\s+General Changes/i.test(text) &&
    /Unique Abil(?:i)?ty Programming Changes from Existing/i.test(text);
  const hasTables = /#TABLE\\s+(?:RACES|PERSONALITIES)/i.test(text) ||
    (/\\bRace\\s+Archetype[\\s\\S]{0,160}?\\bBonuses\\b/i.test(text) &&
     /\\bPersonality\\s+Archetype[\\s\\S]{0,160}?\\bBonuses\\b/i.test(text));
  if (!hasAge117Structure && !hasTables) {
    if (looksBoxed(text)) text = boxedToPlain(text);
    return readPlain(text);
  }

  // Keep every parser's useful output: the canonical table extractor is authoritative
  // for cell-backed race/personality/ritual/dragon rows; the line parser captures
  // ordinary section bullets. Never return the table parser early and discard the
  // revision log or ability-programming changes that follow the tables.
  const tableResult = parseAge117Tables(text);
  const structured = parseStructuredFormat(text.split('\\n'));
  const plain = readPlain(text);
  const result = emptyResult();
  for (const section of ['buildings', 'spells', 'thievery', 'science']) {
    result[section] = { ...(structured[section] || {}), ...(plain[section] || {}) };
  }
  result.races = Object.keys(tableResult.races || {}).length ? tableResult.races
    : (Object.keys(structured.races || {}).length ? structured.races : plain.races);
  result.personalities = Object.keys(tableResult.personalities || {}).length ? tableResult.personalities
    : (Object.keys(structured.personalities || {}).length ? structured.personalities : plain.personalities);
  result.rituals = { ...(plain.rituals || {}), ...(structured.rituals || {}), ...(tableResult.rituals || {}) };
  result.dragons = { ...(plain.dragons || {}), ...(structured.dragons || {}), ...(tableResult.dragons || {}) };
  result.game_rules = { ...(plain.game_rules || {}), ...(structured.game_rules || {}), ...(tableResult.game_rules || {}) };
  result.complete_sections = Array.isArray(tableResult.complete_sections) ? tableResult.complete_sections.slice() : [];
  result.complete_table_counts = { ...(tableResult.complete_table_counts || {}) };
  parseAge117ChangeLogs(text, result);
  return result;
}


const RACE_NAMES = ['Avian','Dark Elf','Gnome','Dwarf','Dryad','Elf','Faery','Halfling','Human','Orc','Undead'];
const PERSONALITY_NAMES = ['The Artisan','The General','The Heretic','The Mystic','The Necromancer',
  'The Cleric','The Rogue','The Tactician','The Warrior','The War Hero','The Sage'];
const DRAGON_NAMES = ['Amethyst Dragon','Emerald Dragon','Ruby Dragon','Topaz Dragon','Sapphire Dragons'];

function emptyResult() {
  return { races: {}, personalities: {}, buildings: {}, spells: {}, thievery: {}, game_rules: {}, dragons: {}, science: {} };
}
function cleanBullet(line) { return line.replace(/^[•\-\*]+\s*/, '').trim(); }
function stripCite(text) { return text.replace(/\s*\[cite:\s*\d+\]/g, ''); }
function isPdfFormat(lines) {
  return lines.some(l => RACE_NAMES.some(r => l.startsWith(`${r} Bonuses:`)));
}

function parseStructuredFormat(lines) {
  const result = emptyResult();
  let currentSection = null, currentRace = null, currentPersonality = null, currentDragon = null;
  let inUnits = false, inPenalties = false;
  const SECTION_HEADERS = {
    'Buildings':'buildings','Science':'science','Spells':'spells','Thievery':'thievery',
    'Attacking and Defending':'attacking','Relations & Hostility':'relations',
    'Relations & Hostility Updates':'relations','Dragons':'dragons','Races':'races','Personalities':'personalities',
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = cleanBullet(raw);
    if (SECTION_HEADERS[raw] !== undefined) {
      currentSection = SECTION_HEADERS[raw]; currentRace = currentPersonality = currentDragon = null; inUnits = inPenalties = false; continue;
    }
    if (currentSection === 'races') {
      const isRace = RACE_NAMES.find(r => raw === r);
      if (isRace) { currentRace = isRace; currentPersonality = currentDragon = null; inUnits = inPenalties = false; result.races[currentRace] = { bonuses:[], penalties:[], units:{}, spells:[], war_doctrine:'', unique_passive:'' }; continue; }
      if (currentRace) {
        if (line === 'Units:') { inUnits = true; inPenalties = false; continue; }
        if (line === 'Bonuses:') { inUnits = inPenalties = false; continue; }
        if (line === 'Penalties:') { inUnits = false; inPenalties = true; continue; }
        const r = result.races[currentRace];
        if (inUnits) { const um = line.match(/^(Soldier|Offensive Specialist|Defensive Specialist|Elite Unit|Mercenary|Prisoner|War Horse):\s*(.+)/); if (um) r.units[um[1]] = um[2].trim(); continue; }
        if (line.startsWith('War Doctrine')) { r.war_doctrine = line; continue; }
        if (line.startsWith('Unique Passive')) { r.unique_passive = line; continue; }
        if (line.startsWith('Spells:')) { r.spells = line.replace('Spells:','').split(',').map(s=>s.trim()).filter(Boolean); continue; }
        if ((raw.startsWith('•')||raw.startsWith('-'))&&line) { if (inPenalties) r.penalties.push(line); else r.bonuses.push(line); }
        continue;
      }
    }
    if (currentSection === 'personalities') {
      const isP = PERSONALITY_NAMES.find(p => raw === p);
      if (isP) { currentPersonality = isP; currentRace = currentDragon = null; inPenalties = false; result.personalities[currentPersonality] = { bonuses:[], spells:[], unique_passive:'', starts_with:[] }; continue; }
      if (currentPersonality) {
        const p = result.personalities[currentPersonality];
        if (line.startsWith('Unique Passive')) { p.unique_passive = line; continue; }
        if (line.startsWith('Access to')) { p.spells = line.replace('Access to','').split(',').map(s=>s.trim()).filter(Boolean); continue; }
        if (line.startsWith('Starts with')) { p.starts_with.push(line); continue; }
        if ((raw.startsWith('•')||raw.startsWith('-'))&&line) p.bonuses.push(line);
        continue;
      }
    }
    if (currentSection === 'dragons') {
      const isDragon = DRAGON_NAMES.find(d => line.startsWith(d)||raw.startsWith(d));
      if (isDragon) { currentDragon = isDragon; currentRace = currentPersonality = null; result.dragons[currentDragon] = { effects:[] }; continue; }
      if (currentDragon&&(raw.startsWith('•')||raw.startsWith('-'))&&line) result.dragons[currentDragon].effects.push(line);
      continue;
    }
    if (!currentRace&&!currentPersonality&&!currentDragon&&(raw.startsWith('•')||raw.startsWith('-'))&&line) {
      if (currentSection==='buildings') result.buildings[`building_${Object.keys(result.buildings).length+1}`]=line;
      if (currentSection==='science') result.science[`science_${Object.keys(result.science).length+1}`]=line;
      if (currentSection==='spells') result.spells[`spell_${Object.keys(result.spells).length+1}`]=line;
      if (currentSection==='thievery') result.thievery[`thievery_${Object.keys(result.thievery).length+1}`]=line;
      if (currentSection==='attacking') result.game_rules[`attack_${Object.keys(result.game_rules).length+1}`]=line;
      if (currentSection==='relations') result.game_rules[`relation_${Object.keys(result.game_rules).length+1}`]=line;
    }
  }
  return result;
}

function parsePdfFormat(lines, fullText) {
  const result = emptyResult();
  const FLAT_MAP = { 'Buildings':'buildings','Science':'science','Spells':'spells','Thievery':'thievery','Attacking and Defending':'attacking','Relations & Hostility':'relations' };
  let currentFlat = null;
  for (const line of lines) {
    if (FLAT_MAP[line]) { currentFlat = FLAT_MAP[line]; continue; }
    if (['Dragons','Races','Personalities'].includes(line)) { currentFlat = null; continue; }
    if (currentFlat&&(line.startsWith('•')||line.startsWith('-'))) {
      const clean = cleanBullet(line); if (!clean) continue;
      if (currentFlat==='buildings') result.buildings[`building_${Object.keys(result.buildings).length+1}`]=clean;
      else if (currentFlat==='science') result.science[`science_${Object.keys(result.science).length+1}`]=clean;
      else if (currentFlat==='spells') result.spells[`spell_${Object.keys(result.spells).length+1}`]=clean;
      else if (currentFlat==='thievery') result.thievery[`thievery_${Object.keys(result.thievery).length+1}`]=clean;
      else if (currentFlat==='attacking'||currentFlat==='relations') result.game_rules[`rule_${Object.keys(result.game_rules).length+1}`]=clean;
    }
  }
  const dragonStart = fullText.indexOf('\nDragons\n'), dragonEnd = fullText.indexOf('\nRaces\n');
  if (dragonStart !== -1 && dragonEnd !== -1) {
    let dragonBlock = fullText.slice(dragonStart, dragonEnd);
    for (const d of DRAGON_NAMES) dragonBlock = dragonBlock.replace(new RegExp(`([^\\n])(${d})`,'g'),`$1\n$2`);
    let currentDragon = null;
    for (const line of dragonBlock.split('\n').map(l=>l.trim()).filter(Boolean)) {
      const dragon = DRAGON_NAMES.find(d => line===d||line.startsWith(d));
      if (dragon) { currentDragon = dragon; result.dragons[currentDragon] = { effects:[] }; continue; }
      if (currentDragon&&(line.startsWith('•')||line.startsWith('-'))) { const clean=cleanBullet(line); if (clean) result.dragons[currentDragon].effects.push(clean); }
    }
  }
  const joinedText = lines.join(' ');
  const racesIdx = joinedText.indexOf('Races '), persIdx = joinedText.indexOf('Personalities');
  const racesBlock = racesIdx !== -1 ? joinedText.slice(racesIdx, persIdx !== -1 ? persIdx : undefined) : '';
  const racePat = new RegExp(`(${RACE_NAMES.map(r=>r.replace(/ /g,'\\s+')).join('|')})\\s+Bonuses:`,'g');
  const raceMatches = [...racesBlock.matchAll(racePat)];
  for (let i = 0; i < raceMatches.length; i++) {
    const raceName = raceMatches[i][1].replace(/\s+/g,' ').trim();
    const start = raceMatches[i].index + raceMatches[i][0].length;
    const end = i+1 < raceMatches.length ? raceMatches[i+1].index : racesBlock.length;
    const data = racesBlock.slice(start, end).trim();
    const r = { bonuses:[], penalties:[], units:{}, spells:[], war_doctrine:'', unique_passive:'' };
    const wdM = data.match(/War Doctrine \(In War\):\s*(.+?)(?=Unique Passive|Spells:|Penalties:|Units:|$)/); if (wdM) r.war_doctrine = 'War Doctrine (In War): '+wdM[1].trim();
    const upNameM = data.match(/Unique Passive\s*[-–]\s*([^:]+):\s*(.+?)(?=Spells:|Penalties:|Units:|War Doctrine|$)/); if (upNameM) r.unique_passive = `Unique Passive - ${upNameM[1].trim()}: ${upNameM[2].trim()}`;
    const spM = data.match(/Spells:\s*(.+?)(?=Penalties:|Units:|War Doctrine|Unique Passive|$)/); if (spM) r.spells = spM[1].split(',').map(s=>s.trim()).filter(Boolean);
    const bonusText = data.split(/War Doctrine|Unique Passive|Spells:|Penalties:|Units:/)[0].trim();
    if (bonusText) bonusText.split(/,\s*(?=[+\-]|\w)/).forEach(b=>{b=b.trim();if(b)r.bonuses.push(b);});
    const penM = data.match(/Penalties:\s*(.+?)(?=Units:|War Doctrine|Unique Passive|Spells:|$)/); if (penM) penM[1].trim().split(/,\s*(?=[+\-]|\w)/).forEach(p=>{p=p.trim();if(p)r.penalties.push(p);});
    const unitTypes = ['Soldier','Offensive Specialist','Defensive Specialist','Elite Unit','Mercenary','Prisoner','War Horse'];
    const unitsM = data.match(/Units:\s*(.+?)$/); if (unitsM) unitTypes.forEach(ut=>{const um=unitsM[1].match(new RegExp(`${ut}\\s*\\(([^)]+)\\)`));if(um)r.units[ut]=um[1].trim();});
    result.races[raceName] = r;
  }
  let inP = false;
  for (const line of lines) {
    if (line === 'Personalities') { inP = true; continue; }
    if (inP&&(line.startsWith('•')||line.startsWith('-'))) {
      const clean = cleanBullet(line), pm = clean.match(/^(The \w[\w\s]*?):\s*(.+)/);
      if (pm&&PERSONALITY_NAMES.includes(pm[1].trim())) {
        const pname=pm[1].trim(), pdata=pm[2].trim(), p={bonuses:[],spells:[],unique_passive:'',starts_with:[]};
        const passM=pdata.match(/Passive:\s*(.+?)(?:\.|$)/); if(passM) p.unique_passive='Passive: '+passM[1].trim();
        const swM=pdata.match(/starts with\s+(.+?)(?=Passive:|$)/i); if(swM) p.starts_with.push('Starts with '+swM[1].trim());
        pdata.split(/starts with|Passive:/i)[0].split(/,\s*(?=[+\-]|\w)/).forEach(b=>{b=b.trim().replace(/\.$/,'');if(b&&b.length>2)p.bonuses.push(b);});
        result.personalities[pname]=p;
      }
    }
  }
  return result;
}

function parseAgeFileChunked(rawText) {
  let text = String(rawText)
    .replace(/^\uFEFF/,'').replace(/\u000C/g,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n')
    .replace(/\bRuby\n+Dragon\b/g,'Ruby Dragon')
    .replace(/\bSapphire\n+Dragons\b/g,'Sapphire Dragons')
    .replace(/\bAmethyst\n+Dragon\b/g,'Amethyst Dragon')
    .replace(/\bEmerald\n+Dragon\b/g,'Emerald Dragon')
    .replace(/\bTopaz\n+Dragon\b/g,'Topaz Dragon');
  text = stripCite(text);
  if (looksLike117(text)) return parse117(text);
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  return isPdfFormat(lines) ? parsePdfFormat(lines, text) : parseStructuredFormat(lines);
}

function summarize(parsed) {
  const lines = [];
  if (parsed.rituals && Object.keys(parsed.rituals).length) lines.push('🔮 ' + Object.keys(parsed.rituals).length + ' Rituals');
  if (Object.keys(parsed.races).length)        lines.push(`🏁 ${Object.keys(parsed.races).length} Races`);
  if (Object.keys(parsed.personalities).length) lines.push(`🎭 ${Object.keys(parsed.personalities).length} Personalities`);
  if (Object.keys(parsed.dragons).length)       lines.push(`🐉 ${Object.keys(parsed.dragons).length} Dragons`);
  if (Object.keys(parsed.spells).length)        lines.push(`✨ ${Object.keys(parsed.spells).length} Spell changes`);
  if (Object.keys(parsed.thievery).length)      lines.push(`🗡️ ${Object.keys(parsed.thievery).length} Thievery changes`);
  if (Object.keys(parsed.buildings).length)     lines.push(`🏗️ ${Object.keys(parsed.buildings).length} Building changes`);
  if (Object.keys(parsed.science).length)       lines.push(`🔬 ${Object.keys(parsed.science).length} Science changes`);
  if (Object.keys(parsed.game_rules).length)    lines.push(`⚔️ ${Object.keys(parsed.game_rules).length} Game rule changes`);
  return lines.join('\n');
}



const SECTIONS = ['races', 'personalities', 'buildings', 'spells', 'thievery', 'game_rules', 'dragons', 'science', 'rituals'];

function cleanText(value) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
}

function stableKey(label, fallback) {
  const raw = String(label || '').trim().replace(/^[•*-]\s*/, '');
  const beforeColon = raw.match(/^(.{2,100}?):\s+\S/);
  if (beforeColon) return beforeColon[1].trim();
  const namedChange = raw.match(/^(?:Added|Changed|Updated|Removed|Restore|Restored|Move|Moved)\s+(.+?)(?:\s+(?:to|from|for|by)\s+.+)?$/i);
  if (namedChange) return namedChange[1].trim();
  return fallback;
}

function normalizeFlatSection(section, prefix) {
  const out = {};
  for (const [originalKey, value] of Object.entries(section || {})) {
    const text = typeof value === 'string' ? value.trim() : value;
    if (text == null || text === '') continue;
    const key = stableKey(text, originalKey.startsWith(prefix + '_') ? text.slice(0, 80) : originalKey);
    out[key || originalKey] = value;
  }
  return out;
}

function extractRemovals(source) {
  const removed = [];
  let inChangeLog = false;
  for (const line of String(source || '').split('\n')) {
    const text = line.trim().replace(/^[•*-]\s*/, '');
    if (/^Change Log from Revised:?$/i.test(text)) { inChangeLog = true; continue; }
    if (/^Unique Abilty Programming Changes from Existing/i.test(text)) inChangeLog = false;

    let match = text.match(/^Removed\s*:\s*(?:(race|personality|spell|ritual|thievery|building|science|dragon|game rule)\s*[-:]?\s*)?(.+)$/i);
    if (!match) match = text.match(/^Removed\s+(?:(race|personality|spell|ritual|thievery|building|science|dragon|game rule)\s+)?(.+)$/i);
    if (match && match[2]) {
      removed.push({ category: String(match[1] || '').toLowerCase().replace(/\s+/g, '_'), name: match[2].trim().replace(/[.;]+$/, ''), entity: null });
      continue;
    }
    if (!inChangeLog) continue;

    const entityChange = text.match(/^(.+?):\s*Removed\s+([^,;]+)(?:[,;].*)?$/i);
    if (entityChange) {
      const entity = entityChange[1].trim();
      const item = entityChange[2].trim().replace(/[.;]+$/, '');
      if (/\britual\b/i.test(entity)) removed.push({ category: 'ritual', name: entity.replace(/\s+ritual$/i, '').trim(), entity: null });
      else if (/\bdragon\b/i.test(entity)) removed.push({ category: 'dragon', name: entity, entity: null });
      else removed.push({ category: '', name: item, entity });
      continue;
    }
    const whole = text.match(/^(.+?):\s*Removed$/i);
    if (whole) {
      const entity = whole[1].trim();
      if (/\britual\b/i.test(entity)) removed.push({ category: 'ritual', name: entity.replace(/\s+ritual$/i, '').trim(), entity: null });
      else removed.push({ category: '', name: entity, entity: null });
    }
  }
  return removed;
}

function parseAgeChangeText(rawText, ageNumber) {
  const text = cleanText(rawText);
  if (!text) throw new Error('Age update text is empty');

  const parsed = Number(ageNumber) === 117 || looksLike117(text)
    ? parse117(text)
    : parseAgeFileChunked(text);

  const normalized = {};
  for (const section of SECTIONS) normalized[section] = parsed?.[section] && typeof parsed[section] === 'object' ? parsed[section] : {};
  normalized.races = { ...normalized.races };
  normalized.personalities = { ...normalized.personalities };
  for (const [section, prefix] of [
    ['buildings', 'building'], ['spells', 'spell'], ['thievery', 'thievery'],
    ['science', 'science'], ['game_rules', 'rule']
  ]) normalized[section] = normalizeFlatSection(normalized[section], prefix);

  normalized.removed = extractRemovals(text);
  normalized.complete_sections = Array.isArray(parsed?.complete_sections) ? parsed.complete_sections.slice() : [];
  normalized.complete_table_counts = parsed?.complete_table_counts && typeof parsed.complete_table_counts === 'object' ? { ...parsed.complete_table_counts } : {};
  normalized.source = {
    ageNumber: Number(ageNumber) || null,
    isChangeSheet: /\b(?:proposed\s+changes|general\s+changes|changes\s+from\s+existing|change\s+log)\b/i.test(text),
    parser: Number(ageNumber) === 117 || looksLike117(text) ? 'age117-generic' : 'age-full'
  };
  return normalized;
}

module.exports = { parseAgeChangeText, extractRemovals, normalizeFlatSection, stableKey, parseAgeFileChunked, summarize, looksLike117, parse117, boxedToPlain };
