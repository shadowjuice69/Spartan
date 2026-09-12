import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { requestIp } from './security'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Spartan account service is not configured.')
  return createSupabaseAdmin(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function internalEmail(screenName: string) {
  return `${screenName.toLowerCase()}@accounts.spartan.local`
}

export async function registerSpartanAccount({
  screenName,
  password,
  provinceName,
  provinceLocation,
}: {
  screenName: string
  password: string
  provinceName: string
  provinceLocation: string
}) {
  const name = screenName.trim()
  const province = provinceName.trim()
  const location = provinceLocation.trim()

  if (!/^[A-Za-z0-9_\-]{3,32}$/.test(name)) throw new Error('Screen name must be 3-32 characters using letters, numbers, _ or - only.')
  if (password.length < 10) throw new Error('Password must be at least 10 characters.')
  if (!/^\d+:\d+$/.test(location)) throw new Error('Province location must look like 6:5.')
  if (province.length < 2 || province.length > 80) throw new Error('Enter your registered province name.')

  const supabase = adminClient()
  const { data: provinceRow, error: provinceError } = await supabase
    .from('provinces')
    .select('name,location,discord_id')
    .eq('name', province)
    .eq('location', location)
    .not('discord_id', 'is', null)
    .maybeSingle()

  if (provinceError) throw new Error(`Province verification failed: ${provinceError.message}`)
  if (!provinceRow?.discord_id) throw new Error('That province name and location are not registered with the Spartan bot.')

  const discordUserId = String(provinceRow.discord_id)

  const { data: access, error: accessError } = await supabase
    .from('spartan_access')
    .select('discord_user_id,status,role')
    .eq('discord_user_id', discordUserId)
    .maybeSingle()

  if (accessError) throw new Error(`Spartan registration verification failed: ${accessError.message}`)
  if (!access || access.status !== 'active') throw new Error('Your Discord identity is not currently authorized by Spartan.')

  const { data: existing } = await supabase
    .from('spartan_accounts')
    .select('id')
    .or(`discord_user_id.eq.${discordUserId},screen_name.eq.${name}`)
    .limit(1)
    .maybeSingle()

  if (existing) throw new Error('That Discord identity or screen name already has a Spartan account.')

  const ip = requestIp(new Request('https://spartan.local', { headers: await headers() }))
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: internalEmail(name),
    password,
    email_confirm: true,
    app_metadata: { discord_user_id: discordUserId, provider: 'spartan-password' },
    user_metadata: { screen_name: name, province_name: province, province_location: location },
  })

  if (authError || !authUser.user) throw new Error(authError?.message || 'Could not create Spartan credentials.')

  const { error: accountError } = await supabase.from('spartan_accounts').insert({
    auth_user_id: authUser.user.id,
    discord_user_id: discordUserId,
    screen_name: name,
    province_name: province,
    province_location: location,
    registration_ip: ip,
    role: access.role || 'member',
  })

  if (accountError) {
    await supabase.auth.admin.deleteUser(authUser.user.id)
    throw new Error(`Spartan account record failed: ${accountError.message}`)
  }

  const { error: accessUpdateError } = await supabase
    .from('spartan_access')
    .update({ username: name, updated_at: new Date().toISOString() })
    .eq('discord_user_id', discordUserId)
  if (accessUpdateError) throw new Error(`Spartan access profile update failed: ${accessUpdateError.message}`)

  return { screenName: name, discordUserId, provinceName: province, provinceLocation: location, ip }
}

export function accountEmail(screenName: string) {
  return internalEmail(screenName.trim())
}
