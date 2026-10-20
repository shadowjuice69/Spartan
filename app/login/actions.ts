'use server'

import crypto from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { registerSpartanAccount, resolveSpartanLoginEmail, syncSpartanAccountProvinceFromDiscord } from '@/lib/spartan/accounts'
import { recordLoginCheckpoint } from '@/lib/spartan/security'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const screenName = String(formData.get('screenName') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!screenName || !password) return { ok: false as const, error: 'Enter your screen name and password.' }

  let email: string | null
  try {
    email = await resolveSpartanLoginEmail(screenName)
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Spartan account lookup failed.' }
  }

  if (!email) return { ok: false as const, error: 'Invalid screen name or password.' }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { ok: false as const, error: 'Invalid screen name or password.' }

  try {
    const requestHeaders = await headers()
    const request = new Request('https://spartan.local/login', { headers: requestHeaders })
    await recordLoginCheckpoint({ authUserId: data.user.id, request })
  } catch (error) {
    await supabase.auth.signOut()
    return { ok: false as const, error: error instanceof Error ? error.message : 'Security check failed.' }
  }

  try {
    const synced = await syncSpartanAccountProvinceFromDiscord(data.user.id)
    if (synced.synced) console.info(`[SPARTAN LOGIN] Province identity synced: ${synced.provinceName} (${synced.provinceLocation})`)
  } catch (error) {
    // A registration sync must never turn a successful password login into a failure.
    console.error('[SPARTAN LOGIN] Province identity sync failed:', error)
  }

  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function createSpartanAccount(formData: FormData) {
  const screenName = String(formData.get('screenName') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const provinceName = String(formData.get('provinceName') ?? '').trim()
  const provinceLocation = String(formData.get('provinceLocation') ?? '').trim()

  if (!screenName || !password || !confirmPassword || !provinceName || !provinceLocation) {
    return { ok: false as const, error: 'Complete every account field.' }
  }
  if (password !== confirmPassword) {
    return { ok: false as const, error: 'Passwords do not match.' }
  }

  try {
    const account = await registerSpartanAccount({
      screenName,
      password,
      provinceName,
      provinceLocation,
    })
    revalidatePath('/login')
    return { ok: true as const, screenName: account.screenName }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Spartan account creation failed.',
    }
  }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}


const RESET_GENERIC_MESSAGE = 'If that Discord ID is linked to an active Spartan account, a reset code will be sent to that Discord account. Check your Discord DMs.'

export async function requestPasswordResetCode(formData: FormData) {
  const discordId = String(formData.get('discordId') ?? '').trim()
  if (!/^\d{17,20}$/.test(discordId)) {
    return { ok: false as const, error: 'Enter a valid Discord ID.' }
  }

  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.BOT_TOKEN
  if (!botToken) {
    console.error('[SPARTAN PASSWORD RESET] Discord bot token environment variable is not configured.')
    return { ok: false as const, error: 'Password reset is temporarily unavailable. Please contact a Spartan admin.' }
  }

  try {
    const admin = createServiceClient()
    const { data: account, error: accountError } = await admin
      .from('spartan_accounts')
      .select('auth_user_id,discord_user_id,account_status')
      .eq('discord_user_id', discordId)
      .maybeSingle()

    if (accountError) throw new Error(accountError.message)
    if (!account || account.account_status !== 'active' || !account.auth_user_id) {
      return { ok: true as const, message: RESET_GENERIC_MESSAGE }
    }

    const { data: authResult, error: authError } = await admin.auth.admin.getUserById(account.auth_user_id)
    if (authError || !authResult.user) throw new Error(authError?.message || 'Linked authentication user not found.')
    const metadata = authResult.user.app_metadata ?? {}
    const previousRequestedAt = Number(metadata.spartan_password_reset_requested_at ?? 0)
    if (Date.now() - previousRequestedAt < 60_000) {
      return { ok: true as const, message: RESET_GENERIC_MESSAGE }
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')
    const expiresAt = Date.now() + 10 * 60_000
    const { error: metadataError } = await admin.auth.admin.updateUserById(account.auth_user_id, {
      app_metadata: {
        ...metadata,
        spartan_password_reset_hash: codeHash,
        spartan_password_reset_expires_at: expiresAt,
        spartan_password_reset_attempts: 0,
        spartan_password_reset_requested_at: Date.now(),
      },
    })
    if (metadataError) throw new Error(metadataError.message)

    const dmResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: discordId }),
      cache: 'no-store',
    })
    if (!dmResponse.ok) {
      await admin.auth.admin.updateUserById(account.auth_user_id, {
        app_metadata: {
          ...metadata,
          spartan_password_reset_hash: null,
          spartan_password_reset_expires_at: null,
          spartan_password_reset_attempts: null,
          spartan_password_reset_requested_at: null,
        },
      })
      throw new Error(`Discord DM channel creation failed (HTTP ${dmResponse.status}).`)
    }
    const channel = await dmResponse.json() as { id?: string }
    if (!channel.id) throw new Error('Discord did not return a DM channel.')

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `Your Spartan password reset code is: **${code}**\\n\\nIt expires in 10 minutes. Enter this code on the Spartan login page to choose a new password. If you did not request this, ignore this message. Never share this code.`,
      }),
      cache: 'no-store',
    })
    if (!messageResponse.ok) {
      await admin.auth.admin.updateUserById(account.auth_user_id, {
        app_metadata: {
          ...metadata,
          spartan_password_reset_hash: null,
          spartan_password_reset_expires_at: null,
          spartan_password_reset_attempts: null,
          spartan_password_reset_requested_at: null,
        },
      })
      throw new Error(`Discord reset message failed (HTTP ${messageResponse.status}).`)
    }

    return { ok: true as const, message: RESET_GENERIC_MESSAGE }
  } catch (error) {
    console.error('[SPARTAN PASSWORD RESET] Code request failed:', error)
    return { ok: false as const, error: 'Could not send a reset code right now. Check that your Discord DMs are open, then try again or contact a Spartan admin.' }
  }
}

