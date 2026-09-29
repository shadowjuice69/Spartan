import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_CODES_PER_HOUR = 6
// Crockford-style alphabet: no I, L, O, U, 0, 1 so codes are easy to read and type.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function generateCode() {
  const bytes = crypto.randomBytes(12)
  let raw = ''
  for (let i = 0; i < 12; i++) raw += ALPHABET[bytes[i] % ALPHABET.length]
  return { raw, display: `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}` }
}

// Session-authenticated on purpose: this route lives outside /api/capture, so the
// proxy requires a logged-in, authorized Spartan member before it runs.
export async function POST() {
  try {
    const session = await createClient()
    const auth = await session.auth.getUser()
    const authUserId = auth.data.user?.id
    if (!authUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServiceClient()
    const account = await supabase
      .from('spartan_accounts')
      .select('id,account_status,province_name,province_location')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (account.error) throw new Error(account.error.message)
    if (!account.data || account.data.account_status !== 'active') {
      return NextResponse.json({ error: 'Active Spartan account not found.' }, { status: 403 })
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recent = await supabase
      .from('spartan_scraper_pairing_codes')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.data.id)
      .gte('created_at', since)
    if (recent.error) throw new Error(recent.error.message)
    if ((recent.count ?? 0) >= MAX_CODES_PER_HOUR) {
      return NextResponse.json({ error: 'Too many pairing codes requested. Try again later.' }, { status: 429 })
    }

    // Only one live code per account: retire any unused ones.
    await supabase
      .from('spartan_scraper_pairing_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('account_id', account.data.id)
      .is('used_at', null)

    const { raw, display } = generateCode()
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()
    const inserted = await supabase
      .from('spartan_scraper_pairing_codes')
      .insert({ account_id: account.data.id, code_hash: hash(raw), expires_at: expiresAt })
    if (inserted.error) throw new Error(inserted.error.message)

    return NextResponse.json({
      ok: true,
      code: display,
      expiresAt,
      provinceName: account.data.province_name ?? null,
      kingdomCode: account.data.province_location ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create pairing code' }, { status: 500 })
  }
}
