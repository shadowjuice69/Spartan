'use client'

import { useState } from 'react'
import {
  C, DataTable, Donut, Empty, Grid, HBars, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'
import PayoffPanel from '@/components/spartan/PayoffPanel'

type Ages = { SOT: number | null; SOM: number | null; Survey: number | null; SOS: number | null }
type Prov = {
  key: string; slot: string; name: string; ruler: string; race: string; personality: string; combo: string
  acres: number | null; nw: number | null; nwpa: number | null; off: number | null; def: number | null; defHome: number | null
  tpa: number | null; wpa: number | null; ages: Ages
}
type Kd = { kd: string; own: boolean; source: string; capturedAt: string; captures: number; provinces: Prov[] }
type Metric = { total: number | null; avg: number | null; perAcre: number | null }
type KdStats = { name: string; kd: string; metrics: Record<string, Metric>; be: number | null; ome: number | null; dme: number | null }
type Army = { id: string; name: string; acres: number | null; gens: number | null; off: number | null; secondsRemaining: number | null }

const PALETTE = [C.lime, C.cyan, C.amber, C.violet, C.red, C.green, '#7d8fa0', '#d0a3ff']
const sum = (list: (number | null)[]) => list.reduce<number>((s, v) => s + (v ?? 0), 0)
const dpa = (p: Prov) => { const d = p.defHome ?? p.def; return d && p.acres ? d / p.acres : null }
const fresh = (h: number | null) => (h === null ? '#4d5966' : h <= 4 ? C.lime : h <= 8 ? C.amber : C.red)
const ageText = (h: number | null) => (h === null ? '—' : h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd')
const left = (s: number | null) => (s === null || s <= 0 ? '—' : Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm')

function tally(list: Prov[], pick: (p: Prov) => string) {
  const m = new Map<string, number>()
  for (const p of list) { const k = pick(p) || 'Unknown'; m.set(k, (m.get(k) || 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))
}

export default function IntelPage() {
  const { data, error, loading, reload } = usePageModel('intel')
  const [pick, setPick] = useState<string>('')
  const m = data?.model
  const kingdoms: Kd[] = m?.kingdoms || []
  const stats: { our: KdStats | null; enemy: KdStats | null } = m?.stats || { our: null, enemy: null }
  const armies: Army[] = m?.armies || []
  const current = kingdoms.find(k => k.kd === pick) || kingdoms.find(k => !k.own) || kingdoms[0]
  const provs = current?.provinces || []

  const label = (k: Kd) => {
    if (k.own) return 'Our kingdom ' + k.kd
    if (stats.enemy?.kd === k.kd) return 'Enemy ' + k.kd
    return 'Kingdom ' + k.kd
  }
  const kdName = current ? (current.own ? stats.our?.name : stats.enemy?.kd === current.kd ? stats.enemy?.name : null) : null

  const acres = sum(provs.map(p => p.acres))
  const off = sum(provs.map(p => p.off))
  const def = sum(provs.map(p => p.defHome ?? p.def))
  const nw = sum(provs.map(p => p.nw))
  const softest = [...provs].filter(p => dpa(p) !== null).sort((a, b) => dpa(a)! - dpa(b)!).slice(0, 8)
  const known = (pickAge: (a: Ages) => number | null) => provs.filter(p => pickAge(p.ages) !== null)
  const freshShare = (pickAge: (a: Ages) => number | null) => {
    const k = known(pickAge)
    return k.length ? Math.round((k.filter(p => pickAge(p.ages)! <= 8).length / provs.length) * 100) : 0
  }
  const freshness = [
    { label: 'Throne (SOT)', value: freshShare(a => a.SOT), color: C.cyan, text: freshShare(a => a.SOT) + '% under 8h' },
    { label: 'Military (SOM)', value: freshShare(a => a.SOM), color: C.red, text: freshShare(a => a.SOM) + '% under 8h' },
    { label: 'Survey', value: freshShare(a => a.Survey), color: C.amber, text: freshShare(a => a.Survey) + '% under 8h' },
    { label: 'Science (SOS)', value: freshShare(a => a.SOS), color: C.violet, text: freshShare(a => a.SOS) + '% under 8h' },
  ]

  const compareRows = stats.our && stats.enemy ? ([
    ['Land', 'Land', false], ['Networth', 'NW', false], ['Offense', 'Off', true], ['Defense', 'Def', true], ['Thieves per acre', 'TPA', true],
  ] as [string, string, boolean][]).map(([name, key, pa]) => ({
    name,
    ours: pa ? stats.our!.metrics[key]?.perAcre ?? null : stats.our!.metrics[key]?.total ?? null,
    theirs: pa ? stats.enemy!.metrics[key]?.perAcre ?? null : stats.enemy!.metrics[key]?.total ?? null,
    unit: pa ? '/acre' : '',
  })) : []
  const eff = stats.our && stats.enemy ? [
    { name: 'Building efficiency', ours: stats.our.be, theirs: stats.enemy.be },
    { name: 'Offense efficiency', ours: stats.our.ome, theirs: stats.enemy.ome },
    { name: 'Defense efficiency', ours: stats.our.dme, theirs: stats.enemy.dme },
  ] : []
  const num = (v: number | null, d = 0) => (v === null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d }))

  const empty = data && !kingdoms.length
  const chip = (k: Kd) => (
    <button key={k.kd} onClick={() => setPick(k.kd)} style={{
      background: current?.kd === k.kd ? C.lime : 'transparent', color: current?.kd === k.kd ? '#101408' : '#aeb9c5',
      border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    }}>{label(k)}</button>
  )

  return (
    <Shell title="Intel" eyebrow="SPARTAN // INTEL" accent={C.violet}
      subtitle="Province grids from the kingdom intel site: who is in each kingdom, how strong they are, and how fresh your intel is."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {empty && (
        <Panel><Empty title="No intel grids yet" hint="Open your kingdom, Enemy or Recent page on the intel site with the scraper running. The province grid is captured from there." /></Panel>
      )}
      {data && !empty && current && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{kingdoms.map(chip)}</div>
          <p style={{ fontSize: 11, color: '#8993a1', margin: '0 2px' }}>
            {kdName ? kdName + ' · ' : ''}captured {ago(current.capturedAt)} from the intel site's {current.source === '/' ? 'kingdom' : current.source.replace('/', '')} page · {current.captures} capture{current.captures === 1 ? '' : 's'} merged
          </p>

          <Grid>
            <Stat label="Provinces" value={provs.length} sub={fmt(acres) + ' acres total'} color={C.cyan} delay={0} />
            <Stat label="Networth" value={nw} format={compact} sub={provs.length ? compact(Math.round(nw / provs.length)) + ' average' : undefined} color={C.amber} delay={1} />
            <Stat label="Offense" value={off} format={compact} sub={acres ? (off / acres).toFixed(1) + ' per acre' : undefined} color={C.red} delay={2} />
            <Stat label="Defense" value={def} format={compact} sub={acres ? (def / acres).toFixed(1) + ' per acre' : undefined} color={C.lime} delay={3} />
          </Grid>

          <Grid>
            <Panel span={7} title="PROVINCES" sub="Tap a column to sort" delay={1}>
              <DataTable<Prov> initialSort="nw" maxHeight={460} empty="No provinces in this capture." columns={[
                { key: 'slot', label: '#', value: r => Number(r.slot), render: r => r.slot },
                { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <span><b>{r.name}</b>{r.ruler ? <span style={{ color: '#687686' }}> · {r.ruler}</span> : null}</span> },
                { key: 'combo', label: 'COMBO', value: r => r.combo, render: r => <Tag color={C.violet}>{r.combo || '—'}</Tag> },
                { key: 'acres', label: 'ACRES', value: r => r.acres ?? 0, render: r => num(r.acres), align: 'right' },
                { key: 'nw', label: 'NW', value: r => r.nw ?? 0, render: r => compact(r.nw ?? 0), align: 'right' },
                { key: 'off', label: 'OFF', value: r => r.off ?? 0, render: r => compact(r.off ?? 0), align: 'right' },
                { key: 'def', label: 'DEF', value: r => r.defHome ?? r.def ?? 0, render: r => compact(r.defHome ?? r.def ?? 0), align: 'right' },
                { key: 'dpa', label: 'DPA', value: r => dpa(r) ?? 0, render: r => (dpa(r) === null ? '—' : dpa(r)!.toFixed(1)), align: 'right' },
                { key: 'tpa', label: 'TPA', value: r => r.tpa ?? 0, render: r => (r.tpa === null ? '—' : r.tpa.toFixed(2)), align: 'right' },
                { key: 'wpa', label: 'WPA', value: r => r.wpa ?? 0, render: r => (r.wpa === null ? '—' : r.wpa.toFixed(2)), align: 'right' },
                { key: 'sot', label: 'INTEL', value: r => r.ages.SOT ?? 9999, render: r => <span style={{ color: fresh(r.ages.SOT) }}>{ageText(r.ages.SOT)}</span>, align: 'right' },
              ]} rows={provs} />
            </Panel>
            <Panel span={5} title="SOFTEST TARGETS" sub="Lowest defense per acre (DPA)" delay={2}>
              <DataTable<Prov> initialSort="dpa" maxHeight={300} empty="Needs defense and acres from the grid." columns={[
                { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b>{r.name}</b> },
                { key: 'acres', label: 'ACRES', value: r => r.acres ?? 0, render: r => num(r.acres), align: 'right' },
                { key: 'dpa', label: 'DPA', value: r => dpa(r) ?? 0, render: r => <span style={{ color: C.lime }}>{dpa(r)!.toFixed(1)}</span>, align: 'right' },
                { key: 'sot', label: 'INTEL', value: r => r.ages.SOT ?? 9999, render: r => <span style={{ color: fresh(r.ages.SOT) }}>{ageText(r.ages.SOT)}</span>, align: 'right' },
              ]} rows={softest} />
              <p style={{ fontSize: 10, color: '#687686', margin: '8px 0 0' }}>Old intel (red) may not match what they have now. Refresh it before you plan a hit.</p>
            </Panel>
          </Grid>

          <Grid>
            <PayoffPanel provs={provs} mine={kingdoms.find(k => k.own)?.provinces || []} ownName={m?.ownName || null} />
          </Grid>

          <Grid>
            <Panel span={4} title="RACES" sub="By province" delay={2}>
              {provs.length ? <Donut slices={tally(provs, p => p.race)} centerTop={String(provs.length)} centerBottom="Provinces" /> : <Empty title="No data" hint="" />}
            </Panel>
            <Panel span={4} title="PERSONALITIES" sub="By province" delay={3}>
              {provs.length ? <Donut slices={tally(provs, p => p.personality)} centerTop={String(provs.length)} centerBottom="Provinces" /> : <Empty title="No data" hint="" />}
            </Panel>
            <Panel span={4} title="INTEL FRESHNESS" sub="Provinces with a scan under 8 hours old" delay={4}>
              <HBars items={freshness} />
            </Panel>
          </Grid>

          {compareRows.length > 0 && (
            <Grid>
              <Panel span={7} title="OUR KINGDOM VS ENEMY" sub={stats.our!.name + ' (' + stats.our!.kd + ') against ' + stats.enemy!.name + ' (' + stats.enemy!.kd + ')' + (m.statsAt ? ' · stats captured ' + ago(m.statsAt) : '')} delay={3}>
                <DataTable<(typeof compareRows)[number]> initialSort="name" maxHeight={300} empty="" columns={[
                  { key: 'name', label: '', value: r => r.name, render: r => <b>{r.name}</b> },
                  { key: 'ours', label: 'US', value: r => r.ours ?? 0, render: r => num(r.ours, r.unit ? 1 : 0) + r.unit, align: 'right' },
                  { key: 'theirs', label: 'THEM', value: r => r.theirs ?? 0, render: r => num(r.theirs, r.unit ? 1 : 0) + r.unit, align: 'right' },
                  { key: 'diff', label: 'US VS THEM', value: r => (r.ours && r.theirs ? r.ours / r.theirs : 0), render: r => {
                    const x = r.ours && r.theirs ? Math.round((r.ours / r.theirs - 1) * 100) : null
                    return x === null ? '—' : <span style={{ color: x >= 0 ? C.lime : C.red }}>{x > 0 ? '+' : ''}{x}%</span>
                  }, align: 'right' },
                ]} rows={compareRows} />
              </Panel>
              <Panel span={5} title="EFFICIENCY" sub="Building, offense and defense" delay={4}>
                <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                  {eff.map(r => (
                    <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ color: '#aeb9c5' }}>{r.name}</span>
                      <span><b style={{ color: C.lime }}>{r.ours === null ? '—' : r.ours.toFixed(1) + '%'}</b> <span style={{ color: '#687686' }}>vs</span> <b style={{ color: C.red }}>{r.theirs === null ? '—' : r.theirs.toFixed(1) + '%'}</b></span>
                    </div>
                  ))}
                </div>
              </Panel>
            </Grid>
          )}

          {current.own && (
            <Grid>
              <Panel span={12} title="ARMIES OUT" sub="Your kingdom's armies that are still away" delay={4}>
                <DataTable<Army> initialSort="back" maxHeight={300} empty="No armies out in the latest capture." columns={[
                  { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b>{r.name}</b> },
                  { key: 'acres', label: 'ACRES', value: r => r.acres ?? 0, render: r => num(r.acres), align: 'right' },
                  { key: 'gens', label: 'GENS', value: r => r.gens ?? 0, render: r => num(r.gens), align: 'right' },
                  { key: 'off', label: 'OFFENSE', value: r => r.off ?? 0, render: r => compact(r.off ?? 0), align: 'right' },
                  { key: 'back', label: 'HOME IN', value: r => r.secondsRemaining ?? 0, render: r => left(r.secondsRemaining), align: 'right' },
                ]} rows={armies} />
              </Panel>
            </Grid>
          )}
        </>
      )}
    </Shell>
  )
}
