import Link from 'next/link'
import { requireAdminPage } from '../../../lib/admin/auth'
import { can } from '../../../lib/admin/permissions'
import { loadAnalytics } from '../../../lib/admin/analytics'
import { formatNaira } from '../../../lib/admin/rules'

const pct = v => (v == null ? '—' : Math.round(v * 100) + '%')
const hrs = v => (v == null ? '—' : v < 1 ? '<1 h' : Math.round(v) + ' h')

function Bars({ rows, color = 'var(--ops-info)', empty = 'No data in this period.' }) {
  if (!rows.length) return <p className="ops-muted ops-small" style={{ margin: 0 }}>{empty}</p>
  const max = Math.max(...rows.map(r => r[1]), 1)
  return (
    <ul className="ops-list ops-stack">
      {rows.map(([label, n]) => (
        <li key={label} className="ops-stack" style={{ gap: 6 }}>
          <div className="ops-row" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>{label}</span><b>{n}</b></div>
          <div className="ops-bar" aria-hidden="true"><span style={{ width: `${(n / max) * 100}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  )
}

export default async function AdminAnalytics({ searchParams }) {
  const admin = await requireAdminPage()
  const business = can(admin.role, 'analytics.business')
  const tabs = [...(business ? [['business', 'Business']] : []), ['usage', 'Usage'], ['reliability', 'Reliability'], ['content', 'Content']]
  const tab = tabs.some(([k]) => k === searchParams?.tab) ? searchParams.tab : tabs[0][0]
  const days = [7, 30, 90].includes(Number(searchParams?.range)) ? Number(searchParams.range) : 30
  const data = await loadAnalytics({ days, includeBusiness: business && tab === 'business' })
  const q = (over) => `/admin/analytics?${new URLSearchParams({ tab, range: String(days), ...over })}`

  return (
    <>
      <header className="ops-head">
        <div className="ops-stack" style={{ gap: 4 }}>
          <h1 className="ops-h1">Analytics</h1>
          <p className="ops-sub">Last {days} days · all clients · from live data</p>
        </div>
        <nav aria-label="Date range" className="ops-pills">
          {[7, 30, 90].map(d => <Link key={d} href={q({ range: String(d) })} className="ops-pill" aria-current={days === d ? 'page' : undefined}>{d} days</Link>)}
        </nav>
      </header>
      <nav aria-label="Analytics sections" className="ops-tabs">
        {tabs.map(([k, label]) => <Link key={k} href={q({ tab: k })} className="ops-tab" aria-current={tab === k ? 'page' : undefined}>{label}</Link>)}
      </nav>

      {tab === 'business' && data.business && (() => {
        const b = data.business
        const max = Math.max(...b.months.map(m => Math.max(m.invoiced, m.collected)), 1)
        return (
          <>
            <section className="ops-stats" aria-label="Business">
              <div className="ops-card ops-stat"><span className="ops-stat-label">Monthly recurring revenue</span><span className="ops-stat-value">{formatNaira(b.mrr)}</span><span className="ops-small ops-muted">active contracts, annual ÷ 12</span></div>
              <div className="ops-card ops-stat"><span className="ops-stat-label">Active contracts</span><span className="ops-stat-value">{b.activeContracts}</span><span className="ops-small ops-muted">{b.newClients} new client(s) in {days} days</span></div>
              <div className="ops-card ops-stat"><span className="ops-stat-label">Collected this month</span><span className="ops-stat-value">{formatNaira(b.months.at(-1).collected)}</span><span className="ops-small ops-muted">of {formatNaira(b.months.at(-1).invoiced)} invoiced</span></div>
              <div className={`ops-card ops-stat ${b.overdueCount ? 'warn' : ''}`}><span className="ops-stat-label">Overdue</span><span className="ops-stat-value">{formatNaira(b.overdueAmount)}</span><span className="ops-small ops-muted">{b.overdueCount} invoice(s)</span></div>
            </section>
            <div className="ops-split">
              <figure className="ops-card ops-grow ops-stack" style={{ margin: 0 }}>
                <figcaption><span className="ops-h2">Invoiced and collected, last 6 months</span><div className="ops-small ops-muted">Dark bar: collected. Light bar: invoiced. ₦.</div></figcaption>
                <div className="ops-cols" role="img" aria-label={b.months.map(m => `${m.label}: invoiced ${formatNaira(m.invoiced)}, collected ${formatNaira(m.collected)}`).join('; ')}>
                  {b.months.map(m => (
                    <div key={m.key} className="ops-col" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
                      <span className="fill" style={{ height: `${(m.invoiced / max) * 160}px` }} />
                      <span className="fill now" style={{ height: `${(m.collected / max) * 160}px` }} />
                    </div>
                  ))}
                </div>
                <div className="ops-col-labels" aria-hidden="true">{b.months.map(m => <span key={m.key}>{m.label}</span>)}</div>
              </figure>
              <section className="ops-card ops-side ops-stack"><h2 className="ops-h2">Clients by status</h2><Bars rows={b.byLifecycle} color="var(--ops-good)" /></section>
            </div>
          </>
        )
      })()}

      {tab === 'usage' && (
        <>
          <section className="ops-stats" aria-label="Usage">
            <div className="ops-card ops-stat"><span className="ops-stat-label">Active clients (7 days)</span><span className="ops-stat-value">{data.usage.activeClients} of {data.usage.liveClients}</span><span className="ops-small ops-muted">generated or approved a post</span></div>
            <div className="ops-card ops-stat"><span className="ops-stat-label">Client sign-ins (7 days)</span><span className="ops-stat-value">{data.usage.signIns ?? '—'}</span><span className="ops-small ops-muted">accounts that signed in</span></div>
            <div className="ops-card ops-stat"><span className="ops-stat-label">Median time to approve</span><span className="ops-stat-value">{hrs(data.usage.medianApproveHours)}</span><span className="ops-small ops-muted">draft → approved</span></div>
          </section>
          <figure className="ops-card ops-stack" style={{ margin: 0 }}>
            <figcaption><span className="ops-h2">Post funnel</span><div className="ops-small ops-muted">Posts created in the last {days} days</div></figcaption>
            <Bars rows={data.usage.funnel} color="var(--ops-ink)" />
          </figure>
        </>
      )}

      {tab === 'reliability' && (
        <div className="ops-split">
          <section className="ops-card ops-grow ops-stack" aria-label="Publish success">
            <h2 className="ops-h2">LinkedIn publish success: {pct(data.reliability.linkedin.rate)}</h2>
            <p className="ops-small ops-muted" style={{ margin: 0 }}>{data.reliability.linkedin.ok} published, {data.reliability.linkedin.failed} failed. X and Instagram publishing isn’t live yet.</p>
            <div className="ops-bar" aria-hidden="true"><span style={{ width: `${(data.reliability.linkedin.rate || 0) * 100}%` }} /></div>
            <p className="ops-small" style={{ margin: 0 }}>Median delay, scheduled → published: <b>{data.reliability.delayMinutes == null ? '—' : `${Math.round(data.reliability.delayMinutes)} min`}</b></p>
          </section>
          <section className="ops-card ops-side ops-stack" aria-label="Failure causes"><h2 className="ops-h2">Top failure causes</h2><Bars rows={data.reliability.causes} color="var(--ops-bad)" empty="No errors logged." /></section>
        </div>
      )}

      {tab === 'content' && (
        <div className="ops-split">
          <section className="ops-card ops-grow ops-stack" aria-label="Rejections">
            <h2 className="ops-h2">Approval rate: {pct(data.content.approvalRate)}</h2>
            <p className="ops-small ops-muted" style={{ margin: 0 }}>{data.content.rejected} rejected of {data.content.decided} decided. Top reasons:</p>
            <Bars rows={data.content.reasons} color="var(--ops-warn)" empty="No rejections." />
          </section>
          <section className="ops-card ops-side ops-stack" aria-label="Languages"><h2 className="ops-h2">Published posts by language</h2><Bars rows={data.content.languages} /><p className="ops-small ops-muted" style={{ margin: 0 }}>Engagement shows here once LinkedIn analytics has data. AI cost per post isn’t tracked yet.</p></section>
        </div>
      )}
    </>
  )
}
