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
