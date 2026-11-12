import { test, expect } from 'vitest'
import { clampHeadline, fitFontSize, overlayFor, photoBox, SIZES } from '../post-layout.js'
test('clampHeadline trims long text on a word and adds an ellipsis', () => {
  const t = clampHeadline('word '.repeat(80), 60)
  expect(t.length).toBeLessThanOrEqual(61); expect(t.endsWith('…')).toBe(true)
  expect(clampHeadline('  short   text ')).toBe('short text')
})
test('fitFontSize shrinks for long text and respects bounds', () => {
  expect(fitFontSize('Hi', 900, 400)).toBe(96)
  expect(fitFontSize('x'.repeat(140), 900, 300)).toBeLessThan(96)
  expect(fitFontSize('x'.repeat(5000), 900, 100)).toBe(38)
})
test('overlay colour contrasts with text colour', () => {
  expect(overlayFor('#FFFFFF')).toBe('0,0,0'); expect(overlayFor('#111111')).toBe('255,255,255')
})
test('photo boxes', () => {
  expect(photoBox('headline', SIZES.square)).toEqual({ width: 1080, height: 1080 })
  expect(photoBox('quote', SIZES.square).width).toBe(0)
  expect(photoBox('split', SIZES.portrait)).toEqual({ width: 1080, height: 675 })
})
