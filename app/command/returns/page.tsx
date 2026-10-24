'use client'

import { useEffect, useMemo, useState } from 'react'
import { C, Empty, Grid, Panel, Shell, Skeletons, Stat, Tag, usePageModel } from '@/components/spartan/ui'

type AttackEvent = {
  at: string; type: string | null; attacker: string | null; defender: string | null; targetKingdom: string | null
  direction: 'out' | 'in' | 'other'; acres: number; troops: number; returnAt?: string | null; travelHours?: number | null
}
type TrackedReturn = AttackEvent & { computedReturnAt: number; hours: number; confidence: 'reported' | 'base'; remaining: number }
const HOUR = 3_600_000
const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60
  return days ? \`\${days}d \${hours}h \${minutes}m\` : \`\${hours}h \${minutes}m \${seconds}s\`
}
const localTime = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
const typeLabel = (type: string | null) => String(type || 'attack').replace(/[_-]+/g, ' ').replace(/\b\w/g, x => x.toUpperCase())

function baseTravelHours(event: AttackEvent, ownKingdom: string) {
  const targetKingdom = String(event.targetKingdom || '').trim()
  return { hours: targetKingdom && targetKingdom === ownKingdom ? 7 : 14, confidence: 'base' as const }
}

export default function ReturnTrackerPage() {
  const { data, error, loading, reload } = usePageModel('war-room')
  const [now, setNow] = useState(Date.now())
  const model = data?.model
  const ownKingdom = String(data?.kingdom || '').trim()
  const events: AttackEvent[] = model?.events || []
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const tracked = useMemo(() => events
    .filter(e => (e.direction === 'out' || e.direction === 'in') && Number.isFinite(Date.parse(e.at)))
    .map(event => {
      const base = baseTravelHours(event, ownKingdom)
      const explicitReturn = event.returnAt ? Date.parse(event.returnAt) : NaN
      const explicitHours = Number(event.travelHours)
      const hasReturn = Number.isFinite(explicitReturn)
      const hasHours = Number.isFinite(explicitHours) && explicitHours > 0 && explicitHours <= 72
      const hours = hasHours ? explicitHours : base.hours
      const computedReturnAt = hasReturn ? explicitReturn : Date.parse(event.at) + hours * HOUR
      return { ...event, computedReturnAt, hours: hasReturn ? Math.max(0, (explicitReturn - Date.parse(event.at)) / HOUR) : hours,
        confidence: hasReturn || hasHours ? 'reported' as const : 'base' as const, remaining: computedReturnAt - now }
    })
    .filter(e => e.computedReturnAt > now - 6 * HOUR && Date.parse(e.at) < now + 5 * 60 * 1000)
    .sort((a, b) => a.computedReturnAt - b.computedReturnAt), [events, ownKingdom, now])
  const outgoing = tracked.filter(e => e.direction === 'out')
  const incoming = tracked.filter(e => e.direction === 'in')
  const next = tracked.find(e => e.remaining > 0)
  const completed = tracked.filter(e => e.remaining <= 0).length
  return (
    <Shell title="Return Time Tracker" eyebrow="SPARTAN // RETURN TRACKER" accent={C.cyan}
      subtitle="Live countdowns for our returning armies and enemy armies returning after attacks. Records persist through Spartan's saved combat Intel."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={5} />}
      {data && <>
        <Grid>
          <Stat label="Active returns" value={tracked.filter(e => e.remaining > 0).length} sub="Tracked from recorded attack events" color={C.cyan} />
          <Stat label="Our armies out" value={outgoing.filter(e => e.remaining > 0).length} sub="Outgoing attacks returning" color={C.lime} />
          <Stat label="Enemy armies out" value={incoming.filter(e => e.remaining > 0).length} sub="Incoming attacks returning" color={C.red} />
          <Stat label="Next return" value={next ? Math.max(0, Math.ceil(next.remaining / 60000)) : null} format={v => \`\${Math.floor(v / 60)}h \${v % 60}m\`} sub={next ? (next.direction === 'out' ? 'Our army returns' : 'Enemy army returns') : 'No active return countdown'} color={C.amber} />
        </Grid>
        {next && <Panel title="NEXT EXPECTED RETURN" sub={\`\${next.direction === 'out' ? 'Our army' : 'Enemy army'} · \${typeLabel(next.type)}\`}>
          <div style={{ fontSize: 34, fontWeight: 850, letterSpacing: '-.03em', color: next.direction === 'out' ? C.lime : C.red, fontVariantNumeric: 'tabular-nums' }}>{formatDuration(next.remaining)}</div>
          <div style={{ color: '#9fb0c0', fontSize: 13, marginTop: 8 }}>{next.attacker || 'Unknown attacker'} → {next.defender || 'Unknown defender'}</div>
          <div style={{ color: '#9fb0c0', fontSize: 12, marginTop: 6 }}>Expected: {localTime(next.computedReturnAt)}</div>
        </Panel>}
        <Panel title="OUR ARMIES RETURNING" sub="Outgoing attacks · earliest return first">
          {outgoing.length ? <div style={{ display: 'grid', gap: 10 }}>{outgoing.map((e, i) => <ReturnRow key={\`\${e.at}|\${e.attacker}|\${e.defender}|\${i}\`} event={e} />)}</div> : <Empty title="No outgoing return timers" hint="Outgoing attacks appear automatically when recognized combat Intel reaches War Room." />}
        </Panel>
        <Panel title="ENEMY ARMIES RETURNING" sub="Incoming attacks · earliest return first">
          {incoming.length ? <div style={{ display: 'grid', gap: 10 }}>{incoming.map((e, i) => <ReturnRow key={\`\${e.at}|\${e.attacker}|\${e.defender}|\${i}\`} event={e} />)}</div> : <Empty title="No incoming return timers" hint="Incoming attacks against your province appear here from recognized combat Intel." />}
        </Panel>
        {tracked.some(e => e.confidence === 'base') && <Panel title="TRAVEL-TIME ACCURACY" sub="Transparent estimates, never silent guesses">
          <div style={{ color: '#b8c7d5', fontSize: 13, lineHeight: 1.7 }}>
            A return time explicitly recorded in Intel takes priority. Where no duration is recorded, this tracker uses Utopia's documented base attack times: 7 hours within the same kingdom and 14 hours against another kingdom. Race, personality, Barracks, Quick Feet, attack type, war phase, net-worth adjustment and ritual modifiers can change the actual time; those modifiers are not present in the current combat event record, so these countdowns are labelled base estimates rather than exact game return times.
          </div>
        </Panel>}
        {!tracked.length && <Panel><Empty title="No attacks to track yet" hint="As new attack reports are recorded, the tracker will start countdowns automatically. It doesn't delete or modify the source Intel." /></Panel>}
        <div style={{ color: '#65788a', fontSize: 11, lineHeight: 1.6, marginTop: 4 }}>{completed ? \`\${completed} return timer(s) have elapsed in the recent window. \` : ''}Countdowns update every second. Saved attack timestamps keep timers stable after refresh.</div>
      </>}
    </Shell>
  )
}

function ReturnRow({ event }: { event: TrackedReturn }) {
  const remaining = Math.max(0, event.remaining), done = event.remaining <= 0
  return <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
        <strong style={{ fontSize: 13 }}>{event.attacker || 'Unknown'} → {event.defender || 'Unknown'}</strong>
        <Tag color={event.direction === 'out' ? C.lime : C.red}>{event.direction === 'out' ? 'OUR ARMY' : 'ENEMY ARMY'}</Tag>
        <Tag color={event.confidence === 'reported' ? C.green : C.amber}>{event.confidence === 'reported' ? 'REPORTED TIME' : 'BASE ESTIMATE'}</Tag>
      </div>
      <div style={{ color: '#8fa1b1', fontSize: 11 }}>{typeLabel(event.type)} · {event.acres ? \`\${Math.abs(event.acres)} acres\` : 'Attack report'} · {event.targetKingdom || 'Target KD unknown'}</div>
      <div style={{ color: '#8fa1b1', fontSize: 11, marginTop: 4 }}>Expected return: {localTime(event.computedReturnAt)} · Duration used: {event.hours.toFixed(2)}h</div>
    </div>
    <div style={{ textAlign: 'right', minWidth: 110 }}>
      <div style={{ color: done ? C.mute : event.direction === 'out' ? C.lime : C.red, fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{done ? 'RETURNED' : formatDuration(remaining)}</div>
      <div style={{ color: '#6f8091', fontSize: 10, marginTop: 4 }}>{done ? 'Expected time passed' : 'TIME REMAINING'}</div>
    </div>
  </div>
}
