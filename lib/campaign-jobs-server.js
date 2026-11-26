import 'server-only'
import crypto from 'crypto'
import { supabaseAdmin } from './supabase-admin'
import { loadLocaleContext } from './locale-context'
import { logGenerations } from './usage'

const N8N_WEBHOOK_URL    = process.env.N8N_WEBHOOK_URL
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET

// Real dependencies for advanceJob (see lib/campaign-jobs.js).
export function serverDeps(job) {
  return {
    async claim(jobId) {
      const { data, error } = await supabaseAdmin.rpc('claim_campaign_item', { p_job: jobId })
      if (error) throw new Error(error.message)
      return Array.isArray(data) ? (data[0] || null) : (data || null)
    },
    async items(jobId) {
      const { data } = await supabaseAdmin.from('campaign_job_items')
        .select('id, position, topic, platforms, status, error, attempts, started_at, finished_at')
        .eq('job_id', jobId).order('position')
      return data || []
    },
    async finish(id, patch) {
      await supabaseAdmin.from('campaign_job_items').update(patch).eq('id', id).eq('status', 'running')
    },
    async markDone(jobId) {
      await supabaseAdmin.from('campaign_jobs').update({ status: 'done', finished_at: new Date().toISOString() })
        .eq('id', jobId).eq('status', 'running')
    },
    async log(item, result) {
      await logGenerations([{ client_id: job.client_id, brand_id: job.brand_id, source: 'campaign',
        platforms: item.platforms, status: result.ok ? 'accepted' : 'failed', error: result.ok ? null : result.error }])
    },
    async callN8n(item) {
      const { data: profile } = await supabaseAdmin.from('brand_profiles')
        .select('company_description, target_audience, topics_to_avoid, example_posts')
        .eq('brand_id', job.brand_id).maybeSingle()
      const parts = [`Company: ${profile?.company_description || ''}`, `Audience: ${profile?.target_audience || ''}`]
      if (profile?.topics_to_avoid) parts.push(`Avoid discussing: ${profile.topics_to_avoid}`)
      if (profile?.example_posts?.filter(Boolean).length) {
        parts.push(`Match the style of these examples:\n${profile.example_posts.filter(Boolean).join('\n---\n')}`)
      }
      const locale = await loadLocaleContext(job.client_id, job.brand_id)
      const headers = { 'Content-Type': 'application/json' }
      if (N8N_WEBHOOK_SECRET) headers['x-webhook-secret'] = N8N_WEBHOOK_SECRET
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST', headers,
        body: JSON.stringify({
          topic: item.topic, platforms: item.platforms.join(','), tone: item.tone || 'Professional',
          brand_voice: parts.join('\n\n'), is_carousel: !!item.is_carousel,
          slide_count: item.is_carousel ? item.slide_count : null, is_campaign: true,
          ...locale, client_id: job.client_id, brand_id: job.brand_id, client_email: job.client_email,
          campaign_item_id: item.id,
        }),
      })
      if (res.ok) return { ok: true }
      const text = await res.text().catch(() => '')
      return { ok: false, error: `${res.status} ${text}` }
    },
  }
}

// The server keeps a campaign moving by calling advance on itself with this
// shared secret. Without CRON_SECRET it still works: the open page drives it.
export function internalSecret() { return process.env.CRON_SECRET || '' }

export function validInternal(request) {
  const secret = internalSecret()
  const given = request.headers.get('x-campaign-secret') || ''
  return secret.length >= 16 && given.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))
}

export function kickAdvance(origin, jobId) {
  const secret = internalSecret()
  if (!secret) return Promise.resolve()
  return fetch(`${origin}/api/campaign-jobs/${jobId}/advance`, {
    method: 'POST', headers: { 'x-campaign-secret': secret },
  }).catch(() => {})
}

export async function loadOwnedJob(jobId, userId) {
  const { data } = await supabaseAdmin.from('campaign_jobs')
    .select('id, client_id, brand_id, client_email, status, total, created_at, finished_at')
    .eq('id', jobId).eq('client_id', userId).maybeSingle()
  return data || null
}
