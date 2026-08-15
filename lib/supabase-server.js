import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Shared server-side Supabase client for Route Handlers.
// Uses @supabase/ssr (the current, maintained package) — do not use
// @supabase/auth-helpers-nextjs, which is deprecated and isn't installed
// in this project's dependencies.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored — happens if called somewhere without response-mutation
            // access (e.g. a Server Component). Session refresh still works
            // via middleware if you add one.
          }
        },
      },
    }
  )
}
