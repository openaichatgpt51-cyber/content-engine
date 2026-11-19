import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '../../../../lib/supabase-server'
import { suggestColorsFromImage } from '../../../../lib/logo-colors'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 5 * 1024 * 1024

// Only fetch logos from our own public storage bucket, never an arbitrary URL.
function isOurStorageUrl(raw) {
  try {
    const u = new URL(raw)
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
    return u.protocol === 'https:' && u.host === base.host && u.pathname.startsWith('/storage/v1/object/public/post-images/')
  } catch { return false }
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })

    const { logoUrl } = await request.json().catch(() => ({}))
    if (!isOurStorageUrl(logoUrl)) return NextResponse.json({ error: 'Upload your logo first.' }, { status: 400 })

    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return NextResponse.json({ error: 'Could not read the logo. Try uploading it again.' }, { status: 400 })
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'The logo file is too large.' }, { status: 400 })

    const suggestion = await suggestColorsFromImage(buf)
    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error('logo-colors failed:', err?.message)
    return NextResponse.json({ error: 'Could not suggest colours from this logo. Pick them by hand instead.' }, { status: 500 })
  }
}
