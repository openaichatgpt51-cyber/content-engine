import { describe, it, expect, afterEach } from 'vitest'
import { safeRedirect, createState, readState } from '../oauth-state'
import { isCronAuthorized } from '../cron-auth'

const req = (headers = {}, url = 'https://app.test/x', cookies = {}) => ({
  url,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  cookies: { get: (k) => (cookies[k] ? { value: cookies[k] } : undefined) },
})

describe('safeRedirect', () => {
  it('allows in-app paths', () => {
    expect(safeRedirect('/dashboard/settings')).toBe('/dashboard/settings')
    expect(safeRedirect('/onboarding?step=2')).toBe('/onboarding?step=2')
  })
  it('blocks open redirects', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/dashboard//evil.com', '/login', '', null, undefined, '/dashboard\r\nX: 1']) {
      expect(safeRedirect(bad)).toBe('/dashboard/settings')
    }
  })
})

describe('oauth state', () => {
  it('accepts a matching nonce and returns the redirect', () => {
    const { nonce, state } = createState('/dashboard/calendar')
    const r = readState(req({}, `https://app.test/cb?state=${state}`, { oauth_state_linkedin: nonce }), 'linkedin')
    expect(r).toEqual({ ok: true, redirect: '/dashboard/calendar' })
  })
  it('rejects a missing cookie, wrong nonce or tampered state', () => {
    const { nonce, state } = createState('/dashboard')
    expect(readState(req({}, `https://app.test/cb?state=${state}`), 'linkedin').ok).toBe(false)
    expect(readState(req({}, `https://app.test/cb?state=${state}`, { oauth_state_linkedin: 'x'.repeat(nonce.length) }), 'linkedin').ok).toBe(false)
    expect(readState(req({}, 'https://app.test/cb?state=abc', { oauth_state_linkedin: nonce }), 'linkedin').ok).toBe(false)
    expect(readState(req({}, 'https://app.test/cb', { oauth_state_linkedin: nonce }), 'linkedin').ok).toBe(false)
  })
  it('sanitises a malicious redirect inside a valid state', () => {
    const { nonce, state } = createState('//evil.com')
    expect(readState(req({}, `https://app.test/cb?state=${state}`, { oauth_state_x: nonce }), 'x').redirect).toBe('/dashboard/settings')
  })
})

describe('isCronAuthorized', () => {
  const old = process.env.CRON_SECRET
  afterEach(() => { process.env.CRON_SECRET = old })
  it('rejects when the secret is unset, even for "Bearer undefined"', () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorized(req({ authorization: 'Bearer undefined' }))).toBe(false)
    expect(isCronAuthorized(req({}))).toBe(false)
  })
  it('rejects short secrets', () => {
    process.env.CRON_SECRET = 'short'
    expect(isCronAuthorized(req({ authorization: 'Bearer short' }))).toBe(false)
  })
  it('accepts only the exact bearer', () => {
    process.env.CRON_SECRET = 'a-long-enough-secret-123'
    expect(isCronAuthorized(req({ authorization: 'Bearer a-long-enough-secret-123' }))).toBe(true)
    expect(isCronAuthorized(req({ authorization: 'Bearer a-long-enough-secret-124' }))).toBe(false)
    expect(isCronAuthorized(req({ authorization: 'a-long-enough-secret-123' }))).toBe(false)
  })
})
