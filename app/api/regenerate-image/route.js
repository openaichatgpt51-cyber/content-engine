import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../lib/supabase-server'

// Called from the Review Queue's "Change image" panel. Requires an
// authenticated session (checked below) — this is a user-triggered action,
// not a webhook, so it should NOT use the service-role client.
export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { query } = await request.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'A search query is required' }, { status: 400 })
    }

    const params = new URLSearchParams({
      key:         process.env.PIXABAY_API_KEY || '',
      q:           query.trim(),
      image_type:  'photo',
      orientation: 'horizontal',
      safesearch:  'true',
      per_page:    '5',
    })

    if (!process.env.PIXABAY_API_KEY) {
      console.error('PIXABAY_API_KEY is not set — check Vercel env vars')
      return NextResponse.json({ error: 'Image search is not configured (missing API key)' }, { status: 500 })
    }

    const res     = await fetch(`https://pixabay.com/api/?${params}`)
    const rawText = await res.text()

    if (!res.ok) {
      // Pixabay returns errors as plain text (e.g. "[ERROR 400] key parameter
      // is required"), not JSON — surfacing the raw text here instead of
      // trying to .json() it, which is what was crashing before.
      console.error('Pixabay error response:', rawText)
      return NextResponse.json({ error: `Pixabay error (${res.status}): ${rawText}` }, { status: 502 })
    }

    let body
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: 'Pixabay returned an unexpected response format' }, { status: 502 })
    }

    if (!body.hits?.length) {
      return NextResponse.json({ error: 'No matching images found — try editing the topic first' }, { status: 404 })
    }

    // Pick a random hit among the top results rather than always the first,
    // so clicking Regenerate repeatedly actually gives different options.
    const pick = body.hits[Math.floor(Math.random() * Math.min(body.hits.length, 5))]

    return NextResponse.json({ imageUrl: pick.largeImageURL })

  } catch (err) {
    console.error('Regenerate image error:', err)
    return NextResponse.json({ error: err.message || 'Regeneration failed' }, { status: 500 })
  }
}
