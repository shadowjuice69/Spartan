'use client'

import { useState } from 'react'
import {
  C, DataTable, Empty, Grid, HBars, LineChart, Panel, Shell, Skeletons, Stat, Tag,
  ago, compact, fmt, usePageModel,
} from '@/components/spartan/ui'

type Party = { name: string; kd: string | null; known: boolean } | null
type Ev = {
  at: string | null; approx: boolean; gameDate: string; type: string
  attacker: Party; defender: Party; acres: number; books: number
  side: 'out' | 'in' | 'other'; text: string; order: number
}

const TYPE_LABEL: Record<string, string> = {
  invade: 'INVADE', capture: 'CAPTURE', recapture: 'RECAPTURE', ambush: 'AMBUSH', plunder: 'LOOT BOOKS', pillage: 'PILLAGE', other: 'EVENT',
}
const who = (p: Party) => (p ? `${p.name}${p.kd ? ` (${p.kd})` : ''}` : '—')

function totals(list: Ev[], pick: (e: Ev) => string | null, color: string) {
  const map = new Map<string, number>()
  for (const e of list) {
    const key = pick(e)
    if (!key || !e.acres) continue
    map.set(key, (map.get(key) || 0) + e.acres)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([label, value]) => ({ label, value, color, text: `${fmt(value)} acres` }))
}

