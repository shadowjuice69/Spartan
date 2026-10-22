export type PageStewardResult = { pageKind: string; handled: boolean; fields: string[]; payload: Record<string, unknown> }

type AnyRecord = Record<string, unknown>
function obj(value: unknown): AnyRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {} }

function parseRecord(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || !(trimmed.startsWith('{') || trimmed.startsWith('['))) return value
  try { return JSON.parse(trimmed) } catch { return value }
}

/** Flatten common capture envelopes without discarding their original keys.
 * UtopiaIntel puts page-specific values under data_simple; game captures often
 * put them under fields or a page-specific details object.
 */
function unwrap(payload: unknown): AnyRecord {
  const root = obj(parseRecord(payload))
  const merged: AnyRecord = { ...root }
  const nestedKeys = ['data', 'payload', 'parsed', 'page', 'state', 'data_simple', 'fields', 'extracted', 'snapshot']
  for (const key of nestedKeys) {
    const parsedNested = parseRecord(root[key])
    const nested = obj(parsedNested)
    if (Object.keys(nested).length) {
      merged[key] = nested
      Object.assign(merged, unwrap(nested))
    }
  }
  return merged
}

function pick(source: AnyRecord, keys: string[]) {
  const out: AnyRecord = {}
  for (const key of keys) {
    const value = source[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && !value.trim()) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as AnyRecord).length === 0) continue
    out[key] = value
  }
  return out
}

export function runPageSteward(pageKind: string | null | undefined, parsedPayload: unknown, rawPayload: unknown): PageStewardResult {
  const kind = String(pageKind ?? '').toLowerCase()
  const parsed = unwrap(parsedPayload)
  const raw = unwrap(rawPayload)
  const source = { ...raw, ...parsed }
  const page = (keys: string[]): PageStewardResult => {
    const payload = pick(source, keys)
    // Keep a non-empty, source-provided structured payload even when the
    // extension's field names are newer than this version's explicit map.
    if (!Object.keys(payload).length) {
      const simple = obj(parseRecord(source.data_simple))
      if (Object.keys(simple).length) payload.data_simple = simple
      else {
        const details = obj(source.fields)
        if (Object.keys(details).length) payload.fields = details
      }
    }
    return { pageKind: kind, handled: Object.keys(payload).length > 0, fields: Object.keys(payload), payload }
  }

  if (kind === 'military' || kind === 'throne') return page(['soldiers','offSpecs','off_specs','defSpecs','def_specs','elites','generals','prisoners','warHorses','war_horses','offense','offence','defense','defence','defenseHome','defense_home','wages','wage','military','army','troops','training','trainingQueue','training_queue','draft','draftRate','draft_rate','draft_target','militaryScience','military_science','data_simple'])
  if (kind === 'buildings') return page(['buildings','building','buildingPercent','building_percent','construction','constructionQueue','construction_queue','construction_cost','total_cost','raze_cost','land','acres','freeLand','free_land','data_simple'])
  if (kind === 'science') return page(['science','scienceLevels','science_levels','sciencePoints','science_points','research','researchPoints','research_points','category_for_next_scientist','data_simple'])
  if (kind === 'magic' || kind === 'council_spells') return page(['magic','spells','spellBook','spell_book','runes','mana','wizards','spellEffects','spell_effects','select_a_spell','data_simple'])
  if (kind === 'thievery') return page(['thievery','thieves','thiefScience','thief_science','stealth','operations','ops','thieveryOperations','thievery_operations','number_of_thieves_to_send','data_simple'])
  if (kind === 'exploration') return page(['exploration','explore','explorationCosts','exploration_costs','land','acres','freeLand','free_land','explorationQueue','exploration_queue','data_simple'])
  if (kind === 'kingdom') return page(['kingdom','kingdom_details','kingdom_code','kingdomCode','provinces','provinceList','province_list','kingdomStats','kingdom_stats','relations','relation','monarch','king','hostile','war','data_simple'])
  if (kind === 'intel' || kind === 'news' || kind === 'war' || kind === 'attack' || kind === 'ritual' || kind === 'aid' || kind === 'dragon' || kind === 'council_history' || kind === 'province_logs') return page(['intel','news','events','attacks','attack','ops','relations','war','hostile','history','army','offense','off','defense','def','name','race','personality','land','acres','mana','stealth','thieves','wizards','data_simple'])
  if (kind === 'utopiaintel' || kind === 'generic') return page(['data_simple','fields','data','prov','url','kind','type','classification','acres','food','gold','networth','peons','runes','population','soldiers','thieves','wizards','mana','stealth','offense','defense','data_html'])
  return { pageKind: kind || 'unknown', handled: false, fields: [], payload: {} }
}
