import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminPage } from '../../../../lib/admin/auth'
import { can } from '../../../../lib/admin/permissions'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { loadPostContext } from '../../../../lib/admin/posts'
import { loadDirectory, whoLine } from '../../../../lib/admin/data'
import {
  postPlatforms, riskFlags, FLAG_LABEL, retryDecision, formatWhen, toZonedInput, LIVE_PLATFORMS, zoneAbbr,
} from '../../../../lib/admin/rules'
import ActionDialog from '../../../../components/admin/ActionDialog'

export default async function AdminPost({ params }) {
  const admin = await requireAdminPage()
  const ctx = await loadPostContext(params.id)
  if (!ctx) notFound()
  const { post, paused, accounts, tz } = ctx
  const dir = await loadDirectory([post.client_id])
  const flags = riskFlags(post)
  const platforms = postPlatforms(post)
  const retry = retryDecision({ post, paused, accounts })
  const canRetryStatus = ['FAILED', 'PARTIAL'].includes(post.posting_status)
  const movable = ['AWAITING_APPROVAL', 'PENDING', 'HALTED'].includes(post.posting_status)
  const toReview = ['FAILED', 'PARTIAL', 'PENDING', 'HALTED'].includes(post.posting_status)

  const [{ data: history }, errorsRes] = await Promise.all([
    supabaseAdmin.from('post_status_events').select('from_status, to_status, at').eq('post_id', post.id).order('at', { ascending: false }).limit(30),
    supabaseAdmin.from('error_logs').select('node_name, platform, error_message, created_at').eq('post_id', post.id).order('created_at', { ascending: false }).limit(10),
  ])
  const errors = errorsRes.error ? null : errorsRes.data

  return (
    <>
      <Link href="/admin/posts" className="ops-back">← Posts queue</Link>
      <header className="ops-card ops-row" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div className="ops-stack" style={{ gap: 6, minWidth: 0 }}>
          <h1 className="ops-h1" style={{ fontSize: 28 }}>{post.topic || 'Untitled post'}</h1>
          <p className="ops-sub" style={{ fontSize: 14 }}>
            <Link href={`/admin/clients/${post.client_id}`} className="ops-strong">{dir.clientName[post.client_id] || 'Client'}</Link>
            {post.brand_id && dir.brandName[post.brand_id] ? ` · ${dir.brandName[post.brand_id]}` : ''} · created {formatWhen(post.created_at, tz)}
          </p>
          <div className="ops-row">
            <span className="ops-badge dark">{post.posting_status}</span>
            {paused && <span className="ops-badge warn">Client paused</span>}
            {flags.map(f => <span key={f} className={`ops-badge ${['failed', 'stuck'].includes(f) ? 'bad' : 'warn'}`}>{FLAG_LABEL[f]}</span>)}
          </div>
        </div>
        <div className="ops-row">
          {canRetryStatus && can(admin.role, 'posts.retry') && (
            <>
              <ActionDialog endpoint={`/api/admin/posts/${post.id}/retry`} body={{ mode: 'now' }} label="Retry now" variant="primary"
                disabled={!retry.ok} disabledReason={retry.reason}
                title="Retry this post now?" points={['It goes back into the queue and publishes within about a minute.', 'Platforms it already published on are skipped.', ...(paused ? ['Posting is paused for this client, so it will be held until they resume.'] : [])]} successMessage="Queued." />
              <ActionDialog endpoint={`/api/admin/posts/${post.id}/retry`} body={{ mode: 'at' }} label="Retry at…"
                disabled={!retry.ok} disabledReason={retry.reason}
                fields={[{ name: 'at', label: `New time (${zoneAbbr(tz)}, ${tz})`, type: 'datetime-local', required: true }]} successMessage="Rescheduled." />
            </>
          )}
          {toReview && can(admin.role, 'posts.to_review') && (
            <ActionDialog endpoint={`/api/admin/posts/${post.id}/to-review`} label="Send back to review"
              title="Send back to the client’s Review Queue?" description="Use this for a wrong image, wrong language or wrong brand. The client approves it again before it goes out." successMessage="Moved to review." />
          )}
        </div>
      </header>

      {canRetryStatus && !retry.ok && <div className="ops-banner warn" role="note"><b>Retry is blocked:</b> {retry.reason}</div>}

      <div className="ops-split">
        <section className="ops-grow ops-stack" aria-label="Copy per platform">
          {platforms.length === 0 && <div className="ops-card ops-muted">This post has no platforms set.</div>}
          {platforms.map(p => {
            const text = post[p.text] || ''
            const over = text.length > p.limit
            const acc = accounts.find(a => a.platform === p.key && (!post.brand_id || a.brand_id === post.brand_id)) || null
            return (
              <article key={p.key} className="ops-card ops-stack">
                <div className="ops-row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="ops-h2">{p.label}{!LIVE_PLATFORMS.includes(p.key) && <span className="ops-badge" style={{ marginLeft: 8 }}>Not live</span>}</h2>
                  <span className={over ? 'ops-text-bad' : 'ops-muted'} style={{ fontSize: 13 }}>{text.length} / {p.limit}{over ? ' — over limit' : ''}</span>
                </div>
                <p className="ops-pre">{text || 'No copy for this platform.'}</p>
                <dl className="ops-dl">
                  <dt>Publishes from</dt><dd>{acc ? (acc.handle ? '@' + acc.handle : acc.display_name || 'Connected account') : <span className="ops-text-bad">No account for this brand</span>}</dd>
                  <dt>Scheduled</dt><dd>{formatWhen(post[p.time], tz)}</dd>
                  <dt>Published</dt><dd>{post[p.posted] === 'YES' ? <span className="ops-text-good">Yes{p.key === 'LinkedIn' && post.linkedin_posted_at ? `, ${formatWhen(post.linkedin_posted_at, tz)}` : ''}</span> : 'No'}</dd>
                </dl>
                {movable && post[p.posted] !== 'YES' && can(admin.role, 'posts.reschedule') && (
                  <div><ActionDialog endpoint={`/api/admin/posts/${post.id}/reschedule`} body={{ platform: p.key }} label={`Change ${p.label} time`} size="sm"
                    fields={[{ name: 'at', label: `New time (${zoneAbbr(tz)}, ${tz})`, type: 'datetime-local', required: true, defaultValue: toZonedInput(post[p.time], tz) }]} successMessage="Time changed." /></div>
                )}
              </article>
            )
          })}
        </section>
        <aside className="ops-side ops-stack">
          <section className="ops-card ops-stack" aria-label="Errors">
            <h2 className="ops-h2">Errors</h2>
            {errors === null ? <p className="ops-small ops-muted" style={{ margin: 0 }}>Error logs aren’t linked to posts yet (no post_id column).</p>
              : errors.length === 0 ? <p className="ops-small ops-muted" style={{ margin: 0 }}>No errors logged for this post.</p>
              : <ul className="ops-list ops-stack">{errors.map((e, i) => <li key={i}><div className="ops-strong" style={{ fontSize: 14 }}>{e.platform || 'Workflow'} · {e.node_name}</div><div className="ops-small" style={{ overflowWrap: 'anywhere' }}>{e.error_message}</div><div className="ops-small ops-muted">{formatWhen(e.created_at, tz)}</div></li>)}</ul>}
          </section>
          <section className="ops-card ops-stack" aria-label="Status history">
            <h2 className="ops-h2">Status history</h2>
            {(history || []).length === 0 ? <p className="ops-small ops-muted" style={{ margin: 0 }}>History starts once the status-history migration is applied.</p> : (
              <ol className="ops-list ops-stack">{history.map((h, i) => <li key={i} style={{ fontSize: 14 }}><b>{h.to_status}</b>{h.from_status ? <span className="ops-muted"> from {h.from_status}</span> : null}<div className="ops-small ops-muted">{formatWhen(h.at, tz)}</div></li>)}</ol>
            )}
          </section>
          <p className="ops-small ops-muted" style={{ margin: 0 }}>{whoLine(dir, post.client_id, post.brand_id)} · Post ID <code>{post.id}</code></p>
        </aside>
      </div>
    </>
  )
}
