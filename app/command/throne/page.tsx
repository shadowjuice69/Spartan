'use client'

import { useState } from 'react'
import {
  C, DataTable, Empty, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'

type Spell = { name: string; daysLeft: number | null; permanent: boolean }
type Extras = {
  gameDate: string | null; nextTickMinutes: number | null; race: string | null; ruler: string | null
  tradeBalance: number | null; offPoints: number | null; offAvailable: number | null; defPoints: number | null; defHome: number | null
  thievesReadyPct: number | null; wizardsReadyPct: number | null
  spells: Spell[]; armies: { daysLeft: number; acres: number }[]
  ritual: { name: string; effectiveness: number; daysLeft: number } | null
  dragon: string | null; notices: string | null; news: string | null
}
type Snap = { id: string; at: string; province: string; kd: string; nums: Record<string, number | null>; extras: Extras }
type Prov = { name: string; own: boolean; kd: string; latest: Snap; series: ({ at: string } & Record<string, any>)[]; captures: number }

const n = (v: number | null | undefined) => (v === null || v === undefined ? null : v)
const per = (v: number | null | undefined, acres: number | null | undefined, d = 1) => (v && acres ? (v / acres).toFixed(d) : '—')
const spellColor = (s: Spell) => (s.permanent ? C.cyan : s.daysLeft !== null && s.daysLeft <= 2 ? C.red : s.daysLeft !== null && s.daysLeft <= 5 ? C.amber : C.lime)
const back = (days: number) => (days < 1 ? `${Math.max(1, Math.round(days * 24))}h` : `${days.toFixed(1)}d`)

export default function ThronePage() {
  const { data, error, loading, reload } = usePageModel('throne')
  const [pick, setPick] = useState('')
  const [metric, setMetric] = useState<'land' | 'resources'>('land')
  const provs: Prov[] = data?.model?.provinces || []
  const cur = provs.find(p => p.name === pick) || provs[0]
  const s = cur?.latest
  const nums = s?.nums || {}
  const x = s?.extras
  const acres = n(nums.acres)

  const units = [
    ['Soldiers', nums.soldiers, C.mute], ['Offensive specialists', nums.off_specs, C.red], ['Defensive specialists', nums.def_specs, C.cyan],
    ['Elites', nums.elites, C.violet], ['Thieves', nums.thieves, C.amber], ['Wizards', nums.wizards, C.lime], ['War horses', nums.war_horses, C.green],
  ].filter(([, v]) => v).map(([label, value, color]) => ({ label: String(label), value: Number(value), color: color as string, text: `${fmt(Number(value))} · ${per(Number(value), acres)}/acre` }))

  const series = cur?.series || []
  const land = [
    { name: 'Acres', color: C.lime, format: compact, points: series.map(p => ({ x: new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), y: p.acres ?? null })) },
    { name: 'Networth', color: C.cyan, format: compact, points: series.map(p => ({ x: new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), y: p.networth ?? null })) },
  ]
  const resources = [
    { name: 'Gold', color: C.amber, format: compact, points: series.map(p => ({ x: new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), y: p.gold ?? null })) },
    { name: 'Food', color: C.green, format: compact, points: series.map(p => ({ x: new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), y: p.food ?? null })) },
    { name: 'Runes', color: C.violet, format: compact, points: series.map(p => ({ x: new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), y: p.runes ?? null })) },
  ]
  const chart = metric === 'land' ? land : resources

  const chip = (p: Prov) => (
    <button key={p.name} onClick={() => setPick(p.name)} style={{
      background: cur?.name === p.name ? C.lime : 'transparent', color: cur?.name === p.name ? '#101408' : '#aeb9c5',
      border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    }}>{p.own ? `${p.name} (you)` : p.name}</button>
  )
  const small = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const

  return (
    <Shell title="Throne" eyebrow="SPARTAN // THRONE" accent={C.lime}
      subtitle="Your throne at a glance: land, resources, military, active spells, armies out and how it has changed."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {data && !provs.length && (
        <Panel><Empty title="No throne captured yet" hint="Open your Throne page in the game with the scraper running. Spartan reads your numbers, spells and armies from it." /></Panel>
      )}
      {data && cur && s && x && (
        <>
          {provs.length > 1 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{provs.map(chip)}</div>}
          <p style={{ fontSize: 11, color: '#8993a1', margin: '0 2px' }}>
            {cur.name} ({cur.kd}){x.race ? ` · ${x.race}` : ''}{x.ruler ? ` · ${x.ruler}` : ''}{x.gameDate ? ` · ${x.gameDate.replace(' of ', ' ')}` : ''} · captured {ago(s.at)} · {cur.captures} capture{cur.captures === 1 ? '' : 's'}
          </p>

          <Grid>
            <Stat label="Land" value={acres} sub={nums.build_efficiency ? `${nums.build_efficiency}% building efficiency` : undefined} color={C.lime} delay={0} />
            <Stat label="Networth" value={n(nums.networth)} format={compact} sub={nums.networth && acres ? `${(nums.networth / acres).toFixed(1)} per acre` : undefined} color={C.cyan} delay={1} />
            <Stat label="Gold" value={n(nums.gold)} format={compact} sub={x.tradeBalance !== null ? `Trade balance ${x.tradeBalance > 0 ? '+' : ''}${compact(x.tradeBalance)}` : undefined} color={C.amber} delay={2} />
            <Stat label="Peasants" value={n(nums.peons)} format={compact} sub={nums.peons && acres ? `${(nums.peons / acres).toFixed(1)} per acre` : undefined} color={C.green} delay={3} />
          </Grid>

          <Grid>
            <Panel span={7} title="MILITARY" sub="Units and per acre" delay={1}>
              {units.length ? <HBars items={units} /> : <Empty title="No unit numbers" hint="" />}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 14, marginTop: 16 }}>
                <div><div style={small}>OFFENSE POINTS</div><b style={{ fontSize: 18, color: C.red }}>{compact(x.offPoints ?? nums.offense ?? 0)}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{x.offAvailable !== null ? `${compact(x.offAvailable)} available` : '—'}</div></div>
                <div><div style={small}>DEFENSE POINTS</div><b style={{ fontSize: 18, color: C.cyan }}>{compact(x.defPoints ?? nums.defense ?? 0)}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{x.defHome !== null ? `${compact(x.defHome)} at home` : '—'}</div></div>
                <div><div style={small}>THIEVES READY</div><b style={{ fontSize: 18 }}>{x.thievesReadyPct !== null ? `${x.thievesReadyPct}%` : '—'}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{nums.tpa ? `${nums.tpa} TPA` : ''}</div></div>
                <div><div style={small}>WIZARDS READY</div><b style={{ fontSize: 18 }}>{x.wizardsReadyPct !== null ? `${x.wizardsReadyPct}%` : '—'}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{nums.wpa ? `${nums.wpa} WPA` : ''}</div></div>
              </div>
            </Panel>
            <Panel span={5} title="RESOURCES" sub="Right now" delay={2}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[['Gold', nums.gold, C.amber], ['Food', nums.food, C.green], ['Runes', nums.runes, C.violet], ['Prisoners', nums.prisoners, C.mute]].map(([label, v, color]) => (
                  <div key={String(label)}><div style={small}>{String(label).toUpperCase()}</div><b style={{ fontSize: 18, color: color as string }}>{v ? compact(Number(v)) : '—'}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{v && acres ? `${(Number(v) / acres).toFixed(1)} per acre` : ''}</div></div>
                ))}
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={7} title="ACTIVE SPELLS" sub={x.spells.length ? `${x.spells.length} running · red is under 2 days` : undefined} delay={2}>
              {x.spells.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {x.spells.map(sp => <Tag key={sp.name} color={spellColor(sp)}>{sp.name}{sp.permanent ? '' : ` · ${sp.daysLeft}d`}</Tag>)}
                </div>
              ) : <Empty title="No spells listed" hint="Spells show once the throne has been captured with the spell list visible." />}
            </Panel>
            <Panel span={5} title="ARMIES OUT" sub="Still on their way home" delay={3}>
              {x.armies.length ? (
                <DataTable<(typeof x.armies)[number]> initialSort="back" maxHeight={220} empty="" columns={[
                  { key: 'back', label: 'HOME IN', value: r => r.daysLeft, render: r => back(r.daysLeft) },
                  { key: 'acres', label: 'ACRES', value: r => r.acres, render: r => fmt(r.acres), align: 'right' },
                ]} rows={x.armies} />
              ) : <Empty title="No armies out" hint="" />}
            </Panel>
          </Grid>

          {(x.ritual || x.dragon || x.notices || (x.news && !/no new happenings/i.test(x.news))) && (
            <Grid>
              {x.ritual && (
                <Panel span={4} title="RITUAL" delay={3}>
                  <b style={{ fontSize: 16, color: C.cyan }}>{x.ritual.name}</b>
                  <div style={{ fontSize: 12, color: '#aeb9c5', marginTop: 4 }}>{x.ritual.effectiveness}% effectiveness left · lifted in {x.ritual.daysLeft} days</div>
                </Panel>
              )}
              {x.dragon && (
                <Panel span={4} title="DRAGON" delay={4}>
                  <b style={{ fontSize: 14, color: C.red }}>{x.dragon}</b>
                </Panel>
              )}
              {(x.notices || (x.news && !/no new happenings/i.test(x.news))) && (
                <Panel span={4} title="NOTICES" delay={5}>
                  {x.notices && <div style={{ fontSize: 12, color: '#aeb9c5' }}>{x.notices}</div>}
                  {x.news && !/no new happenings/i.test(x.news) && <div style={{ fontSize: 12, color: '#aeb9c5', marginTop: 6 }}>{x.news}</div>}
                </Panel>
              )}
            </Grid>
          )}

          <Grid>
            <Panel span={12} title="OVER TIME" sub={`${series.length} capture${series.length === 1 ? '' : 's'}`} delay={4}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {(['land', 'resources'] as const).map(k => (
                  <button key={k} onClick={() => setMetric(k)} style={{
                    background: metric === k ? C.lime : 'transparent', color: metric === k ? '#101408' : '#aeb9c5',
                    border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>{k === 'land' ? 'Land and networth' : 'Gold, food and runes'}</button>
                ))}
              </div>
              {series.length > 1 ? <LineChart series={chart} height={240} /> : <Empty title="Not enough captures yet" hint="Needs at least two Throne captures to draw a trend." />}
            </Panel>
          </Grid>

          {provs.length > 1 && (
            <Grid>
              <Panel span={12} title="KINGDOM THRONES" sub="Latest capture for each province" delay={5}>
                <DataTable<Prov> initialSort="nw" maxHeight={340} empty="" columns={[
                  { key: 'name', label: 'PROVINCE', value: r => r.name, render: r => <b style={{ color: r.own ? C.lime : undefined }}>{r.name}</b> },
                  { key: 'acres', label: 'ACRES', value: r => r.latest.nums.acres ?? 0, render: r => fmt(r.latest.nums.acres), align: 'right' },
                  { key: 'nw', label: 'NW', value: r => r.latest.nums.networth ?? 0, render: r => compact(r.latest.nums.networth ?? 0), align: 'right' },
                  { key: 'off', label: 'OFFENSE', value: r => r.latest.nums.offense ?? 0, render: r => compact(r.latest.nums.offense ?? 0), align: 'right' },
                  { key: 'def', label: 'DEFENSE', value: r => r.latest.nums.defense ?? 0, render: r => compact(r.latest.nums.defense ?? 0), align: 'right' },
                  { key: 'gold', label: 'GOLD', value: r => r.latest.nums.gold ?? 0, render: r => compact(r.latest.nums.gold ?? 0), align: 'right' },
                  { key: 'when', label: 'CAPTURED', value: r => Date.parse(r.latest.at), render: r => ago(r.latest.at), align: 'right' },
                ]} rows={provs} />
              </Panel>
            </Grid>
          )}
        </>
      )}
    </Shell>
  )
}
