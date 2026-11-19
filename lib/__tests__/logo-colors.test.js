import { test, expect } from 'vitest'
import sharp from 'sharp'
import { suggestColorsFromImage } from '../logo-colors.js'
import { contrastRatio } from '../brand-kit.js'

const solid = (w, h, bg, extra = []) => sharp({ create: { width: w, height: h, channels: 4, background: bg } }).composite(extra).png().toBuffer()
const block = (w, h, rgba) => sharp({ create: { width: w, height: h, channels: 4, background: rgba } }).png().toBuffer()

test('transparent logo with a green mark gives green primary and readable text', async () => {
  const mark = await block(60, 60, { r: 20, g: 140, b: 70, alpha: 1 })
  const buf = await solid(100, 100, { r: 0, g: 0, b: 0, alpha: 0 }, [{ input: mark, left: 20, top: 20 }])
  const s = await suggestColorsFromImage(buf)
  expect(s.primary).toMatch(/^#[0-9A-F]{6}$/)
  const [r, g, b] = [1, 3, 5].map(i => parseInt(s.primary.slice(i, i + 2), 16))
  expect(g).toBeGreaterThan(r); expect(g).toBeGreaterThan(b)
  expect(contrastRatio(s.primary, s.text)).toBeGreaterThanOrEqual(4.5)
})
test('two colours: second becomes accent', async () => {
  const red = await block(50, 100, { r: 200, g: 30, b: 40, alpha: 1 })
  const blue = await block(50, 100, { r: 30, g: 70, b: 200, alpha: 1 })
  const buf = await solid(100, 100, { r: 255, g: 255, b: 255, alpha: 0 }, [{ input: red, left: 0, top: 0 }, { input: blue, left: 50, top: 0 }])
  const s = await suggestColorsFromImage(buf)
  expect(s.primary).not.toBe(s.accent)
})
test('black and white logo warns and still returns valid colours', async () => {
  const buf = await solid(100, 100, { r: 255, g: 255, b: 255, alpha: 1 }, [{ input: await block(40, 40, { r: 0, g: 0, b: 0, alpha: 1 }), left: 30, top: 30 }])
  const s = await suggestColorsFromImage(buf)
  expect(s.notes.length).toBeGreaterThan(0)
  expect(contrastRatio(s.primary, s.text)).toBeGreaterThanOrEqual(4.5)
})
test('light brand colour is darkened so white text is readable', async () => {
  const buf = await solid(100, 100, { r: 255, g: 220, b: 80, alpha: 1 })
  const s = await suggestColorsFromImage(buf)
  expect(contrastRatio(s.primary, s.text)).toBeGreaterThanOrEqual(4.5)
})
test('fully transparent image is rejected', async () => {
  await expect(suggestColorsFromImage(await solid(50, 50, { r: 0, g: 0, b: 0, alpha: 0 }))).rejects.toThrow()
})
