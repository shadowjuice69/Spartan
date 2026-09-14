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
  const { data: provinceRows, error: provinceError } = await supabase
    .from('provinces').select('id,name,location,kd_code,discord_id,user_id').eq('name', province).limit(20)
  if (provinceError) throw new Error(`Province verification failed: ${provinceError.message}`)

  const provinceRow = (provinceRows ?? []).find((row) => {
    const rowLocation = String(row.location ?? '').replace(/\s+/g, '')
    const rowKd = String(row.kd_code ?? '').replace(/\s+/g, '')
    return rowLocation === location || rowKd === location
  })
  if (!provinceRow) throw new Error('That province name and location are not currently registered in Spartan. Have the province send a fresh capture, then try again.')

  // The province table is the canonical identity when the bot has already linked
  // a Discord ID. If an older/bot-created province row has not been linked yet,
  // fall back to the already-authorized Spartan registration username. This keeps
  // spartan_accounts.discord_user_id non-null without weakening the DB constraint.
  let discordUserId = provinceRow.discord_id ? String(provinceRow.discord_id) : null
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

  const existingQuery = supabase.from('spartan_accounts').select('id').or(`discord_user_id.eq.${discordUserId},screen_name.eq.${name}`).limit(1).maybeSingle()
  const { data: existing } = await existingQuery
  if (existing) throw new Error('That identity or screen name already has a Spartan account.')

  const ip = requestIp(new Request('https://spartan.local', { headers: await headers() }))
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: internalEmail(name), password, email_confirm: true,
    app_metadata: { discord_user_id: discordUserId, provider: 'spartan-password' },
    user_metadata: { screen_name: name, province_name: province, province_location: location },
  })
  if (authError || !authUser.user) throw new Error(authError?.message || 'Could not create Spartan credentials.')

  const { error: accountError } = await supabase.from('spartan_accounts').insert({
    auth_user_id: authUser.user.id, discord_user_id: discordUserId, screen_name: name,
    province_name: province, province_location: location, registration_ip: ip, role,
  })
  if (accountError) {
    await supabase.auth.admin.deleteUser(authUser.user.id)
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
