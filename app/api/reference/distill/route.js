import { NextResponse } from 'next/server'
import { rateLimit } from '../../../../lib/rate-limit'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { resolveActiveBrandId } from '../../../../lib/brand'

// Reads everything we hold for the active brand (reference posts per platform,
// recently approved posts, saved brand images) and writes ONE compact style
// guide back to brand_profiles. Generation then uses the guide plus a few raw
// examples, instead of pasting dozens of posts into every prompt.
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_IMAGES = 6
const PER_PLATFORM = 10

const PROMPT = `You are a brand voice analyst. From the material below, write a style guide that lets a writer and an image generator reproduce this brand.
Return ONLY JSON with exactly these keys:
{
 "voice": "80-120 words of plain prose: tone, sentence length and rhythm, how openings and endings work, vocabulary habits, point of view, humour, what the brand never sounds like",
 "platforms": { "linkedin": "<=60 words", "instagram": "<=60 words", "twitter": "<=60 words" },
 "visual": "80-120 words of plain prose: colour palette, lighting, composition and framing, subjects, mood, photographic vs illustrated. Empty string if no images were provided"
}
For each platform, describe length, structure, hooks, hashtag and emoji use, and calls to action. If there is no material for a platform, use an empty string for it.
Describe only what the material shows. Do not invent facts about the company. No markdown.`

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'distill', 20)
    if (limited) return limited
    const userId = session.user.id
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Style analysis is not configured (missing OPENAI_API_KEY).' }, { status: 500 })

    const brandId = await resolveActiveBrandId(supabase, userId)

    const [{ data: refs }, { data: approved }, { data: profile }] = await Promise.all([
      supabaseAdmin.from('brand_reference_posts').select('platform, body, media').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(60),
      supabaseAdmin.from('approved_examples').select('platform, text').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(8),
      supabaseAdmin.from('brand_profiles').select('example_posts, brand_image_urls, tone, company_description').eq('brand_id', brandId).maybeSingle(),
    ])

    const byPlatform = { linkedin: [], instagram: [], twitter: [] }
    const images = [...(profile?.brand_image_urls || [])]
    for (const r of refs || []) {
      if (r.body && byPlatform[r.platform] && byPlatform[r.platform].length < PER_PLATFORM) byPlatform[r.platform].push(r.body)
      for (const m of r.media || []) if (m?.url) images.push(m.url)
    }
    for (const a of approved || []) {
      const key = String(a.platform || '').toLowerCase()
      if (a.text && byPlatform[key] && byPlatform[key].length < PER_PLATFORM) byPlatform[key].push(a.text)
    }
    for (const p of profile?.example_posts || []) if (p) byPlatform.linkedin.push(p)

    const textCount = Object.values(byPlatform).reduce((n, a) => n + a.length, 0)
    if (!textCount && !images.length) {
      return NextResponse.json({ error: 'Add some reference posts or images first, then build the style guide.' }, { status: 400 })
    }

    const material = Object.entries(byPlatform)
      .filter(([, a]) => a.length)
      .map(([p, a]) => `=== ${p.toUpperCase()} POSTS ===\n` + a.map((t, i) => `[${i + 1}] ${t.slice(0, 1200)}`).join('\n\n'))
      .join('\n\n')

    const imageUrls = [...new Set(images)].filter(u => /^https:\/\//.test(u)).slice(0, MAX_IMAGES)

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.STYLE_MODEL || process.env.VISION_MODEL || 'gpt-5-mini',
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `${PROMPT}\n\nBrand description: ${profile?.company_description || 'n/a'}\nDeclared tone: ${profile?.tone || 'n/a'}\n\n${material || '(no text posts provided)'}` },
            ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } })),
          ],
        }],
      }),
    })
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => '')
      console.error('Distill error:', aiRes.status, t.slice(0, 400))
      return NextResponse.json({ error: 'The style analysis failed. Try again in a moment.' }, { status: 502 })
    }
    const out = await aiRes.json()
    let guide
    try { guide = JSON.parse(out.choices?.[0]?.message?.content || '') } catch { guide = null }
    if (!guide?.voice) return NextResponse.json({ error: 'The analysis came back unreadable. Try again.' }, { status: 502 })

    const clean = {
      voice: String(guide.voice).trim(),
      platforms: {
        linkedin:  String(guide.platforms?.linkedin  || '').trim(),
        instagram: String(guide.platforms?.instagram || '').trim(),
        twitter:   String(guide.platforms?.twitter   || '').trim(),
      },
      visual: String(guide.visual || '').trim(),
    }

    const update = { style_guide: clean, style_guide_updated_at: new Date().toISOString() }
    if (clean.visual) update.visual_style_description = clean.visual
    const { data: saved, error } = await supabaseAdmin.from('brand_profiles').update(update).eq('brand_id', brandId).select('brand_id')
    if (error) return NextResponse.json({ error: "Built the guide but couldn't save it: " + error.message }, { status: 500 })
    if (!saved?.length) return NextResponse.json({ error: 'Save this brand\'s profile first (press Save Brand Profile), then build the style guide.' }, { status: 400 })

    return NextResponse.json({ style_guide: clean, usedPosts: textCount, usedImages: imageUrls.length })
  } catch (err) {
    console.error('Distill error:', err)
    return NextResponse.json({ error: err.message || 'Style analysis failed' }, { status: 500 })
  }
}
