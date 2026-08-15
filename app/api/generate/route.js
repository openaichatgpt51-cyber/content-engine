// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
// import { cookies } from 'next/headers'
// import { NextResponse } from 'next/server'

// export async function POST(request) {
//   try {
//     // Verify user is authenticated
//     const supabase = createRouteHandlerClient({ cookies })
//     const { data: { session } } = await supabase.auth.getSession()

//     if (!session) {
//       return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
//     }

//     const body = await request.json()
//     const { topic, tone, platforms } = body

//     if (!topic?.trim()) {
//       return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
//     }

//     // Call n8n webhook
//     const n8nUrl    = process.env.N8N_WEBHOOK_URL
//     const n8nSecret = process.env.N8N_WEBHOOK_SECRET

//     if (!n8nUrl) {
//       return NextResponse.json({ error: 'n8n webhook URL not configured' }, { status: 500 })
//     }

//     const n8nRes = await fetch(n8nUrl, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         ...(n8nSecret ? { 'x-webhook-secret': n8nSecret } : {}),
//       },
//       body: JSON.stringify({
//         Topic: topic.trim(),   // matches the n8n Form Trigger field name
//         tone,
//         platforms,
//         client_id:    session.user.id,
//         client_email: session.user.email,
//       }),
//       // n8n can take up to 90s — set a generous timeout
//       signal: AbortSignal.timeout(120_000),
//     })

//     if (!n8nRes.ok) {
//       const text = await n8nRes.text().catch(() => '')
//       console.error('n8n error:', n8nRes.status, text)
//       return NextResponse.json(
//         { error: `Content generation failed (${n8nRes.status}). Check n8n logs.` },
//         { status: 502 }
//       )
//     }

//     return NextResponse.json({ success: true })

//   } catch (err) {
//     if (err.name === 'TimeoutError') {
//       return NextResponse.json(
//         { error: 'Generation timed out. The content may still be processing — check the Review Queue in a few minutes.' },
//         { status: 504 }
//       )
//     }
//     console.error('Generate API error:', err)
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
//   }
// }




// import { createBrowserClient } from '@supabase/ssr'
// import { cookies } from 'next/headers'
// import { NextResponse } from 'next/server'
// import { supabaseAdmin } from '../../../lib/supabase-admin'

// export async function POST(request) {
//   try {
//     const supabase = createBrowserClient({ cookies })
//     const { data: { session } } = await supabase.auth.getSession()
//     if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

//     const { topic, tone, platforms, brand_voice } = await request.json()
//     if (!topic?.trim()) return NextResponse.json({ error: 'Topic is required' }, { status: 400 })

//     const userId = session.user.id

//     // Check usage limit
//     const { data: sub } = await supabaseAdmin
//       .from('subscriptions')
//       .select('posts_used, posts_limit, status')
//       .eq('client_id', userId)
//       .single()

//     if (sub) {
//       if (sub.status === 'canceled') {
//         return NextResponse.json({ error: 'Subscription cancelled.' }, { status: 403 })
//       }
//       if (sub.posts_used >= sub.posts_limit) {
//         return NextResponse.json({
//           error: `Monthly limit of ${sub.posts_limit} posts reached.`,
//           code: 'LIMIT_REACHED',
//         }, { status: 429 })
//       }
//     }

//     const n8nUrl = process.env.N8N_WEBHOOK_URL
//     if (!n8nUrl) return NextResponse.json({ error: 'n8n URL not configured' }, { status: 500 })

//     // Send as form-encoded to match the n8n Form Trigger field names
//     const formBody = new URLSearchParams()
//     formBody.append('Topic', topic.trim())
//     formBody.append('Platforms', Array.isArray(platforms) ? platforms.join(',') : (platforms || 'LinkedIn,Instagram,Twitter'))
//     formBody.append('Tone', tone || 'Professional')
//     formBody.append('Brand Voice', brand_voice || '')
//     formBody.append('client_id', userId)
//     formBody.append('client_email', session.user.email)

//     const n8nRes = await fetch(n8nUrl, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded',
//       },
//       body: formBody.toString(),
//       signal: AbortSignal.timeout(120_000),
//     })

//     if (!n8nRes.ok) {
//       const text = await n8nRes.text().catch(() => '')
//       console.error('n8n error:', n8nRes.status, text)
//       return NextResponse.json(
//         { error: `Generation failed (${n8nRes.status})` },
//         { status: 502 }
//       )
//     }

//     // Increment usage
//     if (sub) {
//       await supabaseAdmin.rpc('increment_post_count', { p_client_id: userId })
//     }

//     return NextResponse.json({ success: true })

//   } catch (err) {
//     if (err.name === 'TimeoutError') {
//       return NextResponse.json(
//         { error: 'Generation timed out — check the Review Queue in a few minutes.' },
//         { status: 504 }
//       )
//     }
//     console.error('Generate error:', err)
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
//   }
// }









import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase-admin'

export async function POST(request) {
  try {
    // 1. Properly create the server client with Next.js cookies
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
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
              // Handled in middleware
            }
          },
        },
      }
    )

    // 2. Authenticate the session
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { topic, tone, platforms, brand_voice } = await request.json()
    if (!topic?.trim()) return NextResponse.json({ error: 'Topic is required' }, { status: 400 })

    const userId = session.user.id

    // Check usage limit
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('posts_used, posts_limit, status')
      .eq('client_id', userId)
      .single()

    if (sub) {
      if (sub.status === 'canceled') {
        return NextResponse.json({ error: 'Subscription cancelled.' }, { status: 403 })
      }
      if (sub.posts_used >= sub.posts_limit) {
        return NextResponse.json({
          error: `Monthly limit of ${sub.posts_limit} posts reached.`,
          code: 'LIMIT_REACHED',
        }, { status: 429 })
      }
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL
    if (!n8nUrl) return NextResponse.json({ error: 'n8n URL not configured' }, { status: 500 })

    // Send as form-encoded to match the n8n Form Trigger field names
    const formBody = new URLSearchParams()
    formBody.append('Topic', topic.trim())
    formBody.append('Platforms', Array.isArray(platforms) ? platforms.join(',') : (platforms || 'LinkedIn,Instagram,Twitter'))
    formBody.append('Tone', tone || 'Professional')
    formBody.append('Brand Voice', brand_voice || '')
    formBody.append('client_id', userId)
    formBody.append('client_email', session.user.email)

    const n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(120_000),
    })

    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => '')
      console.error('n8n error:', n8nRes.status, text)
      return NextResponse.json(
        { error: `Generation failed (${n8nRes.status})` },
        { status: 502 }
      )
    }

    // Increment usage
    if (sub) {
      await supabaseAdmin.rpc('increment_post_count', { p_client_id: userId })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Generation timed out — check the Review Queue in a few minutes.' },
        { status: 504 }
      )
    }
    console.error('Generate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}