'use client'

import { useEffect, useState } from 'react'

type ClockData = {
  now: string
  chicagoTime: string
  chicagoDate: string
  source: string
  utopia: { year: number; month: number; day: number; tick: number }
  nextTickAt: string
  ticksUntilEndYr7: number
  sync: boolean
}

const monthName = (month: number) => new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(2026, month - 1, 1)))

export default function UtopiaClock() {
  const [data, setData] = useState<ClockData | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const response = await fetch('/api/time', { cache: 'no-store' })
        const value = await response.json() as ClockData
        if (mounted) { setData(value); setNow(Date.parse(value.now)) }
      } catch {}
    }
    load()
    const poll = setInterval(load, 30_000)
    const clock = setInterval(() => setNow(value => value + 1000), 1000)
    return () => { mounted = false; clearInterval(poll); clearInterval(clock) }
  }, [])

  const countdown = data ? Math.max(0, Date.parse(data.nextTickAt) - now) : 0
  const totalSeconds = Math.floor(countdown / 1000)
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  const endTicks = data?.ticksUntilEndYr7 ?? 0
  const endDays = Math.max(0, Math.floor(endTicks / 24))
  const endHours = Math.max(0, endTicks % 24)

  return <>
    <style>{` .time-command-panel{position:fixed;top:65px;left:248px;right:0;z-index:9;display:grid;grid-template-columns:1.15fr 1fr 1.15fr 1fr;background:rgba(7,10,14,.96);border-bottom:1px solid #202832;box-shadow:0 8px 28px rgba(0,0,0,.24);backdrop-filter:blur(12px)}.time-cell{padding:10px 18px 9px;border-right:1px solid #1b232c;min-width:0}.time-cell:last-child{border-right:0}.time-kicker{display:block;font:500 8px 'DM Mono';letter-spacing:.15em;color:#66717f}.time-cell strong{display:block;margin-top:3px;font-size:14px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.time-cell small{display:block;margin-top:3px;font:8px 'DM Mono';color:#56616e;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.utopia-time strong,.tick-time strong{color:#d8ff54}.real-time strong{color:#dfe6ee}.season-time strong{color:#8da7ff}.tick-time{background:rgba(216,255,84,.025)}@media(max-width:1050px){.time-command-panel{left:70px;grid-template-columns:1fr 1fr}.time-cell:nth-child(3),.time-cell:nth-child(4){display:none}}@media(max-width:700px){.time-command-panel{left:0;grid-template-columns:1fr 1fr}.time-cell{padding:8px 11px}.time-cell strong{font-size:12px}.time-cell small{font-size:7px}.time-cell:nth-child(3),.time-cell:nth-child(4){display:none}} `}</style>
    <section className="time-command-panel" aria-label="Utopia and real-time synchronization">
      <div className="time-cell utopia-time">
        <span className="time-kicker">UTOPIA CLOCK</span>
        <strong>{data ? `${monthName(data.utopia.month)} ${data.utopia.day}, YR${data.utopia.year}` : 'SYNCING…'}</strong>
        <small>{data ? `TICK ${data.utopia.tick} / 24` : 'CALCULATING TICK'}</small>
      </div>
      <div className="time-cell tick-time">
        <span className="time-kicker">NEXT TICK</span>
        <strong>{data ? `${hh}:${mm}:${ss}` : '--:--:--'}</strong>
        <small>1 TICK = 1 REAL HOUR</small>
      </div>
      <div className="time-cell real-time">
        <span className="time-kicker">REAL TIME · CHICAGO</span>
        <strong>{data?.chicagoTime ?? '--:--:--'}</strong>
        <small>{data?.chicagoDate ?? 'INTERNET TIME SYNC'} · {data?.sync ? 'INTERNET SYNC' : 'FALLBACK CLOCK'}</small>
      </div>
      <div className="time-cell season-time">
        <span className="time-kicker">YR7 BOUNDARY</span>
        <strong>{endDays}D {String(endHours).padStart(2, '0')}H</strong>
        <small>{endTicks > 0 ? `${endTicks.toLocaleString()} TICKS REMAINING` : 'YR7 COMPLETE'}</small>
      </div>
    </section>
  </>
}
