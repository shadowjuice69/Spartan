const KNOWLEDGE_SOURCE_KEY = 'utopia_wiki_age_116'
const KNOWLEDGE_SOURCE_PATH = 'lib/spartan/knowledge/utopia-reference.html'
const KNOWLEDGE_SOURCE_URL = '/knowledge/utopia-reference.html'
const KNOWLEDGE_AGE = 116

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

export async function resolveWikiKnowledge(
  _supabase: DbClient,
  _input: { provinceId?: string | null; snapshot?: Record<string, unknown> | null } = {},
): Promise<WikiKnowledgeContext> {
  return {
    sourceKey: KNOWLEDGE_SOURCE_KEY,
    sourceUrl: KNOWLEDGE_SOURCE_URL,
    age: KNOWLEDGE_AGE,
    authoritative: true,
    knowledgePath: KNOWLEDGE_SOURCE_PATH,
    knowledgeAvailable: true,
    province: null,
    ruleCounts: {},
    wikiEntryCount: 0,
    relevantWikiEntries: [],
    refs: [
      `wiki:${KNOWLEDGE_SOURCE_KEY}`,
      `age:${KNOWLEDGE_AGE}`,
      `knowledge:${KNOWLEDGE_SOURCE_PATH}`,
    ],
  }
}
