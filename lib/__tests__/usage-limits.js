const DEFAULT_SUB = { posts_used: 0, posts_limit: 5, status: 'trialing' }

/**
 * Pure decision logic for whether a requested batch of posts is allowed
 * against a subscription's current usage. Deliberately returns a plain
 * result object rather than an HTTP response — keeps this testable
 * without mocking NextResponse, and callers (the API routes) decide the
 * actual status codes/JSON shape.
 *
 * @param {object|null} sub - subscriptions row, or null/undefined if the
 *   client has no row yet (falls back to trial defaults, same as the
 *   live routes do).
 * @param {number} requestedCount - how many posts this request would generate
 * @returns {{ allowed: boolean, code: string|null, remaining: number, limit: number, used: number }}
 */
export function checkUsageLimit(sub, requestedCount) {
  const effective = sub || DEFAULT_SUB

  // KBP-001: reject NaN/undefined/null/negative/zero/fractional/string/Infinity
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    return { allowed: false, code: 'INVALID_REQUEST', remaining: effective.posts_limit - effective.posts_used, limit: effective.posts_limit, used: effective.posts_used }
  }

  if (effective.status === 'canceled') {
    return { allowed: false, code: 'SUBSCRIPTION_CANCELED', remaining: 0, limit: effective.posts_limit, used: effective.posts_used }
  }

  const remaining = effective.posts_limit - effective.posts_used

  if (requestedCount > remaining) {
    return { allowed: false, code: 'LIMIT_REACHED', remaining, limit: effective.posts_limit, used: effective.posts_used }
  }

  return { allowed: true, code: null, remaining, limit: effective.posts_limit, used: effective.posts_used }
}
