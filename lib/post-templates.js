import React from 'react'
import { fitFontSize, overlayFor, clampHeadline } from './post-layout.js'

const h = React.createElement
const PAD = 72
// Brand font first, then bundled Inter (basic + extended Latin) so no glyph is ever missing.
const ff = f => `${f}, Inter, InterExt, InterVi`

function Logo({ src, align = 'flex-start' }) {
  if (!src) return null
  return h('div', { style: { display: 'flex', width: '100%', justifyContent: align } },
    h('img', { src, height: 84, style: { height: 84, objectFit: 'contain' } }))
}

function Accent({ color, w = 120 }) {
  return h('div', { style: { display: 'flex', width: w, height: 10, background: color, borderRadius: 5 } })
}

// Photo full-bleed, gradient at the bottom, headline over it.
function headline({ size, kit, text, subline, photo, logo }) {
  const ov = overlayFor(kit.text)
  const fs = fitFontSize(text, size.width - PAD * 2, size.height * 0.36)
  return h('div', { style: { display: 'flex', position: 'relative', width: size.width, height: size.height, background: kit.primary } },
    photo ? h('img', { src: photo, width: size.width, height: size.height, style: { position: 'absolute', top: 0, left: 0, width: size.width, height: size.height, objectFit: 'cover' } }) : null,
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: size.width, height: size.height, display: 'flex', backgroundImage: `linear-gradient(to bottom, rgba(${ov},0.15) 0%, rgba(${ov},0.15) 35%, rgba(${ov},0.82) 100%)` } }),
    h('div', { style: { position: 'absolute', top: PAD, left: PAD, right: PAD, display: 'flex' } }, h(Logo, { src: logo })),
    h('div', { style: { position: 'absolute', left: PAD, right: PAD, bottom: PAD, display: 'flex', flexDirection: 'column', gap: 24 } },
      h(Accent, { color: kit.accent }),
      h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontWeight: 700, fontSize: fs, lineHeight: 1.15, color: kit.text } }, text),
      subline ? h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontSize: 34, color: kit.text, opacity: 0.9 } }, subline) : null))
}

// Solid brand colour, big quote mark, centred text.
function quote({ size, kit, text, subline, logo }) {
  const fs = fitFontSize(text, size.width - PAD * 2, size.height * 0.5, { max: 84 })
  return h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: size.width, height: size.height, background: kit.primary, padding: PAD } },
    h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontWeight: 700, fontSize: 220, lineHeight: 0.8, color: kit.accent } }, '“'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 28 } },
      h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontWeight: 700, fontSize: fs, lineHeight: 1.18, color: kit.text } }, text),
      subline ? h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontSize: 34, color: kit.text, opacity: 0.85 } }, subline) : null,
      h(Accent, { color: kit.accent })),
    h(Logo, { src: logo }))
}

// Photo on one half, brand-colour text panel on the other.
function split({ size, kit, text, subline, photo, photoBox, logo }) {
  const vertical = size.height >= size.width
  const panelW = vertical ? size.width : size.width - photoBox.width
  const panelH = vertical ? size.height - photoBox.height : size.height
  const fs = fitFontSize(text, panelW - PAD * 2, panelH * 0.42, { max: 64 })
  const panel = h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: panelW, height: panelH, background: kit.primary, padding: PAD } },
    h(Accent, { color: kit.accent }),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
      h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontWeight: 700, fontSize: fs, lineHeight: 1.15, color: kit.text } }, text),
      subline ? h('div', { style: { display: 'flex', fontFamily: ff(kit.font), fontSize: 30, color: kit.text, opacity: 0.9 } }, subline) : null),
    h(Logo, { src: logo }))
  const img = photo ? h('img', { src: photo, width: photoBox.width, height: photoBox.height, style: { width: photoBox.width, height: photoBox.height, objectFit: 'cover' } }) : h('div', { style: { display: 'flex', width: photoBox.width, height: photoBox.height, background: kit.secondary } })
  return h('div', { style: { display: 'flex', flexDirection: vertical ? 'column' : 'row', width: size.width, height: size.height } }, img, panel)
}

export const TEMPLATES = { headline, quote, split }

export function buildTemplate(layout, args) {
  const fn = TEMPLATES[layout] || headline
  return fn({ ...args, text: clampHeadline(args.text), subline: args.subline ? clampHeadline(args.subline, 90) : '' })
}
