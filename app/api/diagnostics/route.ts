import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Check = { name: string; ok: boolean; latencyMs: number; detail?: string }
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan diagnostics service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
async function timed(name: string, fn: () => Promise<string | undefined>): Promise<Check> {
  const started = Date.now(); try { return { name, ok: true, latencyMs: Date.now() - started, detail: await fn() } }
  catch (error) { return { name, ok: false, latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : 'Diagnostic check failed' } }
}
async function recordIssue(db: any, check: Check, checkedAt: string) {
  const endpoint = `/diagnostics/${check.name}`
  const { data: existing, error: lookupError } = await db.from('spartan_system_issues').select('issue_id,occurrence_count').eq('subsystem','diagnostics').eq('endpoint',endpoint).eq('status','open').order('last_detected_at',{ascending:false}).limit(1).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) {
    const { error } = await db.from('spartan_system_issues').update({ last_detected_at: checkedAt, occurrence_count: Number(existing.occurrence_count || 0) + 1, error_message: check.detail || 'Diagnostic check failed' }).eq('issue_id', existing.issue_id)
    if (error) throw error
  } else {
    const { error } = await db.from('spartan_system_issues').insert({ subsystem:'diagnostics', endpoint, severity:'error', status:'open', error_message:check.detail || 'Diagnostic check failed', first_detected_at:checkedAt, last_detected_at:checkedAt, occurrence_count:1, deployment_id:process.env.RENDER_SERVICE_ID || null, commit_sha:process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null, metadata:{ check:check.name, latencyMs:check.latencyMs } })
    if (error) throw error
  }
}

async function resolveIssues(db: any, checkedAt: string, filters: { subsystem: string; endpoint: string }) {
  const { error } = await db.from('spartan_system_issues')
    .update({ status: 'resolved', resolved_at: checkedAt })
    .eq('status', 'open')
    .eq('subsystem', filters.subsystem)
    .eq('endpoint', filters.endpoint)
  if (error) throw new Error(`Could not resolve recovered issue ${filters.subsystem} ${filters.endpoint}: ${error.message}`)
}

export async function GET() {
  const checkedAt = new Date().toISOString(); const auth = await createClient(); const { data:{ user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ ok:false, status:'unauthorized', error:'Authentication required for diagnostics.' }, { status:401 })
  const db = adminClient()
  const checks = await Promise.all([
    timed('supabase_accounts', async () => { const {error}=await db.from('spartan_accounts').select('id').eq('auth_user_id',user.id).limit(1); if(error) throw error; return 'query ok' }),
    timed('province_registry', async () => { const {error}=await db.from('spartan_province_registry').select('province_id').eq('user_id',user.id).limit(1); if(error) throw error; return 'query ok' }),
    timed('clock_data', async () => {
      const {data:account,error:a}=await db.from('spartan_accounts').select('id,province_name,province_location').eq('auth_user_id',user.id).maybeSingle(); if(a) throw a; if(!account) throw new Error('account missing')
      const {data:registry,error:r}=await db.from('spartan_province_registry').select('province_id,province_name,kingdom_code').eq('user_id',user.id).eq('province_name',account.province_name).eq('kingdom_code',account.province_location).order('updated_at',{ascending:false}).limit(1).maybeSingle(); if(r) throw r; if(!registry?.province_id) throw new Error('current province registry link missing')
      // The authoritative clock reader uses spartan_intel_records. The capture vault is an ingestion/history store and may not contain normalized Throne rows.
      const provinceIds=[...new Set([String(account.id),String(registry.province_id)].filter(Boolean))]
      const {data:capture,error:c}=await db.from('spartan_intel_records').select('id,raw_text,parsed_payload').in('province_id',provinceIds).eq('kingdom_id',account.province_location).eq('page_kind','throne').order('captured_at',{ascending:false}).limit(100); if(c) throw c
      const datePattern=/\b(?:January|February|March|April|May|June|July)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s*(?:of\s+)?YR\s*\d+/i
      const found=(capture||[]).some((row:any)=>datePattern.test(String(row.raw_text||'')) || datePattern.test(JSON.stringify(row.parsed_payload||{})))
      if(!found) throw new Error('no authoritative throne date capture in spartan_intel_records for the linked province')
      return 'clock source ready'
    }),
    timed('jeeves_data', async () => {
      const {data:p,error:e}=await db.from('spartan_jeeves_profiles').select('id').eq('auth_user_id',user.id).maybeSingle(); if(e) throw e; if(!p) throw new Error('Jeeves profile missing')
      const {data:a,error:ae}=await db.from('spartan_accounts').select('province_name').eq('auth_user_id',user.id).maybeSingle(); if(ae) throw ae; if(!a?.province_name) throw new Error('province identity missing')
      return 'Jeeves data ready'
    }),
    timed('intel_records', async () => { const {error}=await db.from('spartan_intel_records').select('id').limit(1); if(error) throw error; return 'query ok' }),
    timed('steward_registry', async () => { const {error}=await db.from('spartan_steward_registry').select('steward_key').limit(1); if(error) throw error; return 'query ok' }),
    timed('event_history', async () => { const {data:account,error:a}=await db.from('spartan_accounts').select('id,province_location').eq('auth_user_id',user.id).maybeSingle(); if(a) throw a; if(!account) throw new Error('account missing'); const {error}=await db.from('spartan_event_history').select('id').eq('province_id',account.id).eq('kingdom_id',account.province_location).limit(1); if(error) throw error; return 'query ok' }),
    timed('render_dependency', async () => { const target=process.env.SPARTAN_RENDER_HEALTH_TARGET?.trim(); if(!target) return 'external Render dependency not configured'; const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),5000); try { const response=await fetch(target,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}}); if(!response.ok) throw new Error(`HTTP ${response.status}`); return 'external dependency ok' } finally { clearTimeout(timeout) } }),
  ])
  const failed=checks.filter(c=>!c.ok), slow=checks.filter(c=>c.latencyMs>=1000)
  for (const check of checks) {
    if (check.ok) await resolveIssues(db, checkedAt, { subsystem: 'diagnostics', endpoint: `/diagnostics/${check.name}` })
    else await recordIssue(db, check, checkedAt)
  }
  // A successful, fully healthy response is direct evidence that the diagnostics endpoint recovered.
  // Do not clear these client-reported failures while any underlying diagnostic remains unhealthy.
  if (failed.length === 0) {
    await resolveIssues(db, checkedAt, { subsystem: 'client', endpoint: '/api/diagnostics' })
  }
  return NextResponse.json({ ok:failed.length===0, status:failed.length?'degraded':slow.length?'slow':'healthy', checkedAt, totalLatencyMs:Math.max(...checks.map(c=>c.latencyMs)), failedChecks:failed.length, slowChecks:slow.length, checks, deployment:{ commit:process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null, service:process.env.RENDER_SERVICE_NAME || null } }, { status:failed.length?503:200 })
}

