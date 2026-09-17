const KNOWLEDGE_SOURCE_KEY = 'utopia_wiki_age_116'
const KNOWLEDGE_SOURCE_PATH = 'lib/spartan/knowledge/utopia-reference.html'
const KNOWLEDGE_SOURCE_URL = '/knowledge/utopia-reference.html'
const KNOWLEDGE_AGE = 116

export type WikiKnowledgeContext = {
  sourceKey: string
  sourceUrl: string
  age: number
  authoritative: boolean
  knowledgePath: string
  knowledgeAvailable: boolean
  ruleCounts: Record<string, number>
  wikiEntryCount: number
  relevantWikiEntries: Array<{ id: number; title: string; category: string; source: string | null }>
  refs: string[]
}

type DbClient = { from: (table: string) => any }

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
