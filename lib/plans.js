// Client-safe plan display data — no Stripe SDK, no secret env vars.
// Import this from any component (client or server) that just needs to
// show plan info. For the actual price IDs / Stripe client, use lib/stripe.js
// from server-only code (API routes).

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 49,
    posts_limit: 30,
    workspaces_limit: 1,
    description: 'Perfect for solo executives',
    features: [
      '30 posts per month',
      '1 workspace',
      'LinkedIn, Instagram & X',
      'AI content generation',
      'Review queue',
    ],
  },
  growth: {
    name: 'Growth',
    price: 149,
    posts_limit: 120,
    workspaces_limit: 3,
    description: 'For growing teams',
    features: [
      '120 posts per month',
      '3 workspaces',
      'LinkedIn, Instagram & X',
      'Priority AI generation',
      'Analytics dashboard',
    ],
  },
  agency: {
    name: 'Agency',
    price: 399,
    posts_limit: 999999,
    workspaces_limit: 10,
    description: 'For agencies and power users',
    features: [
      'Unlimited posts',
      '10 workspaces',
      'All platforms',
      'White-label ready',
      'Dedicated support',
    ],
  },
}

export function getPlanLimits(planKey) {
  return PLANS[planKey] || PLANS.starter
}