export async function POST(request: Request) {
  const auth=await createClient(); const {data:{user}}=await auth.auth.getUser(); if(!user) return NextResponse.json({ok:false,error:'Authentication required.'},{status:401})
  try {
    const body=await request.json(); const allowedSeverity=new Set(['info','warning','error','critical']); const severity=allowedSeverity.has(body?.severity)?body.severity:'error'
    const subsystem=typeof body?.subsystem==='string'?body.subsystem.slice(0,80):'client'; const endpoint=typeof body?.endpoint==='string'?body.endpoint.slice(0,200):'client'; const message=typeof body?.message==='string'?body.message.slice(0,1000):'Client diagnostic failure'
    const db=adminClient(); const checkedAt=new Date().toISOString()
    // Collapse repeated browser reports into the latest open issue instead of creating thousands of duplicate rows.
    const {data:existing,error:lookupError}=await db.from('spartan_system_issues').select('issue_id,occurrence_count').eq('subsystem',subsystem).eq('endpoint',endpoint).eq('error_message',message).eq('status','open').order('last_detected_at',{ascending:false}).limit(1).maybeSingle()
    if(lookupError) throw lookupError
    if(existing) {
      const {error}=await db.from('spartan_system_issues').update({severity,error_message:message,last_detected_at:checkedAt,occurrence_count:Number(existing.occurrence_count||0)+1,metadata:{userId:user.id,source:'client',context:body?.context && typeof body.context==='object'?body.context:{}}}).eq('issue_id',existing.issue_id)
      if(error) throw error
    } else {
      const {error}=await db.from('spartan_system_issues').insert({subsystem,endpoint,severity,status:'open',error_message:message,first_detected_at:checkedAt,last_detected_at:checkedAt,occurrence_count:1,commit_sha:process.env.RENDER_GIT_COMMIT || process.env.RENDER_GIT_COMMIT_SHA || null,metadata:{userId:user.id,source:'client',context:body?.context && typeof body.context==='object'?body.context:{}}})
      if(error) throw error
    }
    return NextResponse.json({ok:true})
  } catch(error) { return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Diagnostic write failed'},{status:400}) }
}
