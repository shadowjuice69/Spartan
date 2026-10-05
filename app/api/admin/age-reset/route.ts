import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isOwner } from '@/lib/spartan/security'

export const dynamic = 'force-dynamic'

async function owner() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const db = createServiceClient()
  const { data: account } = await db.from('spartan_accounts').select('discord_user_id,role').eq('auth_user_id', user.id).maybeSingle()
  const discordId = account?.discord_user_id ? String(account.discord_user_id) : null
  return isOwner(discordId) || String(account?.role ?? '') === 'owner' ? { db } : null
}

export async function GET() {
  const auth = await owner()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const setting = await auth.db.from('bot_settings').select('value').eq('key', 'current_age').maybeSingle()
  const log = await auth.db.from('spartan_age_log').select('ending_age,new_age,action,created_at').order('created_at', { ascending: false }).limit(5)
  const current = Number(setting.data?.value)
  return NextResponse.json({ ok: true, currentAge: Number.isInteger(current) ? current : null, log: log.error ? [] : log.data || [] })
}

export async function POST(request: Request) {
  const auth = await owner()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const ending = Number(body?.endingAge)
  const next = Number(body?.newAge)
  if (!Number.isInteger(ending) || !Number.isInteger(next) || ending < 1 || next <= ending || next > ending + 5) {
    return NextResponse.json({ error: 'Enter the ending age and a new age that is higher (and no more than 5 higher).' }, { status: 400 })
  }
  const confirm = body?.confirm === true
  if (confirm && body?.phrase !== `RESET ${next}`) {
    return NextResponse.json({ error: `Type RESET ${next} to confirm.` }, { status: 400 })
  }
  const { data, error } = await auth.db.rpc('spartan_start_new_age', { p_ending_age: ending, p_new_age: next, p_confirm: confirm })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, result: data })
}