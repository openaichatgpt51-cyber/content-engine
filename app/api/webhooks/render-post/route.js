import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { handleRender } from '../../../../lib/render-handler'

export const runtime = 'nodejs'
export const maxDuration = 30

// n8n use: authenticated with the shared RENDER_SECRET header; client_id is
// supplied by the workflow and the brand must belong to that client.
export async function POST(request) {
  const secret = process.env.RENDER_SECRET || ''
  const given  = request.headers.get('x-render-secret') || ''
  const ok = secret.length >= 16 && given.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  if (!ok) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!body.client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  const r = await handleRender(String(body.client_id), body)
  return NextResponse.json(r.json, { status: r.status })
}
