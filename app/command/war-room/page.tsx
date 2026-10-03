'use client'

import {
  AllData, C, DataTable, Donut, Empty, Gauge, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, pct, usePageModel,
} from '@/components/spartan/ui'

type Ev = {
  at: string; type: string | null; attacker: string | null; defender: string | null; targetKingdom: string | null
  direction: 'out' | 'in' | 'other'
  acres: number; troops: number; thieves: number; wizards: number; gold: number; food: number; runes: number
}

const DAY = 86_400_000
const WINDOW_DAYS = 7
const CHART_DAYS = 14

const typeLabel = (t: string | null) => String(t || 'event').replace(/[_-]+/g, ' ').trim()
const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const signedCompact = (v: number) => `${v > 0 ? '+' : ''}${compact(v)}`

function topBy(list: Ev[], name: (e: Ev) => string | null, color: string) {
  const totals = new Map<string, number>()
  for (const e of list) {
    const key = name(e)
    if (!key) continue
    totals.set(key, (totals.get(key) || 0) + Math.abs(e.acres))
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, color, text: `${fmt(value)} acres` }))
}

export default function WarRoomPage() {
  const { data, error, loading, reload } = usePageModel('war-room')
  const m = data?.model
  const events: Ev[] = m?.events || []
  const mil = m?.military || null
  const kingdom = m?.kingdom || null
  const history: any[] = data?.history || []
  const acres: number | null = history.length ? history[history.length - 1].acres : null

  const now = Date.now()
  const invasions = events.filter(e => e.acres !== 0)
  const recent = invasions.filter(e => now - new Date(e.at).getTime() <= WINDOW_DAYS * DAY)
  const madeRecent = recent.filter(e => e.direction === 'out')
  const takenRecent = recent.filter(e => e.direction === 'in')
  const acresTaken = madeRecent.reduce((s, e) => s + Math.abs(e.acres), 0)
  const acresLost = takenRecent.reduce((s, e) => s + Math.abs(e.acres), 0)
  const net = acresTaken - acresLost

  const dayStarts: number[] = []
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  for (let i = CHART_DAYS - 1; i >= 0; i--) dayStarts.push(startOfToday.getTime() - i * DAY)
  const takenByDay = new Map<string, number>()
  const lostByDay = new Map<string, number>()
  for (const e of invasions) {
    const t = new Date(e.at).getTime()
    if (!Number.isFinite(t) || t < dayStarts[0]) continue
    const k = dayKey(t)
    if (e.direction === 'out') takenByDay.set(k, (takenByDay.get(k) || 0) + Math.abs(e.acres))
    if (e.direction === 'in') lostByDay.set(k, (lostByDay.get(k) || 0) + Math.abs(e.acres))
  }
  const hasFlow = takenByDay.size > 0 || lostByDay.size > 0
  const flowSeries = [
    { name: 'Acres taken', color: C.lime, format: compact, points: dayStarts.map(t => ({ x: dayLabel(t), y: takenByDay.get(dayKey(t)) || 0 })) },
    { name: 'Acres lost', color: C.red, format: compact, points: dayStarts.map(t => ({ x: dayLabel(t), y: lostByDay.get(dayKey(t)) || 0 })) },
  ]

  const youHit = topBy(invasions.filter(e => e.direction === 'out'), e => e.defender || e.targetKingdom, C.lime)
  const hitYou = topBy(invasions.filter(e => e.direction === 'in'), e => e.attacker, C.red)

  const casualties = {
    troops: events.reduce((s, e) => s + e.troops, 0),
    thieves: events.reduce((s, e) => s + e.thieves, 0),
    wizards: events.reduce((s, e) => s + e.wizards, 0),
  }

  const opa = mil?.offPoints != null && acres ? mil.offPoints / acres : null
  const dpa = mil?.defPoints != null && acres ? mil.defPoints / acres : null
  const wars: any[] = kingdom?.warHistory || []
  const resultColor = (r: string) => (/win/i.test(r) ? C.green : /los/i.test(r) ? C.red : C.amber)
  const empty = data && !events.length && !mil && !kingdom
  const label = { fontSize: 10, letterSpacing: '.16em', color: '#7d8fa0' } as const

  return (
    <Shell title="War Room" eyebrow="SPARTAN // WAR ROOM" accent={C.red}
      subtitle="Your combat picture: acres taken and lost, who you are hitting and who is hitting you, casualties, war record and military strength."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {empty && (
        <Panel><Empty title="No war data yet" hint="Attacks and operations appear here once Spartan has recorded them. Your war record fills in from Kingdom Details and your strength from the Military council page." /></Panel>
      )}
      {data && !empty && (
        <>
          <Grid>
            <Stat label={`Acres taken · ${WINDOW_DAYS}d`} value={acresTaken} sub={`${madeRecent.length} hit${madeRecent.length === 1 ? '' : 's'} made`} color={C.lime} delay={0} />
            <Stat label={`Acres lost · ${WINDOW_DAYS}d`} value={acresLost} sub={`${takenRecent.length} hit${takenRecent.length === 1 ? '' : 's'} received`} color={C.red} delay={1} />
            <Stat label={`Net acres · ${WINDOW_DAYS}d`} value={net} format={signedCompact} sub={acres != null ? `${fmt(acres)} acres now` : undefined} color={net < 0 ? C.red : C.cyan} delay={2} />
            <Stat label="War record" value={kingdom?.wars?.won ?? null} sub={kingdom?.wars?.score != null ? `War score ${fmt(kingdom.wars.score)}` : 'Kingdom Details not captured'} color={C.amber} delay={3} />
          </Grid>

          <Grid>
            <Panel span={8} title="ACRES FLOW" sub={`Daily acres taken and lost, last ${CHART_DAYS} days`} delay={1}>
              {hasFlow ? <LineChart series={flowSeries} height={230} /> : <Empty title="No invasions in this window" hint={`No acre gains or losses recorded in the last ${CHART_DAYS} days.`} />}
            </Panel>
            <Panel span={4} title="YOUR STRENGTH" sub={mil?.capturedAt ? `Military council · captured ${ago(mil.capturedAt)}` : undefined} delay={2}>
              {mil ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 8 }}>
                    <Gauge value={mil.offEff} max={200} label="Offense eff." text={pct(mil.offEff)} color={C.red} size={120} />
                    <Gauge value={mil.defEff} max={200} label="Defense eff." text={pct(mil.defEff)} color={C.cyan} size={120} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><div style={label}>OFFENSE AT HOME</div><b style={{ fontSize: 18 }}>{compact(mil.offPoints)}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{opa != null ? `${opa.toFixed(1)} OPA` : '—'}</div></div>
                    <div><div style={label}>DEFENSE AT HOME</div><b style={{ fontSize: 18 }}>{compact(mil.defPoints)}</b><div style={{ fontSize: 11, color: '#8597a8' }}>{dpa != null ? `${dpa.toFixed(1)} DPA` : '—'}</div></div>
                  </div>
                </div>
              ) : <Empty title="No military capture yet" hint="Open Council → Military with the scraper running." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={6} title="WHO YOU HIT" sub="Acres taken, by target" delay={2}>
              {youHit.length ? <HBars items={youHit} /> : <Empty title="No hits made" hint="Targets you have invaded show up here." />}
            </Panel>
            <Panel span={6} title="WHO HIT YOU" sub="Acres lost, by attacker" delay={3}>
              {hitYou.length ? <HBars items={hitYou} /> : <Empty title="No hits received" hint="Provinces that invaded you show up here." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={5} title="WAR HISTORY" sub={kingdom ? `${kingdom.code} · Kingdom Details captured ${ago(kingdom.capturedAt)}` : undefined} delay={3}>
              {wars.length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {wars.slice(0, 10).map((w, i) => (
                    <div key={`${w.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span>{w.name} <span style={{ color: '#8597a8' }}>({w.kingdom})</span></span>
                      <Tag color={resultColor(String(w.result))}>{String(w.result).toUpperCase()}</Tag>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No war history" hint="Open your Kingdom Details page with the scraper running." />}
            </Panel>
            <Panel span={4} title="CASUALTIES" sub="Units lost across recorded events" delay={4}>
              <Donut slices={[
                { label: 'Troops', value: casualties.troops, color: C.red },
                { label: 'Thieves', value: casualties.thieves, color: C.violet },
                { label: 'Wizards', value: casualties.wizards, color: C.cyan },
              ]} centerTop={compact(casualties.troops + casualties.thieves + casualties.wizards)} centerBottom="Lost" />
            </Panel>
            <Panel span={3} title="LAST 7 DAYS" delay={5}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={label}>HITS MADE</div><b style={{ fontSize: 20, color: C.lime }}>{fmt(madeRecent.length)}</b></div>
                <div><div style={label}>HITS RECEIVED</div><b style={{ fontSize: 20, color: C.red }}>{fmt(takenRecent.length)}</b></div>
                <div><div style={label}>EVENTS RECORDED</div><b style={{ fontSize: 20 }}>{fmt(events.filter(e => now - new Date(e.at).getTime() <= WINDOW_DAYS * DAY).length)}</b></div>
              </div>
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="COMBAT LOG" sub="Most recent recorded events (newest first)" delay={5}>
              <DataTable<Ev> initialSort="at" maxHeight={420} empty="Attacks and operations appear here once recorded." columns={[
                { key: 'at', label: 'WHEN', value: r => new Date(r.at).getTime(), render: r => ago(r.at) },
                { key: 'dir', label: 'SIDE', value: r => r.direction, render: r => (
                  <Tag color={r.direction === 'out' ? C.lime : r.direction === 'in' ? C.red : C.mute}>{r.direction === 'out' ? 'YOU HIT' : r.direction === 'in' ? 'HIT YOU' : 'OTHER'}</Tag>
                ) },
                { key: 'type', label: 'TYPE', value: r => typeLabel(r.type) },
                { key: 'attacker', label: 'ATTACKER', value: r => r.attacker },
                { key: 'defender', label: 'DEFENDER', value: r => r.defender },
                { key: 'kd', label: 'KD', value: r => r.targetKingdom },
                { key: 'acres', label: 'ACRES', value: r => (r.direction === 'in' ? -Math.abs(r.acres) : r.acres), render: r => (r.acres ? signedCompact(r.direction === 'in' ? -Math.abs(r.acres) : Math.abs(r.acres)) : '—'), align: 'right' },
                { key: 'troops', label: 'TROOPS LOST', value: r => r.troops, render: r => fmt(r.troops || null), align: 'right' },
              ]} rows={events.slice(0, 100)} />
            </Panel>
          </Grid>
        </>
      )}
      {data && <AllData fields={data.fields} />}
    </Shell>
  )
}
