type DbClient = { from: (table: string) => any }

type WikiProvinceContext = {
  id: string
  name?: string | null
  race?: string | null
  personality?: string | null
  playRole?: string | null
} | null

export type WikiKnowledgeContext = {
  sourceKey: string
  sourceUrl: string
  age: number
  authoritative: boolean
  knowledgePath: string
  knowledgeAvailable: boolean
  province?: WikiProvinceContext
  ruleCounts: Record<string, number>
  wikiEntryCount: number
  relevantWikiEntries: Array<{ id: number; title: string; category: string; source: string | null }>
  refs: string[]
}

const RULE_TABLES = ['spartan_race_rules', 'spartan_personality_rules', 'spartan_game_rules'] as const

async function countForAge(db: DbClient, table: string, age: number): Promise<number | null> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('age_number', age)
  if (error) return null
  return Number(count ?? 0)
}

/** Resolve knowledge from the active registry and populated rule tables.
 * The current age is discovered from the database; it is never hard-coded.
 */
export async function resolveWikiKnowledge(
  supabase: DbClient,
  _input: { provinceId?: string | null; snapshot?: Record<string, unknown> | null } = {},
): Promise<WikiKnowledgeContext | null> {
  const { data: source, error: sourceError } = await supabase
    .from('spartan_wiki_knowledge_registry')
    .select('source_key,source_name,source_url,age_number,authoritative,active,metadata,updated_at')
    .eq('active', true)
    .eq('authoritative', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sourceError || !source) return null

  const { data: ageRows, error: ageError } = await supabase
    .from('spartan_game_rules')
    .select('age_number')
    .order('age_number', { ascending: false })
    .limit(20)

  const candidateAges = !ageError
    ? [...new Set((ageRows ?? []).map((row: { age_number?: number | string }) => Number(row.age_number)).filter((age: number) => Number.isInteger(age) && age > 0))].sort((a, b) => b - a)
    : [Number(source.age_number)]

  let activeAge = 0
  let ruleCounts: Record<string, number> = {}
  for (const age of candidateAges) {
    const counts = await Promise.all(RULE_TABLES.map((table) => countForAge(supabase, table, age)))
    if (counts.every((count) => count !== null) && counts.every((count) => Number(count) > 0)) {
      activeAge = age
      ruleCounts = Object.fromEntries(RULE_TABLES.map((table, index) => [table, Number(counts[index])]))
      break
    }
  }

  if (!activeAge) return null

  const sourceKey = `utopia_wiki_age_${activeAge}`
  const knowledgePath = String(source.metadata?.path ?? source.source_url ?? '')
  return {
    sourceKey,
    sourceUrl: String(source.source_url),
    age: activeAge,
    authoritative: Boolean(source.authoritative),
    knowledgePath,
    knowledgeAvailable: Object.values(ruleCounts).every((count) => count > 0),
    province: null,
    ruleCounts,
    wikiEntryCount: 0,
    relevantWikiEntries: [],
    refs: [`wiki:${sourceKey}`, `age:${activeAge}`, `knowledge:${knowledgePath}`],
  }
}
