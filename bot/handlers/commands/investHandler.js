const supabaseService = require('../../services/supabase');
const spartanAccess = require('../../services/spartanAccessService');
const canonicalIntel = require('../../services/canonicalIntelService');
const { parseScience, parseThrone } = require('../../services/canonicalIntelParser');
const { booksMapFromParsed, buildPlanLines } = require('../../services/investPlan');
const { reply, replyError } = require('../../services/interactionReply');

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
    return {
      error: '❌ No Spartan province identity found. Use `/spartan register`, or pass `province:`.',
    };
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

module.exports = async function investHandler(interaction) {
  try {
    const sb = supabaseService.getClient();
    if (!sb) return reply(interaction, '❌ Database unavailable.');

    const buildQuery = interaction.options.getString('build');
    const provinceQuery = interaction.options.getString('province');

    const province = await resolveProvince(sb, interaction, provinceQuery);
    if (province.error) return reply(interaction, province.error);
    const { provinceName, kingdomCode } = province;

    const [scienceRow, throneRow] = await Promise.all([
      canonicalIntel.getProvinceIntel({
        kd: kingdomCode,
        province: provinceName,
        pageKind: 'science',
        visibility: 'own',
      }),
      canonicalIntel.getProvinceIntel({
        kd: kingdomCode,
        province: provinceName,
        pageKind: 'throne',
        visibility: 'own',
      }),
    ]);

    if (!scienceRow) {
      return reply(
        interaction,
        `❌ No own website Science capture found for **${provinceName}** (`${kingdomCode}`). Capture Science from the site first.`
      );
    }

    const parsedScience = parseScience(
      scienceRow.parsed_payload || { raw_text: scienceRow.raw_text }
    );
    const currentBooks = booksMapFromParsed(parsedScience);
    const race = throneRow
      ? parseThrone(throneRow.parsed_payload || { raw_text: throneRow.raw_text })?.race
      : null;

    const build = await resolveBuild(sb, { buildQuery, race });
    if (!build) {
      const hint = buildQuery
        ? ` matching **${buildQuery}**`
        : race
          ? ` for race **${race}**`
          : '';
      return reply(
        interaction,
        `❌ No build found${hint}. Specify \`build:<name>\` from the Spartan Build Library.`
      );
    }

    if (!build.science || typeof build.science !== 'object' || !Object.keys(build.science).length) {
      return reply(
        interaction,
        `❌ Build **${build.name}** has no science weights configured in the Build Library.`
      );
    }

    const content = buildPlanLines({ provinceName, build, currentBooks });
    return reply(interaction, content);
  } catch (err) {
    return replyError(interaction, err, 'Invest planner failed.');
  }
};
