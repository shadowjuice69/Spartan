import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TICK_MS = 3_600_000
const TICKS_PER_DAY = 24
const DAYS_PER_MONTH = 24
const MONTHS_PER_YEAR = 7
const TICKS_PER_MONTH = DAYS_PER_MONTH * TICKS_PER_DAY
const TICKS_PER_YEAR = MONTHS_PER_YEAR * TICKS_PER_MONTH
const TICK_MINUTE_UTC = 0
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July']

type Anchor = {
  year: number
  month: number
  day: number
  tick: number
  capturedAt: string
  source: string
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan time service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function parseGameDate(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  const match = normalized.match(/(?:class=["']current-date["'][^>]*>\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s*YR\s*(\d+)/i)
  if (!match) return null

  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === match[1].toLowerCase()) + 1
  const day = Number(match[2])
  const year = Number(match[3])
  if (!month || !Number.isInteger(day) || day < 1 || day > DAYS_PER_MONTH || !Number.isInteger(year) || year < 1) return null
  return { year, month, day }
}

function findGameDate(value: unknown): { year: number; month: number; day: number } | null {
  const direct = parseGameDate(value)
  if (direct) return direct
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  for (const candidate of Object.values(value as Record<string, unknown>)) {
    const found = findGameDate(candidate)
    if (found) return found
  }
  return null
}

function tickBoundary(date: Date): Date {
  const boundary = new Date(date)
  boundary.setUTCMinutes(TICK_MINUTE_UTC, 0, 0)
  if (boundary.getTime() > date.getTime()) boundary.setUTCHours(boundary.getUTCHours() - 1)
  return boundary
}

function tickNumberForBoundary(boundary: Date): number {
  return boundary.getUTCHours() + 1
}

function absoluteTick(year: number, month: number, day: number, tick: number) {
  return (year - 1) * TICKS_PER_YEAR + (month - 1) * TICKS_PER_MONTH + (day - 1) * TICKS_PER_DAY + (tick - 1)
}

function fromAbsoluteTick(value: number) {
  let absolute = Math.max(0, value)
  const year = Math.floor(absolute / TICKS_PER_YEAR) + 1
  absolute %= TICKS_PER_YEAR
  const month = Math.floor(absolute / TICKS_PER_MONTH) + 1
  absolute %= TICKS_PER_MONTH
  const day = Math.floor(absolute / TICKS_PER_DAY) + 1
  const tick = (absolute % TICKS_PER_DAY) + 1
  return { year, month, day, tick }
}

async function resolveAnchor() {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const db = adminClient()
  const { data: account, error: accountError } = await db
    .from('spartan_accounts')
    .select('province_name,province_location,discord_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account) throw new Error('Spartan account identity not found.')

  let province: any = null
  if (account.province_name && account.province_location) {
    const result = await db
      .from('provinces')
      .select('id,name,kd_code,discord_id')
      .eq('name', account.province_name)
      .eq('kd_code', account.province_location)
      .maybeSingle()
    if (result.error) throw result.error
    province = result.data
  }
  if (!province && account.province_name) {
    const result = await db
      .from('provinces')
      .select('id,name,kd_code,discord_id')
      .eq('name', account.province_name)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (result.error) throw result.error
    province = result.data
  }
  if (!province && account.discord_user_id) {
    const result = await db
      .from('provinces')
      .select('id,name,kd_code,discord_id')
      .eq('discord_id', String(account.discord_user_id))
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (result.error) throw result.error
    province = result.data
  }
  if (!province?.id) throw new Error('Your Spartan province is not linked to the Utopia clock.')

  const { data: captures, error: captureError } = await db
    .from('spartan_capture_vault')
    .select('captured_at,raw_text,parsed_payload,page_kind')
    .eq('province_id', province.id)
    .eq('page_kind', 'throne')
    .order('captured_at', { ascending: false })
    .limit(50)
  if (captureError) throw captureError

  for (const capture of captures ?? []) {
    const gameDate = findGameDate(capture.raw_text) ?? findGameDate(capture.parsed_payload)
    const capturedAt = typeof capture.captured_at === 'string' ? capture.captured_at : null
    if (!gameDate || !capturedAt) continue

    const captured = new Date(capturedAt)
    if (!Number.isFinite(captured.getTime())) continue
    const boundary = tickBoundary(captured)

    return {
      year: gameDate.year,
      month: gameDate.month,
      day: gameDate.day,
      tick: tickNumberForBoundary(boundary),
      capturedAt: captured.toISOString(),
      source: 'spartan_capture_vault.throne',
    } satisfies Anchor
  }

  throw new Error('No Throne capture containing an authoritative Utopia date has been stored yet.')
}

export async function GET() {
  try {
    const now = new Date()
    const anchor = await resolveAnchor()
    const anchorBoundary = tickBoundary(new Date(anchor.capturedAt))
    const anchorAbsolute = absoluteTick(anchor.year, anchor.month, anchor.day, anchor.tick)
    const elapsedTicks = Math.max(0, Math.floor((now.getTime() - anchorBoundary.getTime()) / TICK_MS))
    const utopia = fromAbsoluteTick(anchorAbsolute + elapsedTicks)

    const nextTick = new Date(tickBoundary(now).getTime() + TICK_MS)
    const absoluteNow = absoluteTick(utopia.year, utopia.month, utopia.day, utopia.tick)
    const nextYearStart = utopia.year * TICKS_PER_YEAR
    const ticksUntilNextYear = Math.max(0, nextYearStart - absoluteNow)

    const current = now
    return NextResponse.json({
      now: now.toISOString(),
      chicagoTime: current.toLocaleString('en-US', {
        timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      }),
      chicagoDate: current.toLocaleDateString('en-US', {
        timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
      }),
      source: anchor.source,
      anchorCapturedAt: anchor.capturedAt,
      anchorGameDate: `YR${anchor.year} ${MONTH_NAMES[anchor.month - 1]} ${anchor.day}`,
      utopia,
      nextTickAt: nextTick.toISOString(),
      ticksUntilNextYear,
      nextYearLabel: `JAN 1, YR${utopia.year + 1}`,
      sync: true,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Utopia clock unavailable'
    const status = message === 'Unauthorized' ? 401 : 503
    return NextResponse.json({ error: message, sync: false }, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}
