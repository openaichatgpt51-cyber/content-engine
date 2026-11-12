import fs from 'node:fs'
import path from 'node:path'
import dns from 'node:dns/promises'
import net from 'node:net'
import sharp from 'sharp'
import { ImageResponse } from 'next/og'
import { SIZES, photoBox } from './post-layout.js'
import { buildTemplate } from './post-templates.js'
import { sanitizeKit } from './brand-kit.js'

const MAX_BYTES = 8 * 1024 * 1024

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:192.168.')
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

// Fetches an https image without letting a caller reach internal addresses.
export async function fetchImageBuffer(url) {
  let u
  try { u = new URL(url) } catch { throw new Error('Invalid image URL') }
  if (u.protocol !== 'https:') throw new Error('Image URL must be https')
  const host = u.hostname
  if (host === 'localhost' || net.isIP(host)) throw new Error('Image host not allowed')
  const addrs = await dns.lookup(host, { all: true })
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Image host not allowed')
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Image download failed (${res.status})`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_BYTES) throw new Error('Image is too large')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error('Image is too large')
  return buf
}

const fontCache = new Map()

function bundledInter() {
  const dir = path.join(process.cwd(), 'node_modules/@fontsource/inter/files')
  return [['latin', 'Inter'], ['latin-ext', 'InterExt'], ['vietnamese', 'InterVi']].map(([sub, name]) => ({
    name, weight: 700, style: 'normal',
    data: fs.readFileSync(path.join(dir, `inter-${sub}-700-normal.woff`)),
  }))
}

// Loads only the glyphs the text needs from Google Fonts; falls back to bundled Inter.
async function loadFonts(family, text) {
  const key = family + '|' + [...new Set(text)].sort().join('')
  if (fontCache.has(key)) return fontCache.get(key)
  let fonts
  try {
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;700&text=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(6000) })).text()
    const found = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/g)]
    if (!found.length) throw new Error('no font urls')
    fonts = []
    for (const [, weight, url] of found) {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!r.ok) throw new Error('font download failed')
      fonts.push({ name: family, weight: Number(weight), style: 'normal', data: Buffer.from(await r.arrayBuffer()) })
    }
  } catch {
    fonts = []
  }
  fonts = [...fonts, ...bundledInter()]
  if (fontCache.size > 50) fontCache.clear()
  fontCache.set(key, fonts)
  return fonts
}

const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`

// Renders a finished post image. Returns { png: Buffer, width, height }.
export async function renderPostPng({ backgroundUrl, headline, subline = '', layout, size = 'square', kit: rawKit }) {
  const kit = sanitizeKit(rawKit)
  const lay = layout || kit.layout
  const dims = SIZES[size] || SIZES.square
  const box = photoBox(lay, dims)

  let photo = null
  if (backgroundUrl && box.width > 0) {
    const raw = await fetchImageBuffer(backgroundUrl)
    const jpg = await sharp(raw).rotate().resize(box.width, box.height, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer()
    photo = dataUri(jpg, 'image/jpeg')
  }
  let logo = null
  if (kit.logo_url) {
    try {
      const raw = await fetchImageBuffer(kit.logo_url)
      const png = await sharp(raw).resize({ width: 320, height: 84, fit: 'inside' }).png().toBuffer()
      logo = dataUri(png, 'image/png')
    } catch { /* a broken logo never blocks the post */ }
  }

  const fonts = await loadFonts(kit.font, `${headline}${subline}`)
  const el = buildTemplate(lay, { size: dims, kit, text: headline, subline, photo, photoBox: box, logo })
  const res = new ImageResponse(el, { width: dims.width, height: dims.height, fonts })
  return { png: Buffer.from(await res.arrayBuffer()), ...dims }
}
