'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/* ------------------------------------------------------------------ tokens */

export const C = {
  lime: '#d8ff54', cyan: '#57e2ff', violet: '#b18cff', amber: '#ffbd66', red: '#ff6b6b',
  green: '#67f0b0', blue: '#7db7ff', pink: '#ff8fd1', mute: '#8597a8', text: '#e7eef5',
}
export const PALETTE = [C.cyan, C.lime, C.violet, C.amber, C.green, C.blue, C.pink, C.red]

export const fmt = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
export const compact = (v: any) => {
  const n = Number(v)
  if (v == null || v === '' || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}
export const pct = (v: any, d = 1) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(d)}%`)
export const signed = (v: any, d = 1) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(d)}%`)

export function ago(iso?: string | null) {
  if (!iso) return 'never'
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const shortDate = (iso?: any) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso ?? '') : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/* --------------------------------------------------------------------- css */

const CSS = `
.sp-root{min-height:100vh;display:flex;color:#e7eef5;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;
 background:radial-gradient(1100px 560px at 78% -8%,rgba(87,226,255,.09),transparent 60%),radial-gradient(900px 480px at 8% 6%,rgba(216,255,84,.06),transparent 55%),#04070c}
.sp-side{width:232px;flex-shrink:0;background:rgba(6,12,19,.94);border-right:1px solid rgba(255,255,255,.07);padding:22px 14px;position:sticky;top:0;height:100vh;overflow-y:auto}
.sp-brand{font-weight:900;letter-spacing:.2em;color:#d8ff54;font-size:15px;padding:0 8px}
.sp-brand small{display:block;font-weight:500;font-size:9px;letter-spacing:.18em;color:#66788a;margin-top:5px}
.sp-navhead{margin:24px 8px 8px;font-size:9px;letter-spacing:.2em;color:#5d6e80}
.sp-nav{display:block;width:100%;text-align:left;background:transparent;border:1px solid transparent;color:#9fb0c0;border-radius:9px;padding:9px 10px;margin-bottom:3px;font-size:12px;cursor:pointer;transition:all .15s}
.sp-nav:hover{background:rgba(255,255,255,.05);color:#fff}
.sp-nav[data-on="1"]{background:rgba(216,255,84,.09);border-color:rgba(216,255,84,.28);color:#d8ff54;font-weight:700}
.sp-main{flex:1;min-width:0;padding:26px 30px 70px;max-width:1640px}
.sp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.sp-eyebrow{font-size:10px;letter-spacing:.22em;font-weight:700}
.sp-title{font-size:30px;font-weight:800;letter-spacing:-.01em;margin:6px 0 4px;background:linear-gradient(90deg,#fff,#9fd9ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.sp-sub{color:#8597a8;font-size:13px;max-width:760px;line-height:1.5}
.sp-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,255,255,.1);border-radius:999px;font-size:11px;color:#b9c7d4;background:rgba(255,255,255,.03)}
.sp-dot{width:7px;height:7px;border-radius:50%;background:#67f0b0;box-shadow:0 0 0 0 rgba(103,240,176,.6);animation:sp-pulse 2s infinite}
.sp-btn{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#dce7ee;border-radius:9px;padding:8px 12px;font-size:11px;cursor:pointer;transition:all .15s}
.sp-btn:hover{background:rgba(255,255,255,.1)}
.sp-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;margin-bottom:14px}
.sp-panel{grid-column:span var(--span,12);position:relative;min-width:0;background:linear-gradient(180deg,rgba(15,26,39,.82),rgba(8,15,23,.82));border:1px solid rgba(255,255,255,.075);border-radius:16px;padding:18px;animation:sp-rise .55s ease both;transition:border-color .2s,transform .2s}
.sp-panel:hover{border-color:rgba(255,255,255,.15)}
.sp-ptitle{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px}
.sp-ptitle b{font-size:11px;letter-spacing:.16em;font-weight:800}
.sp-ptitle span{display:block;font-size:11px;color:#7d8fa0;margin-top:4px;font-weight:400;letter-spacing:0}
.sp-stat{grid-column:span var(--span,3);position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(15,26,39,.85),rgba(8,15,23,.85));border:1px solid rgba(255,255,255,.075);border-radius:16px;padding:16px 18px;animation:sp-rise .55s ease both}
.sp-stat::after{content:'';position:absolute;inset:0 0 auto 0;height:2px;background:var(--c,#57e2ff);opacity:.85}
.sp-stat i{font-style:normal;font-size:9px;letter-spacing:.18em;color:#7d8fa0;font-weight:700}
.sp-stat strong{display:block;font-size:28px;margin:8px 0 2px;font-weight:800;letter-spacing:-.02em;color:var(--c,#fff)}
.sp-stat em{font-style:normal;font-size:11px;color:#8597a8}
.sp-bar{display:grid;grid-template-columns:minmax(90px,1.1fr) 3fr minmax(54px,auto);align-items:center;gap:10px;margin:7px 0;font-size:12px}
.sp-bar>span:first-child{color:#c8d4df;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-track{height:10px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden}
.sp-fill{height:100%;border-radius:99px;transition:width .9s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 14px var(--c,transparent)}
.sp-bar>span:last-child{text-align:right;color:#eaf2f8;font-variant-numeric:tabular-nums}
.sp-tag{display:inline-block;padding:3px 8px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:.04em;border:1px solid var(--c,#57e2ff);color:var(--c,#57e2ff);background:rgba(255,255,255,.03);white-space:nowrap}
.sp-tablewrap{overflow:auto;border-radius:12px;border:1px solid rgba(255,255,255,.06)}
.sp-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.sp-table th{position:sticky;top:0;background:#0b1622;text-align:left;font-size:10px;letter-spacing:.1em;color:#8597a8;padding:10px 12px;cursor:pointer;white-space:nowrap;user-select:none}
.sp-table td{padding:9px 12px;border-top:1px solid rgba(255,255,255,.05);white-space:nowrap}
.sp-table tr:hover td{background:rgba(255,255,255,.035)}
.sp-empty{padding:26px;text-align:center;border:1px dashed rgba(255,255,255,.14);border-radius:14px;color:#8597a8;font-size:13px;line-height:1.6}
.sp-empty b{display:block;color:#e7eef5;margin-bottom:6px;font-size:14px}
.sp-skel{border-radius:16px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:sp-sheen 1.4s infinite;min-height:110px;grid-column:span var(--span,4)}
.sp-err{padding:14px 16px;margin-bottom:16px;border:1px solid rgba(255,107,107,.35);background:rgba(255,80,80,.07);border-radius:12px;color:#ffb3b3;font-size:13px;display:flex;justify-content:space-between;gap:12px;align-items:center}
.sp-details{margin-bottom:14px;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(10,18,28,.6)}
.sp-details summary{cursor:pointer;padding:16px 18px;font-size:11px;letter-spacing:.16em;font-weight:800;color:#b9c7d4;list-style:none}
.sp-details[open] summary{border-bottom:1px solid rgba(255,255,255,.06)}
.sp-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;padding:16px 18px}
.sp-kv div{padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.035);font-size:12px;display:flex;justify-content:space-between;gap:10px}
.sp-kv span{color:#8597a8}
.sp-legend{display:flex;flex-direction:column;gap:7px;font-size:12px;min-width:150px;flex:1}
.sp-legend div{display:flex;align-items:center;gap:8px;cursor:default;padding:3px 6px;border-radius:7px;transition:background .15s}
.sp-legend div:hover{background:rgba(255,255,255,.06)}
.sp-legend i{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.sp-legend b{margin-left:auto;font-variant-numeric:tabular-nums;color:#eaf2f8}
.sp-tip{position:absolute;pointer-events:none;z-index:5;background:rgba(5,10,16,.96);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:8px 10px;font-size:11px;white-space:nowrap;box-shadow:0 8px 30px rgba(0,0,0,.5)}
@keyframes sp-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes sp-pulse{0%{box-shadow:0 0 0 0 rgba(103,240,176,.55)}70%{box-shadow:0 0 0 8px rgba(103,240,176,0)}100%{box-shadow:0 0 0 0 rgba(103,240,176,0)}}
@keyframes sp-sheen{to{background-position:-200% 0}}
@media(max-width:1100px){.sp-panel{grid-column:span 12}.sp-stat{grid-column:span 6}.sp-skel{grid-column:span 12}}
@media(max-width:900px){.sp-root{flex-direction:column}.sp-side{position:relative;width:auto;height:auto;display:flex;flex-wrap:nowrap;overflow-x:auto;gap:4px;padding:10px;border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.sp-brand,.sp-navhead{display:none}.sp-nav{width:auto;white-space:nowrap;margin:0}.sp-main{padding:18px 14px 60px}.sp-title{font-size:24px}}
@media(max-width:520px){.sp-stat{grid-column:span 12}}
`

