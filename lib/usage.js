import 'server-only'
import { supabaseAdmin } from './supabase-admin'
import { lagosMonthBounds, meterDecision } from './usageRules'

// Per-client usage metering. A client is metered when an Owner switches it on
// in the admin panel (clients.usage_metering + monthly_post_limit). Usage is
// the number of generations the app sent to n8n this calendar month (Lagos),
// read from generation_events, so it is exact and immediate.

export async function getMeter(clientId, now = new Date()) {
  const { start, end } = lagosMonthBounds(now)
  const { data: c } = await supabaseAdmin.from('clients')
    .select('usage_metering, monthly_post_limit').eq('id', clientId).maybeSingle()
  const metered = !!c?.usage_metering && !!c?.monthly_post_limit
  if (!metered) return { metered: false, limit: null, used: null, remaining: null, periodStart: start.toISOString(), resetsAt: end.toISOString() }
  const { count } = await supabaseAdmin.from('generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).eq('status', 'accepted').gte('created_at', start.toISOString())
  const used = count || 0
  return { metered: true, limit: c.monthly_post_limit, used, remaining: Math.max(0, c.monthly_post_limit - used), periodStart: start.toISOString(), resetsAt: end.toISOString() }
}

// Returns null when the request may go ahead, or an error payload when it
// would take a metered client over their cap.
export function checkMeter(meter, requested) {
  return meterDecision(meter, requested)
}

// Best effort: a logging failure must never block a client's generation.
export async function logGenerations(rows) {
  if (!rows?.length) return
  try {
    const { error } = await supabaseAdmin.from('generation_events').insert(rows.map(r => ({
      client_id: r.client_id,
      brand_id: r.brand_id || null,
      source: r.source || 'generate',
      platforms: Array.isArray(r.platforms) ? r.platforms.join(',') : (r.platforms || null),
      status: r.status,
      error: r.error ? String(r.error).slice(0, 500) : null,
    })))
    if (error) console.error('generation_events insert failed:', error.message)
  } catch (e) {
    console.error('generation_events insert failed:', e.message)
  }
}
