import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Uses @supabase/ssr — the package actually installed in this project.
// Do not switch to @supabase/auth-helpers-nextjs; it's deprecated and not
// a dependency here (see lib/supabase-server.js for the same note).
export async function middleware(req) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const { pathname } = req.nextUrl

  // Public routes
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/auth/confirm') ||
    pathname.startsWith('/api/webhooks')

  if (isPublic) {
    if (session && (pathname.startsWith('/login') || pathname.startsWith('/signup'))) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return res
  }

  // All other routes require auth
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // ── Onboarding gate ──────────────────────────────────────────────
  // Send anyone who hasn't finished onboarding straight there, instead of
  // letting them land on the Calendar with no idea Settings exists.
  // Skipped for /onboarding itself (avoid a redirect loop) and for /api/*
  // (OAuth callbacks, onboarding-complete, and stripe checkout all need to
  // keep working *during* onboarding — gating them would break the wizard).
  if (!pathname.startsWith('/onboarding') && !pathname.startsWith('/api/')) {
    // Cache a positive result in a cookie so fully-onboarded users don't
    // pay a DB round trip on every single navigation. Only ever cached
    // once `completed` is confirmed true — an incomplete user is checked
    // fresh on every request until they finish.
    if (req.cookies.get('oc')?.value !== '1') {
      const { data: onboarding } = await supabase
        .from('onboarding')
        .select('completed')
        .eq('client_id', session.user.id)
        .single()

      if (!onboarding?.completed) {
        return NextResponse.redirect(new URL('/onboarding', req.url))
      }

      res.cookies.set('oc', '1', { maxAge: 60 * 60 * 24 * 30, path: '/' })
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
