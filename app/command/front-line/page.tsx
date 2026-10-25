'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { C, Empty, Grid, HBars, Panel, Shell, Skeletons, Stat, Tag, ago, compact, fmt } from '@/components/spartan/ui'
import { analyze, type FrontHit } from '@/lib/spartan/front-line'

type ApiBody = {
  ok?: boolean
  page?: string
  province?: string
  kingdom?: string
  days?: number
  generatedAt?: string
  hits?: FrontHit[]
  coverage?: { rows: number; lines: number; parsed: number; unparsed: number; duplicates: number; detailed: number; incoming: number; first: string | null; last: string | null }
  error?: string
}

const HOUR = 3_600_000
const WINDOWS = [
  { key: '6h', label: '6 HOURS', ms: 6 * HOUR },
  { key: '24h', label: '24 HOURS', ms: 24 * HOUR },
  { key: '3d', label: '3 DAYS', ms: 72 * HOUR },
  { key: 'all', label: 'ALL CAPTURED', ms: null },
] as const

const css = `
.fl-controls{display:flex;gap:6px;flex-wrap:wrap}
.fl-control{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);color:#9eafbf;padding:8px 11px;border-radius:9px;font-size:10px;letter-spacing:.08em;cursor:pointer}
.fl-control[data-on="1"]{border-color:rgba(216,255,84,.4);background:rgba(216,255,84,.09);color:#d8ff54}
.fl-select{background:#0b1622;color:#e7eef5;border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:8px 10px;font-size:11px;max-width:100%}
.fl-table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.fl-table th{font-size:9px;letter-spacing:.1em;color:#8597a8;text-align:left;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.09);white-space:nowrap}
.fl-table td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.045);vertical-align:top}
.fl-table tr:last-child td{border-bottom:0}
.fl-tablewrap{overflow:auto}
.fl-muted{color:#8597a8}
.fl-number{font-variant-numeric:tabular-nums;white-space:nowrap}
.fl-spark{display:flex;align-items:end;gap:3px;height:95px;padding:8px 0 2px}
.fl-sparkbar{flex:1;min-width:3px;border-radius:4px 4px 0 0;position:relative;cursor:default}
.fl-sparkbar:hover{filter:brightness(1.4)}
.fl-callout{border:1px solid rgba(87,226,255,.17);background:rgba(87,226,255,.045);border-radius:12px;padding:12px 14px;color:#b9c7d4;font-size:12px;line-height:1.6}
.fl-alert{border-color:rgba(255,107,107,.25);background:rgba(255,107,107,.055)}
.fl-kicker{font-size:9px;letter-spacing:.16em;color:#8597a8}
@media(max-width:700px){.fl-table{font-size:11px}.fl-table th,.fl-table td{padding:8px 6px}}
`

function isYou(name: string, own: string) {
  return name.trim().toLowerCase() === own.trim().toLowerCase()
}

