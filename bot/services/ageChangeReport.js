'use strict';

const { parseAgeChangeText } = require('../parsers/ageChangeParser');

const SECTIONS = [
  ['Races', 'races'],
  ['Personalities', 'personalities'],
  ['Rituals', 'rituals'],
  ['Dragons', 'dragons'],
  ['Spells', 'spells'],
  ['Thievery', 'thievery'],
  ['Buildings', 'buildings'],
  ['Science', 'science'],
  ['Game rules / general changes', 'game_rules']
];

function printable(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(String).join('; ') : '—';
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, item]) => key + ': ' + printable(item)).join('; ') : '—';
  }
  return String(value);
}

function entityLines(section, name, value) {
  const lines = ['### ' + name];
  if (section === 'races') {
    for (const field of ['archetype','war_doctrine','unique_name','unique_passive','bonuses','penalties','spells','units']) {
      if (value[field] !== undefined && value[field] !== null && value[field] !== '') lines.push('- ' + field.replace(/_/g, ' ') + ': ' + printable(value[field]));
    }
  } else if (section === 'personalities') {
    for (const field of ['unique_name','unique_passive','bonuses','starts_with','spells']) {
      if (value[field] !== undefined && value[field] !== null && value[field] !== '') lines.push('- ' + field.replace(/_/g, ' ') + ': ' + printable(value[field]));
    }
  } else {
    lines.push('- ' + printable(value));
  }
  return lines;
}

function buildDetailedAgeChangeReport(rawText, ageNumber, shortSummary) {
  let parsed;
  try {
    parsed = parseAgeChangeText(rawText, ageNumber);
  } catch (error) {
    return String(shortSummary || '') + '\n\nDETAILED REPORT ERROR\n- Could not parse source details: ' + error.message;
  }

  const lines = [
    'AGE ' + ageNumber + ' — FULL PARSED CHANGE REPORT',
    'This report lists extracted source changes, not just section counts.',
    'A field shown here is what the parser extracted; compare it with the PDF before applying.',
    '',
    'SUMMARY / VALIDATION'
  ];
  lines.push(...String(shortSummary || 'No parser summary was returned.').split(/\r?\n/));
  lines.push('', 'DETAILED SOURCE ENTRIES');

  for (const [heading, section] of SECTIONS) {
    const values = parsed[section] && typeof parsed[section] === 'object' ? parsed[section] : {};
    lines.push('', '## ' + heading + ' (' + Object.keys(values).length + ')');
    if (!Object.keys(values).length) {
      lines.push('- No entries extracted in this section.');
      continue;
    }
    for (const [name, value] of Object.entries(values)) {
      if (section === 'races' || section === 'personalities') lines.push(...entityLines(section, name, value || {}));
      else lines.push(...entityLines(section, name, value));
    }
  }

  lines.push('', '## Explicit removals (' + (parsed.removed || []).length + ')');
  if (parsed.removed?.length) {
    for (const item of parsed.removed) lines.push('- ' + [item.category || 'unspecified category', item.entity ? 'entity=' + item.entity : '', item.name || 'unnamed removal'].filter(Boolean).join(' — '));
  } else lines.push('- No explicit removals extracted.');

  lines.push('', '## Source metadata');
  lines.push('- Parser: ' + (parsed.source?.parser || 'unknown'));
  lines.push('- Change sheet detected: ' + String(Boolean(parsed.source?.isChangeSheet)));
  lines.push('- Report is informational; approval re-runs server-side validation.');
  return lines.join('\n');
}

module.exports = { buildDetailedAgeChangeReport };
