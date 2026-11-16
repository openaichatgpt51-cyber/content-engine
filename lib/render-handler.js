import { supabaseAdmin } from './supabase-admin.js'
import { renderPostPng } from './render-post.js'

const LAYOUTS = ['headline', 'quote', 'split']
const SIZE_KEYS = ['square', 'portrait', 'story']

// Shared by the dashboard route (session) and the n8n route (secret).
// `clientId` has already been authenticated by the caller.
export async function handleRender(clientId, body) {
  const brandId = String(body.brand_id || '')
  const headline = String(body.headline || '').trim()
  if (!brandId) return { status: 400, json: { error: 'brand_id is required' } }
  if (!headline || headline.length > 300) return { status: 400, json: { error: 'headline is required (max 300 characters)' } }
  if (body.layout && !LAYOUTS.includes(body.layout)) return { status: 400, json: { error: 'unknown layout' } }
  if (body.size && !SIZE_KEYS.includes(body.size)) return { status: 400, json: { error: 'unknown size' } }

  const { data: brand } = await supabaseAdmin.from('brands').select('id').eq('id', brandId).eq('client_id', clientId).maybeSingle()
  if (!brand) return { status: 404, json: { error: 'Brand not found' } }
  const { data: profile } = await supabaseAdmin.from('brand_profiles').select('brand_kit').eq('brand_id', brandId).maybeSingle()

  try {
    const { png, width, height } = await renderPostPng({
      backgroundUrl: body.background_url || '',
      headline, subline: String(body.subline || ''),
      layout: body.layout, size: body.size || 'square', kit: profile?.brand_kit,
    })
    const file = `${clientId}/render-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`
    const { error } = await supabaseAdmin.storage.from('post-images').upload(file, png, { contentType: 'image/png', upsert: false })
    if (error) return { status: 500, json: { error: 'Could not store the image' } }
    const { data: pub } = supabaseAdmin.storage.from('post-images').getPublicUrl(file)
    return { status: 200, json: { url: pub.publicUrl, width, height } }
  } catch (e) {
    return { status: 422, json: { error: e.message || 'Render failed' } }
  }
}
