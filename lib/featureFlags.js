// Monthly post limits and the usage meter are switched OFF for now (pilot
// phase). Everything stays in the code, guarded by this one flag, so turning
// it back on is a single change:
//
//   USAGE_LIMITS_ENABLED = true
//
// What it controls:
//   - the "N of M posts used" check in /api/generate and /api/generate-campaign
//   - the usage meter in the sidebar and on the Settings > Billing tab
//   - /api/usage (reports "can generate" and refuses to increment)
// Cancelled subscriptions are still blocked either way.
//
// n8n's "Record Usage" node (which does the counting) must be switched on/off
// at the same time as this flag.
export const USAGE_LIMITS_ENABLED = false

// Multi-brand: one client can run several brands, each with its own profile,
// schedule, review queue, analytics and platform connections. While this is
// false the brand switcher is hidden and no query is filtered by brand, so the
// dashboard behaves exactly as it did before multi-brand existed.
//
// Do not switch it on until: multibrand_05a has run, the brand-aware upserts
// are deployed, and multibrand_05b (the cutover) has run.
export const MULTI_BRAND_ENABLED = true

// Shown when a client hits their brand allowance. Fill in once the extra-brand
// price is final, e.g. 'Extra brands are ₦350,000/month each.'
export const EXTRA_BRAND_PRICE_NOTE = ''
