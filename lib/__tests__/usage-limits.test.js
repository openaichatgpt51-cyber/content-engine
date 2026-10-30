import { describe, it, expect } from 'vitest'
import { checkUsageLimit } from '../usage-limits.js'

describe('checkUsageLimit', () => {
  it('allows a request within the remaining limit', () => {
    const result = checkUsageLimit({ posts_used: 2, posts_limit: 5, status: 'active' }, 2)
    expect(result.allowed).toBe(true)
    expect(result.code).toBeNull()
    expect(result.remaining).toBe(3)
  })

  it('allows a request that exactly uses up the remaining limit', () => {
    const result = checkUsageLimit({ posts_used: 3, posts_limit: 5, status: 'active' }, 2)
    expect(result.allowed).toBe(true)
  })

  it('rejects a request that exceeds the remaining limit', () => {
    const result = checkUsageLimit({ posts_used: 4, posts_limit: 5, status: 'active' }, 2)
    expect(result.allowed).toBe(false)
    expect(result.code).toBe('LIMIT_REACHED')
    expect(result.remaining).toBe(1)
  })

  it('rejects any request on a canceled subscription, even a tiny one', () => {
    const result = checkUsageLimit({ posts_used: 0, posts_limit: 5, status: 'canceled' }, 1)
    expect(result.allowed).toBe(false)
    expect(result.code).toBe('SUBSCRIPTION_CANCELED')
  })

  it('falls back to trial defaults (5 posts) when sub is null — matches what a brand-new client with no row yet gets', () => {
    const result = checkUsageLimit(null, 5)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(5)

    const overTrial = checkUsageLimit(null, 6)
    expect(overTrial.allowed).toBe(false)
    expect(overTrial.code).toBe('LIMIT_REACHED')
  })

  it('same fallback applies when sub is undefined', () => {
    const result = checkUsageLimit(undefined, 5)
    expect(result.allowed).toBe(true)
  })

  it('reports accurate used/limit/remaining even on rejection, for building a useful error message', () => {
    const result = checkUsageLimit({ posts_used: 18, posts_limit: 20, status: 'active' }, 5)
    expect(result.allowed).toBe(false)
    expect(result.used).toBe(18)
    expect(result.limit).toBe(20)
    expect(result.remaining).toBe(2)
  })
})
