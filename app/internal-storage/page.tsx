import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isOwner, isTrustedAdmin } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

export default async function InternalStoragePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=discord-required')

  const db = createServiceClient()
  const { data: account } = await db.from('spartan_accounts').select('discord_user_id,screen_name,role').eq('auth_user_id', user.id).maybeSingle()
  const discordId = account?.discord_user_id ? String(account.discord_user_id) : null
  const role = String(account?.role ?? '')
  const allowed = isOwner(discordId) || isTrustedAdmin(discordId) || role === 'owner' || role === 'admin'
  if (!allowed) redirect('/access-denied?reason=internal-storage')

  const [{ data: rows }, { data: stewards }] = await Promise.all([
    db.from('spartan_internal_storage').select('capture_id,source_vault_id,captured_at,province_id,kingdom_id,url,scraper_page_kind,verified_page_kind,classification_source,classification_confidence,processing_status,steward_status,destination,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('spartan_steward_registry').select('steward_key,name,role,enabled,last_run_at,last_status,processed_count,quarantined_count,error_count').order('steward_key'),
  ])

  const items = rows ?? []
  const counts = items.reduce<Record<string, number>>((acc, row) => { acc[row.processing_status] = (acc[row.processing_status] ?? 0) + 1; return acc }, {})

  return <main style={{ minHeight: '100vh', background: '#05090d', color: '#e8f0f5', padding: '32px', fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 28 }}>
        <div><div style={{ color: '#67f0b0', fontSize: 12, fontWeight: 800, letterSpacing: '.18em' }}>SPARTAN // PROTECTED INFRASTRUCTURE</div><h1 style={{ margin: '8px 0', fontSize: 36 }}>Internal Storage</h1><p style={{ color: '#91a2af', margin: 0 }}>Vault intake → durable storage → controlled Steward processing.</p></div>
        <div style={{ border: '1px solid rgba(103,240,176,.3)', borderRadius: 12, padding: '12px 16px', textAlign: 'right' }}><strong>{isOwner(discordId) ? 'OWNER' : 'RIVEN / ADMIN'}</strong><div style={{ color: '#91a2af', fontSize: 11, marginTop: 4 }}>Server-side authorization active</div></div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
        {[["Stored", counts.stored ?? 0], ["Processing", counts.processing ?? 0], ["Processed", counts.processed ?? 0], ["Quarantined", counts.quarantined ?? 0], ["Failed", counts.failed ?? 0]].map(([label, value]) => <div key={String(label)} style={{ background: '#0b131b', border: '1px solid #182632', borderRadius: 12, padding: 18 }}><div style={{ color: '#91a2af', fontSize: 11, letterSpacing: '.1em' }}>{label}</div><strong style={{ display: 'block', fontSize: 28, marginTop: 6 }}>{String(value)}</strong></div>)}
      </section>

      <section style={{ background: '#0b131b', border: '1px solid #182632', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}><div><div style={{ color: '#67f0b0', fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}>CAPTURE STORAGE</div><h2 style={{ margin: '5px 0 0' }}>Recent stored captures</h2></div><span style={{ color: '#91a2af', fontSize: 12 }}>{items.length} shown</span></div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['Capture','Captured','URL','Scraper','Verified','Confidence','Status','Destination'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #1c2b37', color: '#91a2af' }}>{h}</th>)}</tr></thead><tbody>{items.map(row => <tr key={row.capture_id}><td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{row.capture_id.slice(0, 12)}…</td><td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{row.captured_at ? new Date(row.captured_at).toLocaleString() : '—'}</td><td style={{ padding: '10px 8px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.url ?? ''}>{row.url ?? '—'}</td><td style={{ padding: '10px 8px' }}>{row.scraper_page_kind ?? '—'}</td><td style={{ padding: '10px 8px', fontWeight: 700 }}>{row.verified_page_kind ?? 'pending'}</td><td style={{ padding: '10px 8px' }}>{row.classification_confidence ?? '—'}</td><td style={{ padding: '10px 8px' }}>{row.processing_status}</td><td style={{ padding: '10px 8px' }}>{row.destination ?? '—'}</td></tr>)}</tbody></table>{!items.length && <div style={{ padding: 30, textAlign: 'center', color: '#91a2af' }}>No captures have been moved into Internal Storage yet.</div>}</div>
      </section>

      <section style={{ background: '#0b131b', border: '1px solid #182632', borderRadius: 14, padding: 20 }}><div style={{ color: '#67f0b0', fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}>STEWARD CONTROL</div><h2 style={{ margin: '5px 0 16px' }}>Processing workforce</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 12 }}>{(stewards ?? []).map(steward => <div key={steward.steward_key} style={{ border: '1px solid #182632', borderRadius: 10, padding: 14 }}><strong>{steward.name}</strong><div style={{ color: '#91a2af', fontSize: 11, marginTop: 4 }}>{steward.role}</div><div style={{ marginTop: 10, fontSize: 12 }}>{steward.enabled ? 'ENABLED' : 'DISABLED'} · {steward.last_status ?? '—'}</div><div style={{ color: '#91a2af', fontSize: 11, marginTop: 5 }}>Processed {steward.processed_count ?? 0} · Errors {steward.error_count ?? 0}</div></div>)}</div></section>
    </div>
  </main>
}
