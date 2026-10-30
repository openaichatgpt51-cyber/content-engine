import { DateTime } from 'luxon'

// ── SYNC WARNING ─────────────────────────────────────────────────────────
// This is a straight port of the logic embedded in two n8n Code nodes:
// "Calculate Next Slot" and "Calculate Next Slot (Campaign)". n8n Code
// nodes can't import external modules, so those nodes carry their own
// duplicated copy of this logic. If you change the scheduling behavior
// here, you MUST also update both n8n nodes by hand — nothing enforces
// that they stay in sync. This file existing at all is what makes the
// logic testable; it does not eliminate the drift risk between here and
// the live n8n workflow.

const DAY_MAP = { Sunday: 7, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
const DEFAULT_DAYS = ['Monday', 'Wednesday', 'Friday']
const DEFAULT_TIME = '09:00'
const DEFAULT_TZ = 'Africa/Lagos'

// KBP-003: malformed or out-of-range times fall back to the default instead of throwing
function parseTime(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim())
  if (m) {
    const hh = Number(m[1]), mm = Number(m[2])
    if (hh <= 23 && mm <= 59) return [hh, mm]
  }
  return DEFAULT_TIME.split(':').map(Number)
}

/**
 * Computes each platform's next available posting slot from a client's
 * per-platform schedule, with no collision checking — used for single-post
 * (non-campaign) generation. Mirrors n8n's "Calculate Next Slot" node.
 *
 * @param {object} schedule - onboarding row shape: linkedin_posting_days,
 *   linkedin_posting_time, instagram_posting_days, instagram_posting_time,
 *   twitter_posting_days, twitter_posting_time, timezone, plus legacy
 *   posting_days/posting_time fallback fields.
 * @param {DateTime} [now] - injectable for deterministic tests; defaults
 *   to real current time.
 * @returns {{ linkedin_scheduled_time: string, instagram_scheduled_time: string, twitter_scheduled_time: string }}
 */
export function calculateNextSlot(schedule, now) {
  const tz = schedule.timezone || DEFAULT_TZ
  const nowDt = now || DateTime.now().setZone(tz)

  const platformCols = {
    linkedin_scheduled_time:  { days: schedule.linkedin_posting_days,  time: schedule.linkedin_posting_time },
    instagram_scheduled_time: { days: schedule.instagram_posting_days, time: schedule.instagram_posting_time },
    twitter_scheduled_time:   { days: schedule.twitter_posting_days,   time: schedule.twitter_posting_time },
  }

  const result = {}
  for (const [field, cfg] of Object.entries(platformCols)) {
    const days = (cfg.days && cfg.days.length) ? cfg.days : (schedule.posting_days && schedule.posting_days.length ? schedule.posting_days : DEFAULT_DAYS)
    const time = cfg.time || schedule.posting_time || DEFAULT_TIME
    const [hh, mm] = parseTime(time)
    const targetWeekdays = days.map(d => DAY_MAP[d]).filter(Boolean)

    let anchor = null
    for (let i = 0; i < 8; i++) {
      const check = nowDt.plus({ days: i }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 })
      if (targetWeekdays.includes(check.weekday) && check > nowDt) { anchor = check; break }
    }
    if (!anchor) anchor = nowDt.plus({ days: 1 }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 })

    result[field] = anchor.toUTC().toISO()
  }
  return result
}

/**
 * Same idea, but collision-aware per platform against already-scheduled
 * posts for this client — used for campaign generation. Mirrors n8n's
 * "Calculate Next Slot (Campaign)" node.
 *
 * @param {object} schedule - same shape as calculateNextSlot
 * @param {Array<object>} existingPosts - rows with linkedin_scheduled_time /
 *   instagram_scheduled_time / twitter_scheduled_time fields (ISO strings)
 * @param {DateTime} [now]
 */
export function calculateNextSlotWithCollisionAvoidance(schedule, existingPosts, now) {
  const tz = schedule.timezone || DEFAULT_TZ
  const nowDt = now || DateTime.now().setZone(tz)

  const platformCols = {
    linkedin_scheduled_time:  { days: schedule.linkedin_posting_days,  time: schedule.linkedin_posting_time },
    instagram_scheduled_time: { days: schedule.instagram_posting_days, time: schedule.instagram_posting_time },
    twitter_scheduled_time:   { days: schedule.twitter_posting_days,   time: schedule.twitter_posting_time },
  }

  const result = {}
  for (const [field, cfg] of Object.entries(platformCols)) {
    const days = (cfg.days && cfg.days.length) ? cfg.days : (schedule.posting_days && schedule.posting_days.length ? schedule.posting_days : DEFAULT_DAYS)
    const time = cfg.time || schedule.posting_time || DEFAULT_TIME
    const [hh, mm] = parseTime(time)
    const targetWeekdays = days.map(d => DAY_MAP[d]).filter(Boolean)

    const takenDays = new Set(
      (existingPosts || [])
        .filter(p => p[field])
        .map(p => DateTime.fromISO(p[field], { zone: 'utc' }).setZone(tz).toISODate())
    )

    let anchor = null
    for (let i = 0; i < 60; i++) {
      const check = nowDt.plus({ days: i }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 })
      if (!targetWeekdays.includes(check.weekday)) continue
      if (check <= nowDt) continue
      if (takenDays.has(check.toISODate())) continue
      anchor = check; break
    }
    if (!anchor) {
      for (let i = 0; i < 8; i++) {
        const check = nowDt.plus({ days: i }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 })
        if (targetWeekdays.includes(check.weekday) && check > nowDt) { anchor = check; break }
      }
    }
    // KBP-002: same last-resort fallback as calculateNextSlot (no valid day names)
    if (!anchor) anchor = nowDt.plus({ days: 1 }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 })
    result[field] = anchor.toUTC().toISO()
  }
  return result
}
