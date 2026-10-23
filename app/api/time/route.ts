import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TICK_MS = 3_600_000
const DAYS_PER_MONTH = 24
const MONTHS_PER_YEAR = 7
const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July']
const MONTH_ABBR = MONTH_NAMES.map(m => m.slice(0, 3).toLowerCase())

type GameDate = { year: number; month: number; day: number }
type Anchor = GameDate & { capturedAt: string; nextTickAt: string; source: string }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan time service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
function text(v: unknown) { return typeof v === 'string' ? v.trim() : '' }
function parseGameDate(v: unknown): GameDate | null {
  const s = text(v).replace(/\s+/g, ' ')
  const m = s.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s*(?:of\s+)?YR\s*(\d+)/i)
  if (!m) return null
  const word = m[1].toLowerCase()
  let month = MONTH_NAMES.findIndex(n => n.toLowerCase() === word) + 1
  if (!month) month = MONTH_ABBR.findIndex(n => n === word.slice(0, 3)) + 1
  const day = Number(m[2]); const year = Number(m[3])
  if (!month || !Number.isInteger(day) || day < 1 || day > DAYS_PER_MONTH || !Number.isInteger(year) || year < 0) return null
  return { year, month, day }
}
function findGameDate(v: unknown): GameDate | null {
  const direct = parseGameDate(v); if (direct) return direct
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  for (const child of Object.values(v as Record<string, unknown>)) { const found = findGameDate(child); if (found) return found }
  return null
}
function findAge(v: unknown): number | null {
  if (typeof v === 'string') { const match = v.match(/\bAge\s+(\d+)\b/i); return match ? Number(match[1]) : null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  for (const child of Object.values(v as Record<string, unknown>)) { const found = findAge(child); if (found !== null) return found }
  return null
}
function calendarDayIndex(year: number, month: number, day: number) { return year * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + (day - 1) }
function fromCalendarDayIndex(value: number) {
  const absolute = Math.max(0, value)
  const year = Math.floor(absolute / DAYS_PER_YEAR)
  const withinYear = absolute % DAYS_PER_YEAR
  const month = Math.floor(withinYear / DAYS_PER_MONTH) + 1
  const day = (withinYear % DAYS_PER_MONTH) + 1
  return { year, month, day }
}
function daysUntilNextYear(year: number, month: number, day: number) { return Math.max(0, (year + 1) * DAYS_PER_YEAR - calendarDayIndex(year, month, day)) }

async function resolveAnchor(): Promise<Anchor> {
  const auth = await createClient(); const { data: { user } } = await auth.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const db = adminClient()
  const { data: account, error: accountError } = await db.from('spartan_accounts').select('id,province_name,province_location,discord_user_id').eq('auth_user_id', user.id).maybeSingle()
  if (accountError) throw accountError
  if (!account) throw new Error('Spartan account identity not found.')

  let registry: any = null
  const byUser = await db.from('spartan_province_registry').select('province_id,province_name,kingdom_code,metadata,last_seen_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (byUser.error) throw byUser.error
  registry = byUser.data
  if (!registry && account.province_name) {
    const byIdentity = await db.from('spartan_province_registry').select('province_id,province_name,kingdom_code,metadata,last_seen_at').eq('province_name', account.province_name).eq('kingdom_code', account.province_location || '').order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (byIdentity.error) throw byIdentity.error
    registry = byIdentity.data
  }
  if (!registry?.province_id) throw new Error('Your Spartan province is not linked to the Utopia clock.')

  const { data: captures, error: captureError } = await db.from('spartan_intel_records').select('id,captured_at,raw_text,parsed_payload,page_kind,age,game_year,game_tick').in('province_id', [...new Set([String(account.id), String(registry.province_id)].filter(Boolean))]).eq('kingdom_id', account.province_location || '').eq('page_kind', 'throne').order('captured_at', { ascending: false }).limit(100)
  if (captureError) throw captureError
  for (const capture of captures ?? []) {
    const gameDate = findGameDate(capture.raw_text) ?? findGameDate(capture.parsed_payload)
    const captured = new Date(capture.captured_at)
    if (!gameDate || !Number.isFinite(captured.getTime())) continue
    const gameAge = findAge(capture.raw_text) ?? findAge(capture.parsed_payload)
    const gameTick = `${MONTH_NAMES[gameDate.month - 1]} ${gameDate.day}, YR${gameDate.year}`
    if (capture.game_year !== gameDate.year || capture.game_tick !== gameTick || (gameAge !== null && capture.age !== gameAge)) {
      const patch: Record<string, unknown> = { game_year: gameDate.year, game_tick: gameTick }
      if (gameAge !== null) patch.age = gameAge
      const { error: updateError } = await db.from('spartan_intel_records').update(patch).eq('id', capture.id)
      if (updateError) throw updateError
    }
    // Game ticks align to real UTC hour boundaries, not capture time.
    const nextTickAt = new Date(Math.floor(captured.getTime() / TICK_MS) * TICK_MS + TICK_MS)
    if (!Number.isFinite(nextTickAt.getTime())) continue
    return { ...gameDate, capturedAt: captured.toISOString(), nextTickAt: nextTickAt.toISOString(), source: 'spartan_intel_records.throne' }
  }
  throw new Error('No Throne capture containing an authoritative Utopia date has been stored yet.')
}

async function resolveRecoveredClockIssues(checkedAt: string) {
  try {
    const db = adminClient()
    const { error } = await db.from('spartan_system_issues')
      .update({ status: 'resolved', resolved_at: checkedAt })
      .eq('status', 'open')
      .eq('subsystem', 'clock')
      .eq('endpoint', '/api/time')
    if (error) throw error
  } catch (error) {
    // Keep a valid clock response available even if issue bookkeeping is temporarily unavailable.
    console.error('[CLOCK] Could not resolve recovered /api/time issues:', error instanceof Error ? error.message : 'unknown error')
  }
}

export async function GET() {
  try {
    const now = new Date(); const anchor = await resolveAnchor(); const boundary = Date.parse(anchor.nextTickAt) - TICK_MS
    const elapsedTicks = Math.max(0, Math.floor((now.getTime() - boundary) / TICK_MS))
    const date = fromCalendarDayIndex(calendarDayIndex(anchor.year, anchor.month, anchor.day) + elapsedTicks)
    const tick = date.day
    const nextTick = new Date(boundary + (elapsedTicks + 1) * TICK_MS)
    await resolveRecoveredClockIssues(now.toISOString())
    return NextResponse.json({
      now: now.toISOString(),
      chicagoTime: now.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
      chicagoDate: now.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }),
      source: anchor.source, anchorCapturedAt: anchor.capturedAt, anchorGameDate: `YR${anchor.year} ${MONTH_NAMES[anchor.month - 1]} ${anchor.day}`,
      utopia: { ...date, tick }, nextTickAt: nextTick.toISOString(), ticksUntilNextYear: daysUntilNextYear(date.year, date.month, date.day), nextYearLabel: `JAN 1, YR${date.year + 1}`, sync: true,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Utopia clock unavailable'
    return NextResponse.json({ error: message, sync: false }, { status: message === 'Unauthorized' ? 401 : 503, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}
