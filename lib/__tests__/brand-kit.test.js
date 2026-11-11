import { test, expect } from 'vitest'
import { sanitizeKit, contrastRatio, DEFAULT_KIT } from '../brand-kit.js'
test('invalid input falls back to defaults', () => {
  expect(sanitizeKit(null)).toEqual(DEFAULT_KIT)
  expect(sanitizeKit({ primary: 'red', font: 'Comic', logo_url: 'http://x' })).toEqual(DEFAULT_KIT)
})
test('valid values kept and hex uppercased', () => {
  const k = sanitizeKit({ primary: '#aabbcc', font: 'Lora', layout: 'quote', logo_url: 'https://a/b.png' })
  expect(k.primary).toBe('#AABBCC'); expect(k.font).toBe('Lora'); expect(k.layout).toBe('quote'); expect(k.logo_url).toBe('https://a/b.png')
})
test('contrast', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
})
