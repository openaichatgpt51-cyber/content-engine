import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { stripe } from '../../../../lib/stripe'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('client_id', session.user.id)
      .single()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    })

    return NextResponse.json({ url: portalSession.url })

  } catch (err) {
    console.error('Stripe portal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
