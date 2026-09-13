import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UTOPIA_TICK_MINUTE = 3
const ANCHOR_REAL_MS = Date.parse('2026-09-13T05:03:00.000Z')
const ANCHOR_UTOPIA_YEAR = 6
const ANCHOR_UTOPIA_MONTH = 7
const ANCHOR_UTOPIA_DAY = 12
const ANCHOR_UTOPIA_TICK = 1
const TICKS_PER_DAY = 24
const TICKS_PER_MONTH = 31 * TICKS_PER_DAY
const TICKS_PER_YEAR = 12 * TICKS_PER_MONTH

function utopiaFromTicks(ticksFromAnchor: number) {
  let absolute = (ANCHOR_UTOPIA_YEAR - 1) * TICKS_PER_YEAR + (ANCHOR_UTOPIA_MONTH - 1) * TICKS_PER_MONTH + (ANCHOR_UTOPIA_DAY - 1) * TICKS_PER_DAY + (ANCHOR_UTOPIA_TICK - 1) + ticksFromAnchor
  const year = Math.floor(absolute / TICKS_PER_YEAR) + 1
  absolute %= TICKS_PER_YEAR
  const month = Math.floor(absolute / TICKS_PER_MONTH) + 1
  absolute %= TICKS_PER_MONTH
  const day = Math.floor(absolute / TICKS_PER_DAY) + 1
  const tick = (absolute % TICKS_PER_DAY) + 1
  return { year, month, day, tick }
}

export async function GET() {
  const localNow = Date.now()
  let networkNow = localNow
  let source = 'local-fallback'

  try {
    const response = await fetch('https://worldtimeapi.org/api/timezone/America/Chicago', {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    if (response.ok) {
      const data = await response.json() as { unixtime?: number }
      if (Number.isFinite(data.unixtime)) {
        networkNow = Number(data.unixtime) * 1000
        source = 'worldtimeapi-america-chicago'
      }
    }
  } catch {
    // Keep the server clock as a safe fallback if the public time service is unavailable.
  }

  const elapsedTicks = Math.floor((networkNow - ANCHOR_REAL_MS) / 3_600_000)
  const utopia = utopiaFromTicks(elapsedTicks)
  const nextTick = new Date(Math.floor(networkNow / 3_600_000) * 3_600_000 + UTOPIA_TICK_MINUTE * 60_000)
  if (nextTick.getTime() <= networkNow) nextTick.setTime(nextTick.getTime() + 3_600_000)

  const currentDate = new Date(networkNow)
  const currentYearStart = (utopia.year - 1) * TICKS_PER_YEAR
  const nextYearStart = currentYearStart + TICKS_PER_YEAR
  const currentAbsoluteTicks = currentYearStart
    + (utopia.month - 1) * TICKS_PER_MONTH
    + (utopia.day - 1) * TICKS_PER_DAY
    + (utopia.tick - 1)
  const ticksUntilNextYear = Math.max(0, nextYearStart - currentAbsoluteTicks)

  return NextResponse.json({
    now: new Date(networkNow).toISOString(),
    chicagoTime: currentDate.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    chicagoDate: currentDate.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }),
    source,
    utopia,
    nextTickAt: nextTick.toISOString(),
    ticksUntilNextYear,
    ticksUntilEndYr7: utopia.month === 7 ? ticksUntilNextYear : null,
    boundaryLabel: utopia.month === 7 ? `YR${utopia.year + 1} BOUNDARY` : `NEXT YEAR BOUNDARY`,
    sync: source !== 'local-fallback',
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
