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
      <header className="ad-head">
        <div className="ad-stack" style={{ gap: 4 }}>
          <h1 className="ad-h1">Admins</h1>
          <p className="ad-sub">Who can open this panel. Only Owners (super admins) see this page.</p>
        </div>
        <AddAdminButton />
      </header>
      <div className="ad-card flush ad-table-box">
        <table className="ad-table" style={{ minWidth: 860 }}>
          <caption className="ad-sr">Admin users</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Two-step sign-in</th><th scope="col">Last active</th><th scope="col"><span className="ad-sr">Actions</span></th></tr></thead>
          <tbody>
            {users.map(u => {
              const self = u.user_id === me.id
              const lastOwner = u.role === 'owner' && owners <= 1
              return (
                <tr key={u.user_id}>
                  <td><span className="ad-strong">{u.full_name || u.email}{self && <span className="ad-muted" style={{ fontWeight: 500 }}> (you)</span>}</span><div className="ad-small ad-muted">{u.email}</div></td>
                  <td><span className={`ad-badge ${u.role === 'owner' ? 'dark' : ''}`}>{ROLE_LABEL[u.role]}</span></td>
                  <td>{u.banned ? <span className="ad-muted ad-strong">Disabled</span> : u.invited ? <span className="ad-text-warn">Invited</span> : <span className="ad-text-good">Active</span>}</td>
                  <td>{u.mfa ? <span className="ad-text-good">On</span> : <span className="ad-text-warn">Not set</span>}</td>
                  <td className="nowrap">{u.lastSignIn ? formatWhen(u.lastSignIn) : '—'}</td>
                  <td className="nowrap">
                    <span className="ad-row" style={{ justifyContent: 'flex-end' }}>
                      {!(lastOwner) && (
                        <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="PATCH" label="Change role" size="sm"
                          fields={[{ name: 'role', label: 'Role', type: 'select', defaultValue: u.role, options: [{ value: 'owner', label: ROLE_LABEL.owner }, { value: 'support', label: ROLE_LABEL.support }] }]} successMessage="Role changed." />
                      )}
                      {!self && !lastOwner && (u.banned
                        ? <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="PATCH" body={{ action: 'enable' }} label="Enable" size="sm" successMessage="Enabled." />
                        : <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="PATCH" body={{ action: 'disable' }} label="Disable" size="sm" variant="danger" title="Disable this admin’s sign-in?" successMessage="Disabled." />)}
                      {!self && !lastOwner && <ActionDialog endpoint={`/api/admin/admins/${u.user_id}`} method="DELETE" label="Remove" size="sm" variant="danger" title="Remove admin access?" description="Their account stays; they just can’t open the admin panel." successMessage="Removed." />}
                      {lastOwner && <span className="ad-small ad-muted">Only Owner</span>}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <section className="ad-card ad-stack" aria-label="What each role can do">
        <h2 className="ad-h2">What each role can do</h2>
        <div className="ad-table-box">
          <table className="ad-table">
            <thead><tr><th scope="col">Action</th><th scope="col">Owner (super admin)</th><th scope="col">Support (sub admin)</th></tr></thead>
            <tbody>{MATRIX.map(([a, o, s]) => <tr key={a}><td>{a}</td><td>{o ? 'Yes' : 'No'}</td><td>{s ? 'Yes' : 'No'}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="ad-small ad-muted" style={{ margin: 0 }}>Turn on two-step sign-in for every admin (Supabase MFA). It becomes required in P1.</p>
      </section>
    </>
  )
}
