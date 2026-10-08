'use client'

import { useState } from 'react'
import { C, DataTable, Empty, Panel, Tag, fmt } from '@/components/spartan/ui'

type P = {
  key: string; name: string; acres: number | null; nw: number | null
  def: number | null; defHome: number | null; ages: { SOT: number | null }
}

// Same traditional-march math the Spartan bot uses (bot/services/attackCalculator):
//   a = tNW/yNW - 0.05 (inverted if >= 1); magic = max(0.67, a<0.9 ? a+0.1 : a)
//   GF = clamp(3*magic, 0.01, 1.35); gain = min(0.12 * targetAcres * GF * MAPf, 0.2 * yourAcres)
function estimate(yNW: number, yAcres: number, tNW: number, tAcres: number, map: number, war: boolean) {
  let a = tNW / yNW - 0.05
  if (a >= 1) a = 1 / a
  const magic = Math.max(0.67, a < 0.9 ? a + 0.1 : a)
  const gf = Math.min(1.35, Math.max(0.01, 3 * magic))
  const mapf = war ? (1 - map / 100 + 3) / 4 : 1 - map / 100
  const raw = 0.12 * tAcres * gf * mapf
  const cap = 0.2 * yAcres
  return { gain: Math.min(raw, cap), capped: raw >= cap }
}

// Range rules from the bot: smaller target needs BOTH net worth and land in 85%-117.65%, larger needs either.
function inRange(yNW: number, yAcres: number, tNW: number, tAcres: number) {
  const nwIn = tNW / yNW >= 0.85 && tNW / yNW <= 1.1765
  const landIn = tAcres / yAcres >= 0.85 && tAcres / yAcres <= 1.1765
  const smaller = tNW < yNW || tAcres < yAcres
  return smaller ? nwIn && landIn : nwIn || landIn
}

const box = { background: '#0a1118', border: '1px solid #1c2a36', color: '#e6eef6', borderRadius: 8, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' } as const
const lab = { fontSize: 10, letterSpacing: '.14em', color: '#7d8fa0', marginBottom: 4 } as const
const num = (s: string) => { const v = Number(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : 0 }
const ageText = (h: number | null) => (h === null ? '—' : h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd')

export default function PayoffPanel({ provs, mine }: { provs: P[]; mine: P[] }) {
  const [pick, setPick] = useState('')
  const [nw, setNw] = useState('')
  const [acres, setAcres] = useState('')
  const [map, setMap] = useState('0')
  const [war, setWar] = useState(false)
  const [rangeOnly, setRangeOnly] = useState(true)

  const yNW = num(nw)
  const yAcres = num(acres)
  const ready = yNW > 0 && yAcres > 0

  const rows = ready
    ? provs
        .filter(p => p.nw && p.acres)
        .filter(p => !rangeOnly || inRange(yNW, yAcres, p.nw as number, p.acres as number))
        .map(p => {
          const e = estimate(yNW, yAcres, p.nw as number, p.acres as number, Math.min(100, Math.max(0, num(map))), war)
          const def = p.defHome ?? p.def
          return { p, gain: e.gain, capped: e.capped, def, per10k: def ? e.gain / (def / 10000) : null }
        })
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 12)
    : []

  const choose = (key: string) => {
    setPick(key)
    const m = mine.find(x => x.key === key)
    if (m) { setNw(m.nw ? String(m.nw) : ''); setAcres(m.acres ? String(m.acres) : '') }
  }

  return (
    <Panel span={12} title="BIGGEST PAYOFFS" sub="Estimated acres from a traditional march, ranked by gain. Defense is shown as the cost to break them." delay={3}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        {mine.length > 0 && (
          <div>
            <div style={lab}>ATTACKING AS</div>
            <select value={pick} onChange={(e: any) => choose(e.target.value)} style={box}>
              <option value="">Enter manually</option>
              {mine.map(m => <option key={m.key} value={m.key}>{m.name}</option>)}
            </select>
          </div>
        )}
        <div><div style={lab}>YOUR NETWORTH</div><input style={box} inputMode="numeric" value={nw} onChange={(e: any) => setNw(e.target.value)} placeholder="e.g. 865387" /></div>
        <div><div style={lab}>YOUR ACRES</div><input style={box} inputMode="numeric" value={acres} onChange={(e: any) => setAcres(e.target.value)} placeholder="e.g. 4173" /></div>
        <div><div style={lab}>YOUR MAP %</div><input style={box} inputMode="numeric" value={map} onChange={(e: any) => setMap(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#8597a8', marginBottom: 12 }}>
        <label><input type="checkbox" checked={war} onChange={(e: any) => setWar(e.target.checked)} /> At war</label>
        <label><input type="checkbox" checked={rangeOnly} onChange={(e: any) => setRangeOnly(e.target.checked)} /> In range only</label>
      </div>
      {!ready ? (
        <Empty title="Add your networth and acres" hint="Pick your province above or type both numbers and the best hits appear here." />
      ) : (
        <DataTable<any> initialSort="gain" maxHeight={380} empty="No targets in range. Untick 'In range only' to see everyone." columns={[
          { key: 'name', label: 'PROVINCE', value: r => r.p.name, render: r => <b>{r.p.name}</b> },
          { key: 'gain', label: 'EST. ACRES', value: r => r.gain, render: r => <span style={{ color: C.lime }}>{fmt(Math.floor(r.gain))}{r.capped ? ' ' : ''}{r.capped && <Tag color={C.amber}>CAP</Tag>}</span>, align: 'right' },
          { key: 'def', label: 'THEIR DEF', value: r => r.def ?? 0, render: r => (r.def ? fmt(r.def) : '—'), align: 'right' },
          { key: 'per', label: 'ACRES / 10K DEF', value: r => r.per10k ?? 0, render: r => (r.per10k === null ? '—' : r.per10k.toFixed(1)), align: 'right' },
          { key: 'sot', label: 'INTEL', value: r => r.p.ages.SOT ?? 9999, render: r => ageText(r.p.ages.SOT), align: 'right' },
        ]} rows={rows} />
      )}
      <p style={{ fontSize: 10, color: '#687686', margin: '8px 0 0' }}>
        Gain depends on their size and networth against yours, not on their defense. High defense only means you need more offense to break them, so check ACRES / 10K DEF to compare value for effort. Estimate uses the bot's attack formula with no offensive mods; old intel may not match what they have now.
      </p>
    </Panel>
  )
}
