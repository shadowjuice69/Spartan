import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Utopia time: 1 tick = 1 real hour, 24 days/month, 7 months/year.
// The current in-game checkpoint is supplied by the live Utopia state:
// Sep 14 2026, 09:03 Chicago = June 13 YR6, tick 10.
const TICK_MS = 3_600_000
const TICKS_PER_DAY = 24
const DAYS_PER_MONTH = 24
const MONTHS_PER_YEAR = 7
const TICKS_PER_MONTH = DAYS_PER_MONTH * TICKS_PER_DAY
const TICKS_PER_YEAR = MONTHS_PER_YEAR * TICKS_PER_MONTH
const ANCHOR_REAL_MS = Date.parse('2026-09-14T14:03:00.000Z')
const ANCHOR_YEAR = 6
const ANCHOR_MONTH = 6
const ANCHOR_DAY = 13
const ANCHOR_TICK = 10

function utopiaFromTicks(ticksFromAnchor: number) {
  const anchorAbsolute = (ANCHOR_YEAR - 1) * TICKS_PER_YEAR + (ANCHOR_MONTH - 1) * TICKS_PER_MONTH + (ANCHOR_DAY - 1) * TICKS_PER_DAY + (ANCHOR_TICK - 1)
  let absolute = anchorAbsolute + ticksFromAnchor
  const year = Math.floor(absolute / TICKS_PER_YEAR) + 1
  absolute %= TICKS_PER_YEAR
  const month = Math.floor(absolute / TICKS_PER_MONTH) + 1
  absolute %= TICKS_PER_MONTH
  const day = Math.floor(absolute / TICKS_PER_DAY) + 1
  const tick = (absolute % TICKS_PER_DAY) + 1
  return { year, month, day, tick }
}

export async function GET() {
  const now = Date.now()
  const elapsedTicks = Math.floor((now - ANCHOR_REAL_MS) / TICK_MS)
  const utopia = utopiaFromTicks(elapsedTicks)

  // Tick boundaries occur at :03 in the Chicago clock, matching the live clock checkpoint.
  const current = new Date(now)
  const nextTick = new Date(current)
  nextTick.setMinutes(3, 0, 0)
  if (nextTick.getTime() <= now) nextTick.setTime(nextTick.getTime() + TICK_MS)

  const absoluteNow = (utopia.year - 1) * TICKS_PER_YEAR + (utopia.month - 1) * TICKS_PER_MONTH + (utopia.day - 1) * TICKS_PER_DAY + (utopia.tick - 1)
  const nextYearStart = utopia.year * TICKS_PER_YEAR
  const ticksUntilNextYear = Math.max(0, nextYearStart - absoluteNow)
  const jan21Yr7Absolute = TICKS_PER_YEAR + 20 * TICKS_PER_DAY
  const ticksUntilJan21Yr7 = Math.max(0, jan21Yr7Absolute - absoluteNow)

  return NextResponse.json({
    now: new Date(now).toISOString(),
    chicagoTime: current.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    chicagoDate: current.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }),
    source: 'render-server-clock',
    utopia,
    nextTickAt: nextTick.toISOString(),
    ticksUntilNextYear,
    nextYearLabel: `JAN 1, YR${utopia.year + 1}`,
    ticksUntilJan21Yr7,
    jan21Yr7Label: 'JAN 21, YR7',
    sync: true,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