export function Styles() { return <style dangerouslySetInnerHTML={{ __html: CSS }} /> }

/* ------------------------------------------------------------------- shell */

const NAV_COMMAND: Array<[string, string]> = [['Command', '/'], ['Province', '/command/province'], ['Throne', '/command/throne'], ['War Room', '/command/war-room'], ['Build Lab', '/command/build-lab'], ['Draft Calc', '/command/draft-calc'], ['Wiki', '/command/wiki'], ['Tools', '/command/tools'], ['Scraper Generator', '/command/scraper']]
const NAV_INTEL: Array<[string, string]> = [['Intel', '/command/intel'], ['Kingdom', '/command/kingdom'], ['Military', '/command/military'], ['Magic', '/command/magic'], ['Thievery', '/command/thievery'], ['Science', '/command/science'], ['Buildings', '/command/buildings'], ['Enemy Intel', '/command/enemy-intel']]

export function Shell(props: {
  title: string; eyebrow: string; subtitle: string; accent: string
  data?: any; error?: string; loading?: boolean; reload?: () => void
  right?: ReactNode; children: ReactNode
}) {
  const router = useRouter()
  const path = usePathname() || ''
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 15000); return () => clearInterval(t) }, [])
  const nav = (list: Array<[string, string]>) => list.map(([label, href]) => (
    <button key={label} className="sp-nav" data-on={href === path ? '1' : '0'} onClick={() => router.push(href)}>{label}</button>
  ))
  return (
    <div className="sp-root">
      <Styles />
      <aside className="sp-side">
        <div className="sp-brand">SPARTAN<small>UTOPIA COMMAND</small></div>
        <div className="sp-navhead">COMMAND SYSTEMS</div>
        {nav(NAV_COMMAND)}
        <div className="sp-navhead">INTEL DATA</div>
        {nav(NAV_INTEL)}
      </aside>
      <main className="sp-main">
        <header className="sp-head">
          <div>
            <div className="sp-eyebrow" style={{ color: props.accent }}>{props.eyebrow}</div>
            <h1 className="sp-title">{props.title}</h1>
            <div className="sp-sub">{props.subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {props.right}
            <span className="sp-pill"><span className="sp-dot" />{props.data?.province ? `${props.data.province} (${props.data.kingdom})` : 'Spartan'}{props.data?.generatedAt ? ` · ${ago(props.data.generatedAt)}` : ''}</span>
            {props.reload && <button className="sp-btn" onClick={props.reload}>{props.loading ? 'Loading…' : 'Refresh'}</button>}
          </div>
        </header>
        {props.error && (
          <div className="sp-err"><span><b>DATA CORE NOTICE</b> · {props.error}</span>{props.reload && <button className="sp-btn" onClick={props.reload}>Retry</button>}</div>
        )}
        {props.children}
      </main>
    </div>
  )
}

