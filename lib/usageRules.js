// Pure helpers for usage metering (no database), so they can be unit tested.
// Lagos is UTC+1 all year (no daylight saving).

const LAGOS_OFFSET_MS = 60 * 60 * 1000

export function lagosMonthBounds(now = new Date()) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS)
  const y = local.getUTCFullYear(), m = local.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1) - LAGOS_OFFSET_MS)
  const end = new Date(Date.UTC(y, m + 1, 1) - LAGOS_OFFSET_MS)
  return { start, end }
}

export function lagosDayStart(now = new Date()) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - LAGOS_OFFSET_MS)
}

// null = allowed. Otherwise the 429 payload to return.
export function meterDecision(meter, requested) {
  if (!meter?.metered) return null
  const n = Math.max(1, Number(requested) || 1)
  if (meter.used + n <= meter.limit) return null
  const left = Math.max(0, meter.limit - meter.used)
  const resets = new Date(meter.resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })
  return {
    error: left === 0
      ? `You've used all ${meter.limit} posts in your plan this month. Your allowance resets on ${resets}.`
      : `This needs ${n} post${n === 1 ? '' : 's'}, but you have ${left} left this month. Your allowance resets on ${resets}.`,
    code: 'LIMIT_REACHED',
    posts_used: meter.used,
    posts_limit: meter.limit,
    resets_at: meter.resetsAt,
  }
}

export function parseLimit(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null
}
