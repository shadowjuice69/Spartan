'use client'

import JeevesSummary from '@/components/spartan/JeevesSummary'
import { useEffect, useMemo, useState } from 'react'
import {
  AllData, C, DataTable, Donut, Empty, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag, Gauge,
  PALETTE, ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'

const RACE_COLOR: Record<string, string> = {
  Orc: C.red, Human: C.blue, Elf: C.green, 'Dark Elf': C.violet, Dwarf: C.amber, Halfling: C.lime,
  Undead: '#9aa7b4', Avian: C.cyan, Gnome: C.pink, Faery: '#7ef0d0', Dryad: '#9bd16b',
}
const label = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const
const n = (v: any) => typeof v === 'number' && Number.isFinite(v) ? v : null
const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + (n(r[key]) ?? 0), 0)
const avg = (rows: any[], key: string) => rows.length ? sum(rows, key) / rows.length : null

export default function KingdomPage() {
  const [kd, setKd] = useState('')
  const [history, setHistory] = useState<any>(null)
  const { data, error, loading, reload } = usePageModel('kingdom', kd ? `&kd=${encodeURIComponent(kd)}` : '')
  const m = data?.model
  const details = m?.details
  const roster: any[] = m?.roster || []
  const provs: any[] = details?.provinces || []
  const mine = data?.province
  const hasGrid = roster.length > 0
  const rows = hasGrid ? roster : provs

  useEffect(() => {
    let alive = true
    fetch('/api/kingdom-data', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(v => { if (alive) setHistory(v) })
      .catch(() => {})
    return () => { alive = false }
  }, [data?.generatedAt, data?.kingdom])

  const raceCounts = Object.entries(rows.reduce((a: Record<string, number>, p: any) => {
    const race = p.race || 'Unknown'
    a[race] = (a[race] || 0) + 1
    return a
  }, {})) as Array<[string, number]>

  const personalityCounts = Object.entries(rows.reduce((a: Record<string, number>, p: any) => {
    const personality = p.personality || 'Unknown'
    a[personality] = (a[personality] || 0) + 1
    return a
  }, {})) as Array<[string, number]>

  const totalAcres = details?.land?.total ?? sum(rows, 'acres')
  const totalNw = details?.networth?.total ?? sum(rows, 'networth')
  const totalOff = sum(rows, 'off')
  const totalDef = sum(rows, 'def')
  const totalDefHome = sum(rows, 'defHome')
  const totalOffTpa = sum(rows, 'offTpa')
  const totalDefTpa = sum(rows, 'defTpa')
  const totalOffWpa = sum(rows, 'offWpa')
  const totalDefWpa = sum(rows, 'defWpa')
  const avgTpa = avg(rows, 'tpa')
  const avgWpa = avg(rows, 'wpa')
  const avgBe = avg(rows, 'be')
  const avgPop = avg(rows, 'popPct')
  const count = details?.totalProvinces ?? rows.length
  const known = rows.length
  const currentSnapshot = history?.latest
  const trend = Array.isArray(history?.trend) ? history.trend : []

  const latestChanges = useMemo(() => {
    return rows
      .map((r: any) => ({
        ...r,
        changeLand: n(r.deltaLand),
        changeNw: n(r.deltaNw),
        changeNwpa: n(r.deltaNwpa),
        changeGains: n(r.deltaGains),
      }))
      .filter((r: any) => r.changeLand !== null || r.changeNw !== null || r.changeGains !== null)
      .sort((a: any, b: any) => Math.abs(b.changeLand || 0) - Math.abs(a.changeLand || 0))
  }, [rows])

  const strength = totalOff + totalDef
  const offShare = strength ? totalOff / strength * 100 : 0
  const defShare = strength ? totalDef / strength * 100 : 0

  return (
    <Shell title="Kingdom Intelligence" eyebrow="SPARTAN // KINGDOM COMMAND" accent={C.cyan}
      subtitle="The complete kingdom picture: roster, military, economy, magic, thievery, science, buildings, relations, activity and historical change — assembled from Spartan intelligence."
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
            <Stat label="PROVINCES" value={count} sub={known < count ? `${known} currently observed` : details?.name ? `${details.name} · ${m.selected}` : m.selected} color={C.cyan} delay={0} />
            <Stat label="TOTAL LAND" value={totalAcres} sub={details?.landRank ? `Rank ${details.landRank.rank} of ${details.landRank.of}` : `${compact(totalAcres / (count || 1))} avg`} color={C.lime} delay={1} />
            <Stat label="TOTAL NETWORTH" value={totalNw} sub={details?.networthRank ? `Rank ${details.networthRank.rank} of ${details.networthRank.of}` : `${compact(totalNw / (count || 1))} avg`} color={C.violet} delay={2} />
            <Stat label="WAR RECORD" value={details?.wars?.won ?? null} sub={details?.wars ? `Score ${details.wars.score}` : undefined} color={C.red} delay={3} />
          </Grid>

          <Grid>
            <Stat label="KINGDOM OFFENSE" value={totalOff || null} sub={hasGrid ? `${offShare.toFixed(1)}% of known combat power` : 'From captured Intel-site roster'} color={C.red} delay={0} />
            <Stat label="KINGDOM DEFENSE" value={totalDef || null} sub={totalDefHome ? `${compact(totalDefHome)} home defense` : 'From captured Intel-site roster'} color={C.cyan} delay={1} />
            <Stat label="AVG TPA" value={avgTpa == null ? null : avgTpa.toFixed(2)} sub={totalOffTpa || totalDefTpa ? 'Modified TPA available' : 'Known provinces'} color={C.amber} delay={2} />
            <Stat label="AVG WPA" value={avgWpa == null ? null : avgWpa.toFixed(2)} sub={totalOffWpa || totalDefWpa ? 'Modified WPA available' : 'Known provinces'} color={C.green} delay={3} />
          </Grid>

          <Grid>
            <Panel span={8} title="KINGDOM STRENGTH PROFILE" sub="Current observed combat power by province" delay={1}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 14 }}>
                <div style={{ padding: 12, background: 'rgba(255,255,255,.035)', borderRadius: 10 }}>
                  <div style={label}>OFFENSE SHARE</div><b style={{ fontSize: 22, color: C.red }}>{offShare.toFixed(1)}%</b>
                </div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,.035)', borderRadius: 10 }}>
                  <div style={label}>DEFENSE SHARE</div><b style={{ fontSize: 22, color: C.cyan }}>{defShare.toFixed(1)}%</b>
                </div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,.035)', borderRadius: 10 }}>
                  <div style={label}>AVG BUILD EFFICIENCY</div><b style={{ fontSize: 22 }}>{avgBe == null ? '—' : `${avgBe.toFixed(1)}%`}</b>
                </div>
                <div style={{ padding: 12, background: 'rgba(255,255,255,.035)', borderRadius: 10 }}>
                  <div style={label}>AVG POPULATION</div><b style={{ fontSize: 22 }}>{avgPop == null ? '—' : `${avgPop.toFixed(1)}%`}</b>
                </div>
              </div>
              <HBars items={[...rows].filter(r => r.off != null || r.def != null).sort((a, b) => ((b.off || 0) + (b.def || 0)) - ((a.off || 0) + (a.def || 0))).slice(0, 16).map(r => ({
                label: r.name, value: (r.off || 0) + (r.def || 0), color: r.name === mine ? C.lime : C.cyan, highlight: r.name === mine,
              }))} />
            </Panel>
            <Panel span={4} title="FORCE BALANCE" sub="Known province combat power" delay={2}>
              <Donut slices={[
                { label: 'Offense', value: totalOff, color: C.red },
                { label: 'Defense', value: totalDef, color: C.cyan },
              ]} centerBottom="Combat" />
              <div style={{ marginTop: 8 }}>
                <Gauge value={avgBe} max={200} label="Avg BE" color={C.lime} text={avgBe == null ? '—' : `${avgBe.toFixed(0)}%`} />
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={4} title="RACE COMPOSITION" sub="Every observed province" delay={1}>
              <Donut slices={raceCounts.map(([race, value]) => ({ label: race, value, color: RACE_COLOR[race] }))} format={v => String(v)} centerBottom="Provinces" />
            </Panel>
            <Panel span={4} title="PERSONALITY COMPOSITION" sub="Every observed province" delay={2}>
              <Donut slices={personalityCounts.map(([personality, value], i) => ({ label: personality, value, color: PALETTE[i % PALETTE.length] }))} format={v => String(v)} centerBottom="Provinces" />
            </Panel>
            <Panel span={4} title="KINGDOM STATUS" sub={details?.name ? `${details.name} · ${m.selected}` : m.selected} delay={3}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={label}>STANCE</div><Tag color={C.amber}>{details?.stance || 'Unknown'}</Tag></div>
                <div><div style={label}>HONOR</div><b>{details?.honor ? fmt(details.honor.total) : '—'}</b> <span style={{ color: '#8597a8', fontSize: 11 }}>{details?.honor ? `rank ${details.honor.rank} of ${details.honor.of}` : ''}</span></div>
                <div><div style={label}>ATTITUDE</div><b>{details?.attitude?.theirs ? details.attitude.theirs.label : '—'}</b><span style={{ color: '#8597a8', fontSize: 11 }}> · theirs to us</span></div>
                <div><div style={label}>DATA FRESHNESS</div><b>{details?.capturedAt ? ago(details.capturedAt) : data?.generatedAt ? ago(data.generatedAt) : '—'}</b></div>
              </div>
            </Panel>
          </Grid>

          {trend.length > 1 && (
            <Grid>
              <Panel span={12} title="KINGDOM HISTORY" sub={`${history?.capturesAvailable || trend.length} kingdom snapshots preserved`} delay={2}>
                <LineChart series={[
                  { name: 'Land', color: C.lime, points: trend.map((x: any) => ({ x: x.capturedAt, y: n(x.totalLand) })) },
                  { name: 'Networth', color: C.violet, points: trend.map((x: any) => ({ x: x.capturedAt, y: n(x.totalNw) })) },
                ]} height={220} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginTop: 8 }}>
                  <div><span style={{ color: '#7d8fa0', fontSize: 10 }}>SNAPSHOTS</span><br /><b>{history?.capturesAvailable || trend.length}</b></div>
                  <div><span style={{ color: '#7d8fa0', fontSize: 10 }}>LATEST LAND</span><br /><b>{fmt(currentSnapshot?.totalLand ?? totalAcres)}</b></div>
                  <div><span style={{ color: '#7d8fa0', fontSize: 10 }}>LATEST NW</span><br /><b>{compact(currentSnapshot?.totalNw ?? totalNw)}</b></div>
                  <div><span style={{ color: '#7d8fa0', fontSize: 10 }}>AVG NWPA</span><br /><b>{trend[trend.length - 1]?.avgNwpa == null ? '—' : Number(trend[trend.length - 1].avgNwpa).toFixed(1)}</b></div>
                </div>
              </Panel>
            </Grid>
          )}

          {latestChanges.length > 0 && (
            <Grid>
              <Panel span={12} title="CHANGE DETECTION" sub="What moved between the two most recent kingdom snapshots" delay={2}>
                <DataTable<any> initialSort="changeLand" maxHeight={360} columns={[
                  { key: 'slot', label: '#', value: r => r.slot },
                  { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b style={{ color: r.name === mine ? C.lime : '#fff' }}>{r.name}</b> },
                  { key: 'race', label: 'RACE', value: r => r.race },
                  { key: 'changeLand', label: 'LAND Δ', value: r => r.changeLand, render: r => <span style={{ color: (r.changeLand || 0) >= 0 ? C.green : C.red }}>{r.changeLand == null ? '—' : `${r.changeLand > 0 ? '+' : ''}${fmt(r.changeLand)}`}</span>, align: 'right' },
                  { key: 'changeNw', label: 'NW Δ', value: r => r.changeNw, render: r => <span style={{ color: (r.changeNw || 0) >= 0 ? C.green : C.red }}>{r.changeNw == null ? '—' : `${r.changeNw > 0 ? '+' : ''}${compact(r.changeNw)}`}</span>, align: 'right' },
                  { key: 'changeNwpa', label: 'NWPA Δ', value: r => r.changeNwpa, render: r => r.changeNwpa == null ? '—' : `${r.changeNwpa > 0 ? '+' : ''}${r.changeNwpa.toFixed(1)}`, align: 'right' },
                  { key: 'changeGains', label: 'GAINS Δ', value: r => r.changeGains, render: r => r.changeGains == null ? '—' : `${r.changeGains > 0 ? '+' : ''}${fmt(r.changeGains)}`, align: 'right' },
                ]} rows={latestChanges} />
              </Panel>
            </Grid>
          )}

          {hasGrid && (
            <Grid>
              <Panel span={6} title="OFFENSE BY PROVINCE" sub="Intel-site SOT/SOM data" delay={2}>
                <HBars items={[...roster].filter(r => r.off != null).sort((a, b) => (b.off || 0) - (a.off || 0)).slice(0, 14).map(r => ({ label: r.name, value: r.off, color: C.red, highlight: r.name === mine }))} />
              </Panel>
              <Panel span={6} title="DEFENSE BY PROVINCE" sub="Intel-site SOT/SOM data" delay={3}>
                <HBars items={[...roster].filter(r => r.def != null).sort((a, b) => (b.def || 0) - (a.def || 0)).slice(0, 14).map(r => ({ label: r.name, value: r.def, color: C.cyan, highlight: r.name === mine }))} />
              </Panel>
            </Grid>
          )}

          {hasGrid && (
            <Grid>
              <Panel span={12} title="PROVINCE ROSTER · FULL INTEL" sub="Sortable kingdom-wide view. Existing fields remain; expanded to expose the intelligence Spartan already captures." delay={3}>
                <DataTable<any> initialSort="networth" maxHeight={560} columns={[
                  { key: 'slot', label: '#', value: r => r.slot },
                  { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b style={{ color: r.name === mine ? C.lime : '#fff' }}>{r.name}</b> },
                  { key: 'race', label: 'RACE', value: r => r.race, render: r => <span style={{ color: RACE_COLOR[r.race] }}>● {r.race}</span> },
                  { key: 'personality', label: 'PERSONALITY', value: r => r.personality },
                  { key: 'honor', label: 'HONOR', value: r => r.honor },
                  { key: 'acres', label: 'ACRES', value: r => r.acres, render: r => fmt(r.acres), align: 'right' },
                  { key: 'networth', label: 'NETWORTH', value: r => r.networth, render: r => compact(r.networth), align: 'right' },
                  { key: 'nwpa', label: 'NWPA', value: r => r.nwpa, render: r => fmt(r.nwpa), align: 'right' },
                  { key: 'off', label: 'OFF', value: r => r.off, render: r => compact(r.off), align: 'right' },
                  { key: 'def', label: 'DEF', value: r => r.def, render: r => compact(r.def), align: 'right' },
                  { key: 'defHome', label: 'HOME DEF', value: r => r.defHome, render: r => compact(r.defHome), align: 'right' },
                  { key: 'tpa', label: 'TPA', value: r => r.tpa, render: r => fmt(r.tpa), align: 'right' },
                  { key: 'wpa', label: 'WPA', value: r => r.wpa, render: r => fmt(r.wpa), align: 'right' },
                  { key: 'offTpa', label: 'MOD OFF TPA', value: r => r.offTpa, render: r => fmt(r.offTpa), align: 'right' },
                  { key: 'defTpa', label: 'MOD DEF TPA', value: r => r.defTpa, render: r => fmt(r.defTpa), align: 'right' },
                  { key: 'offWpa', label: 'MOD OFF WPA', value: r => r.offWpa, render: r => fmt(r.offWpa), align: 'right' },
                  { key: 'defWpa', label: 'MOD DEF WPA', value: r => r.defWpa, render: r => fmt(r.defWpa), align: 'right' },
                  { key: 'be', label: 'BE', value: r => r.be, render: r => r.be != null ? `${r.be}%` : '—', align: 'right' },
                  { key: 'popPct', label: 'POP', value: r => r.popPct, render: r => r.popPct != null ? `${r.popPct}%` : '—', align: 'right' },
                  { key: 'peons', label: 'PEONS', value: r => r.peons, render: r => fmt(r.peons), align: 'right' },
                  { key: 'bad', label: 'HARMFUL', value: r => r.badSpells.length, render: r => <>{r.badSpells.map((s: string) => <span key={s} style={{ marginRight: 4 }}><Tag color={C.red}>{s}</Tag></span>)}</> },
                  { key: 'good', label: 'BENEFICIAL', value: r => r.goodSpells.length, render: r => <>{r.goodSpells.map((s: string) => <span key={s} style={{ marginRight: 4 }}><Tag color={C.green}>{s}</Tag></span>)}</> },
                  { key: 'intel', label: 'INTEL', value: r => r.intelAge, render: r => <>{r.intelAge} {r.intel.map((s: string) => <span key={s} style={{ marginRight: 3 }}><Tag color={C.cyan}>{s}</Tag></span>)}</> },
                ]} rows={roster} />
              </Panel>
            </Grid>
          )}

          {details && (
            <Grid>
              <Panel span={8} title="KINGDOM DETAILS · ROSTER" sub={`Captured ${ago(details.capturedAt)} · ${details.provinces.length} provinces`} delay={3}>
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

          <Grid>
            <Panel span={12} title="INTELLIGENCE COVERAGE" sub="The Kingdom page stays a presentation layer; source records remain preserved underneath." delay={4}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8 }}>
                {[
                  ['KINGDOM', details ? 1 : 0, details?.capturedAt],
                  ['ROSTER', roster.length, roster.length ? data?.generatedAt : null],
                  ['HISTORY', history?.capturesAvailable || 0, history?.generatedAt],
                  ['PROVINCES', count, data?.generatedAt],
                ].map(([name, value, at]: any) => (
                  <div key={name} style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.035)' }}>
                    <div style={label}>{name}</div>
                    <b style={{ fontSize: 22 }}>{value}</b>
                    <div style={{ color: '#718396', fontSize: 10, marginTop: 4 }}>{at ? ago(at) : 'awaiting capture'}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </Grid>
        </>
      )}

      <JeevesSummary compact />
      {data && <AllData fields={data.fields} captures={data.captures} />}
    </Shell>
  )
}