export function Grid({ children }: { children: ReactNode }) { return <section className="sp-grid">{children}</section> }

export function Panel(props: { title?: string; sub?: string; right?: ReactNode; span?: number; children: ReactNode; delay?: number }) {
  const style: any = { '--span': props.span ?? 12, animationDelay: `${(props.delay ?? 0) * 60}ms` }
  return (
    <article className="sp-panel" style={style}>
      {(props.title || props.right) && (
        <div className="sp-ptitle"><div><b>{props.title}</b>{props.sub && <span>{props.sub}</span>}</div>{props.right}</div>
      )}
      {props.children}
    </article>
  )
}

export function Counter({ value, format = compact }: { value: number | null | undefined; format?: (v: number) => string }) {
  const [shown, setShown] = useState(0)
  const cur = useRef(0)
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return
    const from = cur.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 800)
      const eased = 1 - Math.pow(1 - k, 3)
      cur.current = from + (value - from) * eased
      setShown(cur.current)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{value == null || !Number.isFinite(value) ? '—' : format(shown)}</>
}

export function Stat(props: { label: string; value: number | null | undefined; sub?: string; color?: string; span?: number; format?: (v: number) => string; text?: string; delay?: number }) {
  const style: any = { '--c': props.color ?? C.cyan, '--span': props.span ?? 3, animationDelay: `${(props.delay ?? 0) * 60}ms` }
  return (
    <div className="sp-stat" style={style}>
      <i>{props.label.toUpperCase()}</i>
      <strong>{props.text != null ? props.text : <Counter value={props.value} format={props.format} />}</strong>
      <em>{props.sub ?? '\u00a0'}</em>
    </div>
  )
}

