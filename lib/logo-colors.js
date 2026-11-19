import sharp from 'sharp'
import { contrastRatio } from './brand-kit.js'

// Suggests brand-kit colours from a logo image. Pure image maths, no network:
// quantise the visible pixels, ignore transparent ones, prefer saturated colours
// over white/black/grey, and pick a text colour that is readable on the primary.

const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s, l }
}

function mixWithWhite(hex, amount) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
}
function darken(hex, amount) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)

export async function suggestColorsFromImage(buffer) {
  const { data, info } = await sharp(buffer, { failOn: 'none' })
    .resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const buckets = new Map()
  let visible = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue
    visible++
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += r; e.g += g; e.b += b
    buckets.set(key, e)
  }
  if (!visible) throw new Error('The logo has no visible pixels.')

  const all = [...buckets.values()].map(e => {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n
    return { r, g, b, share: e.n / visible, ...hsl(r, g, b) }
  })
  // Merge near-duplicates, keeping the most common first.
  all.sort((a, b) => b.share - a.share)
  const merged = []
  for (const c of all) {
    const twin = merged.find(m => dist(m, c) < 48)
    if (twin) twin.share += c.share
    else merged.push({ ...c })
  }
  const chromatic = merged.filter(c => c.s >= 0.25 && c.l >= 0.12 && c.l <= 0.9 && c.share >= 0.01)
    .sort((a, b) => b.share * (0.5 + b.s) - a.share * (0.5 + a.s))
  const neutrals = merged.filter(c => c.s < 0.25 || c.l < 0.12 || c.l > 0.9)

  const notes = []
  let primary, accent
  if (chromatic.length) {
    primary = toHex(chromatic[0].r, chromatic[0].g, chromatic[0].b)
    accent = chromatic[1] ? toHex(chromatic[1].r, chromatic[1].g, chromatic[1].b) : null
  } else {
    const dark = neutrals.filter(c => c.l < 0.5).sort((a, b) => b.share - a.share)[0]
    primary = dark ? toHex(dark.r, dark.g, dark.b) : '#111827'
    notes.push('This logo has no distinct brand colour, so check the suggestion and adjust it.')
  }
  // White text needs a dark enough primary. Darken a light brand colour a little so headlines stay readable.
  let adjusted = false
  for (let i = 0; i < 6 && contrastRatio(primary, '#FFFFFF') < 4.5 && contrastRatio(primary, '#111827') < 4.5; i++) {
    primary = darken(primary, 0.12); adjusted = true
  }
  if (adjusted) notes.push('The main colour was darkened slightly so text stays readable on it.')
  const text = contrastRatio(primary, '#FFFFFF') >= contrastRatio(primary, '#111827') ? '#FFFFFF' : '#111827'
  if (!accent) {
    accent = mixWithWhite(primary, 0.35)
    notes.push('The logo has one main colour, so the accent is a lighter shade of it.')
  }
  const secondary = mixWithWhite(primary, 0.93)
  const swatches = merged.slice(0, 6).map(c => toHex(c.r, c.g, c.b))
  return { primary, secondary, accent, text, swatches, notes, contrast: Number(contrastRatio(primary, text).toFixed(1)) }
}
