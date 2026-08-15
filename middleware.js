// // import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
// import { createServerClient } from '@supabase/ssr'
// import { NextResponse } from 'next/server'

// export async function middleware(req) {
//   const res      = NextResponse.next()
//   const supabase = createServerClient({ req, res })

//   const { data: { session } } = await supabase.auth.getSession()

//   const { pathname } = req.nextUrl

//   // Public routes that don't need auth
//   const publicRoutes = ['/login', '/signup']
//   if (publicRoutes.includes(pathname)) {
//     // If already logged in, redirect to dashboard
//     if (session) return NextResponse.redirect(new URL('/dashboard', req.url))
//     return res
//   }

//   // Everything else under /dashboard requires auth
//   if (!session) {
//     const loginUrl = new URL('/login', req.url)
//     loginUrl.searchParams.set('redirected', '1')
//     return NextResponse.redirect(loginUrl)
//   }

//   return res
// }

// export const config = {
//   matcher: ['/dashboard/:path*', '/login', '/signup'],
// }









import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh auth session so cookies stay fresh
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}