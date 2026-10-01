'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import {
  AllData, C, DataTable, Donut, Empty, Gauge, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat,
  PALETTE, ago, fmt, pct, usePageModel,
} from '@/components/spartan/ui'

const GROUP_COLOR: Record<string, string> = {
  Economy: C.lime, Military: C.red, Population: C.cyan, Arcane: C.violet, Covert: C.amber, Science: C.green, Land: '#6b7a8a', Other: C.blue,
}
const label = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const

export default function BuildingsPage() {
  const { data, error, loading, reload } = usePageModel('buildings')
  const m = data?.model
  const cur = m?.current
  const rows: any[] = cur?.rows || []
  const built = rows.filter(r => r.qty > 0)
  const stats = cur?.stats || {}
  const groups = Object.entries(built.reduce((acc: Record<string, number>, r) => { acc[r.group] = (acc[r.group] || 0) + r.qty; return acc }, {}))
  const top = [...built].sort((a, b) => b.qty - a.qty)
  const series: any[] = m?.series || []
  const topNames = top.slice(0, 4).map(r => r.name)
  const lineSeries = topNames.map((name, i) => ({
    name, color: PALETTE[i], format: (v: number) => `${v.toFixed(1)}%`,
    points: series.map(s => ({ x: s.at, y: s.rows.find((r: any) => r.name === name)?.pct ?? null })),
  }))
  const construction = m?.construction
  const jobsFilled = stats.jobs ? Math.min(100, ((stats.workers || 0) / stats.jobs) * 100) : null

  return (
    <Shell title="Building Command" eyebrow="SPARTAN // DEVELOPMENT" accent={C.blue}
      subtitle="How your land is developed: every building, its share of your acres, what it does for you and how well your people can staff them."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !cur && <Panel><Empty title="No buildings capture yet" hint="Open Council → Internal (the buildings page) in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>}
      {cur && (
        <>
          <Grid>
            <Stat label="Acres developed" value={cur.totalAcres} sub={`${built.length} building types`} color={C.blue} delay={0} />
            <Stat label="Building efficiency" value={stats.efficiency} format={v => `${v.toFixed(1)}%`} sub={stats.efficiency != null && stats.efficiency >= 100 ? 'Fully staffed' : 'Understaffed'} color={C.lime} delay={1} />
            <Stat label="Available jobs" value={stats.jobs} sub={`${fmt(stats.workers)} workers available`} color={C.cyan} delay={2} />
            <Stat label="Workers for max" value={stats.workersNeeded} sub="Needed for 100% efficiency" color={C.amber} delay={3} />
          </Grid>

          <Grid>
            <Panel span={4} title="LAND USE BY ROLE" sub={m.capturedAt ? `Captured ${ago(m.capturedAt)}` : undefined} delay={1}>
              <Donut slices={groups.map(([name, value]) => ({ label: name, value: value as number, color: GROUP_COLOR[name] }))} centerBottom="Acres" />
            </Panel>
            <Panel span={5} title="SHARE OF LAND BY BUILDING" sub="Percent of your total acres" delay={2}>
              <HBars max={Math.max(12, ...built.map(r => r.pct))} items={top.map(r => ({ label: r.name, value: r.pct, color: GROUP_COLOR[r.group], text: `${r.pct.toFixed(1)}% · ${fmt(r.qty)}` }))} />
            </Panel>
            <Panel span={3} title="STAFFING" delay={3}>
              <div style={{ display: 'grid', placeItems: 'center' }}>
                <Gauge value={stats.efficiency} max={130} label="Efficiency" text={pct(stats.efficiency)} color={C.lime} />
                <div style={{ width: '100%', marginTop: 8 }}>
                  <HBars max={Math.max(stats.jobs || 1, stats.workers || 1)} items={[
                    { label: 'Workers', value: stats.workers || 0, color: C.cyan, text: fmt(stats.workers) },
                    { label: 'Jobs', value: stats.jobs || 0, color: C.blue, text: fmt(stats.jobs) },
                    { label: 'For max', value: stats.workersNeeded || 0, color: C.amber, text: fmt(stats.workersNeeded) },
                  ]} />
                  {jobsFilled != null && <div style={{ fontSize: 11, color: '#8597a8', marginTop: 4 }}>{jobsFilled.toFixed(0)}% of jobs are filled</div>}
                </div>
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="BUILDING SHARE OVER TIME" sub="Your four biggest building types across captures" delay={3}>
              <LineChart series={lineSeries} height={210} />
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="EVERY BUILDING AND ITS EFFECT" delay={4}>
              <DataTable<any> initialSort="qty" columns={[
                { key: 'name', label: 'BUILDING', value: r => r.name },
                { key: 'group', label: 'ROLE', value: r => r.group, render: r => <span style={{ color: GROUP_COLOR[r.group] }}>● {r.group}</span> },
                { key: 'qty', label: 'QTY', value: r => r.qty, render: r => fmt(r.qty), align: 'right' },
                { key: 'pct', label: '% OF LAND', value: r => r.pct, render: r => pct(r.pct), align: 'right' },
                { key: 'effects', label: 'CURRENT EFFECTS', value: r => r.effects, render: r => <span style={{ whiteSpace: 'normal', display: 'block', minWidth: 260, color: '#b9c7d4' }}>{r.effects || '—'}</span> },
              ]} rows={rows} maxHeight={560} />
            </Panel>
          </Grid>

          {construction && (
            <Grid>
              <Panel span={12} title="CONSTRUCTION PAGE" sub={`Captured ${ago(construction.capturedAt)}`} delay={5}>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  {[['Total built', construction.total != null ? pct(construction.total) : '—'], ['Construction cost', fmt(construction.construction_cost)], ['Raze cost', fmt(construction.raze_cost)], ['Credits in use', construction.use_available_credits ?? '—']].map(([k, v]) => (
                    <div key={String(k)}><div style={label}>{String(k).toUpperCase()}</div><b style={{ fontSize: 20 }}>{String(v)}</b></div>
                  ))}
                </div>
              </Panel>
            </Grid>
          )}
        </>
      )}
      <JeevesSummary compact />
      {data && <AllData fields={data.fields} captures={data.captures} />}
    </Shell>
  )
}