export function Tag({ children, color = C.cyan }: { children: ReactNode; color?: string }) {
  return <span className="sp-tag" style={{ '--c': color } as any}>{children}</span>
}

export function Empty(props: { title: string; hint: string }) {
  return <div className="sp-empty"><b>{props.title}</b>{props.hint}</div>
}

export function Skeletons({ count = 4 }: { count?: number }) {
  return <section className="sp-grid">{Array.from({ length: count }, (_, i) => <div key={i} className="sp-skel" style={{ '--span': i < 4 ? 3 : 6 } as any} />)}</section>
}

/* ------------------------------------------------------------------- charts */

export function HBars(props: { items: Array<{ label: string; value: number; color?: string; text?: string; highlight?: boolean }>; max?: number; format?: (v: number) => string }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t) }, [])
  const max = props.max ?? Math.max(1, ...props.items.map(i => Math.abs(i.value)))
  const f = props.format ?? compact
  return (
    <div>
      {props.items.map((item, i) => {
        const color = item.color ?? PALETTE[i % PALETTE.length]
        const w = on ? Math.max(0, Math.min(100, (Math.abs(item.value) / max) * 100)) : 0
        return (
          <div className="sp-bar" key={`${item.label}-${i}`} title={`${item.label}: ${item.text ?? f(item.value)}`}>
            <span style={item.highlight ? { color: C.lime, fontWeight: 700 } : undefined}>{item.label}</span>
            <div className="sp-track"><div className="sp-fill" style={{ width: `${w}%`, background: color, ['--c' as any]: `${color}66` }} /></div>
            <span>{item.text ?? f(item.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Donut(props: { slices: Array<{ label: string; value: number; color?: string }>; centerTop?: string; centerBottom?: string; size?: number; format?: (v: number) => string }) {
  const [active, setActive] = useState<number | null>(null)
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t) }, [])
  const slices = props.slices.filter(s => s.value > 0)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const size = props.size ?? 170
  const r = 62
  const circ = 2 * Math.PI * r
  let offset = 0
  const f = props.format ?? compact
  if (!total) return <Empty title="No data yet" hint="This chart fills once the page has been captured." />
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 160 160" width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="18" />
        {slices.map((s, i) => {
          const len = (s.value / total) * circ
          const el = (
            <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={active === i ? 22 : 18} strokeDasharray={`${on ? Math.max(0, len - 1.5) : 0} ${circ}`} strokeDashoffset={-offset}
              transform="rotate(-90 80 80)" style={{ transition: 'stroke-dasharray .9s cubic-bezier(.2,.8,.2,1), stroke-width .15s', cursor: 'pointer' }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
          )
          offset += len
          return el
        })}
        <text x="80" y="76" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800">{active != null ? f(slices[active].value) : props.centerTop ?? f(total)}</text>
        <text x="80" y="94" textAnchor="middle" fill="#8597a8" fontSize="9" letterSpacing="1.4">{(active != null ? slices[active].label : props.centerBottom ?? 'TOTAL').toUpperCase().slice(0, 16)}</text>
      </svg>
      <div className="sp-legend">
        {slices.map((s, i) => (
          <div key={s.label} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <i style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />{s.label}<b>{((s.value / total) * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Gauge(props: { value: number | null | undefined; max: number; label: string; color?: string; text?: string; sub?: string; size?: number }) {
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t) }, [])
  const size = props.size ?? 150
  const r = 58
  const circ = 2 * Math.PI * r
  const v = props.value == null || !Number.isFinite(props.value) ? 0 : Math.max(0, Math.min(props.max, props.value))
  const color = props.color ?? C.cyan
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 140 140" width={size} height={size}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="11" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" transform="rotate(-90 70 70)"
          strokeDasharray={`${on ? (v / props.max) * circ : 0} ${circ}`} style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${color}88)` }} />
        <text x="70" y="68" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800">{props.value == null ? '—' : props.text ?? String(Math.round(v))}</text>
        <text x="70" y="86" textAnchor="middle" fill="#8597a8" fontSize="8.5" letterSpacing="1.4">{props.label.toUpperCase()}</text>
      </svg>
      {props.sub && <div style={{ fontSize: 11, color: '#8597a8', marginTop: -6 }}>{props.sub}</div>}
    </div>
  )
}

export type Series = { name: string; color: string; points: Array<{ x: string; y: number | null }>; format?: (v: number) => string }

export function LineChart(props: { series: Series[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = props.height ?? 200
  const pad = { l: 46, r: 12, t: 12, b: 24 }
  const n = Math.max(0, ...props.series.map(s => s.points.length))
  const labels = props.series.find(s => s.points.length === n)?.points.map(p => p.x) ?? []
  const ys = props.series.flatMap(s => s.points.map(p => p.y)).filter((v): v is number => v != null && Number.isFinite(v))
  if (!n || !ys.length) return <Empty title="No history yet" hint="Trend lines build up as Spartan records more captures over time." />
  let lo = Math.min(...ys)
  let hi = Math.max(...ys)
  if (lo === hi) { lo -= 1; hi += 1 }
  const span = hi - lo
  lo -= span * 0.08
  hi += span * 0.08
  const X = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r))
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const ticks = [0, 0.5, 1].map(k => lo + (hi - lo) * k)
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e: any) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const x = ((e.clientX - box.left) / box.width) * W
          setHover(Math.max(0, Math.min(n - 1, Math.round(((x - pad.l) / (W - pad.l - pad.r)) * (n - 1)))))
        }}>
        <defs>
          {props.series.map((s, i) => (
            <linearGradient key={i} id={`sp-lg-${i}-${s.color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,.07)" strokeDasharray="3 5" />
            <text x={pad.l - 6} y={Y(t) + 3} textAnchor="end" fill="#6f8091" fontSize="9">{compact(t)}</text>
          </g>
        ))}
        {labels.length > 0 && <text x={pad.l} y={H - 6} fill="#6f8091" fontSize="9">{shortDate(labels[0])}</text>}
        {labels.length > 1 && <text x={W - pad.r} y={H - 6} textAnchor="end" fill="#6f8091" fontSize="9">{shortDate(labels[labels.length - 1])}</text>}
        {props.series.map((s, si) => {
          const pts = s.points.map((p, i) => (p.y == null ? null : [X(i), Y(p.y)] as [number, number])).filter(Boolean) as Array<[number, number]>
          if (!pts.length) return null
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
          const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${H - pad.b} L${pts[0][0].toFixed(1)},${H - pad.b} Z`
          return (
            <g key={s.name}>
              {pts.length > 1 && props.series.length === 1 && <path d={area} fill={`url(#sp-lg-${si}-${s.color.slice(1)})`} />}
              {pts.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 5px ${s.color}77)` }} />}
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={pts.length === 1 ? 5 : 2.6} fill={s.color} />)}
            </g>
          )
        })}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,.25)" />}
      </svg>
      {hover != null && (
        <div className="sp-tip" style={{ left: `${Math.min(72, Math.max(2, (X(hover) / W) * 100))}%`, top: 6 }}>
          <div style={{ color: '#8597a8', marginBottom: 4 }}>{shortDate(labels[hover])}</div>
          {props.series.map(s => {
            const v = s.points[hover]?.y
            return <div key={s.name} style={{ color: s.color }}>{s.name}: <b style={{ color: '#fff' }}>{v == null ? '—' : (s.format ?? fmt)(v)}</b></div>
          })}
        </div>
      )}
      {props.series.length > 1 && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4, fontSize: 11 }}>
          {props.series.map(s => <span key={s.name} style={{ color: s.color }}>● {s.name}</span>)}
        </div>
      )}
    </div>
  )
}

export function Scatter(props: { points: Array<{ x: number; y: number; label: string; color?: string; highlight?: boolean }>; xLabel: string; yLabel: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = props.height ?? 280
  const pad = { l: 52, r: 14, t: 14, b: 34 }
  const pts = props.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (pts.length < 2) return <Empty title="Not enough provinces yet" hint="Capture the kingdom page to plot every province." />
  const xs = pts.map(p => p.x); const ys = pts.map(p => p.y)
  const pr = (a: number[]) => { const lo = Math.min(...a); const hi = Math.max(...a); const s = (hi - lo) || 1; return [lo - s * 0.06, hi + s * 0.06] as const }
  const [x0, x1] = pr(xs); const [y0, y1] = pr(ys)
  const X = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r)
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b)
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {[0, 0.5, 1].map(k => (
          <g key={k}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(y0 + (y1 - y0) * k)} y2={Y(y0 + (y1 - y0) * k)} stroke="rgba(255,255,255,.07)" strokeDasharray="3 5" />
            <text x={pad.l - 6} y={Y(y0 + (y1 - y0) * k) + 3} textAnchor="end" fill="#6f8091" fontSize="9">{compact(y0 + (y1 - y0) * k)}</text>
            <text x={X(x0 + (x1 - x0) * k)} y={H - 16} textAnchor="middle" fill="#6f8091" fontSize="9">{compact(x0 + (x1 - x0) * k)}</text>
          </g>
        ))}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill="#8597a8" fontSize="9" letterSpacing="1.4">{props.xLabel.toUpperCase()}</text>
        <text x={10} y={H / 2} fill="#8597a8" fontSize="9" letterSpacing="1.4" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">{props.yLabel.toUpperCase()}</text>
        {pts.map((p, i) => (
          <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={p.highlight ? 7 : hover === i ? 7 : 4.5} fill={p.color ?? C.cyan} fillOpacity={p.highlight ? 1 : 0.75}
            stroke={p.highlight ? '#fff' : 'transparent'} strokeWidth="2" style={{ cursor: 'pointer', transition: 'r .12s' }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover != null && (
        <div className="sp-tip" style={{ left: `${Math.min(70, Math.max(2, (X(pts[hover].x) / W) * 100))}%`, top: `${Math.max(2, (Y(pts[hover].y) / H) * 100 - 14)}%` }}>
          <b>{pts[hover].label}</b><div style={{ color: '#9fb0c0' }}>{props.xLabel}: {compact(pts[hover].x)} · {props.yLabel}: {compact(pts[hover].y)}</div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- table */

export type Col<T> = { key: string; label: string; value: (row: T) => number | string | null; render?: (row: T) => ReactNode; align?: 'left' | 'right' }

export function DataTable<T>(props: { columns: Array<Col<T>>; rows: T[]; initialSort?: string; desc?: boolean; maxHeight?: number; empty?: string }) {
  const [sort, setSort] = useState(props.initialSort ?? props.columns[0]?.key)
  const [desc, setDesc] = useState(props.desc ?? true)
  const col = props.columns.find(c => c.key === sort)
  const rows = useMemo(() => {
    if (!col) return props.rows
    const out = [...props.rows]
    out.sort((a, b) => {
      const x = col.value(a); const y = col.value(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return desc ? -c : c
    })
    return out
  }, [props.rows, col, desc])
  if (!props.rows.length) return <Empty title="Nothing captured yet" hint={props.empty ?? 'Visit the matching Utopia page with the Spartan scraper running.'} />
  return (
    <div className="sp-tablewrap" style={{ maxHeight: props.maxHeight ?? 460 }}>
      <table className="sp-table">
        <thead><tr>{props.columns.map(c => (
          <th key={c.key} style={{ textAlign: c.align ?? 'left' }} onClick={() => { if (sort === c.key) setDesc(!desc); else { setSort(c.key); setDesc(true) } }}>
            {c.label}{sort === c.key ? (desc ? ' ▼' : ' ▲') : ''}
          </th>
        ))}</tr></thead>
        <tbody>{rows.map((row, i) => (
          <tr key={i}>{props.columns.map(c => <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.render ? c.render(row) : (c.value(row) ?? '—')}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------- everything we collect */

export function AllData(props: { fields?: Array<{ key: string; value: any }>; captures?: Array<{ id: string; kind: string; path: string; source: string | null; at: string }>; note?: string }) {
  return (
    <details className="sp-details">
      <summary>ALL CAPTURED DATA · {props.fields?.length ?? 0} FIELDS · {props.captures?.length ?? 0} RECENT CAPTURES</summary>
      {props.note && <div style={{ padding: '12px 18px 0', fontSize: 12, color: '#8597a8' }}>{props.note}</div>}
      {props.fields && props.fields.length > 0 && (
        <div className="sp-kv">{props.fields.map(f => <div key={f.key}><span>{f.key}</span><b>{typeof f.value === 'number' ? fmt(f.value) : String(f.value)}</b></div>)}</div>
      )}
      {props.captures && props.captures.length > 0 && (
        <div style={{ padding: '0 18px 18px' }}>
          <DataTable<any> maxHeight={320} initialSort="at" columns={[
            { key: 'at', label: 'CAPTURED', value: r => new Date(r.at).getTime(), render: r => `${shortDate(r.at)} · ${ago(r.at)}` },
            { key: 'kind', label: 'KIND', value: r => r.kind },
            { key: 'path', label: 'PAGE', value: r => r.path },
            { key: 'source', label: 'SOURCE', value: r => r.source },
          ]} rows={props.captures} />
        </div>
      )}
    </details>
  )
}

/* --------------------------------------------------------------------- data */

export function usePageModel(page: string, query = '') {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/page-models?page=${encodeURIComponent(page)}${query}`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
      setData(body)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }, [page, query])
  useEffect(() => {
    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000)
    return () => clearInterval(timer)
  }, [load])
  return { data, error, loading, reload: load }
}

export function seriesFrom(history: any[], key: string, name: string, color: string, format?: (v: number) => string): Series {
  return { name, color, format, points: (history || []).map(h => ({ x: h.observed_at, y: h[key] == null ? null : Number(h[key]) })) }
}
