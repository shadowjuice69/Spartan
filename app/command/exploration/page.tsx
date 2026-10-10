'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import {
  AllData, C, DataTable, Empty, Grid, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'

const row = { display: 'grid', gap: 6, fontSize: 12, color: '#8597a8' } as const

export default function ExplorationPage() {
  const { data, error, loading, reload } = usePageModel('exploration')
  const m = data?.model
  const p = m?.latest
  const plan = m?.plan
  const series: any[] = m?.series || []

  const sizes = p ? [25, 50, 100, 250].filter(n => (p.uncharted == null || n <= p.uncharted)) : []
  const costRows = p
    ? sizes.map(n => ({
        acres: n,
        gold: p.goldPerAcre != null ? p.goldPerAcre * n : null,
        soldiers: p.soldiersPerAcre != null ? p.soldiersPerAcre * n : null,
        ok: (p.goldPerAcre == null || (p.goldAvailable ?? 0) >= p.goldPerAcre * n) && (p.soldiersPerAcre == null || (p.soldiersAvailable ?? 0) >= p.soldiersPerAcre * n) && (p.maxNow == null || n <= p.maxNow),
      }))
    : []

  const costSeries = [
    { name: 'Gold per acre', color: C.amber, format: compact, points: series.map(s => ({ x: s.at, y: s.goldPerAcre })) },
  ]

  return (
    <Shell title="Exploration" eyebrow="SPARTAN // LAND INTELLIGENCE" accent={C.lime}
      subtitle="What exploring costs you right now, what you can afford and what is holding you back, built from the Exploration page you capture."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={6} />}
      {data && !p && (
        <Panel><Empty title="No exploration capture yet" hint="Open the Exploration page in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>
      )}
      {p && (
        <>
          <Grid>
            <Stat label="Can explore now" value={plan?.acres ?? p.maxNow} sub={plan ? `Limited by ${plan.limit}` : undefined} color={C.lime} delay={0} />
            <Stat label="Gold per acre" value={p.goldPerAcre} sub={p.soldiersPerAcre != null ? `${p.soldiersPerAcre} soldiers per acre` : undefined} color={C.amber} delay={1} />
            <Stat label="Uncharted acres" value={p.uncharted} sub={p.exploring ? `${fmt(p.exploring)} already exploring` : 'None exploring now'} color={C.cyan} delay={2} />
            <Stat label="Gold on hand" value={p.goldAvailable} sub={p.soldiersAvailable != null ? `${fmt(p.soldiersAvailable)} soldiers available` : undefined} color={C.violet} delay={3} />
          </Grid>

          <Grid>
            <Panel span={6} title="WHAT LIMITS YOU" sub={m?.capturedAt ? `Captured ${ago(m.capturedAt)}` : undefined}
              right={plan ? <Tag color={C.lime}>{plan.acres} ACRES NOW</Tag> : undefined}>
              {plan ? (
                <div style={row}>
                  <div>Gold pays for <b style={{ color: C.text }}>{plan.byGold != null ? fmt(plan.byGold) : '—'}</b> acres.</div>
                  <div>Soldiers cover <b style={{ color: C.text }}>{plan.bySoldiers != null ? fmt(plan.bySoldiers) : '—'}</b> acres.</div>
                  <div>The game allows <b style={{ color: C.text }}>{p.maxNow != null ? fmt(p.maxNow) : '—'}</b> acres right now (restrictions apply when lands are not built up).</div>
                  <div style={{ marginTop: 6 }}>Exploring {fmt(plan.acres)} acres costs {plan.goldCost != null ? fmt(plan.goldCost) : '—'} gold and {plan.soldierCost != null ? fmt(plan.soldierCost) : '—'} soldiers.</div>
                </div>
              ) : <Empty title="Nothing to compare yet" hint="Capture the Exploration page again to refresh these numbers." />}
            </Panel>

            <Panel span={6} title="COST BY SIZE" sub="Gold and soldiers for common sizes" delay={2}>
              <DataTable<any> columns={[
                { key: 'acres', label: 'ACRES', value: r => r.acres, align: 'right' },
                { key: 'gold', label: 'GOLD', value: r => r.gold ?? 0, render: r => (r.gold != null ? fmt(r.gold) : '—'), align: 'right' },
                { key: 'soldiers', label: 'SOLDIERS', value: r => r.soldiers ?? 0, render: r => (r.soldiers != null ? fmt(r.soldiers) : '—'), align: 'right' },
                { key: 'ok', label: 'NOW', value: r => (r.ok ? 1 : 0), render: r => (r.ok ? <Tag color={C.green}>CAN DO</Tag> : <Tag color={C.red}>SHORT</Tag>), align: 'right' },
              ]} rows={costRows} empty="No sizes to show." />
            </Panel>
          </Grid>

          {series.length > 1 && (
            <Grid>
              <Panel span={12} title="GOLD PER ACRE OVER TIME" sub="Cost climbs as your land grows" delay={3}>
                <LineChart series={costSeries} height={200} />
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
