import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type AnyRecord = Record<string, any>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function code(value: unknown) {
  return text(value).match(/\b\d{1,3}:\d{1,3}\b/)?.[0] ?? ''
}

function hash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function validKey(request: Request) {
  const configured = process.env.SPARTAN_CAPTURE_KEY
  return Boolean(configured && request.headers.get('x-spartan-capture-key') === configured)
}

export async function POST(request: Request) {
  try {
    if (!validKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as AnyRecord
    const provinceName = text(body.provinceName ?? body.province_name ?? body.province)
    const kingdomCode = code(body.kingdomCode ?? body.kingdom_code ?? body.kd_code ?? body.location)
    const existingToken = text(body.captureToken)

    if (!provinceName && !kingdomCode) {
      return NextResponse.json({ error: 'Province identity is required before a scraper identity can be issued.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    let ownerId: string | null = null
    let province: AnyRecord | null = null
    let account: AnyRecord | null = null

    if (provinceName && kingdomCode) {
      const result = await supabase.from('provinces').select('id,name,kd_code,kingdom_id').ilike('name', provinceName).eq('kd_code', kingdomCode).limit(1).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      province = result.data
    }

    if (!province && provinceName) {
      const result = await supabase.from('provinces').select('id,name,kd_code,kingdom_id').ilike('name', provinceName).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      province = result.data
    }

    if (province) {
      const result = await supabase.from('spartan_accounts').select('auth_user_id,account_status,role,screen_name').ilike('province_name', province.name).eq('province_location', province.kd_code).limit(1).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      account = result.data
      ownerId = account?.auth_user_id ?? null
    }

    if (!ownerId && provinceName && kingdomCode) {
      const result = await supabase.from('spartan_accounts').select('auth_user_id,account_status,role,screen_name').ilike('province_name', provinceName).eq('province_location', kingdomCode).limit(1).maybeSingle()
      if (result.error) throw new Error(result.error.message)
      account = result.data
      ownerId = account?.auth_user_id ?? null
    }

    if (!ownerId) return NextResponse.json({ error: 'No Spartan account is linked to this Utopia province.', identity: { provinceName: provinceName || null, kingdomCode: kingdomCode || null } }, { status: 404 })

    if (account?.account_status !== 'active') {
      return NextResponse.json({ error: 'Spartan account is not active. Scraper authentication is disabled.', code: 'ACCOUNT_NOT_ACTIVE' }, { status: 403 })
    }

    if (existingToken) {
      const existing = await supabase
        .from('spartan_capture_devices')
        .select('id,owner_id')
        .eq('token_hash', hash(existingToken))
        .maybeSingle()

      if (!existing.error && existing.data?.owner_id === ownerId) {
        await supabase
          .from('spartan_capture_devices')
          .update({
            last_seen_at: new Date().toISOString(),
            last_province_id: province?.id ?? null,
            last_province_name: province?.name ?? provinceName,
            last_kingdom_code: province?.kd_code ?? kingdomCode,
          })
          .eq('id', existing.data.id)

        return NextResponse.json({
          ok: true,
          captureToken: existingToken,
          ownerId,
          role: account?.role ?? 'member',
          provinceId: province?.id ?? null,
          provinceName: province?.name ?? provinceName,
          kingdomCode: province?.kd_code ?? kingdomCode,
          reused: true,
        })
      }
    }

    const captureToken = crypto.randomBytes(32).toString('base64url')
    const inserted = await supabase.from('spartan_capture_devices').insert({
      token_hash: hash(captureToken),
      owner_id: ownerId,
      label: 'Utopia userscript',
      last_province_id: province?.id ?? null,
      last_province_name: province?.name ?? provinceName,
      last_kingdom_code: province?.kd_code ?? kingdomCode,
    }).select('id').single()
    if (inserted.error) throw new Error(inserted.error.message)

    return NextResponse.json({
      ok: true,
      captureToken,
      ownerId,
      role: account?.role ?? 'member',
      deviceId: inserted.data.id,
      provinceId: province?.id ?? null,
      provinceName: province?.name ?? provinceName,
      kingdomCode: province?.kd_code ?? kingdomCode,
      reused: false,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Identity bootstrap failed' }, { status: 500 })
  }
}
