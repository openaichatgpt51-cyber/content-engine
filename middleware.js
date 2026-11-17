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
  // Self-signup is switched off: admins provision accounts with an invite link.
  if (pathname.startsWith('/signup')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const isPublic =
    pathname.startsWith('/login') ||
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

  // ── Account status + admin role (both read fresh on every request) ──────
  // A disabled (suspended) or offboarded client is signed out on their next
  // request, without waiting for their access token to expire. admin_users is
  // readable by its own row only (RLS policy "admins read own row").
  const [{ data: me }, { data: adminRow }] = await Promise.all([
    supabase.from('clients').select('lifecycle').eq('id', session.user.id).maybeSingle(),
    supabase.from('admin_users').select('role').eq('user_id', session.user.id).maybeSingle(),
  ])
  const isAdmin = !!adminRow?.role
  // Readable marker so analytics (components/GoogleTagManager.jsx) never loads
  // for staff, on any page. Not a security control: access is still decided
  // by admin_users on every request.
  if (isAdmin && req.cookies.get('ce_staff')?.value !== '1') {
    res.cookies.set('ce_staff', '1', { maxAge: 60 * 60 * 24 * 30, path: '/', sameSite: 'lax' })
  } else if (!isAdmin && req.cookies.get('ce_staff')) {
    res.cookies.delete('ce_staff')
  }
  if (!isAdmin && me?.lifecycle && me.lifecycle !== 'active') {
    await supabase.auth.signOut()
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'This account is disabled.' }, { status: 403 })
    }
    const out = NextResponse.redirect(new URL('/login?disabled=1', req.url))
    res.cookies.getAll().forEach(c => out.cookies.set(c))
    return out
  }

  // Admins never need client onboarding; send them to the panel instead.
  if (isAdmin && pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  // ── Onboarding gate ──────────────────────────────────────────────
  // Send anyone who hasn't finished onboarding straight there, instead of
  // letting them land on the Calendar with no idea Settings exists.
  // Skipped for /onboarding itself (avoid a redirect loop) and for /api/*
  // (OAuth callbacks, onboarding-complete, and stripe checkout all need to
  // keep working *during* onboarding — gating them would break the wizard).
  // Also skipped for /admin — admins aren't regular clients and shouldn't
  // be forced through client onboarding to reach the admin panel.
  // Also skipped for /reset-password (invited users set their password there
  // before onboarding) and for admins, who use /admin.
  if (!isAdmin && !pathname.startsWith('/onboarding') && !pathname.startsWith('/api/') && !pathname.startsWith('/admin') && !pathname.startsWith('/reset-password')) {
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

  // ── Admin gate ──────────────────────────────────────────────────────
  // Checked fresh every request (above), never cached. The admin layout and
  // every /api/admin route check again with the service role.
  if (pathname.startsWith('/admin') && !isAdmin) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
