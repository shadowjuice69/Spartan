'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { registerSpartanAccount, resolveSpartanLoginEmail } from '@/lib/spartan/accounts'
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
