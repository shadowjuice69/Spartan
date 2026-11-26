const crypto = require('crypto');
const supabaseService = require('./supabase');
const logger = require('./logger');
const stewardSystem = require('./spartanStewardSystem');
const { parseStructuredNewsEvents } = require('./spartanEventNormalizer');

const INTERVAL_MS = Math.max(500, Number(process.env.SPARTAN_PROCESSOR_INTERVAL_MS || 2000));
const BATCH_SIZE = Math.max(1, Math.min(50, Number(process.env.SPARTAN_PROCESSOR_BATCH_SIZE || 10)));
const BACKLOG_STEWARD_INTERVAL_MS = Math.max(60000, Number(process.env.SPARTAN_BACKLOG_STEWARD_INTERVAL_MS || 300000));
const WORKER_ID = process.env.RENDER_INSTANCE_ID || `spartan-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
let timer = null;
let backlogStewardTimer = null;
let running = false;
let startupBackfillRunning = false;
function compact(value) { return Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== undefined && v !== null)); }
async function loadCapture(sb, flow) {
  if (!flow?.capture_id) return null;
  const { data, error } = await sb.from('spartan_capture_vault').select('id,capture_id,source,province_id,kingdom_id,page_kind,url,raw_text,raw_payload,parsed_payload,content_hash,captured_at,user_id').eq('capture_id', flow.capture_id).order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`capture lookup: ${error.message}`);
  return data || null;
}
function extractState(flow, capture) {
  const parsed = capture?.parsed_payload || {};
  const data = parsed?.data || {};
  return compact({ capture_id: flow.capture_id, source: flow.source, page_kind: flow.page_kind, province_id: flow.province_id, kingdom_id: flow.kingdom_id, url: capture?.url || null, parsed_type: parsed?.type || null, parsed_kind: parsed?.kind || null, raw_length: parsed?.raw_length || null, data, raw_text: capture?.raw_text || null, raw_payload: capture?.raw_payload || {}, content_hash: capture?.content_hash || null, captured_at: capture?.captured_at || null, processed_at: new Date().toISOString() });
}
async function findProvince(sb, flow, state) {
  const data = state?.data || {};
  const kdCode = String(flow.kingdom_id || data.coordinates || '').trim();
  const provinceName = String(flow.province_id || data.name || '').trim();
  if (!provinceName || provinceName.startsWith('Slot #')) return null;

  // Spartan no longer depends on the legacy `provinces` table. The canonical
  // identity source is spartan_province_registry.
  let query = sb.from('spartan_province_registry')
    .select('province_id,province_name,kingdom_code,metadata')
    .limit(1);

  if (kdCode) {
    query = query.eq('kingdom_code', kdCode).eq('province_name', provinceName);
  } else {
    query = query.eq('province_id', provinceName);
  }

  const { data: province, error } = await query.maybeSingle();
  if (error) throw new Error(`canonical province lookup: ${error.message}`);
  if (!province) return null;

  return {
    id: province.province_id,
    province_id: province.province_id,
    name: province.province_name,
    kingdom_id: province.kingdom_code,
    metadata: province.metadata || {},
  };
}
async function syncCanonicalProvince(sb, flow, state) {
  if (flow.page_kind !== 'throne') return null;
  const data = state?.data || {};
  const province = await findProvince(sb, flow, state);
  if (!province) {
    logger.warn(`[SPARTAN PROCESSOR] canonical province not found kd=${flow.kingdom_id} province=${flow.province_id}`);
    return null;
  }
  const capturedAt = state.captured_at || state.processed_at || new Date().toISOString();
  const metadata = {
    ...(province.metadata || {}),
    ruler: data.ruler ?? province.metadata?.ruler ?? null,
    race: data.race ?? province.metadata?.race ?? null,
    personality: data.personality ?? province.metadata?.personality ?? null,
    acres: data.acres ?? province.metadata?.acres ?? null,
    nw: data.nw ?? province.metadata?.nw ?? null,
    off: data.off ?? province.metadata?.off ?? null,
    def: data.def ?? province.metadata?.def ?? null,
    peons: data.peons ?? province.metadata?.peons ?? null,
    soldiers: data.soldiers ?? province.metadata?.soldiers ?? null,
    thieves: data.thieves ?? province.metadata?.thieves ?? null,
    wizards: data.wizards ?? province.metadata?.wizards ?? null,
    war_horses: data.war_horses ?? province.metadata?.war_horses ?? null,
    prisoners: data.prisoners ?? province.metadata?.prisoners ?? null,
    o_tpa: data.o_tpa ?? province.metadata?.o_tpa ?? null,
    d_tpa: data.d_tpa ?? province.metadata?.d_tpa ?? null,
    o_wpa: data.o_wpa ?? province.metadata?.o_wpa ?? null,
    d_wpa: data.d_wpa ?? province.metadata?.d_wpa ?? null,
    be: data.be ?? province.metadata?.be ?? null,
    good_spells: data.good_spells ?? province.metadata?.good_spells ?? null,
    coordinates: data.coordinates ?? province.kingdom_id ?? null,
    game_type: data.game_type ?? province.metadata?.game_type ?? null,
    throne: data,
    throne_captured_at: capturedAt,
  };
  const { error } = await sb.from('spartan_province_registry')
    .update({ metadata, last_seen_at: capturedAt, updated_at: new Date().toISOString() })
    .eq('province_id', province.id);
  if (error) throw new Error(`canonical province update: ${error.message}`);
  return { provinceId: province.id, kingdomId: province.kingdom_id, fields: Object.keys(metadata) };
}
async function syncSpecializedProvinceData(sb, flow, state) {
  if (!['survey', 'science', 'som', 'magic', 'thievery', 'universal'].includes(flow.page_kind)) return null;
  const province = await findProvince(sb, flow, state);
  if (!province) return null;
  const data = state?.data || {};
  const capturedAt = state.captured_at || state.processed_at || new Date().toISOString();
  const metadata = {
    ...(province.metadata || {}),
    [flow.page_kind]: data,
    [`${flow.page_kind}_captured_at`]: capturedAt,
  };
  if (flow.page_kind === 'survey' && data.buildings && typeof data.buildings === 'object') metadata.buildings = data.buildings;
  if (flow.page_kind === 'science' && data.science && typeof data.science === 'object') metadata.science = data.science;
  const { error } = await sb.from('spartan_province_registry')
    .update({ metadata, last_seen_at: capturedAt, updated_at: new Date().toISOString() })
    .eq('province_id', province.id);
  if (error) throw new Error(`specialized province sync: ${error.message}`);
  return { provinceId: province.id, kingdomId: province.kingdom_id, fields: Object.keys(metadata) };
}
async function resolveAuthUserId(sb, capture, flow) {
  const ownerId = capture?.user_id || flow?.user_id || null;
  if (!ownerId) return null;
  const { data: account, error } = await sb.from('spartan_accounts')
    .select('auth_user_id').eq('id', ownerId).maybeSingle();
  if (error) throw new Error(`account owner lookup: ${error.message}`);
  if (account?.auth_user_id) return account.auth_user_id;
  // Some older captures stored the auth user id directly.
  const { data: authAccount, error: authError } = await sb.from('spartan_accounts')
    .select('auth_user_id').eq('auth_user_id', ownerId).maybeSingle();
  if (authError) throw new Error(`auth owner lookup: ${authError.message}`);
  return authAccount?.auth_user_id || null;
}

async function writeProvinceHistory(sb, flow, state, canonical, capture) {
  if (!canonical?.provinceId || !['throne', 'survey', 'science', 'som', 'magic', 'thievery', 'universal'].includes(flow.page_kind)) return null;
  const data = state?.data || {};
  const numeric = (value) => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
  const userId = await resolveAuthUserId(sb, capture, flow);
  const row = compact({
    user_id: userId,
    province_id: canonical.provinceId, kingdom_id: canonical.kingdomId || null,
    observed_at: state.captured_at || state.processed_at || new Date().toISOString(),
    source: flow.source || 'spartan_processor', source_id: flow.source_id || flow.capture_id,
    acres: numeric(data.acres), networth: numeric(data.nw), population: numeric(data.population), peons: numeric(data.peons),
    soldiers: numeric(data.soldiers), off_specs: numeric(data.off_specs), def_specs: numeric(data.def_specs), elites: numeric(data.elites),
    thieves: numeric(data.thieves), wizards: numeric(data.wizards), generals: numeric(data.generals), prisoners: numeric(data.prisoners), war_horses: numeric(data.war_horses),
    offense: numeric(data.off ?? data.offense), defense: numeric(data.def ?? data.defense), defense_home: numeric(data.defense_home ?? data.def_home ?? data.defHome), o_tpa: numeric(data.o_tpa), d_tpa: numeric(data.d_tpa),
    o_wpa: numeric(data.o_wpa), d_wpa: numeric(data.d_wpa), build_efficiency: numeric(data.be), wages: numeric(data.wages),
    raw_state: data, changes: { page_kind: flow.page_kind, capture_id: flow.capture_id }
  });
  const { error } = await sb.from('spartan_province_history').insert(row);
  if (error && !String(error.message).toLowerCase().includes('duplicate')) throw new Error(`province history insert: ${error.message}`);
  return true;
}
function deriveIntelTarget(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const aidTransfer = normalized.match(/:moneybag:\s*(.+?)\s+\[[^\]]+\]\s+sent\s+__(.+?)__\s+to\s+(.+?)\s+\[[^\]]+\]/i);
  if (aidTransfer) return { slot: null, name: aidTransfer[3].trim(), kingdom: null };
  const patterns = [
    /(?:to|at|against|target(?:ed|ing)?(?:\s+province)?|arrive at)\s+(?:\*\*)?#?(\d+)\s+([^(*—:]+?)(?:\s*\*\*)?\s*\((\d+:\d+)\)/i,
    /(?:from|by)\s+(?:an?\s+)?(?:unknown\s+province|province)?\s*(?:from\s+)?([^(*—:]+?)\s*\((\d+:\d+)\)/i,
    /#(\d+)\s+([^—:]+?)\s*\((\d+:\d+)\)/i,
    // Utopia's bot ops feed places the target after a pipe, e.g. "| ggs (5:3)".
    /\|\s*(?:\*\*)?([^|()]+?)\s*\((\d+:\d+)\)/i
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (!m) continue;
    if (m.length === 4) return { slot: m[1] || null, name: m[2]?.trim() || null, kingdom: m[3] || null };
    if (m.length === 3) return { slot: null, name: m[1]?.trim() || null, kingdom: m[2] || null };
  }
  const kingdom = normalized.match(/(?:target kingdom|kingdom(?:\s+mate)?|from).*?\((\d+:\d+)\)/i)?.[1] || null;
  return kingdom ? { slot: null, name: null, kingdom } : null;
}

function deriveIntelIdentity(pageKind, text, flow) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const target = deriveIntelTarget(normalized);
  const operation = normalized.match(/<<__([^_]+?)__>>/i)?.[1]
    ?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || '';
  const aidResources = normalized.match(/sent\s+__(.+?)__\s+to\s+/i)?.[1] || '';
  const actor = normalized.match(/#(\d+)\s+([^—:]+?)(?:\s+—|:)/i);
  const identityType = ['thievery', 'news', 'aid', 'magic', 'attack'].includes(pageKind) && target ? 'target' : 'actor';
  const identity = identityType === 'target'
    ? [target?.kingdom || '', target?.slot || '', target?.name || '', operation || aidResources].join('|').toLowerCase()
    : [flow.kingdom_id || '', actor?.[1] || '', actor?.[2]?.trim() || '', operation || normalized.slice(0, 100)].join('|').toLowerCase();
  return identity.replace(/\s+/g, ' ').trim() || null;
}

async function removePreviousIntelProjection(sb, pageKind, kingdomId, intelKey, currentCaptureId) {
  if (!pageKind || !intelKey) return 0;
  let query = sb.from('spartan_intel_records')
    .delete()
    .eq('page_kind', pageKind)
    .eq('parsed_payload->classification->>intel_key', intelKey)
    .neq('capture_id', currentCaptureId);
  if (kingdomId) query = query.eq('kingdom_id', kingdomId);
  const { data, error } = await query.select('id');
  if (error) throw new Error(`stale Intel cleanup: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

