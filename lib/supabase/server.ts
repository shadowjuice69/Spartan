import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !publishableKey) {
    throw new Error('Supabase client is not configured.')
  }

  return { supabaseUrl, publishableKey }
}

/**
 * Browser/session-aware client for normal dashboard requests.
 * This client intentionally uses the publishable/anon key so RLS applies.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { supabaseUrl, publishableKey } = getSupabaseConfig()

  return createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot always write cookies; proxy handles refreshes.
        }
      },
    },
  })
}

/**
 * Server-only privileged client for authenticated service-to-service routes.
 * The service key is never exposed to the browser.
 *
 * SPARTAN_CAPTURE_KEY authenticates the external scraper at the HTTP layer;
 * this Supabase service key authenticates Spartan itself to its database.
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Supabase service client is not configured. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY on the server.'
    )
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
