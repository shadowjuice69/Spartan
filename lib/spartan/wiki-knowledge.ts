const WIKI_SOURCE_KEY = 'utopia_wiki_age_116'
const WIKI_SOURCE_URL = 'https://raw.githubusercontent.com/shadowjuice69/utopia-nexus/main/utopia-wiki.html'
const WIKI_AGE = 116

type DbClient = {
  from: (table: string) => any
}

export type WikiKnowledgeContext = {
  sourceKey: string
  sourceUrl: string
  age: number
  authoritative: boolean
  province?: {
    id: string
    name?: string | null
    race?: string | null
    personality?: string | null
    playRole?: string | null
  } | null
  ruleCounts: Record<string, number>
  wikiEntryCount: number
  relevantWikiEntries: Array<{ id: number; title: string; category: string; source: string | null }>
  refs: string[]
}

export async function resolveWikiKnowledge(
  supabase: DbClient,
  input: { provinceId?: string | null; snapshot?: Record<string, unknown> | null } = {},
): Promise<WikiKnowledgeContext> {
  const provinceId = input.provinceId ?? null
  let province: WikiKnowledgeContext['province'] = null

  if (provinceId) {
    const { data } = await supabase
      .from('provinces')
      .select('id,name,race,personality,play_role')
      .eq('id', provinceId)
      .maybeSingle()

    if (data) {
      province = {
        id: String(data.id),
        name: data.name,
        race: data.race,
        personality: data.personality,
        playRole: data.play_role,
      }
    }
  }

  const ruleTables = ['game_rules', 'race_rules', 'personality_rules', 'building_rules', 'science_rules', 'spell_rules', 'relation_rules']
  const ruleCounts: Record<string, number> = {}

  await Promise.all(ruleTables.map(async (table) => {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('active', true)
      .eq('age_number', WIKI_AGE)
    ruleCounts[table] = count ?? 0
  }))

  const { count: wikiEntryCount } = await supabase
    .from('wiki_entries')
    .select('*', { count: 'exact', head: true })

  const terms = [province?.race, province?.personality]
    .filter((value): value is string => Boolean(value && value.trim()))

  let relevantWikiEntries: WikiKnowledgeContext['relevantWikiEntries'] = []
  if (terms.length) {
    const orFilter = terms
      .map((term) => `title.ilike.%${term.replace(/[%_]/g, '')}%,content.ilike.%${term.replace(/[%_]/g, '')}%`)
      .join(',')
    const { data } = await supabase
      .from('wiki_entries')
      .select('id,title,category,source')
      .or(orFilter)
      .limit(20)
    relevantWikiEntries = (data ?? []).map((entry: any) => ({
      id: Number(entry.id),
      title: String(entry.title),
      category: String(entry.category),
      source: entry.source ?? null,
    }))
  }

  const refs = [
    `wiki:${WIKI_SOURCE_KEY}`,
    `age:${WIKI_AGE}`,
    ...Object.entries(ruleCounts).map(([table, count]) => `rules:${table}:${count}`),
    ...relevantWikiEntries.map((entry) => `wiki_entry:${entry.id}`),
  ]

  return {
    sourceKey: WIKI_SOURCE_KEY,
    sourceUrl: WIKI_SOURCE_URL,
    age: WIKI_AGE,
    authoritative: true,
    province,
    ruleCounts,
    wikiEntryCount: wikiEntryCount ?? 0,
    relevantWikiEntries,
    refs,
  }
}