function extractBotOperationMarkers(value) {
  return [...String(value || '').matchAll(/<<__([^_]+?)__(?:\s*\*\*\|\s*[^|]{1,120}\(\d+:\d+\)\*\*)?>>/gi)]
    .map(match => match[1])
    .filter(Boolean);
}

function isStructuredGameIntelMessage(value) {
  const text = String(value || '').replace(/\u00a0/g, ' ').trim();
  if (!text) return false;

  // Require a recognizable game-feed structure, not just a keyword or channel name.
  // This intentionally excludes free-form chat and tick/status announcements.
  const patterns = [
    // Utopia bot's structured attack results with land and unit losses.
    /(?:^|\n)\s*(?::[a-z0-9_]+:\s*)?.{1,100}\[\*\*.+?\*\*\]\s+attacked\s+__.+?__\s+\(\d+:\d+\)\s*\|\s*(?:captured|recaptured):\s*\*\*?[\d,]+/i,
    // Structured Magic/Thievery results: explicit operation marker, target KD, and sent/stat fields.
    /<<__[^_]{2,80}__\s*(?:\*\*)?\|[^|]{1,100}\(\d+:\d+\)(?:\*\*)?>>\s*(?:\*\*[\d,]+\*\*)?\s*\|.{0,180}\b(?:sent|success|fail|failed|resist|immune)\b/i,
    // New Kingdom News feed events.
    /\bNEW KDNEWS:\s*.+\(\d+:\d+\).*\b(?:invaded|captured|ambushed|pillaged|looted|attempted an invasion)\b/i,
    // Explicit Province/Kingdom Reporter attack and loss lines.
    /\bForces from .+?\(\d+:\d+\) came through and ravaged our lands! They captured [\d,]+ acres!/i,
    /\bWe lost .{1,180} in this battle\.?/i,
    /\bYour forces arrive at .+?\(\d+:\d+\).{0,220}\b(?:taken|captured|recaptured|repelled)\b/i,
    // Spell/ritual reports need game-specific wording and a result, not a casual mention.
    /\bYour wizards gather .{0,180}\b(?:the spell succeeds|the spell fails)\b/i,
    /^\s*:(?:star2|comet)::(?:green_heart|broken_heart):.+?<<__[^_]{2,80}__(?:\s*\*\*\|\s*[^|]{1,100}\(\d+:\d+\)\*\*)?>>\s*(?:\*\*[\d,]+\*\*|__FAIL__)/im,
    // Kingdom bot resource-transfer reports use a distinct moneybag format.
    /^\s*:moneybag:\s*.+?\[[^\]]+\]\s+sent\s+__[^\n]{1,140}?__\s+to\s+.+?\[[^\]]+\]/im,
    /(?:—|-)\s*Ritual:\s*.+\bcast\s+\*\*\d+\/\d+\*\*/i,
    // Structured aid transfer messages.
    /^\s*#?\d+\s*-\s*.+?:\s*We have sent\s+[\d,]+\s+.+?\s+to\s+.+?\(\d+:\d+\)\./i,
    // Structured dragon project/donation/attack messages, including damage contributions.
    /^\s*(?::dragon_face:|🐉)\s*__DRAGON__\s+.+\b(?:donated\s+(?:__|\*\*)?[\d,]+\s+gold coins?(?:(?:__|\*\*))?\s+to fund dragon|sent\s+(?:__|\*\*)?[\d,]+\s+troops?(?:__|\*\*)?\s+and weakened dragon by\s+(?:__|\*\*)?[\d,]+(?:__|\*\*)?|completed our dragon|begun development of the)\b/i,
    /\bDragon at us\s*[—-]\s*.+?\d[\d,]*\s+points of strength left\b/i
  ];
  return patterns.some(pattern => pattern.test(text));
}

