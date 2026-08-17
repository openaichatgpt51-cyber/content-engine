import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { stripe, getPriceId } from '../../../../lib/stripe'
import { PLANS } from '../../../../lib/plans'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { planKey } = await request.json()
    const plan = PLANS[planKey]
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const priceId = getPriceId(planKey)
    if (!priceId) return NextResponse.json({ error: 'No price configured for this plan' }, { status: 500 })

    const userId    = session.user.id
    const userEmail = session.user.email

    // Reuse an existing Stripe customer if we already created one for this user
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('client_id', userId)
      .single()

    let customerId = sub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    userEmail,
        metadata: { supabase_user_id: userId },
      })
      customerId = customer.id
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?subscription=success`,
      cancel_url:           `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?step=billing&canceled=1`,
      subscription_data: {
        trial_period_days: 14,
        metadata:           { supabase_user_id: userId, plan: planKey },
      },
      metadata: { supabase_user_id: userId, plan: planKey },
    })

    return NextResponse.json({ url: checkoutSession.url })

  } catch (err) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
