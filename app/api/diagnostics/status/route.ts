import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Diagnostics service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 })

  try {
    const db = adminClient()
    const { data, error } = await db
      .from('spartan_system_issues')
      .select('issue_id,subsystem,endpoint,severity,status,error_message,first_detected_at,last_detected_at,occurrence_count,deployment_id,commit_sha,resolved_at,metadata')
      .order('last_detected_at', { ascending: false })
      .limit(50)
    if (error) throw error
    const open = (data || []).filter((row: any) => row.status === 'open')
    return NextResponse.json({ ok: true, status: open.length ? 'degraded' : 'healthy', total: data?.length || 0, open: open.length, issues: data || [] })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Diagnostics status unavailable.' }, { status: 500 })
  }
}
