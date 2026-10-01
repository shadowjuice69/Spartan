'use client'

import {
  AllData, C, DataTable, Donut, Empty, Gauge, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, pct, seriesFrom, usePageModel,
} from '@/components/spartan/ui'

const UNIT_COLORS = [C.amber, C.red, C.cyan, C.violet]

export default function MilitaryPage() {
  const { data, error, loading, reload } = usePageModel('military')
  const m = data?.model
  const cur = m?.current
  const history: any[] = data?.history || []
  const acres = m?.acres ?? (history.length ? history[history.length - 1].acres : null)
  const army: any[] = cur?.army || []
  const troops = army.reduce((s, u) => s + u.home + u.away, 0)
  const opa = cur?.offPoints != null && acres ? cur.offPoints / acres : null
  const dpa = cur?.defPoints != null && acres ? cur.defPoints / acres : null
  const total = (cur?.offPoints || 0) + (cur?.defPoints || 0)
  const series: any[] = m?.series || []
  const powerSeries = history.length > 1
    ? [seriesFrom(history, 'offense', 'Offense', C.red, compact), seriesFrom(history, 'defense', 'Defense', C.cyan, compact)]
    : [
        { name: 'Offense', color: C.red, format: compact, points: series.map(s => ({ x: s.at, y: s.offPoints })) },
        { name: 'Defense', color: C.cyan, format: compact, points: series.map(s => ({ x: s.at, y: s.defPoints })) },
      ]
  const t = m?.training
  const label = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const

  return (
    <Shell title="Military Command" eyebrow="SPARTAN // MILITARY INTELLIGENCE" accent={C.red}
      subtitle="Your offensive and defensive strength, army composition, efficiency and training posture, built from the Council and Military pages you capture."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !cur && (
        <Panel><Empty title="No military capture yet" hint="Open Council → Military in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>
      )}
      {cur && (
        <>
          <Grid>
            <Stat label="Offense at home" value={cur.offPoints} sub={opa != null ? `${opa.toFixed(1)} OPA` : undefined} color={C.red} delay={0} />
            <Stat label="Defense at home" value={cur.defPoints} sub={dpa != null ? `${dpa.toFixed(1)} DPA` : undefined} color={C.cyan} delay={1} />
            <Stat label="Total troops" value={troops} sub={`${cur.generals ?? '—'} generals`} color={C.lime} delay={2} />
            <Stat label="Acres" value={acres} sub={m.networth ? `${compact(m.networth)} networth` : undefined} color={C.violet} delay={3} />
          </Grid>

          <Grid>
            <Panel span={5} title="COMBAT EFFECTIVENESS" sub={m.capturedAt ? `Council · captured ${ago(m.capturedAt)}` : undefined} delay={1}>
              <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 }}>
                <Gauge value={cur.offEff} max={200} label="Offense eff." text={pct(cur.offEff)} color={C.red} />
                <Gauge value={cur.defEff} max={200} label="Defense eff." text={pct(cur.defEff)} color={C.cyan} />
                <Gauge value={cur.efficiency} max={150} label="Military eff." text={pct(cur.efficiency)} color={C.lime} sub={`Wages ${pct(cur.wageRate, 0)} of normal`} />
              </div>
            </Panel>
            <Panel span={4} title="OFFENSE VS DEFENSE" sub="Share of your total fighting points at home" delay={2}>
              <Donut slices={[{ label: 'Offense', value: cur.offPoints || 0, color: C.red }, { label: 'Defense', value: cur.defPoints || 0, color: C.cyan }]}
                centerTop={total ? `${Math.round(((cur.offPoints || 0) / total) * 100)}%` : '—'} centerBottom="Offense" />
            </Panel>
            <Panel span={3} title="POSTURE" delay={3}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={label}>DRAFT RATE</div><Tag color={t?.draft_rate === 'AGGRESSIVE' ? C.red : C.green}>{t?.draft_rate || '—'}</Tag></div>
                <div><div style={label}>DRAFT TARGET</div><b style={{ fontSize: 20 }}>{t?.draft_target != null ? `${t.draft_target}%` : '—'}</b></div>
                <div><div style={label}>NON-PEASANT POPULATION</div><b style={{ fontSize: 20 }}>{pct(cur.nonPeasantPct)}</b></div>
                <div><div style={label}>WAR HORSES</div><b style={{ fontSize: 20 }}>{fmt(cur.horses)}</b></div>
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={7} title="ARMY COMPOSITION" sub="Troops at home and away, by unit" delay={2}>
              {army.length ? (
                <HBars items={army.map((u, i) => ({ label: `${u.name} · ${u.role}`, value: u.home + u.away, color: UNIT_COLORS[i % 4], text: `${fmt(u.home)}${u.away ? ` (+${fmt(u.away)} away)` : ''}` }))} />
              ) : <Empty title="No unit data" hint="The Military council page lists your units once captured." />}
            </Panel>
            <Panel span={5} title="TROOP SHARE" delay={3}>
              <Donut slices={army.map((u, i) => ({ label: u.name, value: u.home + u.away, color: UNIT_COLORS[i % 4] }))} centerBottom="Troops" />
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="POWER OVER TIME" sub={history.length > 1 ? 'From your throne snapshots' : 'From your military council captures'} delay={3}>
              <LineChart series={powerSeries} height={230} />
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="UNIT TABLE" delay={4}>
              <DataTable<any> initialSort="total" columns={[
                { key: 'role', label: 'ROLE', value: r => r.role },
                { key: 'name', label: 'UNIT', value: r => r.name },
                { key: 'home', label: 'HOME', value: r => r.home, render: r => fmt(r.home), align: 'right' },
                { key: 'away', label: 'AWAY', value: r => r.away, render: r => fmt(r.away), align: 'right' },
                { key: 'total', label: 'TOTAL', value: r => r.home + r.away, render: r => fmt(r.home + r.away), align: 'right' },
                { key: 'share', label: 'SHARE', value: r => (troops ? (r.home + r.away) / troops : 0), render: r => pct(troops ? ((r.home + r.away) / troops) * 100 : null), align: 'right' },
              ]} rows={army} />
            </Panel>
          </Grid>
        </>
      )}
      {data && <AllData fields={data.fields} captures={data.captures} />}
    </Shell>
  )
}
