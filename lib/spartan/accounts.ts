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

export async function registerSpartanAccount({ screenName, password, provinceName, provinceLocation }: { screenName: string; password: string; provinceName: string; provinceLocation: string }) {
  const name = screenName.trim()
  const province = provinceName.trim()
  const location = provinceLocation.trim().replace(/\s+/g, '')

  if (!/^[A-Za-z0-9_\-]{3,32}$/.test(name)) throw new Error('Screen name must be 3-32 characters using letters, numbers, _ or - only.')
  if (password.length < 10) throw new Error('Password must be at least 10 characters.')
  if (!/^\d+:\d+$/.test(location)) throw new Error('Province location must look like 6:5.')
  if (province.length < 2 || province.length > 80) throw new Error('Enter your registered province name.')

  const supabase = adminClient()

  // Province verification is anchored to Spartan's canonical registry.
  // The legacy public.provinces table no longer exists in production.
  const { data: registryRows, error: registryError } = await supabase
    .from('spartan_province_registry')
    .select('province_id,province_name,kingdom_code,user_id')
    .ilike('province_name', province)
    .limit(20)
  if (registryError) throw new Error(`Province verification failed: ${registryError.message}`)

  const provinceRow = (registryRows ?? []).find((row) => {
    const rowLocation = String(row.kingdom_code ?? '').replace(/\s+/g, '')
    return rowLocation === location
  })
  if (!provinceRow) throw new Error('That province name and location are not currently registered in Spartan. Have the province send a fresh capture, then try again.')

  let discordUserId: string | null = null

  let role = 'member'

  if (!discordUserId) {
    const { data: namedAccess, error: namedAccessError } = await supabase
      .from('spartan_access')
      .select('discord_user_id,status,role')
      .ilike('username', name)
      .maybeSingle()
    if (namedAccessError) throw new Error(`Spartan registration verification failed: ${namedAccessError.message}`)
    if (namedAccess) {
      if (namedAccess.status !== 'active') throw new Error('The Discord identity associated with this Spartan registration is not currently authorized.')
      discordUserId = String(namedAccess.discord_user_id)
      role = namedAccess.role || role
    }
  }

  if (!discordUserId) {
    throw new Error('This province is registered, but its Discord identity is not linked yet. Use the same Spartan screen name you registered with the Discord bot, or have the province send a fresh capture.')
  }

  const { data: access, error: accessError } = await supabase
    .from('spartan_access').select('discord_user_id,status,role').eq('discord_user_id', discordUserId).maybeSingle()
  if (accessError) throw new Error(`Spartan registration verification failed: ${accessError.message}`)
  if (access?.status !== 'active') throw new Error('The Discord identity associated with this province is not currently authorized by Spartan.')
  role = access.role || role

  const { data: existing } = await supabase
    .from('spartan_accounts')
    .select('id')
    .or(`discord_user_id.eq.${discordUserId},screen_name.eq.${name}`)
    .limit(1)
    .maybeSingle()
  if (existing) throw new Error('That identity or screen name already has a Spartan account.')

  const ip = requestIp(new Request('https://spartan.local', { headers: await headers() }))
  const email = internalEmail(name)

  // If a prior Spartan account row was removed while its Auth credential
  // remained, restore that credential instead of failing on duplicate email.
  const { data: authUsers, error: authListError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authListError) throw new Error(`Spartan credential lookup failed: ${authListError.message}`)
  const existingAuthUser = authUsers.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())

  let authUserId: string
  let createdAuthUser = false

  if (existingAuthUser) {
    const { data: updatedAuth, error: updateAuthError } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
      password,
      email_confirm: true,
      app_metadata: { ...(existingAuthUser.app_metadata ?? {}), discord_user_id: discordUserId, provider: 'spartan-password' },
      user_metadata: { ...(existingAuthUser.user_metadata ?? {}), screen_name: name, province_name: province, province_location: location },
    })
    if (updateAuthError || !updatedAuth.user) throw new Error(updateAuthError?.message || 'Could not restore Spartan credentials.')
    authUserId = updatedAuth.user.id
  } else {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { discord_user_id: discordUserId, provider: 'spartan-password' },
      user_metadata: { screen_name: name, province_name: province, province_location: location },
    })
    if (authError || !authUser.user) throw new Error(authError?.message || 'Could not create Spartan credentials.')
    authUserId = authUser.user.id
    createdAuthUser = true
  }

  const { error: accountError } = await supabase.from('spartan_accounts').insert({
    auth_user_id: authUserId, discord_user_id: discordUserId, screen_name: name,
    province_name: province, province_location: location, registration_ip: ip, role,
  })
  if (accountError) {
    if (createdAuthUser) await supabase.auth.admin.deleteUser(authUserId)
    throw new Error(`Spartan account record failed: ${accountError.message}`)
  }

  const { error: accessUpdateError } = await supabase.from('spartan_access')
    .update({ username: name, updated_at: new Date().toISOString() }).eq('discord_user_id', discordUserId)
  if (accessUpdateError) throw new Error(`Spartan access profile update failed: ${accessUpdateError.message}`)

  return { screenName: name, discordUserId, provinceName: province, provinceLocation: location, ip }
}

export function accountEmail(screenName: string) { return internalEmail(screenName.trim()) }

export async function resolveSpartanLoginEmail(screenName: string) {
  const name = screenName.trim()
  if (!name) return null
  const supabase = adminClient()
  const { data: account, error } = await supabase.from('spartan_accounts').select('auth_user_id').ilike('screen_name', name).maybeSingle()
  if (error) throw new Error(`Spartan login account lookup failed: ${error.message}`)
  if (!account?.auth_user_id) return null
  const { data, error: authError } = await supabase.auth.admin.getUserById(account.auth_user_id)
  if (authError) throw new Error(`Spartan credential lookup failed: ${authError.message}`)
  return data.user?.email ?? null
}
