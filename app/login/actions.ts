'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { accountEmail, registerSpartanAccount } from '@/lib/spartan/accounts'

export async function createSpartanAccount(formData: FormData) {
  const screenName = String(formData.get('screenName') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const provinceName = String(formData.get('provinceName') ?? '')
  const provinceLocation = String(formData.get('provinceLocation') ?? '')

  if (password !== confirmPassword) redirect('/login?error=password-mismatch')

  try {
    await registerSpartanAccount({ screenName, password, provinceName, provinceLocation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'registration-failed'
    redirect(`/login?error=${encodeURIComponent(message)}`)
  }

  redirect(`/login?success=account-created&screen=${encodeURIComponent(screenName.trim())}`)
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const screenName = String(formData.get('screenName') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!screenName || !password) redirect('/login?error=missing')
  const { error } = await supabase.auth.signInWithPassword({ email: accountEmail(screenName), password })
  if (error) redirect('/login?error=invalid')

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function loginWithDiscord() {
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `${origin}/auth/callback`, scopes: 'identify email' },
  })
  if (error || !data.url) redirect('/login?error=discord-config')
  redirect(data.url)
}
