import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PLAN_LIMITS = {
  starter: 30,
  growth:  120,
  agency:  99999,
}

function getPlanFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'starter'
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID)  return 'growth'
  if (priceId === process.env.STRIPE_AGENCY_PRICE_ID)  return 'agency'
  return 'starter'
}

export async function POST(request) {
  const body = await request.text()
  const sig  = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── New subscription created ──────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId  = session.metadata?.supabase_user_id
        const planKey = session.metadata?.plan || 'starter'
        if (!userId) break

        const stripeSub = await stripe.subscriptions.retrieve(session.subscription)
        const planLimit = PLAN_LIMITS[planKey] || 30

        await supabase.from('subscriptions').upsert({
          client_id:              userId,
          stripe_customer_id:     session.customer,
          stripe_subscription_id: session.subscription,
          plan:                   planKey,
          status:                 stripeSub.status,
          posts_used:             0,
          posts_limit:            planLimit,
          current_period_start:   new Date(stripeSub.current_period_start * 1000).toISOString(),
          current_period_end:     new Date(stripeSub.current_period_end   * 1000).toISOString(),
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'client_id' })

        console.log(`Subscription created: ${userId} on ${planKey}`)
        break
      }

      // ── Subscription cancelled ────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object

        await supabase
          .from('subscriptions')
          .update({
            status:     'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        console.log(`Subscription cancelled: ${sub.id}`)
        break
      }

      // ── Payment succeeded — reset monthly post count ──────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (invoice.billing_reason !== 'subscription_cycle') break

        const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription)
        const priceId   = stripeSub.items.data[0]?.price.id
        const planKey   = getPlanFromPriceId(priceId)
        const planLimit = PLAN_LIMITS[planKey] || 30

        await supabase
          .from('subscriptions')
          .update({
            posts_used:           0,
            plan:                 planKey,
            posts_limit:          planLimit,
            status:               'active',
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
            updated_at:           new Date().toISOString(),
          })
          .eq('stripe_subscription_id', invoice.subscription)

        console.log(`Posts reset for subscription ${invoice.subscription}`)
        break
      }

      // ── Payment failed ────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', invoice.subscription)
        break
      }

      // ── Plan upgraded or downgraded ───────────────────────────────────
      case 'customer.subscription.updated': {
        const sub     = event.data.object
        const priceId = sub.items.data[0]?.price.id
        const planKey = getPlanFromPriceId(priceId)

        await supabase
          .from('subscriptions')
          .update({
            plan:        planKey,
            posts_limit: PLAN_LIMITS[planKey],
            status:      sub.status,
            updated_at:  new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        console.log(`Subscription updated to ${planKey}`)
        break
      }

      default:
        console.log(`Unhandled event: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}