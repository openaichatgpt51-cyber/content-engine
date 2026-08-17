import Stripe from 'stripe'
import { PLANS } from './plans'

// SERVER-ONLY. Never import this file from a 'use client' component —
// it reads STRIPE_SECRET_KEY, which is undefined in the browser and will
// throw ("Neither apiKey nor config.authenticator provided"). Client code
// that just needs plan names/prices/features should import from ./plans
// instead.

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
})

// Price IDs live here (server-only) since they're read from secret env vars.
const PRICE_IDS = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  growth:  process.env.STRIPE_GROWTH_PRICE_ID,
  agency:  process.env.STRIPE_AGENCY_PRICE_ID,
}

export function getPriceId(planKey) {
  return PRICE_IDS[planKey]
}

export function getPlanByPriceId(priceId) {
  return Object.entries(PRICE_IDS).find(([, id]) => id === priceId)?.[0] || 'starter'
}

export function getPlanLimits(planKey) {
  return PLANS[planKey] || PLANS.starter
}
