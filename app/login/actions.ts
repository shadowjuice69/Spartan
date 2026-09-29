'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { accountEmail, registerSpartanAccount } from '@/lib/spartan/accounts'
import { recordLoginCheckpoint } from '@/lib/spartan/security'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const screenName = String(formData.get('screenName') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!screenName || !password) redirect('/login?error=missing')

  const { data, error } = await supabase.auth.signInWithPassword({
    email: accountEmail(screenName),
    password,
  })
  if (error || !data.user) redirect('/login?error=invalid')

  try {
    const requestHeaders = await headers()
    const request = new Request('https://spartan.local/login', { headers: requestHeaders })
    await recordLoginCheckpoint({ authUserId: data.user.id, request })
  } catch (error) {
    await supabase.auth.signOut()
    const message = error instanceof Error ? error.message : 'security-check-failed'
    redirect(`/login?error=${encodeURIComponent(message)}`)
  }

  revalidatePath('/', 'layout')
  return { ok: true as const }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login?success=signed-out')
}
