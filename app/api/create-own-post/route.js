import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { slotsForPlatforms } from '../../../lib/schedule'
import { resolveActiveBrandId } from '../../../lib/brand'

// "Write it myself": creates a post from text (and an optional image) the user
// supplies, with NO AI generation and no n8n run. The post lands in the Review
// Queue like any other, scheduled at the client's next posting slot, so the
// normal approve -> schedule -> publish flow applies.
//
// Uploaded posts are NOT counted against the monthly generation limit (they
// cost nothing to produce). To count them, call increment_post_count below.

const LIMITS = { LinkedIn: 3000, Instagram: 2200, Twitter: 280 }
const VALID  = Object.keys(LIMITS)

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const userId = session.user.id

    const body = await request.json()
    const texts = body.texts && typeof body.texts === 'object' ? body.texts : {}
    const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(p => VALID.includes(p))

    if (!platforms.length) return NextResponse.json({ error: 'Select at least one platform' }, { status: 400 })

    const clean = {}
    for (const p of platforms) {
      const t = String(texts[p] || '').trim()
      if (!t) return NextResponse.json({ error: `Add the text for ${p}` }, { status: 400 })
      if (t.length > LIMITS[p]) {
        return NextResponse.json({ error: `${p} text is ${t.length} characters — the limit is ${LIMITS[p]}` }, { status: 400 })
      }
      clean[p] = t
    }

    // Only accept images the user uploaded to their own folder of our bucket.
    let imageUrl = ''
    if (body.image_url) {
      const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-images/${userId}/`
      if (typeof body.image_url !== 'string' || !body.image_url.startsWith(prefix)) {
        return NextResponse.json({ error: 'That image was not uploaded through the dashboard' }, { status: 400 })
      }
      imageUrl = body.image_url
    }
    if (platforms.includes('Instagram') && !imageUrl) {
      return NextResponse.json({ error: 'Instagram posts need an image' }, { status: 400 })
    }

    const brandId = await resolveActiveBrandId(supabase, userId)
    // the brand's own schedule (copied from onboarding for existing clients)
    const { data: schedule } = await supabaseAdmin
      .from('brand_schedules')
      .select('posting_days, posting_time, timezone')
      .eq('brand_id', brandId)
      .maybeSingle()
    const times = slotsForPlatforms(platforms, schedule)

    const firstText = clean[platforms[0]]
    const topic = String(body.topic || '').trim().slice(0, 120) || firstText.split('\n')[0].slice(0, 80)

    const { data: row, error } = await supabaseAdmin
      .from('posts')
      .insert({
        client_id:             userId,
        brand_id:              brandId,
        platforms:             platforms.join(','),
        topic,
        linkedin_article_long: clean.LinkedIn || '',
        linkedin_body_clean:   clean.LinkedIn || '',
        insta_caption_clean:   clean.Instagram || '',
        twitter_hook_clean:    clean.Twitter || '',
        image_1_url:           imageUrl,
        image_2_url:           '',
        image_1_view_url:      imageUrl,
        image_2_view_url:      '',
        ...times,
        posting_status:        'AWAITING_APPROVAL',
        linkedin_posted:       'NO',
        instagram_posted:      'NO',
        twitter_posted:        'NO',
        created_at:            new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('create-own-post insert failed:', error.message)
      return NextResponse.json({ error: 'Could not save the post — please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: row.id })
  } catch (err) {
    console.error('create-own-post error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
