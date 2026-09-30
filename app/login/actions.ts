'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { resolveSpartanLoginEmail } from '@/lib/spartan/accounts'
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

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
}
