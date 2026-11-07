'use client'

import { useCallback, useEffect, useState } from 'react'
import { C, Grid, Panel, Shell, Skeletons, Stat, Tag, fmt, ago } from '@/components/spartan/ui'

type Coverage = {
  account: { province: string; kingdom: string }
  totals: { captures: number; captureLimit: number; intelRecords: number; provinceHistory: number; eventHistory: number; registryProvinces: number }
  coverage: {
    kinds: Array<{ page_kind: string; count: number; latest: string | null; sources: string[]; raw_text: number; structured: number; destinations: string[] }>
    sources: Array<{ source: string; count: number }>
    fields: Array<{ name: string; fields: Array<{ key: string; records: number; present: boolean }> }>
    flows: Array<{ page_kind: string; count: number; latest: string | null; statuses: Record<string, number> }>
    registry: Array<{ province: string; kingdom: string; latest: string | null; available: string[] }>
    capturedAt: string | null
    truncated: boolean
  }
}

export default function DataCoveragePage() {
  const [data, setData] = useState<Coverage | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/data-coverage', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to load data coverage')
      setData(body)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load data coverage') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])

  return <Shell title="Data Coverage" eyebrow="SPARTAN // DATA INVENTORY" accent={C.cyan}
    subtitle="Trace what Spartan has captured, which structured fields exist, and the pages that consume each data stream."
    data={data} error={error} loading={loading} reload={reload}>
    {!data && loading && <Skeletons count={6} />}
    {data && <>
      <p style={{fontSize:11,color:'#8993a1',margin:'0 0 14px'}}>{data.account.province} · {data.account.kingdom} · latest capture {ago(data.coverage.capturedAt)}</p>
      <Grid>
        <Stat label="Captures scanned" value={data.totals.captures} sub={data.coverage.truncated ? 'Latest 1,500; more exist' : 'All account captures'} color={C.cyan} delay={0}/>
        <Stat label="Intel records" value={data.totals.intelRecords} sub="Structured Intel projection" color={C.violet} delay={1}/>
        <Stat label="Province history" value={data.totals.provinceHistory} sub="Historical snapshots" color={C.lime} delay={2}/>
        <Stat label="Event history" value={data.totals.eventHistory} sub="Normalized game events" color={C.amber} delay={3}/>
      </Grid>
      <Grid>
        <Panel title="CAPTURE TYPES → SITE DESTINATIONS" sub="What was captured and where the application is intended to display it.">
          <div style={{display:'grid',gap:9}}>
            {data.coverage.kinds.map(row=><div key={row.page_kind} style={{padding:12,border:'1px solid rgba(255,255,255,.07)',borderRadius:10,background:'rgba(255,255,255,.02)'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><b style={{fontSize:12}}>{row.page_kind}</b><Tag color={C.cyan}>{fmt(row.count)} captures</Tag></div>
              <div style={{fontSize:10,color:'#8d9baa',marginTop:6}}>Latest {ago(row.latest)} · {row.structured} structured · {row.raw_text} text · {row.sources.join(', ') || 'source unknown'}</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:8}}>{row.destinations.map(dest=><Tag key={dest} color={C.green}>{dest}</Tag>)}</div>
            </div>)}
          </div>
        </Panel>
        <Panel title="CAPTURE SOURCES" sub="Which intake paths contribute data.">
          {data.coverage.sources.map(row=><div key={row.source} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.06)',fontSize:11}}><span>{row.source}</span><b>{fmt(row.count)}</b></div>)}
        </Panel>
      </Grid>
      <Panel title="FIELD-LEVEL COVERAGE" sub="Counts are across the most recent captures scanned. A present field is not automatically proof that a page consumes it.">
        {data.coverage.fields.map(group=><div key={group.name} style={{marginBottom:16}}>
          <b style={{fontSize:11,letterSpacing:'.1em'}}>{group.name.toUpperCase()}</b>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:6,marginTop:8}}>
            {group.fields.map(field=><div key={field.key} style={{padding:'8px 10px',borderRadius:8,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)'}}>
              <div style={{fontSize:10,color:'#b7c3ce'}}>{field.key}</div><div style={{fontSize:13,fontWeight:800,color:field.present?C.green:C.red,marginTop:4}}>{fmt(field.records)} captures</div>
            </div>)}
          </div>
        </div>)}
      </Panel>
      <Grid>
        <Panel title="PROCESSING FLOWS" sub="Recent Discord bot flow statuses.">
          {data.coverage.flows.length ? data.coverage.flows.map(flow=><div key={flow.page_kind} style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
            <b style={{fontSize:11}}>{flow.page_kind}</b><div style={{fontSize:10,color:'#8d9baa',marginTop:4}}>{fmt(flow.count)} flows · {ago(flow.latest)} · {Object.entries(flow.statuses).map(([k,v])=>k+': '+v).join(' · ')}</div>
          </div>) : <p style={{fontSize:11,color:'#8993a1'}}>No recent Discord bot flows found.</p>}
        </Panel>
        <Panel title="PROVINCE REGISTRY" sub="Province identity and specialized data stored in registry metadata.">
          {data.coverage.registry.map(row=><div key={row.province} style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
            <b style={{fontSize:11}}>{row.province}</b><div style={{fontSize:10,color:'#8d9baa',marginTop:4}}>{row.kingdom} · {ago(row.latest)} · {row.available.length} metadata keys</div>
          </div>)}
          {!data.coverage.registry.length && <p style={{fontSize:11,color:'#8993a1'}}>No registry entries linked to this account.</p>}
        </Panel>
      </Grid>
      {data.coverage.truncated && <p style={{fontSize:10,color:C.amber}}>Inventory is capped at the latest 1,500 captures to keep this page responsive.</p>}
    </>}
  </Shell>
}