function duration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 'now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function timeAt(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function useFrontLine(days: number) {
  const [body, setBody] = useState<ApiBody | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = useCallback(() => setRefreshKey(v => v + 1), [])
  useEffect(() => {
    let live = true
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`/api/front-line?days=${days}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json?.error || `Front Line request failed (${response.status})`)
        return json as ApiBody
      })
      .then(json => { if (live) setBody(json) })
      .catch(e => { if (live && e?.name !== 'AbortError') setError(e instanceof Error ? e.message : 'Unable to load Front Line data') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false; controller.abort() }
  }, [days, refreshKey])
  return { body, error, loading, reload }
}

function WindowPicker({ value, onChange }: { value: typeof WINDOWS[number]['key']; onChange: (v: typeof WINDOWS[number]['key']) => void }) {
  return <div className="fl-controls" aria-label="Analysis window">{WINDOWS.map(w => <button key={w.key} className="fl-control" data-on={value === w.key ? '1' : '0'} onClick={() => onChange(w.key)}>{w.label}</button>)}</div>
}

export default function FrontLinePage() {
  const [days, setDays] = useState(14)
  const [windowKey, setWindowKey] = useState<typeof WINDOWS[number]['key']>('24h')
  const [enemyKd, setEnemyKd] = useState('all')
  const [now, setNow] = useState(Date.now())
  const { body, error, loading, reload } = useFrontLine(days)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const hits = body?.hits ?? []
  const fronts = useMemo(() => analyze(hits, { now, windowMs: null, enemyKd: null }).fronts, [hits, now])
  const chosenWindow = WINDOWS.find(w => w.key === windowKey) ?? WINDOWS[1]
  const analysis = useMemo(() => analyze(hits, { now, windowMs: chosenWindow.ms, enemyKd: enemyKd === 'all' ? null : enemyKd }), [hits, now, chosenWindow.ms, enemyKd])
  const t = analysis.totals
  const previous = analysis.previous
  const change = (current: number, prior: number) => prior === 0 ? (current > 0 ? 'new activity vs prior window' : 'no activity in either window') : `${current >= prior ? '+' : ''}${((current - prior) / Math.abs(prior) * 100).toFixed(0)}% vs prior window`
  const latest = [...hits].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  const activeAttackers = new Set(hits.filter(h => h.side === 'in' && now - Date.parse(h.at) <= 24 * HOUR).map(h => h.attacker)).size
  const hotTarget = analysis.targets[0]
  const mostActiveEnemy = analysis.aggressors[0]
  const maxTempo = Math.max(1, ...analysis.tempo.map(b => b.in + b.out))
  const data = body ? { ...body, province: body.province, kingdom: body.kingdom, generatedAt: body.generatedAt } : undefined

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <Shell
        title="Front Line"
        eyebrow="WAR INTELLIGENCE / LIVE FRONT"
        subtitle="A kingdom-wide view of attacks, land swing, enemy pressure, target breakpoints and the next returning wave. Built from parsed Discord bot news captures."
        accent={C.lime}
        data={data}
        error={error}
        loading={loading}
        reload={reload}
        right={<><WindowPicker value={windowKey} onChange={setWindowKey} /><select className="fl-select" aria-label="Enemy kingdom" value={enemyKd} onChange={e => setEnemyKd(e.target.value)}><option value="all">All enemy kingdoms</option>{fronts.map(f => <option key={f.kd} value={f.kd}>{f.kd}</option>)}</select></>}
      >
        {loading && !body ? <Skeletons count={6} /> : (
          <>
            <Grid>
              <Stat label="Land taken" value={t.acresTaken} sub={change(t.acresTaken, previous.acresTaken)} color={C.lime} delay={0} />
              <Stat label="Land lost" value={t.acresLost} sub={change(t.acresLost, previous.acresLost)} color={C.red} delay={1} />
              <Stat label="Net land swing" value={t.net} sub={`${t.net >= 0 ? 'Ahead' : 'Behind'} in acres this window`} color={t.net >= 0 ? C.green : C.red} delay={2} />
              <Stat label="Incoming hits" value={t.inHits} sub={`${activeAttackers} attackers active in 24h`} color={C.amber} delay={3} />
              <Stat label="Outgoing hits" value={t.outHits} sub={change(t.outHits, previous.hits)} color={C.cyan} delay={4} />
              <Stat label="Offense committed" value={t.opSent} sub={`${t.acresPerKop == null ? 'No detailed OP yet' : `${t.acresPerKop.toFixed(2)} acres per 1K OP`}`} color={C.violet} format={compact} delay={5} />
              <Stat label="Estimated wasted OP" value={t.wasteOp} sub={t.wastePct == null ? 'Needs repeated detailed hits' : `${t.wastePct.toFixed(1)}% of recorded OP`} color={C.amber} format={compact} delay={6} />
              <Stat label="Units lost attacking" value={t.unitsLost} sub={`${fmt(t.kills)} enemy units killed`} color={C.blue} delay={7} />
            </Grid>

            <Grid>
              <Panel title="WAR PULSE" sub={`Hit tempo · ${chosenWindow.label} · each bar is one time bucket`} span={8}>
                {analysis.tempo.length ? (
                  <>
                    <div className="fl-spark" aria-label="Hit tempo chart">
                      {analysis.tempo.map((b, i) => {
                        const total = b.in + b.out
                        const height = Math.max(total ? 8 : 2, total / maxTempo * 82)
                        return <div key={b.t0} className="fl-sparkbar" title={`${timeAt(b.t1)} · ${b.out} out / ${b.in} in · ${fmt(b.acresOut)} taken / ${fmt(b.acresIn)} lost`} style={{ height, background: total ? (b.in >= b.out ? C.red : C.lime) : 'rgba(255,255,255,.08)' }} />
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: C.mute, fontSize: 10 }}><span>{timeAt(analysis.tempo[0]?.t0)}</span><span>NOW</span></div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: C.mute }}><span><b style={{ color: C.lime }}>■</b> Outgoing pressure</span><span><b style={{ color: C.red }}>■</b> Incoming pressure</span></div>
                  </>
                ) : <Empty title="No hit activity in this window" hint="Broaden the window or wait for the next news capture." />}
              </Panel>
              <Panel title="FRONT STATUS" sub="Enemy kingdoms represented in captured news" span={4}>
                {fronts.length ? fronts.slice(0, 7).map(f => <div key={f.kd} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}><div><b>{f.kd}</b><div className="fl-muted" style={{ fontSize: 10, marginTop: 3 }}>{f.out} out · {f.in} in</div></div><div style={{ textAlign: 'right' }}><b style={{ color: f.net >= 0 ? C.green : C.red }}>{f.net >= 0 ? '+' : ''}{fmt(f.net)}</b><div className="fl-muted" style={{ fontSize: 10 }}>net acres</div></div></div>) : <Empty title="No enemy fronts detected" hint="Fronts appear when news captures identify the opposing kingdom." />}
              </Panel>
            </Grid>

            <Grid>
              <Panel title="INCOMING THREATS" sub="Who is hitting the kingdom, ranked by acres taken from us" span={7}>
                {analysis.aggressors.length ? <div className="fl-tablewrap"><table className="fl-table"><thead><tr><th>ATTACKER</th><th>KD</th><th>HITS</th><th>ACRES</th><th>VICTIMS</th><th>LAST HIT</th></tr></thead><tbody>{analysis.aggressors.slice(0, 12).map((r, i) => <tr key={r.name + r.kd}><td><b>{r.name}</b>{i === 0 ? <> <Tag color={C.red}>TOP THREAT</Tag></> : null}</td><td>{r.kd}</td><td>{r.hits}{r.hits1h > 0 ? <span style={{ color: C.red }}> · +{r.hits1h} 1h</span> : null}</td><td><b>{fmt(r.acres)}</b></td><td>{r.victims}</td><td>{ago(new Date(r.lastAt).toISOString())}</td></tr>)}</tbody></table></div> : <Empty title="No incoming attacks parsed" hint="The threat board fills from incoming KD news and detailed attacker-log captures." />}
              </Panel>
              <Panel title="UNDER FIRE" sub="Our provinces receiving the most incoming land pressure" span={5}>
                {analysis.siege.length ? <div className="fl-tablewrap"><table className="fl-table"><thead><tr><th>PROVINCE</th><th>HITS</th><th>ACRES LOST</th><th>ENEMIES</th></tr></thead><tbody>{analysis.siege.slice(0, 10).map((r, i) => <tr key={r.name}><td><b>{r.name}</b>{i === 0 ? <> <Tag color={C.red}>FOCUS</Tag></> : null}</td><td>{r.hits}{r.hits1h ? <span style={{ color: C.red }}> · {r.hits1h} 1h</span> : null}</td><td>{fmt(r.acres)}</td><td>{r.attackers}</td></tr>)}</tbody></table></div> : <Empty title="No provinces under fire" hint="Incoming attacks will be grouped by the defending province." />}
              </Panel>
            </Grid>

            <Grid>
              <Panel title="TARGET BREAKPOINTS" sub="Enemy provinces we have hit; lowest recorded offense is a rough observed ceiling, not a guaranteed defense value" span={12}>
                {analysis.targets.length ? <div className="fl-tablewrap"><table className="fl-table"><thead><tr><th>TARGET</th><th>KD</th><th>HITS</th><th>LAND</th><th>LOW OP</th><th>AVG OP</th><th>MAX OP</th><th>READY</th><th>SOON</th><th>LAST HIT</th></tr></thead><tbody>{analysis.targets.slice(0, 20).map(r => <tr key={r.name + r.kd}><td><b>{r.name}</b></td><td>{r.kd}</td><td>{r.hits}{r.hits6h ? <span className="fl-muted"> · {r.hits6h} 6h</span> : null}</td><td>{fmt(r.acres)}</td><td>{r.minOp == null ? '—' : compact(r.minOp)}</td><td>{r.avgOp == null ? '—' : compact(r.avgOp)}</td><td>{r.maxOp == null ? '—' : compact(r.maxOp)}</td><td><Tag color={r.readyToBreak ? C.green : C.mute}>{r.readyToBreak}</Tag></td><td><Tag color={r.soonToBreak ? C.amber : C.mute}>{r.soonToBreak}</Tag></td><td>{ago(new Date(r.lastAt).toISOString())}</td></tr>)}</tbody></table></div> : <Empty title="No outgoing targets in this window" hint="Select a wider window or wait for attacks to be captured." />}
              </Panel>
            </Grid>

            <Grid>
              <Panel title="ATTACKER BOARD" sub="Our province-level attack efficiency, loss rate and return status" span={12}>
                {analysis.attackers.length ? <div className="fl-tablewrap"><AttackerTable rows={analysis.attackers} own={body?.province ?? ''} now={now} /></div> : <Empty title="No outgoing attacker records" hint="Outgoing attack reports will appear here. Detailed attacker-log lines add offense, gens, losses and return times." />}
              </Panel>
            </Grid>

            <Grid>
              <Panel title="NEXT RETURNING WAVE" sub="Outgoing armies with a known return time from captured detailed reports" span={7}>
                {analysis.waves.length ? <div className="fl-tablewrap"><table className="fl-table"><thead><tr><th>ATTACKER</th><th>TARGET</th><th>OP</th><th>RETURN</th><th>ETA</th></tr></thead><tbody>{analysis.waves.slice(0, 12).map((w, i) => <tr key={w.attacker + w.target + w.hitAt}><td><b>{w.attacker}</b></td><td>{w.target}</td><td>{compact(w.op)}</td><td>{timeAt(w.returnAt)}</td><td><Tag color={i === 0 ? C.lime : C.cyan}>{duration(w.returnAt - now)}</Tag></td></tr>)}</tbody></table></div> : <Empty title="No known returns pending" hint="A return wave appears only when the source report includes a usable travel duration." />}
              </Panel>
              <Panel title="RETURN FORECAST" sub="Offense expected to return by hour" span={5}>
                <HBars items={analysis.forecast.filter(f => f.armies > 0).slice(0, 10).map(f => ({ label: f.hour === 0 ? 'Within 1h' : `+${f.hour}h`, value: f.op, color: f.hour < 2 ? C.lime : C.cyan, text: `${compact(f.op)} · ${f.armies} army${f.armies === 1 ? '' : 'ies'}` }))} max={Math.max(1, ...analysis.forecast.map(f => f.op))} />
                {!analysis.forecast.some(f => f.armies > 0) ? <Empty title="Forecast is clear" hint="No captured armies have a future return time." /> : null}
              </Panel>
            </Grid>

            <Grid>
              <Panel title="FRONT BALANCE" sub="Net acres and recorded hit counts by opposing kingdom" span={6}>
                {analysis.fronts.length ? <HBars items={analysis.fronts.slice(0, 8).map(f => ({ label: f.kd, value: Math.abs(f.net), color: f.net >= 0 ? C.green : C.red, text: `${f.net >= 0 ? '+' : ''}${fmt(f.net)} · ${f.out + f.in} hits` }))} /> : <Empty title="No front balance data" hint="Kingdom balance appears when incoming or outgoing news identifies a KD." />}
              </Panel>
              <Panel title="DIMINISHING RETURNS" sub="Average land per hit, relative to the best hit, as target pressure builds" span={6}>
                {analysis.yieldCurve.length ? <HBars items={analysis.yieldCurve.map(y => ({ label: y.prior === 0 ? 'First hit' : `${y.prior} prior hits`, value: y.ratio * 100, color: y.ratio >= .75 ? C.green : y.ratio >= .45 ? C.amber : C.red, text: `${(y.ratio * 100).toFixed(0)}% · n=${y.n}` }))} max={100} format={v => `${v.toFixed(0)}%`} /> : <Empty title="Not enough repeat hits yet" hint="Needs at least three land hits against the same target to estimate diminishing returns." />}
              </Panel>
            </Grid>

            <Grid>
              <Panel title="DATA QUALITY & COVERAGE" sub="What the parser actually received — not an estimate of unseen game events" span={12}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
                  {[
                    ['Source rows', body?.coverage?.rows ?? 0],
                    ['Lines scanned', body?.coverage?.lines ?? 0],
                    ['Parsed lines', body?.coverage?.parsed ?? 0],
                    ['Unparsed lines', body?.coverage?.unparsed ?? 0],
                    ['Duplicates skipped', body?.coverage?.duplicates ?? 0],
                    ['Detailed reports', body?.coverage?.detailed ?? 0],
                    ['Incoming parsed', body?.coverage?.incoming ?? 0],
                  ].map(([name, value]) => <div key={String(name)} style={{ border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.025)', padding: 12, borderRadius: 11 }}><div className="fl-kicker">{name}</div><div style={{ color: C.text, fontSize: 22, fontWeight: 800, marginTop: 7 }}>{fmt(value as number)}</div></div>)}
                </div>
                <p className="fl-muted" style={{ fontSize: 11, lineHeight: 1.6, margin: '14px 0 0' }}>Coverage is limited to the latest {days} days of the Discord bot news rows that are linked to your kingdom. Missing or unparsed lines are not silently treated as zero attacks. {body?.coverage?.first ? `Oldest parsed hit: ${timeAt(Date.parse(body.coverage.first))}.` : 'No parsed hit timestamps yet.'} {body?.coverage?.last ? `Newest parsed hit: ${timeAt(Date.parse(body.coverage.last))}.` : ''}</p>
              </Panel>
            </Grid>
          </>
        )}
      </Shell>
    </>
  )
}

function AttackerTable({ rows, own, now }: { rows: import('@/lib/spartan/front-line').AttackerRow[]; own: string; now: number }) {
  const [sort, setSort] = useState<'acres' | 'hits' | 'opAvg' | 'acresPerKop' | 'lostPerAcre' | 'wastePct'>('acres')
  const [desc, setDesc] = useState(true)
  const sorted = [...rows].sort((x, y) => {
    const a = (x[sort] ?? -1) as number
    const b = (y[sort] ?? -1) as number
    return desc ? b - a : a - b
  })
  const maxEff = Math.max(0.01, ...rows.map(r => r.acresPerKop ?? 0))
  const th = (key: typeof sort, text: string, align: 'left' | 'right' = 'right') => (
    <th className="fl-click" style={{ textAlign: align }} onClick={() => { if (sort === key) setDesc(!desc); else { setSort(key); setDesc(true) } }}>{text}{sort === key ? (desc ? ' ▼' : ' ▲') : ''}</th>
  )
  return (
    <table className="sp-table fl-table">
      <thead><tr><th>#</th><th>ATTACKER</th>{th('hits', 'HITS')}{th('acres', 'ACRES')}{th('opAvg', 'AVG OP')}<th style={{ textAlign: 'right' }}>GENS</th>{th('acresPerKop', 'ACRES / 1K OP')}{th('lostPerAcre', 'LOSS / ACRE')}{th('wastePct', 'OVER')}<th>STATUS</th></tr></thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.name} style={isYou(r.name, own) ? { background: 'rgba(216,255,84,.06)' } : undefined}>
            <td className="fl-muted">{i + 1}</td>
            <td><b style={isYou(r.name, own) ? { color: C.lime } : undefined}>{r.name}</b>{isYou(r.name, own) ? ' (you)' : ''}{i === 0 && sort === 'acres' && desc ? <> <Tag color={C.amber}>TOP</Tag></> : null}{r.plague ? <> <Tag color={C.violet}>PLAGUE ×{r.plague}</Tag></> : null}</td>
            <td style={{ textAlign: 'right' }}>{r.hits}</td>
            <td style={{ textAlign: 'right' }}><b>{fmt(r.acres)}</b></td>
            <td style={{ textAlign: 'right' }}>{r.opAvg != null ? compact(r.opAvg) : '—'}</td>
            <td style={{ textAlign: 'right' }}>{r.gensAvg != null ? r.gensAvg.toFixed(1) : '—'}</td>
            <td style={{ textAlign: 'right', minWidth: 120 }}>
              {r.acresPerKop != null ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'inline-block', width: 54, height: 6, borderRadius: 9, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.acresPerKop / maxEff) * 100}%`, background: C.lime }} /></span>{r.acresPerKop.toFixed(2)}</span> : '—'}
            </td>
            <td style={{ textAlign: 'right' }}>{r.lostPerAcre != null ? r.lostPerAcre.toFixed(1) : '—'}</td>
            <td style={{ textAlign: 'right', color: (r.wastePct ?? 0) >= 8 ? C.violet : undefined }}>{r.wastePct != null ? `${r.wastePct.toFixed(0)}%` : '—'}</td>
            <td>{r.returnAt != null ? <Tag color={C.cyan}>HOME {duration(r.returnAt - now)}</Tag> : <Tag color={C.green}>HOME</Tag>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
