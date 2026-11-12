import { contrastRatio } from './brand-kit.js'

export const SIZES = {
  square:   { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story:    { width: 1080, height: 1920 },
}

export function clampHeadline(text, max = 140) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.6))).trim() + '…'
}

// Biggest font size (px) at which `text` fits a box, estimating ~0.55em per
// character and 1.15 line height. Estimates are deliberately conservative.
export function fitFontSize(text, boxW, boxH, { max = 96, min = 38 } = {}) {
  const len = Math.max(String(text || '').length, 1)
  for (let size = max; size >= min; size -= 2) {
    const perLine = Math.max(Math.floor(boxW / (size * 0.55)), 1)
    const lines = Math.ceil(len / perLine)
    if (lines * size * 1.15 <= boxH) return size
  }
  return min
}

// Overlay colour that keeps `textColor` readable on a photo.
export function overlayFor(textColor) {
  return contrastRatio(textColor, '#000000') >= contrastRatio(textColor, '#FFFFFF') ? '0,0,0' : '255,255,255'
}

// Pixel box of the photo for each layout, so the background is resized once.
export function photoBox(layout, { width, height }) {
  if (layout === 'split') {
    return height >= width ? { width, height: Math.round(height * 0.5) } : { width: Math.round(width * 0.5), height }
  }
  if (layout === 'quote') return { width: 0, height: 0 } // no photo
  return { width, height }
}
