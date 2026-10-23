'use client'

import { useEffect, useMemo, useState } from 'react'
import { reportDiagnostic } from '@/lib/diagnostics'

type GameDate = { year: number; month: number; day: number; tick: number }
type ClockData = {
  now: string
  source: string
  anchorCapturedAt: string
  anchorGameDate: string
  utopia: GameDate
  nextTickAt: string
  ticksUntilNextYear: number
  nextYearLabel: string
  sync: boolean
}
const CACHE_KEY = 'spartan:utopia-clock:v1'
const TICK_MS = 60 * 60 * 1000
const DAYS_PER_MONTH = 24
const MONTHS_PER_YEAR = 7
const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July']

function dayIndex(date: GameDate) {
  return date.year * DAYS_PER_YEAR + (date.month - 1) * DAYS_PER_MONTH + (date.day - 1)
}
function fromDayIndex(value: number) {
  const absolute = Math.max(0, value)
  const year = Math.floor(absolute / DAYS_PER_YEAR)
  const withinYear = absolute % DAYS_PER_YEAR
  return { year, month: Math.floor(withinYear / DAYS_PER_MONTH) + 1, day: withinYear % DAYS_PER_MONTH + 1 }
}
function advanceClock(data: ClockData, now: number) {
  const nextTick = Date.parse(data.nextTickAt)
  const passedTicks = Number.isFinite(nextTick) && now >= nextTick
    ? Math.floor((now - nextTick) / TICK_MS) + 1
    : 0
  const totalTick = data.utopia.tick - 1 + passedTicks
  const date = fromDayIndex(dayIndex(data.utopia) + Math.floor(totalTick / 24))
  const tick = totalTick % 24 + 1
  const nextTickAt = (Number.isFinite(nextTick) ? nextTick : now + TICK_MS) + passedTicks * TICK_MS
  return { date: { ...date, tick }, nextTickAt, passedTicks }
}
function readCache(): ClockData | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as ClockData
    if (!value?.utopia || !Number.isInteger(value.utopia.year) || value.utopia.year < 0 || !value?.nextTickAt || !value?.anchorCapturedAt) return null
    if (!Number.isFinite(Date.parse(value.nextTickAt))) return null
    return value
  } catch { return null }
}

