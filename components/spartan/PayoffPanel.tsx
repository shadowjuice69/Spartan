'use client'

import { useEffect, useState } from 'react'
import { C, DataTable, Empty, Panel, Tag, fmt } from '@/components/spartan/ui'

type P = {
  key: string; name: string; kd?: string; slot?: string; acres: number | null; nw: number | null
  def: number | null; defHome: number | null; ages: { SOT: number | null }
}

// Utopia reference wiki: Traditional March starts at 12% land, has a cap of
// 20% of the smaller province, and War adds +10% combat gains. The existing
// bot-style NW/MAP estimate is retained; race, personality, doctrine, ritual,
// dragon and science modifiers are not guessed when the page model lacks them.
function estimate(yNW: number, yAcres: number, tNW: number, tAcres: number, map: number, war: boolean) {
  let a = tNW / yNW - 0.05
  if (a >= 1) a = 1 / a
  const magic = Math.max(0.67, a < 0.9 ? a + 0.1 : a)
  const gf = Math.min(1.35, Math.max(0.01, 3 * magic))
  const mapf = war ? (1 - map / 100 + 3) / 4 : 1 - map / 100
  const warf = war ? 1.10 : 1
  const raw = 0.12 * tAcres * gf * mapf * warf
  const cap = 0.2 * Math.min(yAcres, tAcres)
  return { gain: Math.min(raw, cap), capped: raw >= cap }
}

// Smaller targets must meet both NW and land limits; larger targets may meet either.
function inRange(yNW: number, yAcres: number, tNW: number, tAcres: number) {
  const nwIn = tNW / yNW >= 0.85 && tNW / yNW <= 1.1765
  const landIn = tAcres / yAcres >= 0.85 && tAcres / yAcres <= 1.1765
  const smaller = tNW < yNW || tAcres < yAcres
  return smaller ? nwIn && landIn : nwIn || landIn
}

