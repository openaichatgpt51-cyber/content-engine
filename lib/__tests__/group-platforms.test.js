import { describe, it, expect } from 'vitest'
import { groupPlatformsBySignature } from '../group-platforms.js'

describe('groupPlatformsBySignature', () => {
  it('groups all platforms into one post when content is identical', () => {
    const content = {
      LinkedIn:  { topic: 'Q3 results', tone: 'professional' },
      Instagram: { topic: 'Q3 results', tone: 'professional' },
      Twitter:   { topic: 'Q3 results', tone: 'professional' },
    }
    const groups = groupPlatformsBySignature(content)
    expect(groups).toHaveLength(1)
    expect(groups[0].platforms.sort()).toEqual(['Instagram', 'LinkedIn', 'Twitter'])
  })

  it('splits into separate posts when one platform has different content', () => {
    const content = {
      LinkedIn:  { topic: 'Q3 results', tone: 'professional' },
      Instagram: { topic: 'Q3 results', tone: 'professional' },
      Twitter:   { topic: 'A completely different hot take', tone: 'provocative' },
    }
    const groups = groupPlatformsBySignature(content)
    expect(groups).toHaveLength(2)
    const twitterGroup = groups.find(g => g.platforms.includes('Twitter'))
    expect(twitterGroup.platforms).toEqual(['Twitter'])
    expect(twitterGroup.platforms).not.toContain('LinkedIn')
  })

  it('excludes a platform with no topic entirely, rather than generating an empty post', () => {
    const content = {
      LinkedIn:  { topic: 'Q3 results', tone: 'professional' },
      Instagram: { topic: '', tone: 'professional' },
      Twitter:   { topic: '   ', tone: 'professional' }, // whitespace-only also excluded
    }
    const groups = groupPlatformsBySignature(content)
    expect(groups).toHaveLength(1)
    expect(groups[0].platforms).toEqual(['LinkedIn'])
  })

  it('returns an empty array for empty or missing content', () => {
    expect(groupPlatformsBySignature({})).toEqual([])
    expect(groupPlatformsBySignature(null)).toEqual([])
    expect(groupPlatformsBySignature(undefined)).toEqual([])
  })

  it('clamps carousel slide_count between 2 and 10', () => {
    const tooFew = groupPlatformsBySignature({ LinkedIn: { topic: 'x', is_carousel: true, slideCount: 1 } })
    expect(tooFew[0].slide_count).toBe(2)

    const tooMany = groupPlatformsBySignature({ LinkedIn: { topic: 'x', is_carousel: true, slideCount: 99 } })
    expect(tooMany[0].slide_count).toBe(10)

    const invalid = groupPlatformsBySignature({ LinkedIn: { topic: 'x', is_carousel: true, slideCount: 'not a number' } })
    expect(invalid[0].slide_count).toBe(5) // default
  })

  it('nulls slide_count when is_carousel is false, regardless of slideCount value', () => {
    const groups = groupPlatformsBySignature({ LinkedIn: { topic: 'x', is_carousel: false, slideCount: 7 } })
    expect(groups[0].slide_count).toBeNull()
  })

  it('two platforms with the same topic/tone but is_carousel:false and different slideCount values still group together', () => {
    // slide_count is irrelevant/nulled for non-carousel posts, so differing
    // slideCount values shouldn't create a false split.
    const content = {
      LinkedIn:  { topic: 'x', tone: 'professional', is_carousel: false, slideCount: 3 },
      Instagram: { topic: 'x', tone: 'professional', is_carousel: false, slideCount: 8 },
    }
    const groups = groupPlatformsBySignature(content)
    expect(groups).toHaveLength(1)
  })

  it('defaults tone to Professional when not provided', () => {
    const groups = groupPlatformsBySignature({ LinkedIn: { topic: 'x' } })
    expect(groups[0].tone).toBe('Professional')
  })

  it('is_video and is_carousel are independently tracked in the signature', () => {
    const content = {
      LinkedIn:  { topic: 'x', is_video: true },
      Instagram: { topic: 'x', is_video: false, is_carousel: true, slideCount: 5 },
    }
    const groups = groupPlatformsBySignature(content)
    expect(groups).toHaveLength(2) // different formats -> different posts even with same topic
  })
})