export async function resetSpartanPassword(formData: FormData) {
  const discordId = String(formData.get('discordId') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!/^\d{17,20}$/.test(discordId)) return { ok: false as const, error: 'Enter a valid Discord ID.' }
  if (!/^\d{6}$/.test(code)) return { ok: false as const, error: 'Enter the 6-digit code sent to your Discord DMs.' }
  if (password.length < 10) return { ok: false as const, error: 'Password must be at least 10 characters.' }
  if (password !== confirmPassword) return { ok: false as const, error: 'Passwords do not match.' }

  try {
    const admin = createServiceClient()
    const { data: account, error: accountError } = await admin
      .from('spartan_accounts')
      .select('auth_user_id,account_status')
      .eq('discord_user_id', discordId)
      .maybeSingle()
    if (accountError) throw new Error(accountError.message)
    if (!account || account.account_status !== 'active' || !account.auth_user_id) {
      return { ok: false as const, error: 'The code is invalid or expired. Request a new one.' }
    }

    const { data: authResult, error: authError } = await admin.auth.admin.getUserById(account.auth_user_id)
    if (authError || !authResult.user) throw new Error(authError?.message || 'Linked authentication user not found.')
    const user = authResult.user
    const metadata = user.app_metadata ?? {}
    const expectedHash = String(metadata.spartan_password_reset_hash ?? '')
    const expiresAt = Number(metadata.spartan_password_reset_expires_at ?? 0)
    const attempts = Number(metadata.spartan_password_reset_attempts ?? 0)
    const suppliedHash = crypto.createHash('sha256').update(code).digest('hex')
    const matches = expectedHash.length === suppliedHash.length &&
      crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(suppliedHash))

    if (!expectedHash || !Number.isFinite(expiresAt) || Date.now() > expiresAt || attempts >= 5 || !matches) {
      await admin.auth.admin.updateUserById(account.auth_user_id, {
        app_metadata: {
          ...metadata,
          spartan_password_reset_attempts: attempts + 1,
          ...(attempts + 1 >= 5 ? {
            spartan_password_reset_hash: null,
            spartan_password_reset_expires_at: null,
          } : {}),
        },
      })
      return { ok: false as const, error: 'The code is invalid or expired. Request a new one.' }
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(account.auth_user_id, {
      password,
      app_metadata: {
        ...metadata,
        spartan_password_reset_hash: null,
        spartan_password_reset_expires_at: null,
        spartan_password_reset_attempts: null,
        spartan_password_reset_requested_at: null,
      },
    })
    if (passwordError) throw new Error(passwordError.message)
    return { ok: true as const }
  } catch (error) {
    console.error('[SPARTAN PASSWORD RESET] Password update failed:', error)
    return { ok: false as const, error: 'Password reset could not be completed. Please try again or contact a Spartan admin.' }
  }
}
