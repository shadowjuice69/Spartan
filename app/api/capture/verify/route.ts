import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function resolveOwner(supabase: any, captureToken: string) {
  const device = await supabase.from('spartan_capture_devices').select('owner_id').eq('token_hash', hash(captureToken)).maybeSingle()
  if (device.error) throw new Error(device.error.message)
  if (!device.data?.owner_id) return null

  const account = await supabase
    .from('spartan_accounts')
    .select('id,auth_user_id,account_status,province_name,province_location')
    .eq('id', device.data.owner_id)
    .maybeSingle()
  if (account.error) throw new Error(account.error.message)
  if (!account.data || account.data.account_status !== 'active') return null
  return account.data
}

export async function POST(request: Request) {
  try {
    const captureToken = text(request.headers.get('x-spartan-capture-token'))
    if (!captureToken) return NextResponse.json({ error: 'Scraper capture token is required.' }, { status: 401 })

    const supabase = createServiceClient()
    const owner = await resolveOwner(supabase, captureToken)
    if (!owner) return NextResponse.json({ error: 'Invalid or inactive scraper capture token.' }, { status: 401 })

    const body = (await request.json()) as AnyRecord
    const captureId = text(body.captureId ?? body.capture_id)
    const pageKind = text(body.pageKind ?? body.page_kind)
    const url = text(body.url)
    if (!captureId) return NextResponse.json({ error: 'captureId is required.' }, { status: 400 })

    let query = supabase
      .from('spartan_capture_vault')
      .select('id,capture_id,province_id,kingdom_id,page_kind,url,captured_at')
      .eq('capture_id', captureId)
      .eq('province_id', owner.id)
      .eq('kingdom_id', owner.province_location)
      .limit(1)

    if (pageKind) query = query.eq('page_kind', pageKind)
    if (url) query = query.eq('url', url)

    const result = await query.maybeSingle()
    if (result.error) throw new Error(result.error.message)

    if (!result.data) {
      return NextResponse.json({
        ok: true,
        stored: false,
        ownerId: owner.id,
        provinceName: owner.province_name,
        kingdomCode: owner.province_location,
      }, { status: 200 })
    }

    return NextResponse.json({
      ok: true,
      stored: true,
      ownerId: owner.id,
      provinceName: owner.province_name,
      kingdomCode: owner.province_location,
      vaultId: result.data.id,
      capture: result.data,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Capture verification failed' }, { status: 500 })
  }
}
