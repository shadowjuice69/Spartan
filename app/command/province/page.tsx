'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import {
  AllData, C, DataTable, Donut, Empty, Gauge, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, pct, seriesFrom, usePageModel,
} from '@/components/spartan/ui'

const label = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const

export default function ProvincePage() {
  const { data, error, loading, reload } = usePageModel('province')
  const m = data?.model
  const t = m?.throne
  const f = m?.throneFields || {}
  const s = m?.state
  const history: any[] = data?.history || []
  const acres = f.acres ?? s?.land ?? t?.acres
  const nw = f.networth ?? s?.networth ?? t?.networth
  const off = f.offense ?? t?.offense
  const def = f.defense ?? t?.defense
  const pop = s?.population
  const popSlices = pop ? [
    { label: 'Peasants', value: pop.peasants || 0, color: C.cyan },
    { label: 'Army', value: Math.max(0, (pop.army || 0) - (pop.thieves || 0) - (pop.wizards || 0)), color: C.red },
    { label: 'Thieves', value: pop.thieves || 0, color: C.amber },
    { label: 'Wizards', value: pop.wizards || 0, color: C.violet },
  ] : []
  const capturedUnits = t?.unitCounts && typeof t.unitCounts === 'object' ? Object.entries(t.unitCounts as Record<string, number>) : []
  const army = (capturedUnits.length
    ? capturedUnits.map(([name, value], index) => [name, value, [C.red, C.cyan, C.violet, C.amber, C.lime, C.pink, C.blue][index % 7]] as [string, number, string])
    : [
        ['Offensive specialists', f.off_specs, C.red], ['Defensive specialists', f.def_specs, C.cyan], ['Elites', f.elites, C.violet],
        ['Soldiers', f.soldiers ?? t?.soldiers, C.amber], ['War horses', f.war_horses ?? t?.war_horses, C.lime],
        ['Thieves', f.thieves ?? t?.thieves, C.pink], ['Wizards', f.wizards ?? t?.wizards, C.blue],
      ] as Array<[string, number | null | undefined, string]>).filter(r => r[1] != null && Number.isFinite(Number(r[1]))) as Array<[string, number, string]>
  const resources = [['Gold', f.gold ?? t?.gold, C.amber], ['Food', f.food ?? t?.food, C.green], ['Runes', f.runes ?? t?.runes, C.violet], ['Peasants', f.peons ?? t?.peons, C.cyan]].filter(r => r[1] != null) as Array<[string, number, string]>
  const trends: any[] = s?.trends || []
  const net = (name: string) => trends.find(x => x.label === name)

  return (
    <Shell title={t?.province || data?.province || 'Province'} eyebrow="SPARTAN // PROVINCE OVERVIEW" accent={C.lime}
      subtitle={t ? `${t.race ?? ''} · ${t.ruler ?? ''} · ${t.date ?? ''}`.replace(/^ · | · $/g, '') : 'Your province at a glance: land, networth, forces, economy, ratios and active spells.'}
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !t && !s && <Panel><Empty title="No province capture yet" hint="Open your Throne in Utopia with the Spartan scraper running. This page fills in within seconds." /></Panel>}
      {(t || s) && (
        <>
          <Grid>
            <Stat label="Land" value={acres} sub={s?.landRank ? `Rank ${s.landRank.rank} of ${fmt(s.landRank.of)}` : undefined} color={C.lime} delay={0} />
            <Stat label="Networth" value={nw} sub={s?.networthRank ? `Rank ${s.networthRank.rank} of ${fmt(s.networthRank.of)}` : undefined} color={C.violet} delay={1} />
            <Stat label="Offense" value={off} sub={t?.ratios.offSpa != null ? `${t.ratios.offSpa} per acre` : undefined} color={C.red} delay={2} />
            <Stat label="Defense" value={def} sub={t?.ratios.defSpa != null ? `${t.ratios.defSpa} per acre` : undefined} color={C.cyan} delay={3} />
          </Grid>

          <Grid>
            <Panel span={4} title="FORCES" sub={m.throneAt ? `Throne · captured ${ago(m.throneAt)}` : undefined} delay={1}>
              <HBars items={army.map(([name, value, color]) => ({ label: name, value, color }))} />
            </Panel>
            <Panel span={4} title="POPULATION" sub={pop?.max ? `${fmt(pop.total)} of ${fmt(pop.max)} max` : undefined} delay={2}>
              {popSlices.length ? <Donut slices={popSlices} centerBottom="Population" /> : <Empty title="No state capture" hint="Open Council → State to fill this in." />}
            </Panel>
            <Panel span={4} title="HEALTH" delay={3}>
              <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 6 }}>
                <Gauge value={t?.buildingEfficiency ?? f.build_efficiency} max={130} label="Build eff." text={pct(t?.buildingEfficiency ?? f.build_efficiency, 0)} color={C.lime} size={130} />
                <Gauge value={s?.economy.employment} max={100} label="Employment" text={pct(s?.economy.employment, 0)} color={C.green} size={130} />
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={7} title="PROVINCE OVER TIME" sub="Each throne visit adds a point" delay={2}>
              <LineChart height={230} series={[seriesFrom(history, 'networth', 'Networth', C.violet, compact), seriesFrom(history, 'offense', 'Offense', C.red, compact), seriesFrom(history, 'defense', 'Defense', C.cyan, compact)]} />
            </Panel>
            <Panel span={5} title="RESOURCES" delay={3}>
              <HBars items={resources.map(([name, value, color]) => ({ label: name, value, color }))} />
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><div style={label}>DAILY INCOME</div><b style={{ fontSize: 18 }}>{fmt(s?.economy.dailyIncome)}</b></div>
                <div><div style={label}>DAILY WAGES</div><b style={{ fontSize: 18 }}>{fmt(s?.economy.dailyWages)}</b></div>
                <div><div style={label}>TRADE BALANCE</div><b style={{ fontSize: 18 }}>{fmt(t?.tradeBalance)}</b></div>
                <div><div style={label}>HONOR</div><b style={{ fontSize: 18 }}>{fmt(s?.honor)}</b></div>
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={6} title="ACTIVE SPELLS & RITUAL" delay={3}>
              {t?.ritual && (
                <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: 'rgba(177,140,255,.09)', border: '1px solid rgba(177,140,255,.3)' }}>
                  <Tag color={C.violet}>RITUAL</Tag> <b>{t.ritual.name}</b> <span style={{ color: '#8597a8' }}>· {t.ritual.effectiveness}% effective · {t.ritual.days} days left</span>
                </div>
              )}
              {t?.spells?.length ? <HBars max={Math.max(30, ...t.spells.map((x: any) => x.days))} items={t.spells.map((x: any) => ({ label: x.name, value: x.days, color: C.cyan, text: `${x.days} days` }))} />
                : <Empty title="No active spells captured" hint="Spells appear on your Throne page." />}
            </Panel>
            <Panel span={6} title="RATIOS PER ACRE" delay={4}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {t ? [['OFF SPA', t.ratios.offSpa], ['DEF SPA', t.ratios.defSpa], ['PEASANTS', t.ratios.peasantsPerAcre], ['ELITES', t.ratios.elitesPerAcre], ['THIEVES TPA', t.ratios.thievesPerAcre], ['WIZARDS WPA', t.ratios.wizardsPerAcre]].map(([k, v]) => (
                  <div key={String(k)} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.04)' }}><div style={label}>{k}</div><b style={{ fontSize: 22 }}>{v ?? '—'}</b></div>
                )) : <Empty title="No throne capture" hint="Open your Throne." />}
              </div>
              {t && <div style={{ marginTop: 12, fontSize: 12, color: '#8597a8' }}>Thieves ready {pct(t.thievesReady, 0)} · Wizards ready {pct(t.wizardsReady, 0)}</div>}
            </Panel>
          </Grid>

          {trends.length > 0 && (
            <Grid>
              <Panel span={12} title="RECENT TRENDS" sub={m.stateAt ? `Council State · captured ${ago(m.stateAt)}` : undefined} delay={4}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14, marginBottom: 14 }}>
                  {[['Net gold', net('Net Gold'), C.amber], ['Net food', net('Net Food'), C.green], ['Net runes', net('Net Runes'), C.violet], ['Peasants', net('Peasants'), C.cyan]].map(([name, row, color]: any) => row && (
                    <div key={name} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.035)' }}>
                      <div style={label}>{String(name).toUpperCase()}</div>
                      <HBars items={[{ label: 'Yesterday', value: row.yesterday, color }, { label: 'This month', value: row.month, color }, { label: 'Last month', value: row.lastMonth, color }]} />
                    </div>
                  ))}
                </div>
                <DataTable<any> initialSort="label" desc={false} columns={[
                  { key: 'label', label: 'TREND', value: r => r.label },
                  { key: 'yesterday', label: 'YESTERDAY', value: r => r.yesterday, render: r => fmt(r.yesterday), align: 'right' },
                  { key: 'month', label: 'THIS MONTH', value: r => r.month, render: r => fmt(r.month), align: 'right' },
                  { key: 'lastMonth', label: 'LAST MONTH', value: r => r.lastMonth, render: r => fmt(r.lastMonth), align: 'right' },
                ]} rows={trends} />
              </Panel>
            </Grid>
          )}
        </>
      )}
      <JeevesSummary compact />
      {data && <AllData fields={data.fields} captures={data.captures} note={t ? `Throne visits this month: ${s?.throneVisits ? `${s.throneVisits.days} of ${s.throneVisits.of}` : '—'} · Multi-attack protection: ${s?.protection ?? '—'}` : undefined} />}
    </Shell>
  )
}