async function syncBotIntelRecord(sb, flow, capture, state, options = {}) {
  if (flow.source !== 'discord-bot' || flow.page_kind !== 'bot_event') return null;

  const payload = capture?.parsed_payload || {};
  const data = payload?.data || {};
  const discord = data?.discord || {};
  const metadata = data?.metadata || {};
  const channel = String(metadata.channel_name || '').toLowerCase();
  const text = String(capture?.raw_text || data?.content || '').trim();
  if (!text) return null;

  // Utopia's bot is the authoritative Discord game-feed author. Do not trust
  // a channel name for classification: the same ops channel carries Magic,
  // Thievery, and potentially other game operations.
  const authorBot = metadata.author_bot === true || metadata.author_bot === 'true';
  if (!authorBot) return null;
  if (!isStructuredGameIntelMessage(text)) {
    logger.info(`[SPARTAN INTEL FILTER] ignored non-game Discord post capture=${flow.capture_id} channel=${channel || 'unknown'}`);
    return null;
  }

  // The one-time retained-event recovery uses stricter identity checks than the
  // live vault-backed path. Never let a composite upsert bypass capture_id's
  // separate production UNIQUE constraint.
  const sourceId = flow.source_id || discord.message_id || flow.capture_id;
  if (options.recoveryMode) {
    const captureIds = [...new Set([flow.capture_id, String(flow.capture_id || '').replace(/^bot-/, '')])];
    for (const candidate of captureIds) {
      const { data: existing, error: existingError } = await sb.from('spartan_intel_records')
        .select('id,capture_id,source_id')
        .eq('capture_id', candidate)
        .maybeSingle();
      if (existingError) throw new Error(`bot Intel recovery capture_id check: ${existingError.message}`);
      if (existing) return { skippedExisting: true, reason: 'capture_id', pageKind: null };
    }
    if (sourceId) {
      const { data: existing, error: existingError } = await sb.from('spartan_intel_records')
        .select('id,capture_id,source_id')
        .eq('source_id', sourceId)
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(`bot Intel recovery source_id check: ${existingError.message}`);
      if (existing) return { skippedExisting: true, reason: 'source_id', pageKind: null };
    }
  }

  // These vocabularies are derived directly from the Magic/Mystics and
  // Thievery sections of utopia-wiki.html. The message operation name is
  // normalized before matching, so Discord formatting such as
  // <<__spy on defense__>> still resolves to the Wiki operation.
  const WIKI_MAGIC_OPS = [
    'Aggression','Animate Dead','Anonymity','Bloodlust',"Builders' Boon",'Clear Sight',
    'Divine Shield','Fanaticism','Fertile Lands','Fountain of Knowledge','Ghost Workers',
    'Greater Protection','Guile','Illuminate Shadows','Inspire Army','Invisibility',
    "Love & Peace","Mage's Fury",'Magic Shield','Mind Focus',"Miner's Mystique",
    'Minor Protection',"Nature's Blessing",'Paradise','Patriotism','Quick Feet',
    'Reflect Magic','Revelation','Salvation','Shadowlight','Town Watch','Tree of Gold',
    'War Spoils','Wrath','Abolish Ritual','Blizzard','Chastity','Crystal Ball',
    'Crystal Eye','Droughts','Explosions','Expose Thieves','Fireball',"Fool's Gold",
    'Gluttony','Greed','Lightning Strike','Land Lust','Meteor Showers','Mystic Vortex',
    'Nightmares','Pitfalls','Storms','Tornadoes','Vermin','Amnesia',"Hero's Inspiration",
    'Nightfall','Righteous Aggressor','Righteous Defender','Sloth','Soul Blight'
  ];
  const WIKI_THIEVERY_OPS = [
    'Spy on Throne','Spy on Defense','Spy on Exploration','Snatch News','Infiltrate',
    'Survey','Spy on Military','Spy on Sciences','Sabotage Wizards','Destabilize Guilds',
    'Rob the Granaries','Rob the Vaults','Rob the Towers','Kidnapping','Steal Horses',
    'Arson','Greater Arson','Night Strike','Incite Riots','Steal War Horses',
    'Bribe Thieves','Bribe Generals','Free Prisoners','Assassinate Wizards','Propaganda'
  ];

  const normalizeOperation = value => String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/\band\b/g, ' ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|an|a)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const wikiMagic = new Map(WIKI_MAGIC_OPS.map(name => [normalizeOperation(name), name]));
  const wikiThievery = new Map(WIKI_THIEVERY_OPS.map(name => [normalizeOperation(name), name]));

  // Utopia's Discord feed puts the operation in <<__...__>>. Prefer that
  // structured marker; fall back to a compact content signature for feeds
  // that omit the marker.
  const operationMarkers = extractBotOperationMarkers(text)
    .map(normalizeOperation)
    .filter(Boolean);

  const normalizedText = normalizeOperation(text);
  const findWikiOperation = (ops, vocabulary) => {
    for (const op of ops) {
      if (vocabulary.has(op)) return vocabulary.get(op);
    }
    return null;
  };

  const magicOperation = findWikiOperation(operationMarkers, wikiMagic);
  const thieveryOperation = findWikiOperation(operationMarkers, wikiThievery);

  let pageKind = 'bot_event';
  let confidence = 0.55;
  let reason = 'Fallback bot-event classification';

  if (thieveryOperation) {
    pageKind = 'thievery';
    confidence = 0.98;
    reason = `Wiki-defined Thievery operation: ${thieveryOperation}`;
  } else if (magicOperation) {
    pageKind = 'magic';
    confidence = 0.98;
    reason = `Wiki-defined Magic operation: ${magicOperation}`;
  } else if (/\bspy\s+on\s+(?:defense|throne|military|sciences?|exploration)\b/i.test(normalizedText) ||
             /\b(?:thieves?|stealth)\b.*\b(?:sent|success|failed|op)\b/i.test(normalizedText)) {
    pageKind = 'thievery';
    confidence = 0.90;
    reason = 'Thievery content signature matches Utopia ops feed';
  } else if (/\b(?:spell|wizards?|mana|runes?|casting)\b/i.test(normalizedText)) {
    pageKind = 'magic';
    confidence = 0.82;
    reason = 'Magic content signature matches Utopia ops feed';
  } else if (channel.includes('ritual') || /\b(ritual|sacrifice|ceremony|rituals)\b/i.test(normalizedText)) {
    pageKind = 'ritual';
    confidence = 0.80;
    reason = 'Content identifies ritual';
  } else if (channel.includes('attack') || /\b(attacked|attack|invaded|march|plunder|learn|massacre|land grab|conquest|ambush)\b/i.test(normalizedText)) {
    pageKind = 'news';
    confidence = 0.74;
    reason = 'Content identifies attack/news';
  } else if (/^\s*:moneybag:/im.test(text) || channel.includes('aid') || /\b(aid|assistance|sent .* aid|received .* aid)\b/i.test(normalizedText)) {
    pageKind = 'aid';
    confidence = /^\s*:moneybag:/im.test(text) ? 0.95 : 0.74;
    reason = /^\s*:moneybag:/im.test(text) ? 'Structured kingdom resource-transfer message' : 'Content identifies aid';
  } else if (channel.includes('dragon') || /\b(dragon|emerald|ruby|amethyst|topaz|sapphire)\b/i.test(normalizedText)) {
    pageKind = 'dragon';
    confidence = 0.74;
    reason = 'Content identifies dragon';
  }

  const target = deriveIntelTarget(text);
  const sourceKingdom = String(flow.kingdom_id || '').trim() || null;
  const targetKingdom = target?.kingdom || null;
  const visibility = targetKingdom
    ? (sourceKingdom && targetKingdom === sourceKingdom ? 'own' : 'enemy')
    : 'own';
  const intelType = 'province';
  const targetProvinceId = target
    ? [target.slot ? String(target.slot) : '', target.name || ''].filter(Boolean).join(' ').trim() || null
    : null;

  const capturedAt = capture?.captured_at || new Date().toISOString();
  const expiresAt = new Date(new Date(capturedAt).getTime() + 48 * 60 * 60 * 1000).toISOString();
  const intelKey = deriveIntelIdentity(pageKind, text, flow);
  const parsedPayload = {
    ...payload,
    classification: {
      page_kind: pageKind,
      confidence,
      source: 'channel+content',
      reason,
      intel_key: intelKey,
      freshness_policy: 'preserve_each_capture_history'
    }
  };

  if (options.skipIfFreshKeyExists && !options.preserveHistory) {
    let existingKeyQuery = sb.from('spartan_intel_records')
      .select('id,capture_id')
      .eq('page_kind', pageKind)
      .eq('parsed_payload->classification->>intel_key', intelKey)
      .neq('capture_id', flow.capture_id)
      .limit(1);
    if (sourceKingdom) existingKeyQuery = existingKeyQuery.eq('kingdom_id', sourceKingdom);
    const { data: existingKeyRows, error: existingKeyError } = await existingKeyQuery;
    if (existingKeyError) throw new Error(`bot Intel backfill key check: ${existingKeyError.message}`);
    if (existingKeyRows?.length) return { pageKind, confidence, intelKey, skippedExisting: true };
  }

  // Keep each source capture as historical evidence. Do not delete older
  // projections merely because a later operation has the same identity.
  const intelRow = {
    capture_id: flow.capture_id,
    source_vault_id: options.recoveryMode ? null : capture.id,
    user_id: capture.user_id || null,
    province_id: flow.province_id || null,
    kingdom_id: sourceKingdom,
    target_province_id: targetProvinceId,
    target_kingdom_id: targetKingdom,
    captured_at: capturedAt,
    source: 'discord-bot',
    source_id: sourceId,
    url: capture.url || null,
    page_kind: pageKind,
    intel_type: intelType,
    visibility,
    classification_source: 'channel+content',
    classification_confidence: confidence,
    classification_reason: reason,
    age: state?.data?.age || null,
    game_year: state?.data?.game_year || null,
    game_tick: state?.data?.game_tick || null,
    retention_class: 'intel_48h',
    expires_at: expiresAt,
    raw_text: capture.raw_text || text,
    raw_payload: capture.raw_payload || {},
    parsed_payload: parsedPayload,
    content_hash: capture.content_hash || null,
    updated_at: new Date().toISOString()
  };

  let error;
  if (options.recoveryMode) {
    // Plain INSERT is intentional: production has UNIQUE(capture_id) as well
    // as the composite unique index used by the live projection path.
    ({ error } = await sb.from('spartan_intel_records').insert(intelRow));
    if (error?.code === '23505') {
      return { pageKind, confidence, intelKey, kingdomId: sourceKingdom, skippedExisting: true, reason: 'unique_conflict' };
    }
  } else {
    ({ error } = await sb.from('spartan_intel_records').upsert(intelRow, {
      onConflict: 'capture_id,intel_type,province_id,kingdom_id'
    }));
  }

  if (error) throw new Error(`bot intel projection: ${error.message}`);
  return { pageKind, confidence, intelKey, kingdomId: sourceKingdom, skippedExisting: false };
}

