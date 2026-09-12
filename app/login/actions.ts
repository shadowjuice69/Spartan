'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { accountEmail, registerSpartanAccount } from '@/lib/spartan/accounts'

export async function createSpartanAccount(formData: FormData) {
  try {
    const screenName = String(formData.get('screenName') ?? '')
    const password = String(formData.get('password') ?? '')
    const confirmPassword = String(formData.get('confirmPassword') ?? '')
    const provinceName = String(formData.get('provinceName') ?? '')
    const provinceLocation = String(formData.get('provinceLocation') ?? '')

    if (password !== confirmPassword) redirect('/login?error=password-mismatch')
    await registerSpartanAccount({ screenName, password, provinceName, provinceLocation })
    redirect(`/login?success=account-created&screen=${encodeURIComponent(screenName.trim())}`)
  } catch (error) {
    if (error instanceof Error) redirect(`/login?error=${encodeURIComponent(error.message)}`)
    redirect('/login?error=registration-failed')
  }
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

// Discord OAuth remains available for legacy identities, but new Spartan
// accounts use the local screen-name/password flow above.
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
