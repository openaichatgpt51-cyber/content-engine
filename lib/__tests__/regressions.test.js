import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { calculateNextSlot, calculateNextSlotWithCollisionAvoidance } from '../scheduling.js'
import { groupPlatformsBySignature } from '../group-platforms.js'
import { checkUsageLimit } from '../usage-limits.js'

// Regression tests for bugs found by adversarial probing.
// Intended behavior for each is stated in the test names; if you disagree
// with a choice (e.g. fall back vs. reject), change the test AND the code
// together so they never drift apart.

// Wednesday, 9 Sept 2026, 10:00 Africa/Lagos
const NOW = DateTime.fromISO('2026-09-09T10:00:00', { zone: 'Africa/Lagos' })
const ACTIVE = { posts_used: 5, posts_limit: 5, status: 'active' }

describe('KBP-001: checkUsageLimit must reject invalid requestedCount', () => {
  it.each([
    ['NaN', NaN],
    ['undefined', undefined],
    ['null', null],
    ['negative', -3],
    ['zero', 0],
    ['fractional', 1.5],
    ['numeric string', '2'],
    ['Infinity', Infinity],
  ])('rejects %s', (_label, value) => {
    const result = checkUsageLimit({ posts_used: 0, posts_limit: 5, status: 'active' }, value)
    expect(result.allowed).toBe(false)
    expect(result.code).toBe('INVALID_REQUEST')
  })

  it('an invalid count can never bypass an exhausted plan', () => {
    for (const bad of [NaN, undefined, -3]) {
      expect(checkUsageLimit(ACTIVE, bad).allowed).toBe(false)
    }
  })

  it('still allows a valid positive integer within the limit', () => {
    expect(checkUsageLimit({ posts_used: 0, posts_limit: 5, status: 'active' }, 3).allowed).toBe(true)
  })
})

describe('KBP-002: collision-aware scheduling must not crash on invalid day names', () => {
  const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Mon'], linkedin_posting_time: '09:00' }

  it('does not throw, and returns a valid future UTC time', () => {
    const result = calculateNextSlotWithCollisionAvoidance(schedule, [], NOW)
    const t = DateTime.fromISO(result.linkedin_scheduled_time)
    expect(t.isValid).toBe(true)
    expect(t > NOW).toBe(true)
  })

  it('behaves the same as the simple version for invalid day names', () => {
    const simple = calculateNextSlot(schedule, NOW)
    const collision = calculateNextSlotWithCollisionAvoidance(schedule, [], NOW)
    expect(collision.linkedin_scheduled_time).toBe(simple.linkedin_scheduled_time)
  })
})

describe('KBP-003: malformed posting_time must fall back to the default, not throw', () => {
  it.each(['9am', 'noon', '25:99', '', 'abc'])('time %j does not throw in either function', (badTime) => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Friday'], linkedin_posting_time: badTime }
    expect(() => calculateNextSlot(schedule, NOW)).not.toThrow()
    expect(() => calculateNextSlotWithCollisionAvoidance(schedule, [], NOW)).not.toThrow()
  })

  it.each(['noon', '25:99', '9am'])('uses the 09:00 default when the time is %j', (badTime) => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Friday'], linkedin_posting_time: badTime }
    const result = calculateNextSlot(schedule, NOW)
    const t = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(t.hour).toBe(9)
    expect(t.minute).toBe(0)
  })
})

describe('KBP-004: groupPlatformsBySignature must not split content that resolves identically', () => {
  it('missing tone and explicit "Professional" group together', () => {
    const groups = groupPlatformsBySignature({
      LinkedIn: { topic: 'x' },
      Instagram: { topic: 'x', tone: 'Professional' },
    })
    expect(groups).toHaveLength(1)
  })

  it('tone casing differences do not create separate posts', () => {
    const groups = groupPlatformsBySignature({
      LinkedIn: { topic: 'x', tone: 'professional' },
      Instagram: { topic: 'x', tone: 'Professional' },
    })
    expect(groups).toHaveLength(1)
  })

  it('slideCount values that clamp to the same number group together', () => {
    const groups = groupPlatformsBySignature({
      LinkedIn: { topic: 'x', is_carousel: true, slideCount: 99 },
      Instagram: { topic: 'x', is_carousel: true, slideCount: 10 },
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].slide_count).toBe(10)
  })

  it('an unspecified carousel slideCount groups with an explicit default of 5', () => {
    const groups = groupPlatformsBySignature({
      LinkedIn: { topic: 'x', is_carousel: true },
      Instagram: { topic: 'x', is_carousel: true, slideCount: 5 },
    })
    expect(groups).toHaveLength(1)
  })

  it('genuinely different content still splits', () => {
    const groups = groupPlatformsBySignature({
      LinkedIn: { topic: 'x', tone: 'professional' },
      Instagram: { topic: 'x', tone: 'casual' },
    })
    expect(groups).toHaveLength(2)
  })
})
