import { NextResponse } from 'next/server'
import { rateLimit } from '../../../../lib/rate-limit'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { resolveActiveBrandId } from '../../../../lib/brand'
import { mirrorImage, stripHtml } from '../../../../lib/reference-store'

// Best-effort: reads a public post's caption and thumbnail through the
// platform's own oEmbed endpoint. This is NOT scraping, so it only gets what
// the platform chooses to publish (usually the text and a preview image,
// never the video itself). Each platform's endpoint is fixed here, so a pasted
// link can never make the server fetch an arbitrary address.
export const runtime = 'nodejs'
export const maxDuration = 30

function endpointFor(u) {
  const h = u.hostname.replace(/^www\./, '')
  const enc = encodeURIComponent(u.toString())
  if (h === 'x.com' || h === 'twitter.com') return { name: 'X', url: `https://publish.twitter.com/oembed?omit_script=1&url=${enc}` }
  if (h === 'tiktok.com') return { name: 'TikTok', url: `https://www.tiktok.com/oembed?url=${enc}` }
  if (h === 'youtube.com' || h === 'youtu.be') return { name: 'YouTube', url: `https://www.youtube.com/oembed?format=json&url=${enc}` }
  if (h === 'instagram.com' && process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET) {
    const tok = encodeURIComponent(`${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET}`)
    return { name: 'Instagram', url: `https://graph.facebook.com/v21.0/instagram_oembed?url=${enc}&access_token=${tok}` }
  }
  return null
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'ref-link', 30)
    if (limited) return limited
    const userId = session.user.id

    const { url, platform } = await request.json().catch(() => ({}))
    if (!['linkedin', 'instagram', 'twitter'].includes(platform)) return NextResponse.json({ error: 'Pick a platform tab first.' }, { status: 400 })

    let u
    try { u = new URL(String(url || '').trim()) } catch { return NextResponse.json({ error: 'That is not a valid link.' }, { status: 400 }) }
    if (u.protocol !== 'https:') return NextResponse.json({ error: 'Links must start with https://' }, { status: 400 })
    if (/(^|\.)linkedin\.com$/.test(u.hostname)) {
      return NextResponse.json({ error: "LinkedIn doesn't allow reading posts from a link. Paste the post text into the box instead." }, { status: 400 })
    }

    const ep = endpointFor(u)
    if (!ep) return NextResponse.json({ error: 'Links from this site are not supported. Paste the text or upload the image instead.' }, { status: 400 })

    const res = await fetch(ep.url, { headers: { 'User-Agent': 'ContentEngine reference import' } })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return NextResponse.json({ error: `${ep.name} wouldn't share that post (it may be private, deleted, or ${ep.name} requires extra approval for link lookups). Paste the text or upload the image instead.` }, { status: 502 })
    }

    const text = data.html ? stripHtml(data.html).replace(/^—.*$/m, '').trim() : (data.title || '')
    const body = (text || data.title || '').slice(0, 3000) || null
    const brandId = await resolveActiveBrandId(supabase, userId)
    const thumb = data.thumbnail_url ? await mirrorImage(data.thumbnail_url, userId, `link-${Date.now()}`) : null
    if (!body && !thumb) return NextResponse.json({ error: `${ep.name} returned no text or image for that link.` }, { status: 502 })

    const { error } = await supabaseAdmin.from('brand_reference_posts').insert({
      client_id: userId, brand_id: brandId, platform, source: 'link', source_url: u.toString(),
      body, media: thumb ? [{ url: thumb, kind: 'frame' }] : [],
      metadata: { provider: ep.name, author: data.author_name || null },
    })
    if (error) return NextResponse.json({ error: "Couldn't save it: " + error.message }, { status: 500 })
    return NextResponse.json({ ok: true, hadText: !!body, hadImage: !!thumb })
  } catch (err) {
    console.error('Reference link error:', err)
    return NextResponse.json({ error: err.message || 'Link import failed' }, { status: 500 })
  }
}
