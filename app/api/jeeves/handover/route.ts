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
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(`https://api.github.com/repos/shadowjuice69/Spartan/${path}`, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  })
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)
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
    const { data, error } = await db
      .from('spartan_system_issues')
      .select('issue_id,subsystem,endpoint,severity,error_message,last_detected_at,occurrence_count,commit_sha')
      .eq('status', 'open')
      .order('last_detected_at', { ascending: false })
      .limit(12)
    if (error) throw error
    issues = (data || []).map((row: any) => ({
      id: String(row.issue_id),
      subsystem: String(row.subsystem || 'unknown'),
      endpoint: String(row.endpoint || ''),
      severity: String(row.severity || 'warning'),
      message: String(row.error_message || 'No diagnostic detail recorded').slice(0, 500),
      lastDetectedAt: row.last_detected_at || null,
      occurrences: Number(row.occurrence_count || 1),
      commitSha: row.commit_sha || null,
    }))
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
    issueSearchComplete,
    sourceStatus,
    warnings,
    summary: lines,
    approvalGate: { enforced: false, note: 'This endpoint reports state only. Runtime write/merge/deploy enforcement is not implemented by this handover feature.' },
  })
}
