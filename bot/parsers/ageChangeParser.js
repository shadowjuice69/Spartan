'use strict';

const { parseAgeFileChunked } = require('./ageParser');
const { looksLike117, parse117 } = require('./age117');

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

    const entityChange = text.match(/^(.+?):\s*Removed\s+(.+)$/i);
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
  normalized.source = {
    ageNumber: Number(ageNumber) || null,
    isChangeSheet: /\b(?:proposed\s+changes|general\s+changes|changes\s+from\s+existing|change\s+log)\b/i.test(text),
    parser: Number(ageNumber) === 117 || looksLike117(text) ? 'age117-generic' : 'age-full'
  };
  return normalized;
}

module.exports = { parseAgeChangeText, extractRemovals, normalizeFlatSection, stableKey };
