import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Small in-memory brake on bad pairing attempts (per client IP). Render runs one
// instance, so this is enough to make guessing a 60-bit, 10-minute code pointless.
const failures = new Map<string, { count: number; resetAt: number }>()
const MAX_FAILURES = 10
const WINDOW_MS = 10 * 60 * 1000

function clientIp(request: Request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
}
function isLimited(ip: string) {
  const entry = failures.get(ip)
  if (!entry) return false
  if (entry.resetAt < Date.now()) { failures.delete(ip); return false }
  return entry.count >= MAX_FAILURES
}
function recordFailure(ip: string) {
  const entry = failures.get(ip)
  if (!entry || entry.resetAt < Date.now()) failures.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS })
  else entry.count += 1
}

const ACCOUNT_FIELDS = 'id,auth_user_id,account_status,role,province_name,province_location'

function identityResponse(account: AnyRecord, captureToken: string, extra: AnyRecord) {
  return NextResponse.json({
    ok: true,
    captureToken,
    ownerId: account.id,
    role: account.role ?? 'member',
    provinceId: null,
    provinceName: account.province_name,
    kingdomCode: account.province_location,
    ...extra,
  })
}

// No shared key. Identity is proven one of two ways:
//   1. captureToken  - a per-device secret this server issued earlier (refresh/validate)
//   2. pairingCode   - a one-time code a logged-in member generated on the site
// Province names or kingdom codes sent by the client are never used to pick an account.
export async function POST(request: Request) {
  try {
    const ip = clientIp(request)
    if (isLimited(ip)) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

    const body = (await request.json().catch(() => ({}))) as AnyRecord
    const existingToken = text(body.captureToken)
    const pairingCode = normalizeCode(text(body.pairingCode ?? body.pairing_code))
    if (!existingToken && !pairingCode) {
      return NextResponse.json({ error: 'A pairing code is required. Generate one in Spartan (Command → Scraper).', code: 'PAIRING_REQUIRED' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const now = new Date().toISOString()

    // 1. Existing device token: validate it and refresh the identity.
    if (existingToken) {
      const device = await supabase.from('spartan_capture_devices').select('id,owner_id').eq('token_hash', hash(existingToken)).maybeSingle()
      if (device.error) throw new Error(device.error.message)
      if (device.data?.owner_id) {
        const account = await supabase.from('spartan_accounts').select(ACCOUNT_FIELDS).eq('id', device.data.owner_id).maybeSingle()
        if (account.error) throw new Error(account.error.message)
        if (!account.data || account.data.account_status !== 'active') {
          return NextResponse.json({ error: 'Spartan account is not active. Scraper authentication is disabled.', code: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 })
        }
        await supabase.from('spartan_capture_devices').update({
          last_seen_at: now,
          last_province_name: account.data.province_name,
          last_kingdom_code: account.data.province_location,
        }).eq('id', device.data.id)
        return identityResponse(account.data, existingToken, { reused: true })
      }
      if (!pairingCode) {
        return NextResponse.json({ error: 'Scraper token not recognized. Generate a new pairing code in Spartan.', code: 'TOKEN_INVALID' }, { status: 401 })
      }
    }

    // 2. One-time pairing code: consume it atomically (used_at is null AND not expired).
    const consumed = await supabase
      .from('spartan_scraper_pairing_codes')
      .update({ used_at: now })
      .eq('code_hash', hash(pairingCode))
      .is('used_at', null)
      .gt('expires_at', now)
      .select('id,account_id')
      .maybeSingle()
    if (consumed.error) throw new Error(consumed.error.message)
    if (!consumed.data) {
      recordFailure(ip)
      return NextResponse.json({ error: 'Pairing code is invalid, expired, or already used.', code: 'PAIRING_INVALID' }, { status: 401 })
    }

    const account = await supabase.from('spartan_accounts').select(ACCOUNT_FIELDS).eq('id', consumed.data.account_id).maybeSingle()
    if (account.error) throw new Error(account.error.message)
    if (!account.data || account.data.account_status !== 'active') {
      return NextResponse.json({ error: 'Spartan account is not active. Scraper authentication is disabled.', code: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 })
    }
    if (!account.data.province_name || !account.data.province_location) {
      return NextResponse.json({ error: 'Set your province name and kingdom in Spartan before pairing a scraper.', code: 'PROFILE_INCOMPLETE' }, { status: 409 })
    }

    await supabase.from('spartan_province_registry').update({
      province_id: account.data.id,
      user_id: account.data.auth_user_id,
      kingdom_code: account.data.province_location,
      last_seen_at: now,
      updated_at: now,
    }).eq('province_name', account.data.province_name).eq('kingdom_code', account.data.province_location)

    const captureToken = crypto.randomBytes(32).toString('base64url')
    const inserted = await supabase.from('spartan_capture_devices').insert({
      token_hash: hash(captureToken),
      owner_id: account.data.id,
      label: 'Spartan Chrome extension',
      last_province_id: null,
      last_province_name: account.data.province_name,
      last_kingdom_code: account.data.province_location,
    }).select('id').single()
    if (inserted.error) throw new Error(inserted.error.message)

    await supabase.from('spartan_scraper_pairing_codes').update({ used_device_id: inserted.data.id }).eq('id', consumed.data.id)

    return identityResponse(account.data, captureToken, { deviceId: inserted.data.id, reused: false })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Identity bootstrap failed' }, { status: 500 })
  }
}
