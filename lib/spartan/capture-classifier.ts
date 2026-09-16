export type CaptureClassification = {
  pageKind: string
  source: 'url' | 'url+content' | 'fallback'
  confidence: number
  reason: string
  retentionClass: 'intel_48h' | 'war_until_age_end' | 'age_stats_permanent' | 'system_permanent'
}

function lower(value: unknown) { return typeof value === 'string' ? value.toLowerCase() : '' }

export function classifyCapture(urlValue: unknown, rawTextValue: unknown, scraperKindValue: unknown): CaptureClassification {
  const url = lower(urlValue)
  const raw = lower(rawTextValue)
  const scraper = lower(scraperKindValue)
  const rules: Array<[RegExp, string, number, string]> = [
    [/\/throne(?:$|[?#/])/, 'throne', 1, 'Utopia throne URL'],
    [/\/military(?:$|[?#/])/, 'military', 1, 'Utopia military URL'],
    [/\/buildings?(?:$|[?#/])/, 'buildings', 1, 'Utopia buildings URL'],
    [/\/science(?:$|[?#/])/, 'science', 1, 'Utopia science URL'],
    [/\/magic(?:$|[?#/])/, 'magic', 1, 'Utopia magic URL'],
    [/\/thie(?:very|ves?)(?:$|[?#/])/, 'thievery', 0.98, 'Utopia thievery URL'],
    [/\/exploration(?:$|[?#/])/, 'exploration', 1, 'Utopia exploration URL'],
    [/\/kingdom(?:$|[?#/])/, 'kingdom', 1, 'Utopia kingdom URL'],
    [/\/intel(?:$|[?#/])/, 'intel', 0.98, 'Utopia intel URL'],
    [/\/council_history(?:$|[?#/])/, 'council_history', 1, 'Utopia council history URL'],
    [/\/council_spells(?:$|[?#/])/, 'council_spells', 1, 'Utopia council spells URL'],
    [/\/news(?:$|[?#/])/, 'news', 0.98, 'Utopia news URL'],
    [/\/war(?:$|[?#/])|war/, 'war', 0.9, 'War-related URL'],
    [/\/age(?:$|[?#/])|age.?stats|hall.?of.?fame/, 'age_stats', 0.9, 'Age statistics URL'],
    [/\/province(?:$|[?#/])|\/state(?:$|[?#/])|\/overview(?:$|[?#/])/, 'province_state', 0.9, 'Province/state URL'],
  ]
  for (const [pattern, pageKind, confidence, reason] of rules) {
    if (pattern.test(url)) {
      const retentionClass = pageKind === 'war' ? 'war_until_age_end' : pageKind === 'age_stats' ? 'age_stats_permanent' : 'intel_48h'
      return { pageKind, source: 'url', confidence, reason, retentionClass }
    }
  }
  const contentRules: Array<[RegExp, string, number, string]> = [
    [/\bthrone\b.*\bprovince\b|\bprovince\b.*\bthrone\b/, 'throne', 0.78, 'Page content identifies a throne view'],
    [/\bmilitary\b.*\bsoldiers\b|\boffense\b.*\bdefense\b/, 'military', 0.78, 'Page content identifies military state'],
    [/\bbuildings?\b.*\bpercent|\bconstruction\b/, 'buildings', 0.76, 'Page content identifies buildings'],
    [/\bscience\b.*\bpoints?\b|\bscience\b.*\bbooks?\b/, 'science', 0.76, 'Page content identifies science'],
    [/\bmagic\b.*\bspell|\brunes\b.*\bspell/, 'magic', 0.76, 'Page content identifies magic'],
    [/\bthievery\b|\bthieves?\b.*\bstealth\b/, 'thievery', 0.76, 'Page content identifies thievery'],
    [/\bexploration\b.*\bland|\bexplore\b.*\bacres?\b/, 'exploration', 0.76, 'Page content identifies exploration'],
    [/\bkingdom\b.*\bprovinces?\b/, 'kingdom', 0.74, 'Page content identifies kingdom information'],
  ]
  for (const [pattern, pageKind, confidence, reason] of contentRules) {
    if (pattern.test(raw)) return { pageKind, source: 'url+content', confidence, reason, retentionClass: 'intel_48h' }
  }
  if (scraper) return { pageKind: scraper.replace(/[^a-z0-9_-]+/g, '_') || 'unknown', source: 'fallback', confidence: 0.35, reason: 'URL/content did not identify the page; scraper label retained only as a low-confidence fallback', retentionClass: 'intel_48h' }
  return { pageKind: 'unknown', source: 'fallback', confidence: 0.1, reason: 'No reliable page classification was available; raw capture preserved', retentionClass: 'intel_48h' }
}
