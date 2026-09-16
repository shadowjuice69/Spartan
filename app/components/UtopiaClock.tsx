'use client'

import { useEffect, useState } from 'react'

type ClockData = {
  now: string
  chicagoTime: string
  chicagoDate: string
  source: string
  anchorCapturedAt: string
  anchorGameDate: string
  utopia: { year: number; month: number; day: number; tick: number }
  nextTickAt: string
  ticksUntilNextYear: number
  nextYearLabel: string
  sync: boolean
}

const monthNames = ['January','February','March','April','May','June','July']

export default function UtopiaClock() {
  const [data, setData] = useState<ClockData | null>(null)
  const [liveNow, setLiveNow] = useState(Date.now())
  const [syncBase, setSyncBase] = useState<{ network: number; local: number } | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const response = await fetch(`/api/time?live=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!response.ok) throw new Error('time sync failed')
        const value = await response.json() as ClockData
        if (mounted) {
          const network = Date.parse(value.now)
          const local = Date.now()
          setData(value)
          setSyncBase({ network, local })
          setLiveNow(network)
        }
      } catch {}
    }
    load()
    const poll = setInterval(load, 5_000)
    const clock = setInterval(() => {
      setLiveNow((current) => {
        if (!syncBase) return current + 250
        return syncBase.network + (Date.now() - syncBase.local)
      })
    }, 250)
    return () => { mounted = false; clearInterval(poll); clearInterval(clock) }
  }, [])

  const countdown = data ? Math.max(0, Date.parse(data.nextTickAt) - liveNow) : 0
  const totalSeconds = Math.floor(countdown / 1000)
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  const endTicks = data?.ticksUntilNextYear ?? 0
  const endDays = Math.max(0, Math.floor(endTicks / 24))
  const endHours = Math.max(0, endTicks % 24)
  const chicagoTime = data ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(liveNow)) : '--:--:--'
  const chicagoDate = data ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(liveNow)) : 'CLOCK SYNC'
  const month = data ? monthNames[data.utopia.month - 1] || `MONTH ${data.utopia.month}` : ''

  return <>
    <style>{` .time-command-panel{position:fixed;top:65px;left:248px;right:0;z-index:9;display:grid;grid-template-columns:1.15fr 1fr 1.15fr 1fr;background:rgba(7,10,14,.96);border-bottom:1px solid #202832;box-shadow:0 8px 28px rgba(0,0,0,.24);backdrop-filter:blur(12px)}.time-cell{padding:10px 18px 9px;border-right:1px solid #1b232c;min-width:0}.time-cell:last-child{border-right:0}.time-kicker{display:block;font:500 8px 'DM Mono';letter-spacing:.15em;color:#66717f}.time-cell strong{display:block;margin-top:3px;font-size:14px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.time-cell small{display:block;margin-top:3px;font:8px 'DM Mono';color:#56616e;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.utopia-time strong,.tick-time strong{color:#d8ff54}.real-time strong{color:#dfe6ee}.season-time strong{color:#8da7ff}.tick-time{background:rgba(216,255,84,.025)}@media(max-width:1050px){.time-command-panel{left:70px;grid-template-columns:1fr 1fr}.time-cell:nth-child(3),.time-cell:nth-child(4){display:none}}@media(max-width:700px){.time-command-panel{left:0;grid-template-columns:1fr 1fr}.time-cell{padding:8px 11px}.time-cell strong{font-size:12px}.time-cell small{font-size:7px}.time-cell:nth-child(3),.time-cell:nth-child(4){display:none}} `}</style>
    <section className="time-command-panel" aria-label="Utopia and real-time synchronization">
      <div className="time-cell utopia-time"><span className="time-kicker">UTOPIA CLOCK</span><strong>{data ? `${month} ${data.utopia.day}, YR${data.utopia.year}` : 'SYNCING…'}</strong><small>{data ? `TICK ${data.utopia.tick} / 24` : 'CALCULATING TICK'}</small></div>
      <div className="time-cell tick-time"><span className="time-kicker">NEXT TICK</span><strong>{data ? `${hh}:${mm}:${ss}` : '--:--:--'}</strong><small>COUNTDOWN · 1 TICK = 1 REAL HOUR</small></div>
      <div className="time-cell real-time"><span className="time-kicker">REAL TIME · CHICAGO</span><strong>{chicagoTime}</strong><small>{chicagoDate} · {data?.sync ? 'SERVER SYNC · LIVE' : 'CLOCK FALLBACK'}</small></div>
      <div className="time-cell season-time"><span className="time-kicker">NEXT YEAR · {data?.nextYearLabel || 'SYNCING'}</span><strong>{endDays}D {String(endHours).padStart(2, '0')}H</strong><small>{endTicks > 0 ? `${endTicks.toLocaleString()} TICKS REMAINING` : 'YEAR BOUNDARY'}</small></div>
    </section>
  </>
}
