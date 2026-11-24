const CATEGORY_EMOJI = { arcane: '🔮', economy: '💰', military: '⚔️' };

function bookKey(name) {
  return String(name || '').trim().toLowerCase();
}

function booksMapFromParsed(parsed) {
  const map = {};
  for (const science of parsed || []) {
    const key = bookKey(science.name);
    if (!key) continue;
    map[key] = Number(science.books) || 0;
  }
  return map;
}

function formatBuildLabel(build) {
  if (!build) return '';
  const bits = [build.race, build.personality].filter(Boolean).join(' ');
  return bits ? ` (${bits})` : '';
}

/**
 * Rank weighted sciences by how far current share is below target share.
 * Fixed actual_pct entries are listed, not ranked.
 */
function rankCategory(sciences, currentBooks = {}) {
  const entries = Object.entries(sciences || {});
  const weighted = entries.filter(([, science]) => science && science.type === 'weight');
  const fixed = entries.filter(([, science]) => science && science.type === 'actual_pct');

  const totalWeight = weighted.reduce((sum, [, value]) => sum + (Number(value.value) || 0), 0);
  const totalBooks = weighted.reduce(
    (sum, [name]) => sum + (Number(currentBooks[bookKey(name)]) || 0),
    0
  );

  const rows = weighted
    .map(([name, value]) => {
      const have = Number(currentBooks[bookKey(name)]) || 0;
      const targetShare = totalWeight ? (Number(value.value) || 0) / totalWeight : 0;
      const haveShare = totalBooks ? have / totalBooks : 0;
      return {
        name,
        weight: Number(value.value) || 0,
        have,
        gap: targetShare - haveShare,
      };
    })
    .sort((a, b) => b.gap - a.gap);

  return {
    rows,
    fixed: fixed.map(([name, value]) => ({ name, value: value.value })),
    totalWeight,
    totalBooks,
  };
}

function categoryLines(category, sciences, currentBooks = {}) {
  const { rows, fixed } = rankCategory(sciences, currentBooks);
  const lines = [];
  const title = String(category || '').charAt(0).toUpperCase() + String(category || '').slice(1);
  lines.push(`${CATEGORY_EMOJI[category] || '📊'} **${title}**`);

  if (!rows.length && !fixed.length) {
    lines.push('_No sciences configured in this category._', '');
    return lines;
  }

  if (rows.length) {
    lines.push(`Invest next: ${rows.slice(0, 3).map((row) => `**${row.name}**`).join(' → ')}`);
  }
  for (const row of rows) {
    lines.push(`  ${row.name} — weight ${row.weight}, have ${row.have.toLocaleString()} books`);
  }
  for (const item of fixed) {
    lines.push(`  ${item.name} — target ${item.value}% (fixed target, not weight-ranked)`);
  }
  lines.push('');
  return lines;
}

function buildPlanLines({ provinceName, build, currentBooks = {} }) {
  const inactiveNote =
    build.active === false
      ? '\\n⚠️ This build is **inactive** in the library; plan may be outdated.'
      : '';

  const lines = [
    `📈 **Investment Plan — ${provinceName}**`,
    `Build: **${build.name}**${formatBuildLabel(build)}${inactiveNote}`,
    '',
  ];

  for (const [category, sciences] of Object.entries(build.science || {})) {
    lines.push(...categoryLines(category, sciences, currentBooks));
  }

  lines.push(
    '_Ranks each science by how far its current book share sits below its weight target within the category — not by raw book counts alone. Fixed-% sciences are listed but not ranked; work those toward their stated target directly._'
  );

  return lines.join('\\n').slice(0, 1900);
}

module.exports = {
  bookKey,
  booksMapFromParsed,
  formatBuildLabel,
  rankCategory,
  categoryLines,
  buildPlanLines,
  CATEGORY_EMOJI,
};
