import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { calculateNextSlot, calculateNextSlotWithCollisionAvoidance } from '../scheduling.js'

// Fixed reference point for every test: Wednesday, 9 Sept 2026, 10:00 in
// Africa/Lagos — deterministic, no reliance on real "now".
const NOW = DateTime.fromISO('2026-09-09T10:00:00', { zone: 'Africa/Lagos' })

describe('calculateNextSlot', () => {
  it('picks the next matching weekday at the configured time', () => {
    const schedule = {
      timezone: 'Africa/Lagos',
      linkedin_posting_days: ['Friday'],
      linkedin_posting_time: '09:00',
    }
    const result = calculateNextSlot(schedule, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.weekday).toBe(5) // Friday
    expect(anchor.toISODate()).toBe('2026-09-11') // the very next Friday from Wed 9th
    expect(anchor.hour).toBe(9)
  })

  it('never picks a slot in the past, even on the same weekday later today', () => {
    // "now" is Wednesday 10:00 — if LinkedIn's time is 09:00 (already passed
    // today), it must roll to NEXT Wednesday, not today.
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Wednesday'], linkedin_posting_time: '09:00' }
    const result = calculateNextSlot(schedule, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.toISODate()).toBe('2026-09-16') // next Wednesday, not today
  })

  it('picks later today if the time genuinely has not passed yet', () => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Wednesday'], linkedin_posting_time: '18:00' }
    const result = calculateNextSlot(schedule, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.toISODate()).toBe('2026-09-09') // today
    expect(anchor.hour).toBe(18)
  })

  it('each platform computes independently, on different days/times', () => {
    const schedule = {
      timezone: 'Africa/Lagos',
      linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00',
      instagram_posting_days: ['Saturday'], instagram_posting_time: '14:00',
      twitter_posting_days: ['Sunday'], twitter_posting_time: '20:00',
    }
    const result = calculateNextSlot(schedule, NOW)
    expect(DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos').weekday).toBe(5)
    expect(DateTime.fromISO(result.instagram_scheduled_time).setZone('Africa/Lagos').weekday).toBe(6)
    expect(DateTime.fromISO(result.twitter_scheduled_time).setZone('Africa/Lagos').weekday).toBe(7)
  })

  it('falls back to legacy shared posting_days/posting_time when per-platform columns are empty', () => {
    const schedule = { timezone: 'Africa/Lagos', posting_days: ['Friday'], posting_time: '11:00', linkedin_posting_days: [] }
    const result = calculateNextSlot(schedule, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.weekday).toBe(5)
    expect(anchor.hour).toBe(11)
  })

  it('falls back to Mon/Wed/Fri 09:00 when nothing at all is configured', () => {
    const result = calculateNextSlot({}, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect([1, 3, 5]).toContain(anchor.weekday) // Mon, Wed, or Fri
    expect(anchor.hour).toBe(9)
  })

  it('returns valid UTC ISO strings', () => {
    const result = calculateNextSlot({ linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00' }, NOW)
    expect(result.linkedin_scheduled_time).toMatch(/Z$|\+00:00$/)
  })
})

describe('calculateNextSlotWithCollisionAvoidance', () => {
  it('skips a day already taken for that platform and rolls to the next match', () => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00' }
    // The very next Friday (11 Sept) is already taken.
    const existing = [{ linkedin_scheduled_time: '2026-09-11T08:00:00Z' }]
    const result = calculateNextSlotWithCollisionAvoidance(schedule, existing, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.toISODate()).toBe('2026-09-18') // the Friday after that
  })

  it('does not let one platform\'s collisions affect another platform\'s availability', () => {
    const schedule = {
      timezone: 'Africa/Lagos',
      linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00',
      instagram_posting_days: ['Friday'], instagram_posting_time: '09:00',
    }
    // LinkedIn's Friday slot is taken; Instagram's is not, even though it's
    // the same calendar day/time — they're tracked independently.
    const existing = [{ linkedin_scheduled_time: '2026-09-11T08:00:00Z' }]
    const result = calculateNextSlotWithCollisionAvoidance(schedule, existing, NOW)
    const li = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    const ig = DateTime.fromISO(result.instagram_scheduled_time).setZone('Africa/Lagos')
    expect(li.toISODate()).toBe('2026-09-18') // pushed out
    expect(ig.toISODate()).toBe('2026-09-11') // unaffected, still the first Friday
  })

  it('handles multiple consecutive taken slots, rolling forward past all of them', () => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00' }
    const existing = [
      { linkedin_scheduled_time: '2026-09-11T08:00:00Z' },
      { linkedin_scheduled_time: '2026-09-18T08:00:00Z' },
    ]
    const result = calculateNextSlotWithCollisionAvoidance(schedule, existing, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.toISODate()).toBe('2026-09-25') // third available Friday
  })

  it('falls back to the simple (uncollision-checked) search if every slot in the 60-day window is taken', () => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00' }
    // Block every Friday for the next ~9 weeks.
    const existing = []
    let d = NOW
    for (let i = 0; i < 10; i++) {
      d = d.plus({ weeks: 1 })
      existing.push({ linkedin_scheduled_time: d.set({ weekday: 5 }).toUTC().toISO() })
    }
    const result = calculateNextSlotWithCollisionAvoidance(schedule, existing, NOW)
    // Should not throw, and should still return SOME valid future Friday
    // via the fallback path rather than crashing.
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.weekday).toBe(5)
    expect(anchor > NOW).toBe(true)
  })

  it('ignores existing posts with no scheduled_time for that field', () => {
    const schedule = { timezone: 'Africa/Lagos', linkedin_posting_days: ['Friday'], linkedin_posting_time: '09:00' }
    const existing = [{ instagram_scheduled_time: '2026-09-11T08:00:00Z' }] // no linkedin field at all
    const result = calculateNextSlotWithCollisionAvoidance(schedule, existing, NOW)
    const anchor = DateTime.fromISO(result.linkedin_scheduled_time).setZone('Africa/Lagos')
    expect(anchor.toISODate()).toBe('2026-09-11') // not blocked, since this post has no linkedin slot
  })
})