async function backfillMissingBotIntel(sb) {
  if (!sb) return { checked: 0, recovered: 0, skipped: 0 };
  const chunk = (list, size) => { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };
  // Phase 1 (cheap): ids only. The bot-message filters run in the database, so this never downloads payloads.
  const { data: heads, error: captureError } = await sb.from('spartan_capture_vault')
    .select('id,capture_id')
    .eq('source', 'discord-bot')
    .or('raw_text.like.%<<__%,raw_text.like.%:moneybag:%')
    .eq('parsed_payload->data->metadata->>author_bot', 'true')
    // Bot intel expires 48h after capture and is purged daily, so only recover captures still inside that window.
    .gte('captured_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order('captured_at', { ascending: false })
    .limit(1000);
  if (captureError) throw new Error(`bot Intel backfill capture scan: ${captureError.message}`);
  const headRows = (heads || []).filter(h => h && h.capture_id);
  if (!headRows.length) return { checked: 0, recovered: 0, skipped: 0 };
  // Phase 2 (cheap): which of those already have an intel record. Small chunks keep request URLs short.
  const existingCaptures = new Set();
  for (const part of chunk(headRows, 100)) {
    const { data: byCapture, error: e1 } = await sb.from('spartan_intel_records')
      .select('capture_id,source_vault_id').eq('source', 'discord-bot').in('capture_id', part.map(h => h.capture_id));
    if (e1) throw new Error(`bot Intel backfill existing-record scan: ${e1.message}`);
    const { data: byVault, error: e2 } = await sb.from('spartan_intel_records')
      .select('capture_id,source_vault_id').eq('source', 'discord-bot').in('source_vault_id', part.map(h => h.id));
    if (e2) throw new Error(`bot Intel backfill existing-record scan: ${e2.message}`);
    for (const row of [...(byCapture || []), ...(byVault || [])]) {
      if (row.capture_id) existingCaptures.add(String(row.capture_id));
      if (row.source_vault_id != null) existingCaptures.add(`vault:${row.source_vault_id}`);
    }
  }
  const missing = headRows.filter(h => !existingCaptures.has(String(h.capture_id)) && !existingCaptures.has(`vault:${h.id}`));
  if (!missing.length) return { checked: headRows.length, recovered: 0, skipped: headRows.length };
  // Phase 3: download full rows and flows only for the captures that are actually missing.
  const candidates = [];
  for (const part of chunk(missing, 50)) {
    const { data: full, error: fullError } = await sb.from('spartan_capture_vault')
      .select('id,capture_id,source,province_id,kingdom_id,page_kind,url,raw_text,raw_payload,parsed_payload,content_hash,captured_at,user_id')
      .in('id', part.map(h => h.id));
    if (fullError) throw new Error(`bot Intel backfill capture scan: ${fullError.message}`);
    candidates.push(...(full || []));
  }
  candidates.sort((a, b) => String(b.captured_at || '').localeCompare(String(a.captured_at || '')));
  // Look flows up in small chunks. One .in() with ~1000 ids makes a ~40 KB URL, which the
  // gateway rejects, so every run died with "TypeError: fetch failed".
  const flows = [];
  for (const part of chunk(candidates.map(c => c.capture_id).filter(Boolean), 100)) {
    const { data: flowPart, error: flowError } = await sb.from('spartan_data_flow')
      .select('*').eq('source', 'discord-bot').eq('page_kind', 'bot_event').in('capture_id', part);
    if (flowError) throw new Error(`bot Intel backfill flow scan: ${flowError.message}`);
    flows.push(...(flowPart || []));
  }
  const flowByCapture = new Map(flows.map(flow => [flow.capture_id, flow]));
  let recovered = 0;
  let skipped = 0;
  // Newest-first plus key checks preserves the latest record for each operation identity.
  for (const capture of candidates) {
    if (!capture.capture_id || existingCaptures.has(String(capture.capture_id)) || existingCaptures.has(`vault:${capture.id}`)) {
      skipped++;
      continue;
    }
    const flow = flowByCapture.get(capture.capture_id);
    if (!flow) { skipped++; continue; }
    const state = extractState(flow, capture);
    const result = await syncBotIntelRecord(sb, flow, capture, state, { preserveHistory: true });
    if (result?.skippedExisting) skipped++;
    else if (result) {
      recovered++;
      existingCaptures.add(String(capture.capture_id));
      existingCaptures.add(`vault:${capture.id}`);
    } else skipped++;
  }
  logger.info(`[SPARTAN INTEL BACKFILL] checked=${candidates.length} recovered=${recovered} skipped=${skipped}`);
  return { checked: candidates.length, recovered, skipped };
}

async function resolveAccountContext(sb, capture, flow) {
  const ownerId = capture?.user_id || flow?.user_id || null;
  if (!ownerId) return null;
  const byId = await sb.from('spartan_accounts')
    .select('auth_user_id,province_name,province_location').eq('id', ownerId).maybeSingle();
  if (byId.error) throw new Error(`account context lookup: ${byId.error.message}`);
  if (byId.data) return byId.data;
  const byAuthId = await sb.from('spartan_accounts')
    .select('auth_user_id,province_name,province_location').eq('auth_user_id', ownerId).maybeSingle();
  if (byAuthId.error) throw new Error(`auth context lookup: ${byAuthId.error.message}`);
  return byAuthId.data || null;
}

async function syncNewsEvents(sb, flow, state, capture, classifiedKind = null) {
  const isNews = flow.page_kind === 'news' || ['news', 'attack'].includes(String(classifiedKind || ''));
  if (!isNews) return null;
  const account = await resolveAccountContext(sb, capture, flow);
  const userId = account?.auth_user_id || await resolveAuthUserId(sb, capture, flow);
  if (!userId) {
    logger.warn(`[SPARTAN PROCESSOR] skipping news event without a mapped account owner capture=${flow.capture_id || 'unknown'}`);
    return 0;
  }
  let province = await findProvince(sb, flow, state);
  if (!province && account?.province_name && account?.province_location && userId) {
    const { data: registered, error: registryError } = await sb.from('spartan_province_registry')
      .select('province_id,province_name,kingdom_code')
      .eq('user_id', userId).eq('province_name', account.province_name).eq('kingdom_code', account.province_location).maybeSingle();
    if (registryError) throw new Error(`event province registry lookup: ${registryError.message}`);
    if (registered) province = { id: registered.province_id, province_id: registered.province_id, name: registered.province_name, kingdom_id: registered.kingdom_code };
  }
  const capturedAt = capture?.captured_at || state?.captured_at || state?.processed_at || new Date().toISOString();
  const existing = Array.isArray(state?.data?.events) ? state.data.events : [];
  const normalized = existing.length ? [] : parseStructuredNewsEvents(capture?.raw_text || state?.raw_text || '', {
    captureId: flow.capture_id, capturedAt, ownProvince: state?.data?.name || account?.province_name || null, ownKingdom: flow.kingdom_id || account?.province_location || null,
  });
  const rows = [
    ...existing.map((event, index) => ({
      user_id: userId, province_id: province?.id || null,
      kingdom_id: province?.kingdom_id || flow.kingdom_id || null,
      occurred_at: event.created_at || capturedAt, age: Number(state?.data?.age) || null,
      game_year: Number(state?.data?.game_year) || null, game_tick: state?.data?.game_tick || null,
      event_type: event.event_type || 'news',
      source: flow.source === 'discord-bot' ? 'spartan-event-normalizer' : (flow.source || 'spartan_processor'),
      source_id: `${flow.capture_id}:parsed:${index}:${event.created_at || event.raw || ''}`,
      attacker: event.attacker || null, defender: event.defender || null,
      target_kingdom: event.target_kingdom || event.defender_kingdom || null,
      acres_change: Number.isFinite(Number(event.acres ?? event.acres_change)) ? Number(event.acres ?? event.acres_change) : null,
      troops_lost: Number.isFinite(Number(event.troops_lost)) ? Number(event.troops_lost) : null,
      thieves_lost: Number.isFinite(Number(event.thieves_lost)) ? Number(event.thieves_lost) : null,
      wizards_lost: Number.isFinite(Number(event.wizards_lost)) ? Number(event.wizards_lost) : null,
      payload: { ...event, normalizer: 'spartan-event-normalizer', original_source: flow.source || null },
      raw_text: event.raw || event.raw_text || null, created_at: new Date().toISOString(),
    })),
    ...normalized.map(event => ({
      user_id: userId, province_id: province?.id || null,
      kingdom_id: province?.kingdom_id || flow.kingdom_id || null, occurred_at: event.occurred_at,
      age: Number(state?.data?.age) || null, game_year: Number(state?.data?.game_year) || null,
      game_tick: state?.data?.game_tick || null, event_type: event.event_type,
      source: 'spartan-event-normalizer', source_id: event.source_id,
      attacker: event.attacker || null, defender: event.defender || null,
      target_kingdom: event.target_kingdom || null, acres_change: event.acres_change,
      troops_lost: event.troops_lost, thieves_lost: event.thieves_lost, wizards_lost: event.wizards_lost,
      payload: { ...event.payload, original_source: flow.source || null },
      raw_text: event.raw_text, created_at: new Date().toISOString(),
    })),
  ];
  if (!rows.length) return 0;
  const { error } = await sb.from('spartan_event_history').upsert(rows, { onConflict: 'source_id' });
  if (error) throw new Error(`news event sync: ${error.message}`);
  return rows.length;
}
async function addEdge(sb, flowId, fromSystem, toSystem, eventType, payload = {}) {
  const { error } = await sb.from('spartan_data_edges').insert({ flow_id: flowId, from_system: fromSystem, to_system: toSystem, event_type: eventType, payload });
  if (error) throw new Error(`spartan_data_edges: ${error.message}`);
}
async function quarantine(sb, flow, job, stewardResult) {
  const capture = await loadCapture(sb, flow);
  await sb.from('spartan_data_quarantine').insert({ capture_id: flow.capture_id, source: flow.source, source_id: flow.source_id, page_kind: flow.page_kind, url: capture?.url || null, province_id: flow.province_id, kingdom_id: flow.kingdom_id, steward: 'spartan-stewards', severity: stewardResult.decision === 'fail' ? 'critical' : 'high', reason: stewardResult.results.map(item => `${item.steward}: ${item.reason}`).join('; '), observed_value: stewardResult.results, raw_payload: capture?.raw_payload || {}, parsed_payload: capture?.parsed_payload || {}, validation_details: { confidence: stewardResult.confidence, results: stewardResult.results }, fingerprint: crypto.createHash('sha256').update(`${flow.flow_id}:${flow.capture_id}`).digest('hex'), status: 'quarantined' });
  await sb.from('spartan_processing_queue').update({ status: 'failed', locked_at: null, error: { steward: stewardResult.results, reason: 'quarantined by fresh Spartan Stewards' } }).eq('id', job.id);
  await sb.from('spartan_data_flow').update({ status: 'failed', stage: 'steward', current_stage: 'steward', error: { reason: 'quarantined by fresh Spartan Stewards', steward_results: stewardResult.results } }).eq('flow_id', flow.flow_id);
}
function mergeProjectionState(existingState, incomingState, previousFlow) {
  const previousData = previousFlow?.source === 'discord-bot' && previousFlow?.page_kind === 'bot_event'
    ? {}
    : (existingState?.data || {});
  const pageKind = String(incomingState?.page_kind || 'unknown');
  const incomingTime = Date.parse(incomingState?.captured_at || '');
  const timestamps = { ...(existingState?.page_capture_timestamps || {}) };
  // Without a per-page timestamp, only compare against the top-level
  // timestamp when the previous projection itself came from this same page.
  const previousPageTime = Date.parse(
    timestamps[pageKind] ||
    (existingState?.page_kind === pageKind ? existingState?.captured_at : '')
  );
  const staleForPage = Number.isFinite(incomingTime) && Number.isFinite(previousPageTime) && incomingTime < previousPageTime;
  if (!staleForPage && Number.isFinite(incomingTime)) timestamps[pageKind] = new Date(incomingTime).toISOString();

  return {
    ...incomingState,
    ...(staleForPage ? {
      capture_id: existingState?.capture_id || incomingState.capture_id,
      page_kind: existingState?.page_kind || incomingState.page_kind,
      source: existingState?.source || incomingState.source,
      captured_at: existingState?.captured_at || incomingState.captured_at,
    } : {}),
    page_capture_timestamps: timestamps,
    stale_page_capture: staleForPage,
    data: staleForPage ? previousData : { ...previousData, ...(incomingState?.data || {}) },
  };
}

async function processOne(sb, job) {
  const { data: flow, error: flowError } = await sb.from('spartan_data_flow').select('*').eq('flow_id', job.flow_id).maybeSingle();
  if (flowError) throw new Error(`flow lookup: ${flowError.message}`);
  if (!flow) throw new Error(`flow ${job.flow_id} not found`);

  const capture = await loadCapture(sb, flow);
  if (!capture) throw new Error(`capture ${flow.capture_id || ''} not found in Spartan vault`);

  const stewardResult = await stewardSystem.run(flow, capture, job.id, flow.province_id || flow.flow_id);
  if (stewardResult.decision === 'quarantine' || stewardResult.decision === 'fail') {
    await quarantine(sb, flow, job, stewardResult);
    return { flowId: flow.flow_id, queueId: job.id, quarantined: true, pageKind: flow.page_kind };
  }

  let state = extractState(flow, capture);
  const isBotEvent = flow.source === 'discord-bot' && flow.page_kind === 'bot_event';

  // Discord bot events are evidence for the Intel pipeline, not province-state
  // snapshots. Never merge their Discord payload into spartan_state_projection.
  if (isBotEvent) {
    const intelResult = await syncBotIntelRecord(sb, flow, capture, state);
    await syncNewsEvents(sb, flow, state, capture, intelResult?.pageKind);
    await addEdge(
      sb,
      flow.flow_id,
      'spartan_processing_queue',
      'spartan_intel_records',
      'bot_intel',
      {
        queue_id: job.id,
        capture_id: flow.capture_id,
        outcome: intelResult ? (intelResult.skippedExisting ? 'already_present' : 'projected') : 'ignored_non_game',
        page_kind: intelResult?.pageKind || 'bot_event',
      },
    );

    const integrity = await stewardSystem.run(
      flow,
      capture,
      job.id,
      flow.province_id || flow.flow_id,
      { afterProjection: true, skipProjection: true },
    );
    if (integrity.results.some(item => item.steward === 'integrity' && (item.decision === 'fail' || item.decision === 'quarantine'))) {
      throw new Error(`Integrity Steward failed: ${integrity.results.find(item => item.steward === 'integrity')?.reason || 'unknown'}`);
    }

    const { error: flowUpdateError } = await sb.from('spartan_data_flow')
      .update({ status: 'processed', stage: 'bot_intel', current_stage: 'bot_intel', processed_at: new Date().toISOString(), error: null })
      .eq('flow_id', flow.flow_id);
    if (flowUpdateError) throw new Error(`flow update: ${flowUpdateError.message}`);

    const { error: queueError } = await sb.from('spartan_processing_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString(), locked_at: null, error: null })
      .eq('id', job.id);
    if (queueError) throw new Error(`queue complete: ${queueError.message}`);

    return { flowId: flow.flow_id, queueId: job.id, version: null, pageKind: flow.page_kind, botIntel: true };
  }

  const projectionKey = flow.province_id || flow.flow_id;
  const { data: existing, error: existingError } = await sb.from('spartan_state_projection')
    .select('version,state,source_flow_id').eq('province_id', projectionKey).maybeSingle();
  if (existingError) throw new Error(`projection lookup: ${existingError.message}`);
  const version = Number(existing?.version || 0) + 1;

  let previousFlow = null;
  if (existing?.source_flow_id) {
    const { data, error } = await sb.from('spartan_data_flow')
      .select('source,page_kind').eq('flow_id', existing.source_flow_id).maybeSingle();
    if (error) throw new Error(`previous projection source lookup: ${error.message}`);
    previousFlow = data;
  }

  // Preserve partial-page data, but never carry Discord event wrapper fields
  // forward from a legacy projection that was incorrectly sourced from bot_event.
  state = mergeProjectionState(existing?.state, state, previousFlow);
  const { error: projectionError } = await sb.from('spartan_state_projection').upsert({
    province_id: projectionKey,
    kingdom_id: flow.kingdom_id || null,
    state,
    version,
    source_flow_id: flow.flow_id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'province_id' });
  if (projectionError) throw new Error(`spartan_state_projection: ${projectionError.message}`);

  await addEdge(sb, flow.flow_id, 'spartan_processing_queue', 'spartan_state_projection', 'projection', {
    queue_id: job.id, processor: WORKER_ID, version, capture_id: flow.capture_id,
  });
  // Stale captures remain in the vault and event history, but must not
  // overwrite current province metadata or create misleading current snapshots.
  const canonical = state.stale_page_capture ? null : await syncCanonicalProvince(sb, flow, state);
  const specialized = state.stale_page_capture ? null : await syncSpecializedProvinceData(sb, flow, state);
  if (!state.stale_page_capture) {
    await writeProvinceHistory(sb, flow, state, canonical || specialized, capture);
  }
  await syncNewsEvents(sb, flow, state, capture);
  await syncBotIntelRecord(sb, flow, capture, state);

  const integrity = await stewardSystem.run(flow, capture, job.id, projectionKey, { afterProjection: true });
  if (integrity.results.some(item => item.steward === 'integrity' && (item.decision === 'fail' || item.decision === 'quarantine'))) {
    throw new Error(`Integrity Steward failed: ${integrity.results.find(item => item.steward === 'integrity')?.reason || 'unknown'}`);
  }

  const { error: flowUpdateError } = await sb.from('spartan_data_flow')
    .update({ status: 'processed', stage: 'projection', current_stage: 'projection', processed_at: new Date().toISOString(), error: null })
    .eq('flow_id', flow.flow_id);
  if (flowUpdateError) throw new Error(`flow update: ${flowUpdateError.message}`);

  const { error: queueError } = await sb.from('spartan_processing_queue')
    .update({ status: 'completed', completed_at: new Date().toISOString(), locked_at: null, error: null })
    .eq('id', job.id);
  if (queueError) throw new Error(`queue complete: ${queueError.message}`);

  return { flowId: flow.flow_id, queueId: job.id, version, pageKind: flow.page_kind };
}
async function failOne(sb, job, error) {
  const attempts = Number(job.attempts || 1); const terminal = attempts >= 5; const delaySeconds = Math.min(300, Math.pow(2, Math.max(0, attempts - 1)) * 5);
  await sb.from('spartan_processing_queue').update({ status: terminal ? 'failed' : 'retry', available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(), locked_at: null, error: { message: error.message, worker: WORKER_ID, attempts } }).eq('id', job.id);
  await sb.from('spartan_data_flow').update({ status: terminal ? 'failed' : 'retry', stage: 'processor', current_stage: 'processor', error: { message: error.message, worker: WORKER_ID, attempts } }).eq('flow_id', job.flow_id);
}
async function processBatch() {
  if (running || startupBackfillRunning) return; const sb = supabaseService.getClient(); if (!sb) return; running = true;
  try {
    const { data: jobs, error } = await sb.rpc('claim_spartan_queue', { p_worker: WORKER_ID, p_limit: BATCH_SIZE });
    if (error) throw new Error(`claim_spartan_queue: ${error.message}`); if (!jobs?.length) return;
    for (const job of jobs) { try { const result = await processOne(sb, job); if (!result.quarantined) logger.info(`[SPARTAN PROCESSOR] completed queue=${result.queueId} flow=${result.flowId} page=${result.pageKind || ''} version=${result.version}`); } catch (error) { logger.error(`[SPARTAN PROCESSOR] queue=${job.id} flow=${job.flow_id} failed: ${error.stack || error.message}`); try { await failOne(sb, job, error); } catch (failError) { logger.error(`[SPARTAN PROCESSOR] failure bookkeeping failed: ${failError.message}`); } } }
  } catch (error) { logger.error(`[SPARTAN PROCESSOR LOOP] ${error.stack || error.message}`); } finally { running = false; }
}
async function runBacklogSteward() {
  if (running || startupBackfillRunning) return;
  const sb = supabaseService.getClient();
  if (!sb) return;
  startupBackfillRunning = true;
  try {
    const result = await backfillMissingBotIntel(sb);
    logger.info(`[SPARTAN BACKLOG STEWARD] checked=${result.checked} recovered=${result.recovered} skipped=${result.skipped}`);
  } catch (error) {
    logger.error(`[SPARTAN BACKLOG STEWARD] failed: ${error.stack || error.message}`);
  } finally {
    startupBackfillRunning = false;
    processBatch();
  }
}
function start() { if (timer || startupBackfillRunning) return; if (process.env.SPARTAN_PROCESSOR_ENABLED === 'false') { logger.info('[SPARTAN PROCESSOR] disabled by SPARTAN_PROCESSOR_ENABLED=false'); return; } stewardSystem.start(); logger.info(`[SPARTAN PROCESSOR] starting worker=${WORKER_ID} interval=${INTERVAL_MS}ms batch=${BATCH_SIZE}`); const sb = supabaseService.getClient(); startupBackfillRunning = true; backfillMissingBotIntel(sb).catch(error => logger.error(`[SPARTAN INTEL BACKFILL] failed: ${error.stack || error.message}`)).finally(() => { startupBackfillRunning = false; processBatch(); timer = setInterval(processBatch, INTERVAL_MS); backlogStewardTimer = setInterval(runBacklogSteward, BACKLOG_STEWARD_INTERVAL_MS); logger.info(`[SPARTAN BACKLOG STEWARD] scheduled interval=${BACKLOG_STEWARD_INTERVAL_MS}ms`); }); }
function stop() { if (timer) clearInterval(timer); if (backlogStewardTimer) clearInterval(backlogStewardTimer); timer = null; backlogStewardTimer = null; }
module.exports = { start, stop, processBatch, processOne, runBacklogSteward, isStructuredGameIntelMessage, extractBotOperationMarkers, mergeProjectionState, syncBotIntelRecord };
