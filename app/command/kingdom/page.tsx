'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import { useState } from 'react'
import {
  AllData, C, DataTable, Donut, Empty, Grid, HBars, Panel, Scatter, Shell, Skeletons, Stat, Tag,
  PALETTE, ago, compact, fmt, pct, usePageModel,
} from '@/components/spartan/ui'

const RACE_COLOR: Record<string, string> = {
  Orc: C.red, Human: C.blue, Elf: C.green, 'Dark Elf': C.violet, Dwarf: C.amber, Halfling: C.lime, Undead: '#9aa7b4', Avian: C.cyan, Gnome: C.pink, Faery: '#7ef0d0', Dryad: '#9bd16b',
}
const label = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const

export default function KingdomPage() {
  const [kd, setKd] = useState('')
  const { data, error, loading, reload } = usePageModel('kingdom', kd ? `&kd=${encodeURIComponent(kd)}` : '')
  const m = data?.model
  const details = m?.details
  const roster: any[] = m?.roster || []
  const provs: any[] = details?.provinces || []
  const mine = data?.province
  const hasGrid = roster.length > 0
  const raceCounts = Object.entries((hasGrid ? roster : provs).reduce((a: Record<string, number>, p: any) => { a[p.race] = (a[p.race] || 0) + 1; return a }, {})) as Array<[string, number]>
  const acresList = (hasGrid ? roster.map(r => r.acres) : provs.map(p => p.acres)).filter((v: any) => v != null)
  const nwList = (hasGrid ? roster.map(r => r.networth) : provs.map(p => p.networth)).filter((v: any) => v != null)
  const totalAcres = details?.land?.total ?? acresList.reduce((s: number, v: number) => s + v, 0)
  const totalNw = details?.networth?.total ?? nwList.reduce((s: number, v: number) => s + v, 0)
  const count = details?.totalProvinces ?? (hasGrid ? roster.length : provs.length)
  const isMine = m?.selected === data?.kingdom

  return (
    <Shell title="Kingdom Intelligence" eyebrow="SPARTAN // KINGDOM ROSTER" accent={C.cyan}
      subtitle="Every province in the kingdom: size, networth, race mix, military strength and the war record, built from the Kingdom Details page and the Intel site."
      data={data} error={error} loading={loading} reload={reload}
      right={m?.available?.length > 1 ? (
        <select className="sp-btn" value={m.selected} onChange={(e: any) => setKd(e.target.value)} style={{ background: '#0b1622' }}>
          {m.available.map((c: string) => <option key={c} value={c}>{c === data.kingdom ? `${c} (yours)` : c}</option>)}
        </select>
      ) : undefined}>
      {!data && !error && <Skeletons count={8} />}
      {data && !details && !hasGrid && (
        <Panel><Empty title="No kingdom capture yet" hint="Open Kingdom → Kingdom Details in Utopia, or the Intel site, with the Spartan scraper running. This page fills in within seconds." /></Panel>
      )}
      {(details || hasGrid) && (
        <>
          <Grid>
            <Stat label="Provinces" value={count} sub={details?.name ? `${details.name} (${m.selected})` : m.selected} color={C.cyan} delay={0} />
            <Stat label="Total land" value={totalAcres} sub={details?.landRank ? `Rank ${details.landRank.rank} of ${details.landRank.of}` : `${compact(totalAcres / (count || 1))} avg`} color={C.lime} delay={1} />
            <Stat label="Total networth" value={totalNw} sub={details?.networthRank ? `Rank ${details.networthRank.rank} of ${details.networthRank.of}` : undefined} color={C.violet} delay={2} />
            <Stat label="War record" value={details?.wars?.won ?? null} sub={details?.wars ? `Score ${details.wars.score}` : undefined} color={C.red} delay={3} />
          </Grid>

          <Grid>
            <Panel span={4} title="RACE MIX" sub={isMine ? 'Your kingdom' : `Kingdom ${m.selected}`} delay={1}>
              <Donut slices={raceCounts.map(([race, n]) => ({ label: race, value: n, color: RACE_COLOR[race] }))} format={v => String(v)} centerBottom="Provinces" />
            </Panel>
            <Panel span={8} title="LAND VS NETWORTH" sub="Every province. Your own is outlined. Hover for the name." delay={2}>
              <Scatter xLabel="Acres" yLabel="Networth" points={(hasGrid ? roster : provs).map((p: any) => ({
                x: p.acres, y: p.networth, label: p.name, color: RACE_COLOR[p.race] ?? C.cyan, highlight: p.name === mine,
              })).filter((p: any) => p.x != null && p.y != null)} />
            </Panel>
          </Grid>

          {hasGrid && (
            <Grid>
              <Panel span={6} title="OFFENSE BY PROVINCE" sub="From Intel-site SOT/SOM data" delay={2}>
                <HBars items={[...roster].filter(r => r.off != null).sort((a, b) => (b.off || 0) - (a.off || 0)).slice(0, 14).map(r => ({ label: r.name, value: r.off, color: C.red, highlight: r.name === mine }))} />
              </Panel>
              <Panel span={6} title="DEFENSE BY PROVINCE" sub="From Intel-site SOT/SOM data" delay={3}>
                <HBars items={[...roster].filter(r => r.def != null).sort((a, b) => (b.def || 0) - (a.def || 0)).slice(0, 14).map(r => ({ label: r.name, value: r.def, color: C.cyan, highlight: r.name === mine }))} />
              </Panel>
            </Grid>
          )}

          {hasGrid && (
            <Grid>
              <Panel span={12} title="PROVINCE ROSTER · INTEL" sub="Sortable. Everything the Intel site shows for each province." delay={3}>
                <DataTable<any> initialSort="networth" maxHeight={520} columns={[
                  { key: 'slot', label: '#', value: r => r.slot },
                  { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b style={{ color: r.name === mine ? C.lime : '#fff' }}>{r.name}</b> },
                  { key: 'race', label: 'RACE', value: r => r.race, render: r => <span style={{ color: RACE_COLOR[r.race] }}>● {r.race}</span> },
                  { key: 'honor', label: 'HONOR', value: r => r.honor },
                  { key: 'personality', label: 'PERSONALITY', value: r => r.personality },
                  { key: 'acres', label: 'ACRES', value: r => r.acres, render: r => fmt(r.acres), align: 'right' },
                  { key: 'networth', label: 'NETWORTH', value: r => r.networth, render: r => compact(r.networth), align: 'right' },
                  { key: 'nwpa', label: 'NWPA', value: r => r.nwpa, render: r => fmt(r.nwpa), align: 'right' },
                  { key: 'off', label: 'OFF', value: r => r.off, render: r => compact(r.off), align: 'right' },
                  { key: 'def', label: 'DEF', value: r => r.def, render: r => compact(r.def), align: 'right' },
                  { key: 'tpa', label: 'TPA', value: r => r.tpa, render: r => fmt(r.tpa), align: 'right' },
                  { key: 'wpa', label: 'WPA', value: r => r.wpa, render: r => fmt(r.wpa), align: 'right' },
                  { key: 'be', label: 'BE', value: r => r.be, render: r => (r.be != null ? `${r.be}%` : '—'), align: 'right' },
                  { key: 'popPct', label: 'POP', value: r => r.popPct, render: r => (r.popPct != null ? `${r.popPct}%` : '—'), align: 'right' },
                  { key: 'bad', label: 'HARMFUL SPELLS', value: r => r.badSpells.length, render: r => <>{r.badSpells.map((s: string) => <span key={s} style={{ marginRight: 4 }}><Tag color={C.red}>{s}</Tag></span>)}</> },
                  { key: 'good', label: 'BENEFICIAL', value: r => r.goodSpells.length, render: r => <>{r.goodSpells.map((s: string) => <span key={s} style={{ marginRight: 4 }}><Tag color={C.green}>{s}</Tag></span>)}</> },
                  { key: 'intel', label: 'INTEL', value: r => r.intelAge, render: r => <>{r.intelAge} {r.intel.map((s: string) => <span key={s} style={{ marginRight: 3 }}><Tag color={C.cyan}>{s}</Tag></span>)}</> },
                ]} rows={roster} />
              </Panel>
            </Grid>
          )}

          {details && (
            <Grid>
              <Panel span={8} title="PROVINCES · KINGDOM DETAILS" sub={`Captured ${ago(details.capturedAt)}`} delay={3}>
                <DataTable<any> initialSort="networth" maxHeight={520} columns={[
                  { key: 'slot', label: '#', value: r => r.slot },
                  { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b style={{ color: r.name === mine ? C.lime : '#fff' }}>{r.name}{r.monarch ? ' (M)' : ''}{r.steward ? ' (S)' : ''}</b> },
                  { key: 'race', label: 'RACE', value: r => r.race, render: r => <span style={{ color: RACE_COLOR[r.race] }}>● {r.race}</span> },
                  { key: 'acres', label: 'LAND', value: r => r.acres, render: r => `${fmt(r.acres)}a`, align: 'right' },
                  { key: 'networth', label: 'NETWORTH', value: r => r.networth, render: r => compact(r.networth), align: 'right' },
                  { key: 'nwpa', label: 'NWPA', value: r => r.nwpa, align: 'right' },
                  { key: 'nobility', label: 'NOBILITY', value: r => r.nobility },
                  { key: 'gains', label: 'GAINS', value: r => r.gains, align: 'right' },
                ]} rows={provs} />
              </Panel>
              <Panel span={4} title="WAR & RELATIONS" delay={4}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div><div style={label}>STANCE</div><Tag color={C.amber}>{details.stance || '—'}</Tag></div>
                  <div><div style={label}>HONOR</div><b>{fmt(details.honor?.total)}</b> <span style={{ color: '#8597a8', fontSize: 11 }}>{details.honor ? `rank ${details.honor.rank} of ${details.honor.of}` : ''}</span></div>
                  <div><div style={label}>ATTITUDE TO US</div><b>{details.attitude?.theirs ? `${details.attitude.theirs.label} (${details.attitude.theirs.points})` : '—'}</b></div>
                  <div><div style={label}>OUR ATTITUDE TO THEM</div><b>{details.attitude?.ours ? `${details.attitude.ours.label} (${details.attitude.ours.points})` : '—'}</b></div>
                  <div><div style={label}>WAR HISTORY</div>
                    {details.warHistory.length ? details.warHistory.map((w: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, margin: '5px 0' }}><Tag color={w.result === 'Win' ? C.green : C.red}>{w.result}</Tag> {w.name} <span style={{ color: '#8597a8' }}>({w.kingdom})</span></div>
                    )) : <span style={{ color: '#8597a8', fontSize: 12 }}>No wars recorded</span>}
                  </div>
                </div>
              </Panel>
            </Grid>
          )}

          {details?.doctrines?.length > 0 && (
            <Grid>
              <Panel span={12} title="WAR DOCTRINES" sub="Bonuses from the race mix of the kingdom" delay={4}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
                  {details.doctrines.map((d: any, i: number) => (
                    <div key={d.race} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.035)', borderLeft: `3px solid ${RACE_COLOR[d.race] ?? PALETTE[i % PALETTE.length]}` }}>
                      <b>{d.race}</b> <span style={{ color: '#8597a8' }}>· {d.provinces} provinces</span>
                      <div style={{ fontSize: 12, color: '#b9c7d4', marginTop: 6 }}>{d.effects}</div>
                    </div>
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
