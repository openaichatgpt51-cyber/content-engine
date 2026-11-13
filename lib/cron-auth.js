import crypto from 'crypto'

// Cron routes are public URLs, so the shared secret is the only gate.
// Fail CLOSED: if CRON_SECRET is missing or too short, nothing is authorised
// (otherwise the header "Bearer undefined" would match an unset variable).
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return false
  const header = request.headers.get('authorization') || ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  if (given.length !== expected.length) return false
  return crypto.timingSafeEqual(given, expected)
}
