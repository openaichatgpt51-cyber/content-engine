// Picks a posting time for a client — the same rule n8n's "Calculate Next Slot"
// node uses for generated posts: the next configured posting day at the
// configured time, in the client's timezone. Instagram goes out 3 hours after
// LinkedIn and X 6 hours after, like generated posts.
//
// Uses only the built-in Intl API (no date library) and handles daylight
// saving by checking the offset at the target moment.

const ISO_WEEKDAY = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 }
const DEFAULT_DAYS = ['Monday', 'Wednesday', 'Friday']

function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

// Wall-clock parts of an instant, as seen in a timezone.
function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const o = {}
  for (const p of fmt.formatToParts(date)) o[p.type] = p.value
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute }
}

// How far ahead of UTC the timezone is at a given instant, in ms.
function offsetMs(instantMs, timeZone) {
  const p = zonedParts(new Date(instantMs), timeZone)
  const wallAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi)
  return wallAsUtc - Math.floor(instantMs / 60000) * 60000
}

// The UTC instant at which a wall-clock time occurs in a timezone.
function zonedToUtcMs(y, m, d, hh, mm, timeZone) {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const off1 = offsetMs(guess, timeZone)
  let utc = guess - off1
  const off2 = offsetMs(utc, timeZone)
  if (off2 !== off1) utc = guess - off2 // crossed a daylight-saving change
  return utc
}

export function nextPostingSlot(schedule, now = new Date()) {
  const days = Array.isArray(schedule?.posting_days) && schedule.posting_days.length
    ? schedule.posting_days : DEFAULT_DAYS
  const timeZone = isValidTimeZone(schedule?.timezone) ? schedule.timezone : 'UTC'
  const [hh, mm] = String(schedule?.posting_time || '09:00').split(':').map(n => Number(n) || 0)
  const wanted = days.map(d => ISO_WEEKDAY[d]).filter(Boolean)

  const today = zonedParts(now, timeZone)
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i))
    const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay()
    if (!wanted.includes(weekday)) continue
    const utc = zonedToUtcMs(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, timeZone)
    if (utc > now.getTime()) return new Date(utc)
  }
  // No configured day within a week (or none configured): tomorrow at the set time.
  const t = new Date(Date.UTC(today.y, today.m - 1, today.d + 1))
  return new Date(zonedToUtcMs(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), hh, mm, timeZone))
}

// { linkedin, instagram, twitter } ISO strings (UTC), null for unused platforms.
export function slotsForPlatforms(platforms, schedule, now = new Date()) {
  const anchor = nextPostingSlot(schedule, now)
  const plus = hours => new Date(anchor.getTime() + hours * 3600_000).toISOString()
  return {
    linkedin_scheduled_time:  platforms.includes('LinkedIn')  ? anchor.toISOString() : null,
    instagram_scheduled_time: platforms.includes('Instagram') ? plus(3) : null,
    twitter_scheduled_time:   platforms.includes('Twitter')   ? plus(6) : null,
  }
}