export default function NewsPage() {
  const { data, error, loading, reload } = usePageModel('news')
  const [view, setView] = useState<'all' | 'kingdom' | 'me'>('all')
  const m = data?.model
  const all: Ev[] = m?.events || []
  const ownKd: string | null = m?.own?.kd || null

  const kdSide = (e: Ev): 'out' | 'in' | 'other' =>
    ownKd && e.attacker?.kd === ownKd ? 'out' : ownKd && e.defender?.kd === ownKd ? 'in' : 'other'
  const list = all.filter(e => view === 'all' ? true : view === 'me' ? e.side !== 'other' : kdSide(e) !== 'other')

  const acresMoved = list.reduce((s, e) => s + e.acres, 0)
  const made = list.filter(e => (view === 'me' ? e.side : kdSide(e)) === 'out')
  const taken = list.filter(e => (view === 'me' ? e.side : kdSide(e)) === 'in')
  const acresGained = made.reduce((s, e) => s + e.acres, 0)
  const acresLost = taken.reduce((s, e) => s + e.acres, 0)
  const scoped = view !== 'all'

  const byDay = new Map<string, { order: number; gained: number; lost: number; total: number }>()
  for (const e of list) {
    const d = byDay.get(e.gameDate) || { order: e.order, gained: 0, lost: 0, total: 0 }
    const side = view === 'me' ? e.side : kdSide(e)
    if (side === 'out') d.gained += e.acres
    if (side === 'in') d.lost += e.acres
    d.total += e.acres
    byDay.set(e.gameDate, d)
  }
  const days = [...byDay.entries()].sort((a, b) => a[1].order - b[1].order)
  const dayLabel = (g: string) => g.replace(/ of YR\d+/, '')
  const chart = scoped
    ? [
        { name: 'Acres gained', color: C.lime, format: compact, points: days.map(([g, d]) => ({ x: dayLabel(g), y: d.gained })) },
        { name: 'Acres lost', color: C.red, format: compact, points: days.map(([g, d]) => ({ x: dayLabel(g), y: d.lost })) },
      ]
    : [{ name: 'Acres changing hands', color: C.cyan, format: compact, points: days.map(([g, d]) => ({ x: dayLabel(g), y: d.total })) }]

  const attackers = totals(list, e => e.attacker?.name || null, C.lime)
  const victims = totals(list, e => e.defender?.name || null, C.red)

  const board = new Map<string, { kd: string; gained: number; lost: number; hits: number }>()
  const row = (kd: string) => board.get(kd) || { kd, gained: 0, lost: 0, hits: 0 }
  for (const e of list) {
    if (e.attacker?.kd) { const r = row(e.attacker.kd); r.gained += e.acres; r.hits += 1; board.set(e.attacker.kd, r) }
    if (e.defender?.kd) { const r = row(e.defender.kd); r.lost += e.acres; board.set(e.defender.kd, r) }
  }
  const scoreboard = [...board.values()].map(r => ({ ...r, net: r.gained - r.lost })).sort((a, b) => b.net - a.net)

  const empty = data && !all.length
  const chip = (id: typeof view, text: string) => (
    <button key={id} onClick={() => setView(id)} style={{
      background: view === id ? C.lime : 'transparent', color: view === id ? '#101408' : '#aeb9c5',
      border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    }}>{text}</button>
  )

  return (
    <Shell title="News" eyebrow="SPARTAN // NEWS" accent={C.cyan}
      subtitle="Who is hitting whom, and for how many acres, from the Kingdom News feed."
      data={data} error={error} loading={loading} reload={reload}>
      {!data && !error && <Skeletons count={8} />}
      {empty && (
        <Panel><Empty title="No kingdom news yet" hint="Open Kingdom News in the game with the scraper running. Hits show up here once the page has been captured." /></Panel>
      )}
      {data && !empty && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chip('all', 'Everyone')}
            {chip('kingdom', ownKd ? `My kingdom ${ownKd}` : 'My kingdom')}
            {chip('me', 'My province')}
          </div>
          <p style={{ fontSize: 11, color: '#8597a8', margin: '-4px 2px 0' }}>
            {m.latestAt ? `Latest capture ${ago(m.latestAt)}` : 'Waiting for the first usable capture'}
            {' · '}{all.length.toLocaleString('en-US')} unique events in view
          </p>

          <Grid>
            <Stat label="Hits in feed" value={list.length} sub={`${m.captures} capture${m.captures === 1 ? '' : 's'} read`} color={C.cyan} delay={0} />
            <Stat label="Acres moved" value={acresMoved} sub="Total acres changing hands" color={C.amber} delay={1} />
            <Stat label={scoped ? 'Acres gained' : 'Biggest hit'} value={scoped ? acresGained : Math.max(0, ...list.map(e => e.acres))} sub={scoped ? `${made.length} hit${made.length === 1 ? '' : 's'} made` : 'Largest single hit'} color={C.lime} delay={2} />
            <Stat label={scoped ? 'Acres lost' : 'Active kingdoms'} value={scoped ? acresLost : scoreboard.length} sub={scoped ? `${taken.length} hit${taken.length === 1 ? '' : 's'} received` : 'Kingdoms in the feed'} color={scoped ? C.red : C.violet} delay={3} />
          </Grid>

          <Grid>
            <Panel span={8} title="ACRES BY GAME DAY" sub={scoped ? 'Gained and lost per day' : 'All acres changing hands per day'} delay={1}>
              {days.length > 1 ? <LineChart series={chart} height={230} /> : <Empty title="Not enough days yet" hint="Needs hits on at least two different game days." />}
            </Panel>
            <Panel span={4} title="MOST ACTIVE" sub="Acres taken, top attackers" delay={2}>
              {attackers.length ? <HBars items={attackers} /> : <Empty title="No hits" hint="Nothing with acres in this view." />}
            </Panel>
          </Grid>

          <Grid>
            <Panel span={5} title="MOST HIT" sub="Acres lost, top targets" delay={2}>
              {victims.length ? <HBars items={victims} /> : <Empty title="No hits" hint="Nothing with acres in this view." />}
            </Panel>
            <Panel span={7} title="KINGDOM SCOREBOARD" sub="Acres gained and lost by kingdom" delay={3}>
              <DataTable<(typeof scoreboard)[number]> initialSort="net" maxHeight={300} empty="No kingdoms yet." columns={[
                { key: 'kd', label: 'KINGDOM', value: r => r.kd, render: r => <b style={{ color: r.kd === ownKd ? C.lime : undefined }}>{r.kd}{r.kd === ownKd ? ' (you)' : ''}</b> },
                { key: 'hits', label: 'HITS', value: r => r.hits, render: r => fmt(r.hits), align: 'right' },
                { key: 'gained', label: 'GAINED', value: r => r.gained, render: r => fmt(r.gained), align: 'right' },
                { key: 'lost', label: 'LOST', value: r => r.lost, render: r => fmt(r.lost), align: 'right' },
                { key: 'net', label: 'NET', value: r => r.net, render: r => <span style={{ color: r.net < 0 ? C.red : C.lime }}>{r.net > 0 ? '+' : ''}{fmt(r.net)}</span>, align: 'right' },
              ]} rows={scoreboard} />
            </Panel>
          </Grid>

          <Grid>
            <Panel span={12} title="FEED" sub={`Newest first${m.anchor ? '' : ' · dates are game dates'}`} delay={4}>
              <DataTable<Ev> initialSort="order" maxHeight={460} empty="No events in this view." columns={[
                { key: 'order', label: 'GAME DATE', value: r => r.order, render: r => r.gameDate.replace(' of ', ' ') },
                { key: 'real', label: 'WHEN', value: r => (r.at ? Date.parse(r.at) : 0), render: r => (r.at ? ago(r.at) : '—') },
                { key: 'type', label: 'TYPE', value: r => r.type, render: r => <Tag color={r.type === 'plunder' ? C.violet : r.type === 'pillage' ? C.amber : C.cyan}>{TYPE_LABEL[r.type] || 'EVENT'}</Tag> },
                { key: 'att', label: 'ATTACKER', value: r => r.attacker?.name || '', render: r => <span style={{ color: r.side === 'out' ? C.lime : undefined }}>{who(r.attacker)}</span> },
                { key: 'def', label: 'TARGET', value: r => r.defender?.name || '', render: r => <span style={{ color: r.side === 'in' ? C.red : undefined }}>{who(r.defender)}</span> },
                { key: 'amt', label: 'TAKEN', value: r => r.acres || r.books, render: r => (r.acres ? `${fmt(r.acres)} acres` : r.books ? `${fmt(r.books)} books` : '—'), align: 'right' },
              ]} rows={list} />
            </Panel>
          </Grid>
          <p style={{ fontSize: 10, color: '#687686', margin: '4px 2px 0' }}>
            The feed only shows game dates, so times are estimated to the day from your latest Throne capture. Hits from the same feed captured several times are counted once.
          </p>
        </>
      )}
    </Shell>
  )
}
