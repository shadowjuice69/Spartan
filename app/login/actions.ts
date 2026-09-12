'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function loginWithDiscord() {
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: 'identify email',
    },
  })

  if (error || !data.url) redirect('/login?error=discord-config')
  redirect(data.url)
}

// Existing password login remains available for compatibility, but Spartan
// authorization still requires a registered Discord identity.
export async function login(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) redirect('/login?error=missing')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=invalid')

  revalidatePath('/', 'layout')
  redirect('/')
}