const KEY = 'spartan.payoff.v1'
const box = { background: '#0a1118', border: '1px solid #1c2a36', color: '#e6eef6', borderRadius: 8, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' } as const
const lab = { fontSize: 10, letterSpacing: '.14em', color: '#7d8fa0', marginBottom: 4 } as const
const num = (s: string) => { const v = Number(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : 0 }
const ageText = (h: number | null) => (h === null ? '—' : h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd')

export default function PayoffPanel({ provs, mine, ownName, ownKd }: { provs: P[]; mine: P[]; ownName?: string | null; ownKd?: string | null }) {
  const [pick, setPick] = useState('')
  const [nw, setNw] = useState('')
  const [acres, setAcres] = useState('')
  const [map, setMap] = useState('0')
  const [war, setWar] = useState(false)
  const [rangeOnly, setRangeOnly] = useState(true)
  const [targetKd, setTargetKd] = useState('all')
  const [loaded, setLoaded] = useState(false)
  const [liveOwnStats, setLiveOwnStats] = useState<{ nw: number | null; acres: number | null } | null>(null)

  // The kingdom grid often contains names only. Pull the signed-in province's
  // latest Throne values so Biggest Payoffs can fill NW and land automatically.
  useEffect(() => {
    let active = true
    fetch("/api/page-models?page=throne", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!active) return
        const list = Array.isArray(j?.model?.provinces) ? j.model.provinces : []
        const match = list.find((p: any) => p.own) || list.find((p: any) =>
          String(p?.name || "").trim().toLowerCase() === String(ownName || "").trim().toLowerCase() &&
          (!ownKd || String(p?.kd || "") === ownKd)
        )
        const nw = Number(match?.latest?.nums?.networth)
        const acres = Number(match?.latest?.nums?.acres)
        if (match && (Number.isFinite(nw) || Number.isFinite(acres))) {
          setLiveOwnStats({
            nw: Number.isFinite(nw) && nw > 0 ? nw : null,
            acres: Number.isFinite(acres) && acres > 0 ? acres : null,
          })
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [ownName, ownKd])

  // Restore optional browser preferences; the calculator remains usable if storage is unavailable.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (typeof s.map === 'string') setMap(s.map)
        if (typeof s.war === 'boolean') setWar(s.war)
        if (typeof s.rangeOnly === 'boolean') setRangeOnly(s.rangeOnly)
        if (typeof s.pick === 'string') setPick(s.pick)
        if (typeof s.nw === 'string') setNw(s.nw)
        if (typeof s.acres === 'string') setAcres(s.acres)
      }
    } catch {}
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (!loaded) return
    try { window.localStorage.setItem(KEY, JSON.stringify({ map, war, rangeOnly, pick, nw, acres })) } catch {}
  }, [loaded, map, war, rangeOnly, pick, nw, acres])

  const ownInGrid = ownName ? mine.find(x => x.name.trim().toLowerCase() === ownName.trim().toLowerCase()) || null : null
  const ownSlot = ownInGrid?.slot
  const [kdMajor, kdMinor] = String(ownKd || '').split(':')
  const generatedOwnKey = ownKd && ownSlot
    ? String(Number(kdMajor)).padStart(2, '0') + String(Number(kdMinor)).padStart(2, '0') + String(Number(ownSlot)).padStart(2, '0')
    : ownKd ? ownKd + ':own' : 'own-province'
  const own: P | null = ownInGrid || (ownName ? {
    key: generatedOwnKey, name: ownName, slot: ownSlot || undefined,
    nw: liveOwnStats?.nw ?? null, acres: liveOwnStats?.acres ?? null,
    def: null, defHome: null, ages: { SOT: null },
  } : null)
  const availableMine = own && !mine.some(x => x.key === own.key) ? [own, ...mine] : mine
  const sel = pick === 'manual' ? null : availableMine.find(x => x.key === pick) || own
  const selectedIsOwn = !!sel && !!ownName && sel.name.trim().toLowerCase() === ownName.trim().toLowerCase()
  const shownNW = sel ? (sel.nw ? String(sel.nw) : selectedIsOwn && liveOwnStats?.nw ? String(liveOwnStats.nw) : '') : nw
  const shownAcres = sel ? (sel.acres ? String(sel.acres) : selectedIsOwn && liveOwnStats?.acres ? String(liveOwnStats.acres) : '') : acres
  const selectValue = pick === 'manual' ? 'manual' : availableMine.some(x => x.key === pick) ? pick : own?.key || ''

  const yNW = num(shownNW)
  const yAcres = num(shownAcres)
  const ready = yNW > 0 && yAcres > 0

  const targetKingdoms = [...new Set(provs.map(p => p.kd).filter((kd): kd is string => Boolean(kd)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const rows = ready
    ? provs
        .filter(p => targetKd === 'all' || p.kd === targetKd)
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

  const choose = (v: string) => {
    if (v === 'manual') { setNw(shownNW); setAcres(shownAcres) }
    setPick(v)
  }
  const edit = (which: 'nw' | 'acres', v: string) => {
    if (pick !== 'manual') { setNw(shownNW); setAcres(shownAcres); setPick('manual') }
    if (which === 'nw') setNw(v)
    else setAcres(v)
  }

  return (
    <Panel span={12} title="BEST GAINS" sub="Compare captured enemy provinces by estimated traditional-march land gains, with war mode and target-defense context." delay={3}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={lab}>ATTACKING AS</div>
          <select value={selectValue} onChange={(e: any) => choose(e.target.value)} style={box}>
            <option value="">{own ? `You: ${own.name}` : 'Select a province'}</option>
            <option value="manual">Enter manually</option>
            {availableMine.map(m => <option key={m.key} value={m.key}>{m.name}{m.key === own?.key ? ' — your province' : ''}</option>)}
          </select>
        </div>
        <div><div style={lab}>TARGET KINGDOM</div><select value={targetKd} onChange={(e: any) => setTargetKd(e.target.value)} style={box}><option value="all">All captured enemy kingdoms</option>{targetKingdoms.map(kd => <option key={kd} value={kd}>{kd}</option>)}</select></div>
        <div><div style={lab}>YOUR NETWORTH</div><input style={box} inputMode="numeric" value={shownNW} onChange={(e: any) => edit('nw', e.target.value)} placeholder="e.g. 865387" /></div>
        <div><div style={lab}>YOUR ACRES</div><input style={box} inputMode="numeric" value={shownAcres} onChange={(e: any) => edit('acres', e.target.value)} placeholder="e.g. 4173" /></div>
        <div><div style={lab}>YOUR MAP %</div><input style={box} inputMode="numeric" value={map} onChange={(e: any) => setMap(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#8597a8', marginBottom: 12 }}>
        <label><input type="checkbox" checked={war} onChange={(e: any) => setWar(e.target.checked)} /> At war</label>
        <label><input type="checkbox" checked={rangeOnly} onChange={(e: any) => setRangeOnly(e.target.checked)} /> In range only</label>
        {sel && <span>Using the latest captured numbers for {sel.name}.</span>}
      </div>
      {!ready ? (
        <Empty title="Add your networth and acres" hint="Pick your province above or type both numbers and the best hits appear here." />
      ) : (
        <DataTable<any> initialSort="gain" maxHeight={380} empty="No targets in range. Untick 'In range only' to see everyone." columns={[
          { key: 'kd', label: 'KD', value: r => r.p.kd || '', render: r => r.p.kd || '—' },
          { key: 'name', label: 'PROVINCE', value: r => r.p.name, render: r => <b>{r.p.name}</b> },
          { key: 'gain', label: 'EST. ACRES', value: r => r.gain, render: r => <span style={{ color: C.lime }}>{fmt(Math.floor(r.gain))}{r.capped ? ' ' : ''}{r.capped && <Tag color={C.amber}>CAP</Tag>}</span>, align: 'right' },
          { key: 'def', label: 'THEIR DEF', value: r => r.def ?? 0, render: r => (r.def ? fmt(r.def) : '—'), align: 'right' },
          { key: 'per', label: 'ACRES / 10K DEF', value: r => r.per10k ?? 0, render: r => (r.per10k === null ? '—' : r.per10k.toFixed(1)), align: 'right' },
          { key: 'sot', label: 'INTEL', value: r => r.p.ages.SOT ?? 9999, render: r => ageText(r.p.ages.SOT), align: 'right' },
        ]} rows={rows} />
      )}
      <p style={{ fontSize: 10, color: '#687686', margin: '8px 0 0' }}>
        Gain estimates use the existing bot-style traditional-march formula and captured land/networth. War mode adjusts the estimate for war MAP; it does not confirm a break. Compare defense and acres per 10K defense, and refresh stale intel before committing armies. Targets are limited to captured enemy kingdom grids; missing values are excluded rather than guessed.
      </p>
    </Panel>
  )
}
