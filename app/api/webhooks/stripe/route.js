import { NextResponse } from 'next/server'
import { stripe, getPlanByPriceId, getPlanLimits } from '../../../../lib/stripe'
import { supabaseAdmin } from '../../../../lib/supabase-admin'

export async function POST(request) {
  const body = await request.text()
  const sig  = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── New subscription created / trial started ──────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId  = session.metadata?.supabase_user_id
        const planKey = session.metadata?.plan || 'starter'
        if (!userId) break

        const plan = getPlanLimits(planKey)
        const sub  = await stripe.subscriptions.retrieve(session.subscription)

        await supabaseAdmin.from('subscriptions').upsert({
          client_id:              userId,
          stripe_customer_id:     session.customer,
          stripe_subscription_id: session.subscription,
          plan:                   planKey,
          status:                 sub.status,
          posts_used:             0,
          posts_limit:            plan.posts_limit,
          current_period_start:   new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:     new Date(sub.current_period_end   * 1000).toISOString(),
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'client_id' })

        console.log(`Subscription created for user ${userId} on ${planKey} plan`)
        break
      }

      // ── Subscription renewed — reset post count ───────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (invoice.billing_reason !== 'subscription_cycle') break

        const stripeSub = await stripe.subscriptions.retrieve(invoice.subscription)
        const userId    = stripeSub.metadata?.supabase_user_id

        if (!userId) {
          // Fallback: look up by stripe_subscription_id when metadata is missing
          const { data: sub } = await supabaseAdmin
            .from('subscriptions')
            .select('client_id, plan')
            .eq('stripe_subscription_id', invoice.subscription)
            .single()
          if (!sub) break

          const plan = getPlanLimits(sub.plan)
          await supabaseAdmin.from('subscriptions').update({
            posts_used:           0,
            status:               'active',
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
            updated_at:           new Date().toISOString(),
          }).eq('stripe_subscription_id', invoice.subscription)

          console.log(`Posts reset for subscription ${invoice.subscription}`)
          break
        }

        const planKey = getPlanByPriceId(stripeSub.items.data[0]?.price.id)
        const plan    = getPlanLimits(planKey)

        await supabaseAdmin.from('subscriptions').update({
          posts_used:           0,
          plan:                 planKey,
          posts_limit:          plan.posts_limit,
          status:               'active',
          current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
          current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
          updated_at:           new Date().toISOString(),
        }).eq('client_id', userId)

        console.log(`Posts reset and plan updated for user ${userId}`)
        break
      }

      // ── Payment failed ────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        await supabaseAdmin.from('subscriptions').update({
          status:     'past_due',
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', invoice.subscription)
        console.log(`Payment failed for subscription ${invoice.subscription}`)
        break
      }

      // ── Subscription cancelled ────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabaseAdmin.from('subscriptions').update({
          status:     'canceled',
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        console.log(`Subscription cancelled: ${sub.id}`)
        break
      }

      // ── Plan changed (upgrade/downgrade) ─────────────────────
      case 'customer.subscription.updated': {
        const sub     = event.data.object
        const planKey = getPlanByPriceId(sub.items.data[0]?.price.id)
        const plan    = getPlanLimits(planKey)

        await supabaseAdmin.from('subscriptions').update({
          plan:        planKey,
          posts_limit: plan.posts_limit,
          status:      sub.status,
          updated_at:  new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        console.log(`Subscription updated to ${planKey}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