export default function UtopiaClock() {
  const [data, setData] = useState<ClockData | null>(null)
  const [liveNow, setLiveNow] = useState(() => Date.now())
  const [lastVerified, setLastVerified] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let mounted = true
    let reportedFailure = false
    const cached = readCache()
    if (cached) {
      setData(cached)
      setLastVerified(cached.now || cached.anchorCapturedAt)
      setOffline(true)
    }
    const load = async () => {
      try {
        const response = await fetch('/api/time', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
        const value = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(value.error || 'Utopia date sync unavailable')
        if (!value?.utopia || !Number.isInteger(value.utopia.year) || value.utopia.year < 0 || !value?.nextTickAt || !value?.now) throw new Error('Utopia date sync returned incomplete data')
        if (!Number.isFinite(Date.parse(value.nextTickAt)) || !Number.isFinite(Date.parse(value.now))) throw new Error('Utopia date sync returned invalid timestamps')
        if (!mounted) return
        const verified = value as ClockData
        setData(verified)
        setLastVerified(verified.now)
        setOffline(false)
        reportedFailure = false
        try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(verified)) } catch {}
      } catch (error) {
        if (!mounted) return
        setOffline(true)
        if (!reportedFailure) {
          reportDiagnostic('clock', '/api/time', error instanceof Error ? error.message : 'Utopia date sync unavailable', 'warning', { component: 'UtopiaClock' })
          reportedFailure = true
        }
      }
    }
    void load()
    const poll = window.setInterval(load, 60_000)
    const clock = window.setInterval(() => setLiveNow(Date.now()), 250)
    return () => { mounted = false; window.clearInterval(poll); window.clearInterval(clock) }
  }, [])

  const view = useMemo(() => data ? advanceClock(data, liveNow) : null, [data, liveNow])
  const countdown = view ? Math.max(0, view.nextTickAt - liveNow) : 0
  const totalSeconds = Math.floor(countdown / 1000)
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  const date = view?.date
  const month = date ? monthNames[date.month - 1] : ''
  const tabletTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(liveNow))
  const tabletDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(liveNow))
  const daysUntilNextYear = date ? Math.max(0, date.year * DAYS_PER_YEAR - dayIndex(date)) : 0

  return (
    <>
      <style>{`
        .time-command-panel{position:relative;width:100%;display:grid;grid-template-columns:1.15fr 1fr 1.15fr 1fr;margin:0 0 16px;background:rgba(7,10,14,.72);border:1px solid #202832;border-radius:14px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.14)}
        .time-cell{padding:13px 16px 12px;border-right:1px solid #1b232c;min-width:0}
        .time-cell:last-child{border-right:0}
        .time-kicker{display:block;font:500 9px 'DM Mono',monospace;letter-spacing:.15em;color:#84909e}
        .time-cell strong{display:block;margin-top:5px;font-size:15px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .time-cell small{display:block;margin-top:4px;font:9px 'DM Mono',monospace;color:#788391;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .utopia-time strong,.tick-time strong{color:#d8ff54}.real-time strong{color:#dfe6ee}.season-time strong{color:#a7b8ff}.tick-time{background:rgba(216,255,84,.035)}
        @media(max-width:1050px){.time-command-panel{grid-template-columns:1fr 1fr}.time-cell:nth-child(2){border-right:0}.time-cell:nth-child(1),.time-cell:nth-child(2){border-bottom:1px solid #1b232c}}
        @media(max-width:520px){.time-cell{padding:10px}.time-cell strong{font-size:13px}.time-cell small{font-size:8px}.time-kicker{font-size:8px}}
      `}</style>
      <section className="time-command-panel" aria-label="Utopia calendar and live clock">
        <div className="time-cell utopia-time">
          <span className="time-kicker">UTOPIA CALENDAR</span>
          <strong>{date ? `Age date · ${month} ${date.day}, YR${date.year}` : 'Waiting for Intel date'}</strong>
          <small>{date ? `DAY ${date.day} / 24 · 1 HOURLY TICK = 1 UTOPIA DAY` : 'Last trusted Intel date loads when available'}</small>
        </div>
        <div className="time-cell tick-time">
          <span className="time-kicker">NEXT HOURLY TICK</span>
          <strong>{view ? `${hh}:${mm}:${ss}` : '--:--:--'}</strong>
          <small>TABLET CLOCK · 1 TICK = 1 HOUR</small>
        </div>
        <div className="time-cell real-time">
          <span className="time-kicker">YOUR LOCAL TIME</span>
          <strong>{tabletTime}</strong>
          <small>{tabletDate} · DEVICE CLOCK</small>
        </div>
        <div className="time-cell season-time">
          <span className="time-kicker">YEAR ROLLOVER</span>
          <strong>{date ? `JAN 1, YR${date.year + 1}` : '—'}</strong>
          <small>{date ? `${daysUntilNextYear.toLocaleString()} UTOPIA DAYS REMAINING` : offline ? 'Using saved date when available' : 'Verifying game date'}</small>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '7px 13px', borderTop: '1px solid #1b232c', color: '#788391', font: '9px DM Mono, monospace' }}>
          <span>{offline ? 'INTEL OFFLINE · LOCAL CLOCK CONTINUES' : 'INTEL VERIFIED · LOCAL CLOCK ADVANCES DATE'}</span>
          <span>{lastVerified ? `LAST VERIFIED ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastVerified))}` : 'WAITING FOR FIRST INTEL DATE'}</span>
        </div>
      </section>
    </>
  )
}
