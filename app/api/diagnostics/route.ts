import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan diagnostics service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type Check = {
  name: string
  ok: boolean
  latencyMs: number
  detail?: string
}

async function timed(name: string, fn: () => Promise<string | undefined>): Promise<Check> {
  const started = Date.now()
  try {
    const detail = await fn()
    return { name, ok: true, latencyMs: Date.now() - started, detail }
  } catch (error) {
    return {
      name,
      ok: false,
      latencyMs: Date.now() - started,
      detail: error instanceof Error ? error.message : 'Diagnostic check failed',
    }
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString()
  const db = adminClient()

  const checks = await Promise.all([
    timed('supabase_accounts', async () => {
      const { error } = await db.from('spartan_accounts').select('auth_user_id').limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('province_registry', async () => {
      const { error } = await db.from('spartan_province_registry').select('province_id').limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('state_projection', async () => {
      const { error } = await db.from('spartan_state_projection').select('province_id,updated_at').order('updated_at', { ascending: false }).limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('province_history', async () => {
      const { error } = await db.from('spartan_province_history').select('province_id,observed_at').order('observed_at', { ascending: false }).limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('intel_records', async () => {
      const { error } = await db.from('spartan_intel_records').select('id,captured_at').order('captured_at', { ascending: false }).limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('capture_vault', async () => {
      const { error } = await db.from('spartan_capture_vault').select('id').limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('steward_registry', async () => {
      const { error } = await db.from('spartan_steward_registry').select('steward_key').limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('event_history', async () => {
      const { error } = await db.from('spartan_event_history').select('id').limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('jeeves_profiles', async () => {
      const { error } = await db.from('spartan_jeeves_profiles').select('id').limit(1)
      if (error) throw error
      return 'query ok'
    }),
    timed('render_dependency', async () => {
      const target = process.env.SPIRIT_RENDER_HEALTH_URL || 'https://utopia-nexus.onrender.com/health'
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(target, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return 'dependency ok'
      } finally {
        clearTimeout(timeout)
      }
    }),
  ])

  const failed = checks.filter((check) => !check.ok)
  const slow = checks.filter((check) => check.latencyMs >= 1000)

  // Record only failures so the ledger stays useful rather than becoming a log dump.
  if (failed.length) {
    for (const check of failed) {
      const endpoint = `/api/diagnostics#${check.name}`
      const { data: existing } = await db.from('spartan_system_issues')
        .select('issue_id,occurrence_count')
        .eq('subsystem', 'diagnostics')
        .eq('endpoint', endpoint)
        .eq('status', 'open')
        .maybeSingle()
      if (existing) {
        await db.from('spartan_system_issues').update({
          last_detected_at: checkedAt,
          occurrence_count: Number(existing.occurrence_count || 0) + 1,
          error_message: check.detail || 'Diagnostic check failed',
        }).eq('issue_id', existing.issue_id)
      } else {
        await db.from('spartan_system_issues').insert({
          subsystem: 'diagnostics',
          endpoint,
          severity: 'error',
          status: 'open',
          error_message: check.detail || 'Diagnostic check failed',
          metadata: { check: check.name, latencyMs: check.latencyMs },
        })
      }
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    status: failed.length ? 'degraded' : slow.length ? 'slow' : 'healthy',
    checkedAt,
    totalLatencyMs: checks.reduce((max, check) => Math.max(max, check.latencyMs), 0),
    failedChecks: failed.length,
    slowChecks: slow.length,
    checks,
    deployment: {
      commit: process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null,
      service: process.env.RENDER_SERVICE_NAME || null,
    },
  }, { status: failed.length ? 503 : 200 })
}
