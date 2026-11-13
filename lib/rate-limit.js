import { NextResponse } from 'next/server'
import { supabaseAdmin } from './supabase-admin'

// Per-user fixed-window limiter backed by Supabase (see
// lib/migrations/20261113_rate_limits.sql). Durable across serverless
// instances, unlike an in-memory counter. If the database check itself fails
// we log and let the request through, so an outage never locks users out.
export async function rateLimit(userId, bucket, limit, windowSeconds = 3600) {
  try {
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `${bucket}:${userId}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    if (error) { console.error('rate limit check failed:', error.message); return null }
    if (data === false) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a while and try again.' },
        { status: 429, headers: { 'Retry-After': String(windowSeconds) } }
      )
    }
  } catch (e) {
    console.error('rate limit check threw:', e?.message)
  }
  return null
}
