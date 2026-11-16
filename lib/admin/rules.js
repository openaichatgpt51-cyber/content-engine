// Pure business rules for the admin panel: retry safety, risk flags, time
// zones and money formatting. No server imports, so everything here is unit
// tested in lib/__tests__/admin-rules.test.js.

export const DEFAULT_TZ = 'Africa/Lagos'

// Platforms the n8n workflow can actually publish to today. X and Instagram
// are "import only" until the n8n status mismatch is fixed (their filters
// require PENDING while the scheduler sets IN_PROGRESS).
export const LIVE_PLATFORMS = ['LinkedIn']

export const PLATFORMS = [
  { key: 'LinkedIn',  label: 'LinkedIn',  text: 'linkedin_body_clean',  time: 'linkedin_scheduled_time',  posted: 'linkedin_posted',  limit: 1200 },
  { key: 'Instagram', label: 'Instagram', text: 'insta_caption_clean',  time: 'instagram_scheduled_time', posted: 'instagram_posted', limit: 2200 },
  { key: 'Twitter',   label: 'X',         text: 'twitter_hook_clean',   time: 'twitter_scheduled_time',   posted: 'twitter_posted',   limit: 280 },
]

export const STUCK_MINUTES = 30
export const STALE_APPROVAL_HOURS = 48
export const LEAD_RESPONSE_HOURS = 4

export function postPlatforms(post) {
  const raw = post?.platforms
  const list = Array.isArray(raw) ? raw.join(',') : String(raw || '')
  return PLATFORMS.filter(p => list.includes(p.key))
}

// Platforms on this post that still need publishing.
export function unpublishedPlatforms(post) {
  return postPlatforms(post).filter(p => post?.[p.posted] !== 'YES')
}

// Decide what Retry does. Returns { ok, nextStatus, reason }.
// Rules (see the plan doc): only from FAILED/PARTIAL; respect the client's
// pause; refuse when a live platform's connection is broken; refuse when only
// non-live platforms are left.
export function retryDecision({ post, paused = false, accounts = [], now = new Date() }) {
  if (!post) return { ok: false, reason: 'Post not found.' }
  if (!['FAILED', 'PARTIAL'].includes(post.posting_status)) {
    return { ok: false, reason: `Only failed or partly published posts can be retried (this one is ${post.posting_status}).` }
  }
  const remaining = unpublishedPlatforms(post)
  const live = remaining.filter(p => LIVE_PLATFORMS.includes(p.key))
  if (remaining.length > 0 && live.length === 0) {
    return { ok: false, reason: `${remaining.map(p => p.label).join(' and ')} publishing isn't live yet, so a retry can't publish this post.` }
  }
  for (const p of live) {
    const acc = accounts.find(a => a.platform === p.key && (!post.brand_id || !a.brand_id || a.brand_id === post.brand_id))
    if (!acc) return { ok: false, reason: `No ${p.label} account is connected for this brand. Ask the client to connect it.` }
    const expired = acc.expires_at && new Date(acc.expires_at).getTime() <= now.getTime()
    if (acc.token_valid === false || expired) {
      return { ok: false, reason: `The ${p.label} connection has expired. Ask the client to reconnect ${p.label}, then retry.` }
    }
  }
  return { ok: true, nextStatus: paused ? 'HALTED' : 'PENDING', reason: paused ? 'Posting is paused for this client, so the post is held until it resumes.' : null }
}

export function earliestScheduled(post) {
  const times = postPlatforms(post).map(p => post?.[p.time]).filter(Boolean).map(t => new Date(t).getTime())
  return times.length ? new Date(Math.min(...times)) : null
}

// Risk flags shown on the Posts queue and Today. Returns an array of keys.
export function riskFlags(post, now = new Date()) {
  const flags = []
  const t = now.getTime()
  const status = post?.posting_status
  if (status === 'FAILED') flags.push('failed')
  if (status === 'PARTIAL') flags.push('partial')
  if (status === 'IN_PROGRESS' && post.updated_at && t - new Date(post.updated_at).getTime() > STUCK_MINUTES * 60_000) flags.push('stuck')
  if (status === 'AWAITING_APPROVAL' && post.created_at && t - new Date(post.created_at).getTime() > STALE_APPROVAL_HOURS * 3_600_000) flags.push('stale_approval')
  if (['PENDING', 'HALTED', 'AWAITING_APPROVAL'].includes(status)) {
    const first = earliestScheduled(post)
    if (first && first.getTime() < t - 10 * 60_000) flags.push('past_due')
    if (postPlatforms(post).some(p => (post[p.text] || '').length > p.limit)) flags.push('over_limit')
    if (status !== 'AWAITING_APPROVAL' && unpublishedPlatforms(post).some(p => !LIVE_PLATFORMS.includes(p.key))) flags.push('not_live')
  }
  return flags
}

export const FLAG_LABEL = {
  failed: 'Failed',
  partial: 'Partly published',
  stuck: 'Stuck',
  stale_approval: 'Waiting > 48h',
  past_due: 'Past its time',
  over_limit: 'Over character limit',
  not_live: 'Platform not live',
}

// ── Time zones ─────────────────────────────────────────────────────────────
function zonedParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const out = {}
  for (const { type, value } of fmt.formatToParts(date)) out[type] = value
  return out
}

function offsetMs(date, tz) {
  const p = zonedParts(date, tz)
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

// ISO instant → value for <input type="datetime-local"> in the given zone.
// (The client app's Review Queue used toISOString(), which shows UTC: audit F03.)
export function toZonedInput(iso, tz = DEFAULT_TZ) {
  if (!iso) return ''
  const p = zonedParts(new Date(iso), tz)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// <input type="datetime-local"> value typed in the given zone → ISO instant.
export function fromZonedInput(value, tz = DEFAULT_TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '')
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let ts = guess - offsetMs(new Date(guess), tz)
  ts = guess - offsetMs(new Date(ts), tz) // second pass handles DST edges
  return new Date(ts).toISOString()
}

export function formatWhen(iso, tz = DEFAULT_TZ, { withZone = true } = {}) {
  if (!iso) return '—'
  const d = new Date(iso)
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return withZone ? `${s} ${zoneAbbr(tz)}` : s
}

export function formatDate(iso, tz = DEFAULT_TZ) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function zoneAbbr(tz = DEFAULT_TZ) {
  if (tz === 'Africa/Lagos') return 'WAT'
  const part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')
  return part ? part.value : tz
}

export function ageLabel(iso, now = new Date()) {
  if (!iso) return '—'
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins} min`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} days`
}

// ── Money ──────────────────────────────────────────────────────────────────
export function formatNaira(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return '₦' + Math.round(n).toLocaleString('en-NG')
}

export function parseNaira(input) {
  const digits = String(input ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isSafeInteger(n) ? n : null
}

// Monthly recurring revenue from active contracts (annual ÷ 12).
export function monthlyRecurring(contracts = []) {
  return contracts
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + (c.cycle === 'annual' ? Number(c.amount_ngn) / 12 : Number(c.amount_ngn)), 0)
}

// An invoice is overdue when it was sent, isn't paid or void, and its due date has passed.
export function invoiceIsOverdue(inv, now = new Date()) {
  if (!inv) return false
  if (inv.status === 'overdue') return true
  if (inv.status !== 'sent') return false
  return new Date(inv.due_date + 'T23:59:59Z').getTime() < now.getTime()
}

export function median(values) {
  const v = values.filter(x => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export function cleanReason(reason) {
  const r = typeof reason === 'string' ? reason.trim() : ''
  return r.length >= 3 && r.length <= 500 ? r : null
}
