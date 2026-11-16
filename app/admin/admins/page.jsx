import { requireAdminPage } from '../../../lib/admin/auth'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { ROLE_LABEL } from '../../../lib/admin/permissions'
import { formatWhen } from '../../../lib/admin/rules'
import ActionDialog from '../../../components/admin/ActionDialog'
import AddAdminButton from '../../../components/admin/AddAdminButton'

const MATRIX = [
  ['Retry, reschedule, send back to review', true, true],
  ['Pause / resume posting; enable / disable client accounts', true, true],
  ['Work leads (status, notes, mark won)', true, true],
  ['See any naira amount, invoices, contracts, Business analytics', true, false],
  ['Set up clients, convert leads, change brand allowance', true, false],
  ['Offboard a client', true, false],
  ['Manage admins', true, false],
]

export default async function AdminsPage() {
  const me = await requireAdminPage('admins.manage')
  const { data: rows } = await supabaseAdmin.from('admin_users').select('user_id, role, full_name, created_at').order('created_at')
  const users = await Promise.all((rows || []).map(async r => {
    const { data } = await supabaseAdmin.auth.admin.getUserById(r.user_id)
    const u = data?.user
    const banned = u?.banned_until && new Date(u.banned_until) > new Date()
    return { ...r, email: u?.email || '—', lastSignIn: u?.last_sign_in_at, mfa: (u?.factors || []).some(f => f.status === 'verified'), banned, invited: !u?.last_sign_in_at }
  }))
  const owners = users.filter(u => u.role === 'owner').length

  return (
    <>
      <header className="ops-head">
        <div className="ops-stack" style={{ gap: 4 }}>
          <h1 className="ops-h1">Admins</h1>
          <p className="ops-sub">Who can open this panel. Only Owners (super admins) see this page.</p>
        </div>
        <AddAdminButton />
      </header>
      <div className="ops-card flush ops-table-box">
        <table className="ops-table" style={{ minWidth: 860 }}>
          <caption className="ops-sr">Admin users</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Two-step sign-in</th><th scope="col">Last active</th><th scope="col"><span className="ops-sr">Actions</span></th></tr></thead>
          <tbody>
            {users.map(u => {
              const self = u.user_id === me.id
              const lastOwner = u.role === 'owner' && owners <= 1
              return (
                <tr key={u.user_id}>
                  <td><span className="ops-strong">{u.full_name || u.email}{self && <span className="ops-muted" style={{ fontWeight: 500 }}> (you)</span>}</span><div className="ops-small ops-muted">{u.email}</div></td>
                  <td><span className={`ops-badge ${u.role === 'owner' ? 'dark' : ''}`}>{ROLE_LABEL[u.role]}</span></td>
                  <td>{u.banned ? <span className="ops-muted ops-strong">Disabled</span> : u.invited ? <span className="ops-text-warn">Invited</span> : <span className="ops-text-good">Active</span>}</td>
                  <td>{u.mfa ? <span className="ops-text-good">On</span> : <span className="ops-text-warn">Not set</span>}</td>
                  <td className="nowrap">{u.lastSignIn ? formatWhen(u.lastSignIn) : '—'}</td>
                  <td className="nowrap">
                    <span className="ops-row" style={{ justifyContent: 'flex-end' }}>
                      {!(lastOwner) && (
                        <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="PATCH" label="Change role" size="sm"
                          fields={[{ name: 'role', label: 'Role', type: 'select', defaultValue: u.role, options: [{ value: 'owner', label: ROLE_LABEL.owner }, { value: 'support', label: ROLE_LABEL.support }] }]} successMessage="Role changed." />
                      )}
                      {!self && !lastOwner && (u.banned
                        ? <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="PATCH" body={{ action: 'enable' }} label="Enable" size="sm" successMessage="Enabled." />
                        : <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="PATCH" body={{ action: 'disable' }} label="Disable" size="sm" variant="danger" title="Disable this admin’s sign-in?" successMessage="Disabled." />)}
                      {!self && !lastOwner && <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="DELETE" label="Remove" size="sm" variant="danger" title="Remove admin access?" description="Their account stays; they just can’t open the admin panel." successMessage="Removed." />}
                      {lastOwner && <span className="ops-small ops-muted">Only Owner</span>}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <section className="ops-card ops-stack" aria-label="What each role can do">
        <h2 className="ops-h2">What each role can do</h2>
        <div className="ops-table-box">
          <table className="ops-table">
            <thead><tr><th scope="col">Action</th><th scope="col">Owner (super admin)</th><th scope="col">Support (sub admin)</th></tr></thead>
            <tbody>{MATRIX.map(([a, o, s]) => <tr key={a}><td>{a}</td><td>{o ? 'Yes' : 'No'}</td><td>{s ? 'Yes' : 'No'}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="ops-small ops-muted" style={{ margin: 0 }}>Turn on two-step sign-in for every admin (Supabase MFA). It becomes required in P1.</p>
      </section>
    </>
  )
}
