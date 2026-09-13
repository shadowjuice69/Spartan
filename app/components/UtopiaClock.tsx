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

  return <section className="time-command-panel">
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
}
