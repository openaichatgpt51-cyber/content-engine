import Link from 'next/link'
import { requireAdminPage } from '../../../lib/admin/auth'
import { loadClientRows } from '../../../lib/admin/clients'
import { can } from '../../../lib/admin/permissions'
import { formatNaira, formatDate } from '../../../lib/admin/rules'

const PAGE = 50
const FILTERS = [['all', 'All'], ['active', 'Active'], ['paused', 'Paused'], ['disabled', 'Disabled'], ['overdue', 'Invoice overdue'], ['risk', 'At risk']]

export default async function AdminClients({ searchParams }) {
  const admin = await requireAdminPage()
  const money = can(admin.role, 'money.view')
  const { rows, mrr } = await loadClientRows()
  const q = String(searchParams?.q || '').trim().toLowerCase()
  const filter = FILTERS.some(([k]) => k === searchParams?.status) ? searchParams.status : 'all'
  const page = Math.max(1, parseInt(searchParams?.page || '1', 10) || 1)

  const match = r => {
    if (q && ![r.company_name, r.email, r.contact_name].some(v => (v || '').toLowerCase().includes(q))) return false
    if (filter === 'active') return r.status.key === 'active'
    if (filter === 'paused') return r.status.key === 'paused'
    if (filter === 'disabled') return ['disabled', 'offboarded'].includes(r.status.key)
    if (filter === 'overdue') return r.invoiceState === 'overdue'
    if (filter === 'risk') return r.risk === 'high'
    return true
  }
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, rows.filter(r => {
    if (k === 'all') return true
    if (k === 'disabled') return ['disabled', 'offboarded'].includes(r.status.key)
    if (k === 'overdue') return r.invoiceState === 'overdue'
    if (k === 'risk') return r.risk === 'high'
    return r.status.key === k
  }).length]))
  const filtered = rows.filter(match)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE)
  const link = (over) => {
    const all = { ...(q ? { q } : {}), ...(filter !== 'all' ? { status: filter } : {}), ...over }
    const p = new URLSearchParams(Object.entries(all).filter(([, v]) => v))
    const s = p.toString()
    return `/admin/clients${s ? `?${s}` : ''}`
  }

  return (
    <>
      <header className="ops-head">
        <div className="ops-stack" style={{ gap: 4 }}>
          <h1 className="ops-h1">Clients</h1>
          <p className="ops-sub">{rows.length} client{rows.length === 1 ? '' : 's'}{money ? ` · ${formatNaira(mrr)} monthly recurring revenue` : ''}</p>
        </div>
        {can(admin.role, 'clients.create') && <Link href="/admin/clients/new" className="ops-btn primary">+ New client</Link>}
      </header>

      <div className="ops-row" style={{ justifyContent: 'space-between' }}>
        <nav aria-label="Client status" className="ops-pills">
          {FILTERS.map(([k, label]) => (
            <Link key={k} href={link({ status: k === 'all' ? '' : k, page: '' })} className="ops-pill" aria-current={filter === k ? 'page' : undefined}>{label} <span className="ops-muted">{counts[k]}</span></Link>
          ))}
        </nav>
        <form role="search" action="/admin/clients" className="ops-row">
          {filter !== 'all' && <input type="hidden" name="status" value={filter} />}
          <label className="ops-sr" htmlFor="client-q">Search clients</label>
          <input id="client-q" name="q" defaultValue={q} placeholder="Search name or email" className="ops-input" style={{ width: 260 }} />
          <button className="ops-btn" type="submit">Search</button>
        </form>
      </div>

      <div className="ops-card flush ops-table-box">
        <table className="ops-table" style={{ minWidth: 960 }}>
          <caption className="ops-sr">Clients, sorted by risk then name</caption>
          <thead><tr>
            <th scope="col">Client</th><th scope="col">Status</th><th scope="col">Plan</th><th scope="col">Invoice</th>
            <th scope="col">Brands</th><th scope="col">Last post</th><th scope="col">Next 7 days</th><th scope="col">Risk</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8}><div className="ops-empty"><strong>No clients match</strong><span className="ops-muted">Try another filter or search.</span></div></td></tr>}
            {shown.map(r => (
              <tr key={r.client_id}>
                <td><Link href={`/admin/clients/${r.client_id}`} className="ops-strong" style={{ textDecoration: 'none' }}>{r.company_name || r.email}</Link><div className="ops-small ops-muted">{r.email}</div></td>
                <td><span className={`ops-badge ${r.status.tone}`}>{r.status.label}</span></td>
                <td className="nowrap">{r.contract ? r.contract.plan_name : <span className="ops-muted">No contract</span>}{money && r.contract && <div className="ops-small ops-muted">{formatNaira(r.contract.amount_ngn)} / {r.contract.cycle === 'annual' ? 'year' : 'month'}</div>}</td>
                <td className="nowrap">{r.invoiceState === 'overdue' ? <span className="ops-text-bad">Overdue</span> : r.invoiceState === 'none' ? <span className="ops-muted">None yet</span> : money ? <span className={r.invoiceState === 'paid' ? 'ops-text-good' : ''}>{r.invoiceState === 'paid' ? 'Paid' : 'Sent'}</span> : <span className="ops-text-good">Up to date</span>}</td>
                <td className="nowrap">{r.brands} of {r.max_brands}</td>
                <td className="nowrap">{r.last_post_at ? formatDate(r.last_post_at) : <span className="ops-muted">Never</span>}</td>
                <td className="nowrap">{r.scheduled_7d}{r.stale_approvals ? <div className="ops-small ops-text-warn">{r.stale_approvals} waiting approval</div> : null}</td>
                <td><span className={`ops-badge ${r.risk === 'high' ? 'bad' : r.risk === 'medium' ? 'warn' : ''}`}>{r.risk[0].toUpperCase() + r.risk.slice(1)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="ops-row" style={{ justifyContent: 'space-between' }}>
          <span className="ops-small ops-muted">Page {page} of {pages}</span>
          <span className="ops-row">
            {page > 1 && <Link className="ops-btn" href={link({ page: String(page - 1) })}>Previous</Link>}
            {page < pages && <Link className="ops-btn" href={link({ page: String(page + 1) })}>Next</Link>}
          </span>
        </nav>
      )}
    </>
  )
}
