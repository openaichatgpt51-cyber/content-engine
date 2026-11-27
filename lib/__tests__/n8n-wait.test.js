import { describe, it, expect } from 'vitest'
import { waitForPost, buildSuggestPrompt } from '../n8n-wait'

const noSleep = async () => {}
describe('waitForPost', () => {
  it('ignores non-proxy errors', async () => {
    let calls = 0
    expect(await waitForPost({ status: 500, postExists: async () => { calls++; return true }, sleep: noSleep })).toBe(false)
    expect(calls).toBe(0)
  })
  it('succeeds when the post appears after a 524', async () => {
    let n = 0
    expect(await waitForPost({ status: 524, postExists: async () => ++n === 3, sleep: noSleep })).toBe(true)
    expect(n).toBe(3)
  })
  it('gives up when no post ever appears', async () => {
    let n = 0
    expect(await waitForPost({ status: 504, tries: 4, postExists: async () => { n++; return false }, sleep: noSleep })).toBe(false)
    expect(n).toBe(4)
  })
})

describe('buildSuggestPrompt', () => {
  const profile = { company_description: 'Clinic', target_audience: 'Patients with hypertension', tone: '', topics_to_avoid: '' }
  const base = { n: 5, platform: 'LinkedIn', profile, guidance: 'g' }
  it('keeps the user themes and demands B2C calls to action', () => {
    const p = buildSuggestPrompt({ ...base, existing: 'Exercise and blood pressure\n' })
    expect(p).toContain('- Exercise and blood pressure')
    expect(p).toContain('call to action')
    expect(p).toContain('Patients with hypertension')
  })
  it('has no theme block when nothing is typed', () => {
    expect(buildSuggestPrompt({ ...base, existing: '' })).not.toContain('already chosen')
  })
})
