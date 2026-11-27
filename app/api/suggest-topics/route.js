import { NextResponse } from 'next/server'
import { rateLimit } from '../../../lib/rate-limit'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { resolveActiveBrandId } from '../../../lib/brand'
import { buildSuggestPrompt } from '../../../lib/n8n-wait'

// Distinct platform norms matter here — the same brand shouldn't get
// identical topic suggestions for LinkedIn and Twitter. This is deliberately
// an LLM brainstorm from brand profile context, not trending-news-grounded
// (that would need a SerpAPI key/account that doesn't exist yet) — a
// reasonable fast-follow, not a blocker for this to be useful today.
const PLATFORM_GUIDANCE = {
  LinkedIn:  'Professional insight, thought leadership, industry analysis, lessons learned. Topics should sound like something a credible expert in the field would post, pitched at the brand's actual audience.',
  Instagram: 'More visual and human — behind-the-scenes, team/culture moments, product in use, relatable takes. Still on-brand, less formal than LinkedIn.',
  Twitter:   'Punchy, timely, opinionated takes. Short-form hooks, not long-form analysis — a single sharp idea per topic.',
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const limited = await rateLimit(session.user.id, 'topics', 40)
    if (limited) return limited

    const { platform, count, existing } = await request.json()
    if (!platform || !PLATFORM_GUIDANCE[platform]) {
      return NextResponse.json({ error: 'A valid platform is required' }, { status: 400 })
    }
    const n = Math.max(1, Math.min(10, Number(count) || 5))

    const brandId = await resolveActiveBrandId(supabase, session.user.id)
    const { data: profile } = await supabaseAdmin
      .from('brand_profiles')
      .select('company_description, target_audience, topics_to_avoid, tone')
      .eq('brand_id', brandId)
      .maybeSingle()

    if (!profile?.company_description?.trim() || !profile?.target_audience?.trim()) {
      return NextResponse.json({
        error: 'Complete your Brand Voice settings first — topic suggestions need a company description and target audience to work from.',
        code:  'BRAND_PROFILE_INCOMPLETE',
      }, { status: 400 })
    }

    const prompt = buildSuggestPrompt({ n, platform, profile, guidance: PLATFORM_GUIDANCE[platform], existing })

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiRes.ok) {
      const text = await openaiRes.text().catch(() => '')
      console.error('Topic suggestion OpenAI error:', text)
      return NextResponse.json({ error: 'Topic generation failed — try again' }, { status: 502 })
    }

    const body = await openaiRes.json()
    let topics = []
    try {
      const raw = body.choices?.[0]?.message?.content || '[]'
      const parsed = JSON.parse(raw)
      // Model might wrap the array in an object depending on how it
      // interprets response_format — handle both shapes defensively.
      let raw0 = Array.isArray(parsed) ? parsed : (parsed.topics ?? Object.values(parsed)[0] ?? [])
      // The model sometimes returns one string (newline-separated, maybe numbered)
      // instead of an array — spreading that later turns it into single characters.
      if (typeof raw0 === 'string') raw0 = raw0.split('\n')
      if (!Array.isArray(raw0)) raw0 = Object.values(raw0 || {})
      topics = raw0
        .map(t => (typeof t === 'string' ? t : (t && (t.topic || t.title)) || ''))
        .map(t => t.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(t => t.length > 12)
    } catch {
      return NextResponse.json({ error: 'Could not parse suggested topics — try again' }, { status: 502 })
    }

    if (!topics.length) return NextResponse.json({ error: 'Could not read the suggested topics — try again' }, { status: 502 })
    return NextResponse.json({ topics: topics.slice(0, n) })

  } catch (err) {
    console.error('Suggest topics error:', err)
    return NextResponse.json({ error: err.message || 'Topic generation failed' }, { status: 500 })
  }
}
