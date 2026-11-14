import Link from 'next/link'
import { requireAdminPage } from '../../lib/admin/auth'
import { loadTodayItems } from '../../lib/admin/data'
import { formatNaira, formatWhen } from '../../lib/admin/rules'
import { supabaseAdmin } from '../../lib/supabase-admin'

const FILTERS = [
  ['all', 'All'], ['leads', 'Leads'], ['failed', 'Failed'], ['stuck', 'Stuck'],
  ['connections', 'Connections'], ['waiting', 'Waiting'], ['money', 'Overdue'], ['quiet', 'Quiet'],
]

export default async function AdminToday({ searchParams }) {
  const admin = await requireAdminPage()
  const now = new Date()
  const { items, stats } = await loadTodayItems(admin, now)
  const filter = FILTERS.some(([k]) => k === searchParams?.filter) ? searchParams.filter : 'all'
  const shown = filter === 'all' ? items : items.filter(i => i.kind === filter)
  const count = k => (k === 'all' ? items.length : items.filter(i => i.kind === k).length)

  const { data: recent } = await supabaseAdmin
    .from('admin_audit_log').select('id, at, action, reason, admin_id, client_id').order('at', { ascending: false }).limit(5)

  return (
    <>
      <header className="ad-head">
        <div className="ad-stack" style={{ gap: 4 }}>
          <p className="ad-eyebrow">{formatWhen(now.toISOString())}</p>
          <h1 className="ad-h1">{items.length === 0 ? 'Nothing needs you right now' : `${items.length} thing${items.length > 1 ? 's' : ''} need${items.length > 1 ? '' : 's'} you`}</h1>
        </div>
        {admin.role === 'owner' && <Link href="/admin/clients/new" className="ad-btn primary">+ New client</Link>}
      </header>

      <section aria-label="At a glance" className="ad-stats">
        <div className="ad-card ad-stat"><span className="ad-stat-label">Clients live</span><span className="ad-stat-value">{stats.clientsLive}</span><span className="ad-small ad-muted">{stats.paused} paused · {stats.disabled} disabled or offboarded</span></div>
        <div className="ad-card ad-stat"><span className="ad-stat-label">Approved and queued</span><span className="ad-stat-value">{stats.queued}</span><span className="ad-small ad-muted">Publishing live on {stats.liveOnly.join(', ')} only</span></div>
        <div className={`ad-card ad-stat ${stats.failures ? 'bad' : ''}`}><span className="ad-stat-label">Failed or stuck posts</span><span className="ad-stat-value">{stats.failures}</span></div>
        <div className={`ad-card ad-stat ${stats.overdueCount ? 'warn' : ''}`}><span className="ad-stat-label">Overdue invoices</span><span className="ad-stat-value">{admin.role === 'owner' ? formatNaira(stats.overdueAmount) : `${stats.overdueCount} client${stats.overdueCount === 1 ? '' : 's'}`}</span><span className="ad-small ad-muted">{admin.role === 'owner' ? `${stats.overdueCount} client${stats.overdueCount === 1 ? '' : 's'}` : 'An Owner follows up'}</span></div>
      </section>

      <div className="ad-split">
        <section aria-label="Needs action" className="ad-card flush ad-grow">
          <div className="ad-card-head">
            <h2 className="ad-h2">Needs action</h2>
            <nav aria-label="Filter" className="ad-pills">
              {FILTERS.map(([k, label]) => (
                <Link key={k} href={k === 'all' ? '/admin' : `/admin?filter=${k}`} className="ad-pill" aria-current={filter === k ? 'page' : undefined}>
                  {label} <span className="ad-muted">{count(k)}</span>
                </Link>
              ))}
            </nav>
          </div>
          {shown.length === 0 ? (
            <div className="ad-empty"><strong>Nothing here needs you</strong><span className="ad-muted">This list refreshes each time you open the page.</span></div>
          ) : (
            <ul className="ad-list">
              {shown.map(i => (
                <li key={i.id} className="ad-item">
                  <span className={`ad-badge ${i.severity}`} style={{ minWidth: 92, justifyContent: 'center' }}>{i.badge}</span>
                  <div className="ad-item-body">
                    <span className="ad-item-title">{i.title}</span>
                    <span className="ad-item-meta">{i.meta}</span>
                  </div>
                  {i.age && <span className="ad-small ad-muted" style={{ whiteSpace: 'nowrap' }}>{i.age}</span>}
                  <Link href={i.href} className="ad-btn primary">{i.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="ad-side ad-card ad-stack" aria-label="Recent admin activity">
          <div className="ad-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="ad-h2">Recent admin activity</h2>
            <Link href="/admin/audit" className="ad-small ad-strong">Audit log</Link>
          </div>
          {(recent || []).length === 0 ? <p className="ad-muted ad-small" style={{ margin: 0 }}>No admin actions yet.</p> : (
            <ol className="ad-list ad-stack">
              {recent.map(r => (
                <li key={r.id}>
                  <div style={{ fontSize: 14 }}><b>{r.action.replace(/[._]/g, ' ')}</b></div>
                  <div className="ad-small ad-muted">{r.reason ? `“${r.reason}” · ` : ''}{formatWhen(r.at)}</div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </>
  )
}
