import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { company_name, timezone } = body

    // Mark onboarding complete
    await supabaseAdmin
      .from('onboarding')
      .upsert({
        client_id:    session.user.id,
        completed:    true,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'client_id' })

    // Send welcome email via Resend
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${RESEND_KEY}`,
        },
        body: JSON.stringify({
          from:    `ContentEngine <welcome@${process.env.EMAIL_DOMAIN || 'yourdomain.com'}>`,
          to:      [session.user.email],
          subject: `Welcome to ContentEngine${company_name ? `, ${company_name}` : ''} — generate your first post`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
              <h1 style="font-size:28px;font-weight:400;color:#0D0D0F;margin-bottom:8px;">
                Welcome to <span style="color:#C8963E;">ContentEngine</span>
              </h1>
              <p style="color:#4A4A55;font-size:16px;line-height:1.6;margin-bottom:24px;">
                Your account is set up${company_name ? ` for <strong>${company_name}</strong>` : ''}. 
                You're ready to generate your first AI-powered post.
              </p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/new-post"
                 style="display:inline-block;padding:12px 24px;background:#0D0D0F;color:white;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;">
                Generate your first post →
              </a>
              <hr style="border:none;border-top:1px solid #E0DDD8;margin:36px 0;" />
              <p style="color:#8A8A99;font-size:13px;line-height:1.6;">
                <strong>What happens next:</strong><br/>
                1. Enter a topic and we research, write and schedule content across LinkedIn, Instagram and X.<br/>
                2. Review and approve posts before anything goes live.<br/>
                3. We post automatically at your scheduled times.
              </p>
              <p style="color:#8A8A99;font-size:12px;margin-top:24px;">
                ContentEngine · 
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings" style="color:#8A8A99;">Settings</a> · 
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#8A8A99;">Dashboard</a>
              </p>
            </div>
          `,
        }),
      })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('Onboarding complete error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}