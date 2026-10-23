import { NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { canAccessOwnerConsole, extractDiscordId } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

type PullRequest = {
  number: number
  title: string
  html_url: string
  updated_at: string
  head?: { sha?: string }
  labels?: { name?: string }[]
  draft?: boolean
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Jeeves handover data service is not configured.')
  return createAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function github<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Spartan-Jeeves-Handover',
  }
  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) throw new Error('GITHUB_TOKEN is not configured in Render; authenticated GitHub read access is required.')
  headers.Authorization = `Bearer ${token}`
  const response = await fetch(`https://api.github.com/repos/shadowjuice69/Spartan/${path}`, {
    headers,
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(7000),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    const remaining = response.headers.get('x-ratelimit-remaining')
    const detail = response.status === 403 && remaining === '0'
      ? 'GitHub API rate limit exhausted; verify GITHUB_TOKEN and retry after the rate-limit reset.'
      : (payload?.message || 'GitHub API request was denied.')
    throw new Error(`GitHub returned HTTP ${response.status}: ${detail}`)
  }
  return response.json() as Promise<T>
}

export async function GET() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 })

  const db = adminClient()
  const { data: account, error: accountError } = await db.from('spartan_accounts').select('discord_user_id').eq('auth_user_id', user.id).maybeSingle()
  if (accountError) return NextResponse.json({ ok: false, error: 'Could not verify Spartan owner access.' }, { status: 503 })
  const discordId = account?.discord_user_id || extractDiscordId(user)
  if (!canAccessOwnerConsole(discordId)) return NextResponse.json({ ok: true, visible: false })

  const checkedAt = new Date().toISOString()
  const sourceStatus = { github: 'pending', supabase: 'pending' } as Record<string, string>
  let mainSha: string | null = null
  let openPullRequests: { number: number; title: string; url: string; updatedAt: string; headSha: string | null; draft: boolean; labels: string[]; jeevesProposal: boolean }[] = []
  let proposals: { number: number; title: string; url: string; updatedAt: string; headSha: string | null; draft: boolean; labels: string[] }[] = []
  let proposalSearchComplete = false
  let issues: { id: string; subsystem: string; endpoint: string; severity: string; message: string; lastDetectedAt: string | null; occurrences: number; commitSha: string | null }[] = []
  let resolvedIssues: { id: string; subsystem: string; endpoint: string; message: string; resolvedAt: string | null; occurrences: number }[] = []
  let issueSearchComplete = false
  const warnings: string[] = []

  try {
    const [commit, pulls] = await Promise.all([
      github<{ sha?: string }>('commits/main'),
      github<PullRequest[]>('pulls?state=open&per_page=100&sort=updated&direction=desc'),
    ])
    mainSha = commit?.sha || null
    openPullRequests = pulls.map((pr) => {
      const labels = (pr.labels || []).map((label) => String(label.name || ''))
      const jeevesProposal = /^\[jeeves proposal\]/i.test(pr.title) || labels.some((label) => label.toLowerCase() === 'jeeves-proposal')
      return { number: pr.number, title: pr.title, url: pr.html_url, updatedAt: pr.updated_at, headSha: pr.head?.sha || null, draft: Boolean(pr.draft), labels, jeevesProposal }
    })
    proposals = openPullRequests.filter((pr) => pr.jeevesProposal).map(({ jeevesProposal, ...pr }) => pr)
    proposalSearchComplete = true
    sourceStatus.github = 'ok'
  } catch (error) {
    sourceStatus.github = 'unavailable'
    warnings.push(error instanceof Error ? error.message : 'GitHub proposal check failed.')
  }

  try {
    const allRows: any[] = []
    let offset = 0
    let reachedEnd = false
    const pageSize = 1000
    while (offset < 10000) {
      const { data, error } = await db
        .from('spartan_system_issues')
        .select('issue_id,subsystem,endpoint,severity,error_message,last_detected_at,occurrence_count,commit_sha')
        .eq('status', 'open')
        .order('last_detected_at', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      const page = data || []
      allRows.push(...page)
      if (page.length < pageSize) { reachedEnd = true; break }
      offset += page.length
    }
    if (!reachedEnd) throw new Error('Open issue queue exceeds 10000 rows; issue aggregation is incomplete.')
    const grouped = new Map<string, any>()
    for (const row of allRows) {
      const subsystem = String(row.subsystem || 'unknown')
      const endpoint = String(row.endpoint || '')
      const severity = String(row.severity || 'warning')
      const message = String(row.error_message || 'No diagnostic detail recorded').slice(0, 500)
      const key = [subsystem, endpoint, severity, message].join('|')
      const existing = grouped.get(key)
      if (existing) {
        existing.occurrences += Number(row.occurrence_count || 1)
        if (row.last_detected_at && (!existing.lastDetectedAt || row.last_detected_at > existing.lastDetectedAt)) {
          existing.id = String(row.issue_id)
          existing.lastDetectedAt = row.last_detected_at
          existing.commitSha = row.commit_sha || null
        }
      } else {
        grouped.set(key, {
          id: String(row.issue_id), subsystem, endpoint, severity, message,
          lastDetectedAt: row.last_detected_at || null,
          occurrences: Number(row.occurrence_count || 1),
          commitSha: row.commit_sha || null,
        })
      }
    }
    issues = Array.from(grouped.values())
      .sort((a, b) => String(b.lastDetectedAt || '').localeCompare(String(a.lastDetectedAt || '')))
      .slice(0, 12)
    const resolvedSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: resolvedRows, error: resolvedError } = await db
      .from('spartan_system_issues')
      .select('issue_id,subsystem,endpoint,error_message,resolved_at,occurrence_count')
      .eq('status', 'resolved')
      .not('resolved_at', 'is', null)
      .gte('resolved_at', resolvedSince)
      .order('resolved_at', { ascending: false })
      .limit(1000)
    if (resolvedError) throw resolvedError
    const completed = new Map<string, any>()
    for (const row of resolvedRows || []) {
      const subsystem = String(row.subsystem || 'unknown')
      const endpoint = String(row.endpoint || '')
      const message = String(row.error_message || 'Resolved issue').slice(0, 500)
      const key = [subsystem, endpoint, message].join('|')
      const existing = completed.get(key)
      if (existing) {
        existing.occurrences += Number(row.occurrence_count || 1)
        if (row.resolved_at && (!existing.resolvedAt || row.resolved_at > existing.resolvedAt)) {
          existing.id = String(row.issue_id)
          existing.resolvedAt = row.resolved_at
        }
      } else {
        completed.set(key, {
          id: String(row.issue_id), subsystem, endpoint, message,
          resolvedAt: row.resolved_at || null,
          occurrences: Number(row.occurrence_count || 1),
        })
      }
    }
    resolvedIssues = Array.from(completed.values())
      .sort((a, b) => String(b.resolvedAt || '').localeCompare(String(a.resolvedAt || '')))
      .slice(0, 12)
    issueSearchComplete = true
    sourceStatus.supabase = 'ok'
  } catch (error) {
    sourceStatus.supabase = 'unavailable'
    warnings.push(error instanceof Error ? error.message : 'Spartan issue check failed.')
  }

  const deployedSha = process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null
  const deployment = {
    service: process.env.RENDER_SERVICE_NAME || 'sparta-west',
    deployedSha,
    mainSha,
    matchesMain: Boolean(deployedSha && mainSha && deployedSha === mainSha),
    checkedAt,
  }
  const lines = [
    'SPARTAN / JEEVES SESSION HANDOVER',
    `Generated: ${checkedAt}`,
    `Production service: ${deployment.service}`,
    `Render deployed commit: ${deployedSha || 'not exposed by runtime'}`,
    `GitHub main commit: ${mainSha || 'unavailable'}`,
    `Production matches main: ${deployment.matchesMain ? 'yes' : deployedSha && mainSha ? 'no' : 'unknown'}`,
    `Proposal check: ${proposalSearchComplete ? 'complete' : 'INCOMPLETE'}`,
    ...(proposalSearchComplete
      ? openPullRequests.length
        ? openPullRequests.map((pr) => `${pr.jeevesProposal ? 'JEEVES PROPOSAL — PENDING REVIEW' : 'OPEN PULL REQUEST — REVIEW STATUS NOT ASSUMED'}: PR #${pr.number} ${pr.title} | head ${pr.headSha || 'unknown'} | ${pr.url}`)
        : ['No open pull requests were found.']
      : ['Could not verify open pull requests or Jeeves proposals; do not assume the queue is empty.']),
    `System issue check: ${issueSearchComplete ? 'complete' : 'INCOMPLETE'}`,
    ...(issueSearchComplete
      ? issues.length
        ? issues.map((issue) => `OPEN ISSUE [${issue.severity}] ${issue.subsystem} ${issue.endpoint}: ${issue.message} (occurrences: ${issue.occurrences})`)
        : ['No open issues found in spartan_system_issues.']
      : ['Could not verify the open system issue queue.']),
    `Recently resolved issues: ${issueSearchComplete ? resolvedIssues.length : 'unavailable'}`,
    ...(issueSearchComplete && resolvedIssues.length
      ? resolvedIssues.slice(0, 8).map((issue) => `COMPLETED ${issue.subsystem} ${issue.endpoint}: ${issue.message} (resolved: ${issue.resolvedAt || 'timestamp unavailable'})`)
      : []),
    ...(warnings.length ? ['Warnings: ' + warnings.join(' | ')] : []),
    'Approval rule: proposal discovery and reporting do not authorize a build, merge, database mutation, or deployment.',
  ].join('\n')

  return NextResponse.json({
    ok: true,
    visible: true,
    checkedAt,
    deployment,
    proposals,
    openPullRequests,
    proposalSearchComplete,
    issues,
    resolvedIssues,
    issueSearchComplete,
    sourceStatus,
    warnings,
    summary: lines,
    approvalGate: { enforced: false, note: 'This endpoint reports state only. Runtime write/merge/deploy enforcement is not implemented by this handover feature.' },
  })
}
