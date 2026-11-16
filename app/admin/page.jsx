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
      <header className="ops-head">
        <div className="ops-stack" style={{ gap: 4 }}>
          <p className="ops-eyebrow">{formatWhen(now.toISOString())}</p>
          <h1 className="ops-h1">{items.length === 0 ? 'Nothing needs you right now' : `${items.length} thing${items.length > 1 ? 's' : ''} need${items.length > 1 ? '' : 's'} you`}</h1>
        </div>
        {admin.role === 'owner' && <Link href="/admin/clients/new" className="ops-btn primary">+ New client</Link>}
      </header>

      <section aria-label="At a glance" className="ops-stats">
        <div className="ops-card ops-stat"><span className="ops-stat-label">Clients live</span><span className="ops-stat-value">{stats.clientsLive}</span><span className="ops-small ops-muted">{stats.paused} paused · {stats.disabled} disabled or offboarded</span></div>
        <div className="ops-card ops-stat"><span className="ops-stat-label">Approved and queued</span><span className="ops-stat-value">{stats.queued}</span><span className="ops-small ops-muted">Publishing live on {stats.liveOnly.join(', ')} only</span></div>
        <div className={`ops-card ops-stat ${stats.failures ? 'bad' : ''}`}><span className="ops-stat-label">Failed or stuck posts</span><span className="ops-stat-value">{stats.failures}</span></div>
        <div className={`ops-card ops-stat ${stats.overdueCount ? 'warn' : ''}`}><span className="ops-stat-label">Overdue invoices</span><span className="ops-stat-value">{admin.role === 'owner' ? formatNaira(stats.overdueAmount) : `${stats.overdueCount} client${stats.overdueCount === 1 ? '' : 's'}`}</span><span className="ops-small ops-muted">{admin.role === 'owner' ? `${stats.overdueCount} client${stats.overdueCount === 1 ? '' : 's'}` : 'An Owner follows up'}</span></div>
      </section>

      <div className="ops-split">
        <section aria-label="Needs action" className="ops-card flush ops-grow">
          <div className="ops-card-head">
            <h2 className="ops-h2">Needs action</h2>
            <nav aria-label="Filter" className="ops-pills">
              {FILTERS.map(([k, label]) => (
                <Link key={k} href={k === 'all' ? '/admin' : `/admin?filter=${k}`} className="ops-pill" aria-current={filter === k ? 'page' : undefined}>
                  {label} <span className="ops-muted">{count(k)}</span>
                </Link>
              ))}
            </nav>
          </div>
          {shown.length === 0 ? (
            <div className="ops-empty"><strong>Nothing here needs you</strong><span className="ops-muted">This list refreshes each time you open the page.</span></div>
          ) : (
            <ul className="ops-list">
              {shown.map(i => (
                <li key={i.id} className="ops-item">
                  <span className={`ops-badge ${i.severity}`} style={{ minWidth: 92, justifyContent: 'center' }}>{i.badge}</span>
                  <div className="ops-item-body">
                    <span className="ops-item-title">{i.title}</span>
                    <span className="ops-item-meta">{i.meta}</span>
                  </div>
                  {i.age && <span className="ops-small ops-muted" style={{ whiteSpace: 'nowrap' }}>{i.age}</span>}
                  <Link href={i.href} className="ops-btn primary">{i.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="ops-side ops-card ops-stack" aria-label="Recent admin activity">
          <div className="ops-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="ops-h2">Recent admin activity</h2>
            <Link href="/admin/audit" className="ops-small ops-strong">Audit log</Link>
          </div>
          {(recent || []).length === 0 ? <p className="ops-muted ops-small" style={{ margin: 0 }}>No admin actions yet.</p> : (
            <ol className="ops-list ops-stack">
              {recent.map(r => (
                <li key={r.id}>
                  <div style={{ fontSize: 14 }}><b>{r.action.replace(/[._]/g, ' ')}</b></div>
                  <div className="ops-small ops-muted">{r.reason ? `“${r.reason}” · ` : ''}{formatWhen(r.at)}</div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </>
  )
}
