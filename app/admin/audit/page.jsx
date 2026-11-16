import Link from 'next/link'
import { requireAdminPage } from '../../../lib/admin/auth'
import { can } from '../../../lib/admin/permissions'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { loadDirectory } from '../../../lib/admin/data'
import { formatWhen } from '../../../lib/admin/rules'

const PAGE = 50

export default async function AuditPage({ searchParams }) {
  const admin = await requireAdminPage()
  const money = can(admin.role, 'money.view')
  const page = Math.max(1, parseInt(searchParams?.page || '1', 10) || 1)
  let q = supabaseAdmin.from('admin_audit_log').select('id, at, admin_id, client_id, post_id, lead_id, action, reason, before, after', { count: 'exact' }).order('at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
  if (searchParams?.client) q = q.eq('client_id', searchParams.client)
  if (!money) q = q.not('action', 'like', 'contract.%').not('action', 'like', 'invoice.%')
  const { data: rows, count, error } = await q
  const dir = await loadDirectory([...new Set((rows || []).map(r => r.client_id).filter(Boolean))])
  const adminIds = [...new Set((rows || []).map(r => r.admin_id))]
  const { data: admins } = adminIds.length ? await supabaseAdmin.from('admin_users').select('user_id, full_name').in('user_id', adminIds) : { data: [] }
  const who = Object.fromEntries((admins || []).map(a => [a.user_id, a.full_name || 'Admin']))
  const pages = Math.max(1, Math.ceil((count || 0) / PAGE))

  return (
    <>
      <header className="ad-stack" style={{ gap: 4 }}>
        <h1 className="ad-h1">Audit log</h1>
        <p className="ad-sub">Every admin change, newest first. Entries can’t be edited or deleted.</p>
      </header>
      {error && <div className="ad-error" role="alert">Couldn’t read the audit log: {error.message}</div>}
      <div className="ad-card flush ad-table-box">
        <table className="ad-table" style={{ minWidth: 860 }}>
          <thead><tr><th scope="col">When</th><th scope="col">Admin</th><th scope="col">Action</th><th scope="col">Client</th><th scope="col">Reason</th><th scope="col">Change</th></tr></thead>
          <tbody>
            {(rows || []).length === 0 && <tr><td colSpan={6}><div className="ad-empty">No entries yet.</div></td></tr>}
            {(rows || []).map(r => (
              <tr key={r.id}>
                <td className="nowrap">{formatWhen(r.at)}</td>
                <td className="nowrap">{who[r.admin_id] || 'Former admin'}</td>
                <td className="nowrap ad-strong">{r.action}</td>
                <td>{r.client_id ? <Link href={`/admin/clients/${r.client_id}`}>{dir.clientName[r.client_id] || 'Client'}</Link> : r.post_id ? <Link href={`/admin/posts/${r.post_id}`}>Post</Link> : r.lead_id ? <Link href={`/admin/leads?id=${r.lead_id}`}>Lead</Link> : '—'}</td>
                <td style={{ maxWidth: 280 }}>{r.reason || <span className="ad-muted">—</span>}</td>
                <td style={{ maxWidth: 320 }}><details><summary className="ad-small">View</summary><pre className="ad-pre" style={{ fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{JSON.stringify({ before: r.before, after: r.after }, money ? null : (k, v) => (/amount|mrr|price/i.test(k) ? '(hidden)' : v), 2)}</pre></details></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="ad-row" style={{ justifyContent: 'space-between' }}>
          <span className="ad-small ad-muted">Page {page} of {pages}</span>
          <span className="ad-row">
            {page > 1 && <Link className="ad-btn" href={`/admin/audit?page=${page - 1}`}>Previous</Link>}
            {page < pages && <Link className="ad-btn" href={`/admin/audit?page=${page + 1}`}>Next</Link>}
          </span>
        </nav>
      )}
    </>
  )
}
