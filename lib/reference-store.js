// Server-only helpers shared by the reference-material routes.
import { supabaseAdmin } from './supabase-admin'

const BUCKET = 'post-images'

// Copies a remote image into our own storage. Platform CDN URLs (Instagram in
// particular) expire, so a reference saved with the original URL would stop
// working within days. Returns the permanent public URL, or null.
export async function mirrorImage(remoteUrl, clientId, key) {
  try {
    const res = await fetch(remoteUrl)
    if (!res.ok) return null
    const type = res.headers.get('content-type') || 'image/jpeg'
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 6 * 1024 * 1024) return null
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const path = `${clientId}/ref-${key}.${ext}`
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true })
    if (error) return null
    return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
