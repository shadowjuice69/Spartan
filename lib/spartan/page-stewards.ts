export type PageStewardResult = { pageKind: string; handled: boolean; fields: string[]; payload: Record<string, unknown> }

type AnyRecord = Record<string, unknown>
function obj(value: unknown): AnyRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {} }
function unwrap(payload: unknown): AnyRecord { let current = obj(payload); for (let i = 0; i < 6; i += 1) { const next = obj(current.data ?? current.payload ?? current.parsed ?? current.page ?? current.state); if (!Object.keys(next).length) break; current = next } return current }
function pick(source: AnyRecord, keys: string[]) { const out: AnyRecord = {}; for (const key of keys) if (source[key] !== undefined && source[key] !== null) out[key] = source[key]; return out }
export function runPageSteward(pageKind: string | null | undefined, parsedPayload: unknown, rawPayload: unknown): PageStewardResult {
  const kind = String(pageKind ?? '').toLowerCase(); const parsed = unwrap(parsedPayload); const raw = unwrap(rawPayload); const source = { ...raw, ...parsed }
  const page = (keys: string[]) => { const payload = pick(source, keys); return { pageKind: kind, handled: Object.keys(payload).length > 0, fields: Object.keys(payload), payload } }
  if (kind === 'military') return page(['soldiers','offSpecs','off_specs','defSpecs','def_specs','elites','generals','prisoners','warHorses','war_horses','offense','offence','defense','defence','defenseHome','defense_home','wages','military','army','troops','training','trainingQueue','training_queue','draft','draftRate','draft_rate','militaryScience','military_science'])
  if (kind === 'buildings') return page(['buildings','building','buildingPercent','building_percent','construction','constructionQueue','construction_queue','land','acres','freeLand','free_land'])
  if (kind === 'science') return page(['science','scienceLevels','science_levels','sciencePoints','science_points','research','researchPoints','research_points'])
  if (kind === 'magic' || kind === 'council_spells') return page(['magic','spells','spellBook','spell_book','runes','mana','spellEffects','spell_effects'])
  if (kind === 'thievery') return page(['thievery','thieves','thiefScience','thief_science','stealth','operations','ops','thieveryOperations','thievery_operations'])
  if (kind === 'exploration') return page(['exploration','explore','explorationCosts','exploration_costs','land','acres','freeLand','free_land','explorationQueue','exploration_queue'])
  if (kind === 'kingdom') return page(['kingdom','provinces','provinceList','province_list','kingdomStats','kingdom_stats','relations','relation','monarch','king','hostile','war'])
  if (kind === 'intel' || kind === 'news' || kind === 'war') return page(['intel','news','events','attacks','ops','relations','war','hostile','history'])
  return { pageKind: kind || 'unknown', handled: false, fields: [], payload: {} }
}
