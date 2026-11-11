// Brand kit: the colours, heading font, logo and default layout used when a post
// image is rendered. Stored as one jsonb object on brand_profiles.brand_kit.
export const KIT_FONTS = ['Inter', 'Poppins', 'Montserrat', 'DM Sans', 'Playfair Display', 'Merriweather', 'Lora']
export const KIT_LAYOUTS = [
  { value: 'headline', label: 'Headline over image' },
  { value: 'quote',    label: 'Quote card' },
  { value: 'split',    label: 'Split (image + text panel)' },
]
export const DEFAULT_KIT = {
  primary: '#111827', secondary: '#F3F4F6', accent: '#2563EB', text: '#FFFFFF',
  font: 'Inter', layout: 'headline', logo_url: '',
}

const HEX = /^#[0-9a-fA-F]{6}$/

// Always returns a complete, valid kit; anything invalid falls back to the default.
export function sanitizeKit(raw) {
  const k = raw && typeof raw === 'object' ? raw : {}
  const out = { ...DEFAULT_KIT }
  for (const key of ['primary', 'secondary', 'accent', 'text']) {
    if (typeof k[key] === 'string' && HEX.test(k[key])) out[key] = k[key].toUpperCase()
  }
  if (KIT_FONTS.includes(k.font)) out.font = k.font
  if (KIT_LAYOUTS.some(l => l.value === k.layout)) out.layout = k.layout
  if (typeof k.logo_url === 'string' && /^https:\/\//.test(k.logo_url)) out.logo_url = k.logo_url
  return out
}

function lum(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
// WCAG contrast ratio between two #RRGGBB colours.
export function contrastRatio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
