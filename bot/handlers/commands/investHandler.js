const supabaseService = require('../../services/supabase');
const spartanAccess = require('../../services/spartanAccessService');
const canonicalIntel = require('../../services/canonicalIntelService');
const { parseScience, parseThrone } = require('../../services/canonicalIntelParser');
const errorHandler = require('../../services/errorHandler');

const CATEGORY_EMOJI = { arcane: '🔮', economy: '💰', military: '⚔️' };

function bookKey(name) {
  return String(name || '').trim().toLowerCase();
}

function booksMapFromScienceRow(scienceRow) {
  const parsed = parseScience(scienceRow.parsed_payload || { raw_text: scienceRow.raw_text }) || [];
  const map = {};
  for (const s of parsed) {
    const key = bookKey(s.name);
    if (!key) continue;
    map[key] = Number(s.books) || 0;
  }
  return map;
}

async function resolveProvince(sb, interaction, provinceQuery) {
  if (provinceQuery) {
    const { data, error } = await sb
      .from('spartan_province_registry')
      .select('province_name,kingdom_code')
      .ilike('province_name', `%${provinceQuery}%`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: `❌ No registered province matching **${provinceQuery}**.` };
    return { provinceName: data.province_name, kingdomCode: data.kingdom_code };
  }

  const access = await spartanAccess.get(interaction.user.id).catch(() => null);
  const meta = access?.metadata || {};
  const provinceName = meta.province || access?.username || null;
  const kingdomCode = String(meta.coordinates || access?.kingdom_code || '').trim() || null;
  if (!provinceName || !kingdomCode) {
    return { error: '❌ No Spartan province identity found. Use `/spartan register`, or pass `province:`.' };
  }
  return { provinceName, kingdomCode };
}

async function resolveBuild(sb, { buildQuery, race }) {
  if (buildQuery) {
    const { data, error } = await sb
      .from('spartan_builds')
      .select('name,race,personality,science,active')
      .ilike('name', `%${buildQuery}%`)
      .order('active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  if (!race) return null;
  const { data: activeMatch, error: activeError } = await sb
    .from('spartan_builds')
    .select('name,race,personality,science,active')
    .ilike('race', race)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (activeMatch) return activeMatch;

  const { data: anyMatch, error: anyError } = await sb
    .from('spartan_builds')
    .select('name,race,personality,science,active')
    .ilike('race', race)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anyError) throw anyError;
  return anyMatch;
}

function formatBuildLabel(build) {
  const bits = [build.race, build.personality].filter(Boolean).join(' ');
  return bits ? ` (${bits})` : '';
}

function categoryLines(cat, sciences, currentBooks) {
  const entries = Object.entries(sciences || {});
  const weighted = entries.filter(([, s]) => s && s.type === 'weight');
  const fixed = entries.filter(([, s]) => s && s.type === 'actual_pct');
  const totalWeight = weighted.reduce((sum, [, v]) => sum + (Number(v.value) || 0), 0);
  const totalBooks = weighted.reduce((sum, [name]) => sum + (currentBooks[bookKey(name)] || 0), 0);
  const rows = weighted.map(([name, v]) => {
    const have = currentBooks[bookKey(name)] || 0;
    const targetShare = totalWeight ? Number(v.value) / totalWeight : 0;
    const haveShare = totalBooks ? have / totalBooks : 0;
    return { name, weight: v.value, have, gap: targetShare - haveShare };
  }).sort((a, b) => b.gap - a.gap);

  const lines = [];
  const title = cat.charAt(0).toUpperCase() + cat.slice(1);
  lines.push(`${CATEGORY_EMOJI[cat] || '📊'} **${title}**`);
  if (!rows.length && !fixed.length) {
    lines.push('_No sciences configured in this category._', '');
    return lines;
  }
  if (rows.length) {
    lines.push(`Invest next: ${rows.slice(0, 3).map((r) => `**${r.name}**`).join(' → ')}`);
  }
  for (const r of rows) lines.push(`  ${r.name} — weight ${r.weight}, have ${r.have.toLocaleString()} books`);
  for (const [name, v] of fixed) lines.push(`  ${name} — target ${v.value}% (fixed target, not weight-ranked)`);
  lines.push('');
  return lines;
}

module.exports = async function investHandler(interaction) {
  try {
    const sb = supabaseService.getClient();
    if (!sb) return interaction.reply({ content: '❌ Database unavailable.', ephemeral: true });

    const buildQuery = interaction.options.getString('build');
    const provinceQuery = interaction.options.getString('province');
    const province = await resolveProvince(sb, interaction, provinceQuery);
    if (province.error) return interaction.reply({ content: province.error, ephemeral: true });
    const { provinceName, kingdomCode } = province;

    const [scienceRow, throneRow] = await Promise.all([
      canonicalIntel.getProvinceIntel({ kd: kingdomCode, province: provinceName, pageKind: 'science', visibility: 'own' }),
      canonicalIntel.getProvinceIntel({ kd: kingdomCode, province: provinceName, pageKind: 'throne', visibility: 'own' }),
    ]);
    if (!scienceRow) {
      return interaction.reply({
        content: `❌ No own website Science capture found for **${provinceName}** (\`${kingdomCode}\`). Capture Science from the site first.`,
        ephemeral: true,
      });
    }

    const currentBooks = booksMapFromScienceRow(scienceRow);
    const race = throneRow ? parseThrone(throneRow.parsed_payload || { raw_text: throneRow.raw_text })?.race : null;
    const build = await resolveBuild(sb, { buildQuery, race });
    if (!build) {
      const hint = buildQuery ? ` matching **${buildQuery}**` : race ? ` for race **${race}**` : '';
      return interaction.reply({
        content: `❌ No build found${hint}. Specify \`build:<name>\` from the Spartan Build Library.`,
        ephemeral: true,
      });
    }
    if (!build.science || typeof build.science !== 'object' || !Object.keys(build.science).length) {
      return interaction.reply({
        content: `❌ Build **${build.name}** has no science weights configured in the Build Library.`,
        ephemeral: true,
      });
    }

    const inactiveNote = build.active === false ? '\n⚠️ This build is **inactive** in the library; plan may be outdated.' : '';
    const lines = [
      `📈 **Investment Plan — ${provinceName}**`,
      `Build: **${build.name}**${formatBuildLabel(build)}${inactiveNote}`,
      '',
    ];
    for (const [cat, sciences] of Object.entries(build.science)) lines.push(...categoryLines(cat, sciences, currentBooks));
    lines.push('_Ranks each science by how far its current book share sits below its weight target within the category — not by raw book counts alone. Fixed-% sciences are listed but not ranked; work those toward their stated target directly._');
    return interaction.reply({ content: lines.join('\n').slice(0, 1900), ephemeral: true });
  } catch (err) {
    const msg = errorHandler.userMessage(err, 'Invest planner failed.');
    return interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
  }
};
