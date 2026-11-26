import Link from 'next/link'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { loadBrandContext } from '../../../lib/brand'
import { MULTI_BRAND_ENABLED } from '../../../lib/featureFlags'
import { scopeBrand } from '../../../lib/brand-scope'
import { buildRows, summariseCampaign } from '../../../lib/campaign-status'
import LocalTime from '../../../components/LocalTime'

export const dynamic = 'force-dynamic'

const TONE = {
  published:  { bg: '#E4F3E8', fg: '#1E6B3A' },
  scheduled:  { bg: '#E6EEF8', fg: '#1F4E8C' },
  publishing: { bg: '#E6EEF8', fg: '#1F4E8C' },
  review:     { bg: '#FFF1D6', fg: '#8A5A00' },
  generating: { bg: '#EFEFEF', fg: '#555' },
  waiting:    { bg: '#EFEFEF', fg: '#555' },
  failed:     { bg: '#FBE4E2', fg: '#9B2C20' },
  generation_failed: { bg: '#FBE4E2', fg: '#9B2C20' },
  missed:     { bg: '#FBE4E2', fg: '#9B2C20' },
  partly:     { bg: '#FFF1D6', fg: '#8A5A00' },
  rejected:   { bg: '#EFEFEF', fg: '#555' },
  untracked:  { bg: '#EFEFEF', fg: '#555' },
}

function Chip({ kind, children }) {
  const t = TONE[kind] || TONE.waiting
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 500, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{children}</span>
}

function Count({ n, label }) {
  if (!n) return null
  return <span style={{ fontSize: '0.8125rem', color: 'var(--ink-40)' }}><strong style={{ color: 'var(--ink)' }}>{n}</strong> {label}</span>
}

export default async function CampaignsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  const ctx = session ? await loadBrandContext(supabase, session.user.id) : { activeBrandId: null }

  const { data: jobs } = await scopeBrand(supabase
    .from('campaign_jobs').select('id, status, total, created_at'), MULTI_BRAND_ENABLED ? ctx.activeBrandId : null)
    .order('created_at', { ascending: false }).limit(15)

  const jobIds = (jobs || []).map(j => j.id)
  const { data: itemRows } = jobIds.length
    ? await supabase.from('campaign_job_items').select('id, job_id, position, topic, platforms, status').in('job_id', jobIds)
    : { data: [] }
  const itemIds = (itemRows || []).map(i => i.id)
  const { data: postRows } = itemIds.length
    ? await supabase.from('posts').select('id, campaign_item_id, posting_status, created_at, linkedin_posted, instagram_posted, twitter_posted, linkedin_posted_at, instagram_posted_at, twitter_posted_at, linkedin_scheduled_time, instagram_scheduled_time, twitter_scheduled_time')
        .in('campaign_item_id', itemIds)
    : { data: [] }

  const campaigns = (jobs || []).map(job => {
    const rows = buildRows((itemRows || []).filter(i => i.job_id === job.id), postRows || [])
    return { job, rows, summary: summariseCampaign(rows) }
  })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>Your campaigns</h1>
        <Link href="/dashboard/campaign" style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>New campaign →</Link>
      </div>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 24 }}>
        Every topic in a campaign, and where its post is now. Campaigns started before this page existed show their topics but not publishing progress.
      </p>

      {campaigns.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ color: 'var(--ink-40)', fontSize: '0.875rem' }}>No campaigns yet. Start one from the Campaign page.</p>
        </div>
      ) : campaigns.map(({ job, rows, summary: s }) => (
        <section key={job.id} style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', marginBottom: 20, overflow: 'hidden' }}>
          <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--fog-60)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.9375rem' }}>
                Campaign of {new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} · {s.total} topic{s.total === 1 ? '' : 's'}
              </strong>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {s.remaining === 0 ? 'All done' : `${s.remaining} left to go out`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              <Count n={s.published} label="published" />
              <Count n={s.scheduled + s.publishing} label="scheduled" />
              <Count n={s.review} label="need review" />
              <Count n={s.generating} label="being written" />
              <Count n={s.partly + s.missed} label="partly or not published" />
              <Count n={s.failed + s.generation_failed} label="failed" />
              <Count n={s.rejected} label="rejected" />
            </div>
          </header>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map(r => (
              <li key={r.item.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--fog-60)' }}>
                <span style={{ color: 'var(--ink-20)', fontSize: '0.8125rem', paddingTop: 2 }}>{r.item.position}.</span>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{r.item.topic}</span>
                    <Chip kind={r.stage.stage}>{r.stage.label}</Chip>
                  </div>
                  {r.post && (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
                      {r.platforms.map(p => (
                        <span key={p.platform} style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {p.name} <Chip kind={p.state}>{p.label}</Chip>
                          {p.at && <LocalTime iso={p.at} />}
                        </span>
                      ))}
                      {r.stage.stage === 'review' && <Link href="/dashboard/review" style={{ fontSize: '0.8125rem', color: 'var(--ink)' }}>Open in Review Queue →</Link>}
                    </div>
                  )}
                  {r.item.status === 'failed' && (
                    <div style={{ marginTop: 6, fontSize: '0.8125rem', color: '#9B2C20' }}>Generation failed. Retry it from the Campaign page.</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

