import { describe, it, expect } from 'vitest'
import {
  retryDecision, riskFlags, toZonedInput, fromZonedInput, formatNaira, parseNaira,
  monthlyRecurring, invoiceIsOverdue, cleanReason, median, unpublishedPlatforms,
} from '../admin/rules.js'
import { can, PERMISSIONS } from '../admin/permissions.js'

const NOW = new Date('2026-11-14T12:00:00Z')
const okAccount = { platform: 'LinkedIn', brand_id: 'b1', token_valid: true, expires_at: '2027-01-01T00:00:00Z' }

describe('retryDecision', () => {
  const failed = { id: 'p1', brand_id: 'b1', posting_status: 'FAILED', platforms: 'LinkedIn', linkedin_posted: 'NO' }

  it('resets a failed LinkedIn post to PENDING', () => {
    expect(retryDecision({ post: failed, accounts: [okAccount], now: NOW })).toEqual({ ok: true, nextStatus: 'PENDING', reason: null })
  })
  it('holds it (HALTED) when the client is paused', () => {
    expect(retryDecision({ post: failed, paused: true, accounts: [okAccount], now: NOW }).nextStatus).toBe('HALTED')
  })
  it('refuses posts that are not FAILED or PARTIAL', () => {
    for (const s of ['IN_PROGRESS', 'PENDING', 'DONE', 'AWAITING_APPROVAL']) {
      expect(retryDecision({ post: { ...failed, posting_status: s }, accounts: [okAccount], now: NOW }).ok).toBe(false)
    }
  })
  it('refuses when the LinkedIn token is invalid or expired', () => {
    expect(retryDecision({ post: failed, accounts: [{ ...okAccount, token_valid: false }], now: NOW }).ok).toBe(false)
    expect(retryDecision({ post: failed, accounts: [{ ...okAccount, expires_at: '2026-11-01T00:00:00Z' }], now: NOW }).ok).toBe(false)
  })
  it('refuses when no account is connected for the brand', () => {
    expect(retryDecision({ post: failed, accounts: [], now: NOW }).reason).toMatch(/No LinkedIn account/)
  })
  it('refuses a PARTIAL post whose only unpublished platforms are not live', () => {
    const partial = { ...failed, posting_status: 'PARTIAL', platforms: 'LinkedIn,Twitter', linkedin_posted: 'YES', twitter_posted: 'NO' }
    const d = retryDecision({ post: partial, accounts: [okAccount], now: NOW })
    expect(d.ok).toBe(false)
    expect(d.reason).toMatch(/isn't live/)
  })
  it('never counts an already-published platform as remaining', () => {
    const p = { platforms: 'LinkedIn,Instagram', linkedin_posted: 'YES', instagram_posted: 'NO' }
    expect(unpublishedPlatforms(p).map(x => x.key)).toEqual(['Instagram'])
  })
})

describe('riskFlags', () => {
  it('flags stuck, stale approvals, past due and over limit', () => {
    expect(riskFlags({ posting_status: 'IN_PROGRESS', updated_at: '2026-11-14T11:00:00Z' }, NOW)).toContain('stuck')
    expect(riskFlags({ posting_status: 'AWAITING_APPROVAL', created_at: '2026-11-10T11:00:00Z', platforms: '' }, NOW)).toContain('stale_approval')
    expect(riskFlags({ posting_status: 'PENDING', platforms: 'LinkedIn', linkedin_scheduled_time: '2026-11-09T14:00:00Z' }, NOW)).toContain('past_due')
    expect(riskFlags({ posting_status: 'PENDING', platforms: 'Twitter', twitter_hook_clean: 'x'.repeat(311), twitter_scheduled_time: '2026-11-20T10:00:00Z' }, NOW)).toEqual(expect.arrayContaining(['over_limit', 'not_live']))
  })
  it('does not flag a healthy queued LinkedIn post', () => {
    expect(riskFlags({ posting_status: 'PENDING', platforms: 'LinkedIn', linkedin_body_clean: 'hi', linkedin_scheduled_time: '2026-11-20T10:00:00Z' }, NOW)).toEqual([])
  })
})

describe('time zones (Africa/Lagos, UTC+1)', () => {
  it('shows stored UTC in local time for the datetime input (audit F03)', () => {
    expect(toZonedInput('2026-11-09T14:00:00Z', 'Africa/Lagos')).toBe('2026-11-09T15:00')
  })
  it('stores a local input as the right UTC instant', () => {
    expect(fromZonedInput('2026-11-09T15:00', 'Africa/Lagos')).toBe('2026-11-09T14:00:00.000Z')
  })
  it('round-trips without drifting', () => {
    const iso = '2026-12-31T23:30:00.000Z'
    expect(fromZonedInput(toZonedInput(iso, 'Africa/Lagos'), 'Africa/Lagos')).toBe(iso)
  })
  it('rejects malformed input', () => {
    expect(fromZonedInput('15:00', 'Africa/Lagos')).toBeNull()
  })
})

describe('money', () => {
  it('formats and parses naira', () => {
    expect(formatNaira(800000)).toBe('₦800,000')
    expect(parseNaira('₦8,400,000')).toBe(8400000)
    expect(parseNaira('abc')).toBeNull()
  })
  it('computes MRR with annual ÷ 12 and ignores ended contracts', () => {
    expect(monthlyRecurring([
      { status: 'active', cycle: 'monthly', amount_ngn: 800000 },
      { status: 'active', cycle: 'annual', amount_ngn: 8400000 },
      { status: 'ended', cycle: 'monthly', amount_ngn: 999999 },
    ])).toBe(1500000)
  })
  it('treats sent invoices past their due date as overdue', () => {
    expect(invoiceIsOverdue({ status: 'sent', due_date: '2026-11-05' }, NOW)).toBe(true)
    expect(invoiceIsOverdue({ status: 'sent', due_date: '2026-11-20' }, NOW)).toBe(false)
    expect(invoiceIsOverdue({ status: 'paid', due_date: '2026-11-05' }, NOW)).toBe(false)
  })
})

describe('misc', () => {
  it('requires a real reason', () => {
    expect(cleanReason('  ')).toBeNull()
    expect(cleanReason('ok')).toBeNull()
    expect(cleanReason('Client asked to hold')).toBe('Client asked to hold')
  })
  it('median', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([])).toBeNull()
  })
})

describe('permissions', () => {
  it('keeps money and admin management Owner-only', () => {
    for (const a of ['money.view', 'billing.edit', 'analytics.business', 'admins.manage', 'clients.create', 'leads.convert', 'clients.offboard']) {
      expect(can('owner', a)).toBe(true)
      expect(can('support', a)).toBe(false)
    }
  })
  it('lets Support run day-to-day operations', () => {
    for (const a of ['posts.retry', 'posts.reschedule', 'clients.pause', 'clients.status', 'leads.edit']) {
      expect(can('support', a)).toBe(true)
    }
  })
  it('denies unknown actions and unknown roles', () => {
    expect(can('owner', 'nope')).toBe(false)
    expect(can('guest', 'admin.view')).toBe(false)
  })
  it('every permission lists at least the Owner', () => {
    for (const roles of Object.values(PERMISSIONS)) expect(roles).toContain('owner')
  })
})
