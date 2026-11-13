import { NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { createSupabaseServerClient } from '../../../lib/supabase-server'

// Always return JSON, even on failure — the settings page calls res.json()
// unconditionally, so an HTML error page here is what produced
// "Unexpected token '<', <!DOCTYPE ... is not valid JSON".
export const runtime = 'nodejs'
export const maxDuration = 60

const PROMPT = `You are a visual art director. Look at these brand reference images and describe the brand's visual style so an image generator can reproduce it.
Cover, in 80-120 words of plain prose: colour palette, lighting, composition and framing, subject matter and how people are depicted, mood, and photographic vs illustrated treatment.
Be concrete and specific. Do not mention the images by number. No markdown, no bullet points.`

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'analyze-images', 20)
    if (limited) return limited

    const { imageUrls } = await request.json().catch(() => ({}))
    const urls = (Array.isArray(imageUrls) ? imageUrls : []).filter(u => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 5)
    if (!urls.length) return NextResponse.json({ error: 'Upload at least one image first.' }, { status: 400 })

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Image analysis is not configured (missing OPENAI_API_KEY).' }, { status: 500 })
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.VISION_MODEL || 'gpt-5-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            ...urls.map(url => ({ type: 'image_url', image_url: { url } })),
          ],
        }],
      }),
    })

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => '')
      console.error('Analyze brand images error:', aiRes.status, text.slice(0, 500))
      return NextResponse.json({ error: 'Could not analyse the images — check they are publicly viewable and try again.' }, { status: 502 })
    }

    const body = await aiRes.json()
    const description = (body.choices?.[0]?.message?.content || '').trim()
    if (!description) return NextResponse.json({ error: 'The analysis came back empty — try again.' }, { status: 502 })

    return NextResponse.json({ description })
  } catch (err) {
    console.error('Analyze brand images error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
