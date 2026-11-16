import Link from 'next/link'
import { requireAdminPage } from '../../../lib/admin/auth'
import { can } from '../../../lib/admin/permissions'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { formatWhen, ageLabel, median, LEAD_RESPONSE_HOURS } from '../../../lib/admin/rules'
import ActionDialog from '../../../components/admin/ActionDialog'

const STATUS = { new: ['New', 'good'], contacted: ['Contacted', 'info'], demo: ['Demo booked', 'info'], won: ['Won', 'dark'], lost: ['Lost', ''] }
const TABS = [['all', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['demo', 'Demo booked'], ['won', 'Won'], ['lost', 'Lost']]

export default async function AdminLeads({ searchParams }) {
  const admin = await requireAdminPage()
  const tab = TABS.some(([k]) => k === searchParams?.status) ? searchParams.status : 'all'
  const now = new Date()
  const { data: leadsRaw, error } = await supabaseAdmin.from('leads').select('*').order('created_at', { ascending: false }).limit(500)
  const leads = leadsRaw || []
  const adminIds = [...new Set(leads.map(l => l.assigned_to).filter(Boolean))]
  const { data: admins } = adminIds.length ? await supabaseAdmin.from('admin_users').select('user_id, full_name').in('user_id', adminIds) : { data: [] }
  const who = Object.fromEntries((admins || []).map(a => [a.user_id, a.full_name || 'Admin']))

  const counts = Object.fromEntries(TABS.map(([k]) => [k, k === 'all' ? leads.length : leads.filter(l => (l.status || 'new') === k).length]))
  const shown = tab === 'all' ? leads : leads.filter(l => (l.status || 'new') === tab)
  const selected = leads.find(l => String(l.id) === String(searchParams?.id)) || shown[0] || null
  const weekAgo = now.getTime() - 7 * 86_400_000
  const responseHours = median(leads.filter(l => l.first_contacted_at).map(l => (new Date(l.first_contacted_at) - new Date(l.created_at)) / 3_600_000))
  const closed = leads.filter(l => ['won', 'lost'].includes(l.status) && new Date(l.created_at).getTime() > now.getTime() - 90 * 86_400_000)
  const won = closed.filter(l => l.status === 'won').length

  let events = []
  if (selected) {
    const { data } = await supabaseAdmin.from('lead_events').select('kind, body, at, admin_id').eq('lead_id', String(selected.id)).order('at', { ascending: false }).limit(30)
    events = data || []
  }
  const statusOptions = Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))

  return (
    <>
      <header className="ad-head">
        <div className="ad-stack" style={{ gap: 4 }}>
          <h1 className="ad-h1">Leads</h1>
          <p className="ad-sub">Demo requests from contentengine.social arrive here automatically. Times in WAT.</p>
        </div>
        <ActionDialog endpoint="/api/admin/leads" label="+ Add lead" requireReason={false} title="Add a lead by hand"
          fields={[{ name: 'company', label: 'Company', required: true }, { name: 'name', label: 'Contact name', required: true }, { name: 'email', label: 'Email', type: 'email' },
            { name: 'brands', label: 'Number of brands', type: 'select', defaultValue: '1', options: ['1', '2 to 3', '4 to 10', 'More than 10'].map(v => ({ value: v, label: v })) },
            { name: 'source', label: 'Where it came from', type: 'select', defaultValue: 'email', options: [{ value: 'email', label: 'Email to hello@' }, { value: 'phone', label: 'Phone or WhatsApp' }, { value: 'referral', label: 'Referral' }, { value: 'event', label: 'Event' }] },
            { name: 'message', label: 'Notes', type: 'textarea' }]} successMessage="Lead added." />
      </header>

      {error && <div className="ad-error" role="alert">Couldn’t read the leads table: {error.message}. Apply the leads migration first.</div>}

      <section className="ad-stats" aria-label="Lead summary">
        <div className="ad-card ad-stat"><span className="ad-stat-label">New this week</span><span className="ad-stat-value">{leads.filter(l => new Date(l.created_at).getTime() > weekAgo).length}</span><span className="ad-small ad-muted">{counts.new} not yet contacted</span></div>
        <div className="ad-card ad-stat"><span className="ad-stat-label">Median first response</span><span className="ad-stat-value">{responseHours == null ? '—' : responseHours < 1 ? '<1 h' : Math.round(responseHours) + ' h'}</span><span className="ad-small ad-muted">target: under {LEAD_RESPONSE_HOURS} h</span></div>
        <div className="ad-card ad-stat"><span className="ad-stat-label">Demos booked</span><span className="ad-stat-value">{counts.demo}</span></div>
        <div className="ad-card ad-stat"><span className="ad-stat-label">Lead → client (90 days)</span><span className="ad-stat-value">{closed.length ? Math.round((won / closed.length) * 100) + '%' : '—'}</span><span className="ad-small ad-muted">{won} won of {closed.length} closed</span></div>
      </section>

      <nav aria-label="Lead status" className="ad-pills" style={{ alignSelf: 'flex-start' }}>
        {TABS.map(([k, label]) => <Link key={k} href={k === 'all' ? '/admin/leads' : `/admin/leads?status=${k}`} className="ad-pill" aria-current={tab === k ? 'page' : undefined}>{label} <span className="ad-muted">{counts[k]}</span></Link>)}
      </nav>

      <div className="ad-split">
        <div className="ad-grow ad-card flush ad-table-box">
          <table className="ad-table" style={{ minWidth: 700 }}>
            <caption className="ad-sr">Leads, newest first</caption>
            <thead><tr><th scope="col">Lead</th><th scope="col">Brands</th><th scope="col">Received</th><th scope="col">Status</th><th scope="col">Owner</th><th scope="col">Next step</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6}><div className="ad-empty"><strong>No leads here</strong><span className="ad-muted">New demo requests appear automatically.</span></div></td></tr>}
              {shown.map(l => {
                const st = STATUS[l.status || 'new']
                const late = (l.status || 'new') === 'new' && now - new Date(l.created_at) > LEAD_RESPONSE_HOURS * 3_600_000
                const href = `/admin/leads?${new URLSearchParams({ ...(tab !== 'all' ? { status: tab } : {}), id: String(l.id) })}`
                return (
                  <tr key={l.id} style={selected && selected.id === l.id ? { background: '#FAF7EF' } : undefined}>
                    <td><Link href={href} className="ad-strong" style={{ textDecoration: 'none' }}>{l.company}</Link><div className="ad-small ad-muted">{l.name}</div></td>
                    <td className="nowrap">{l.brands || '—'}</td>
                    <td className="nowrap">{formatWhen(l.created_at)}{late && <div className="ad-small ad-text-warn">waiting {ageLabel(l.created_at, now)}</div>}</td>
                    <td><span className={`ad-badge ${st[1]}`}>{st[0]}</span></td>
                    <td className="nowrap">{l.assigned_to ? who[l.assigned_to] || 'Admin' : <span className="ad-muted">Unassigned</span>}</td>
                    <td>{l.next_step || <span className="ad-muted">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="ad-side ad-card ad-stack" aria-label="Lead details">
            <div className="ad-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="ad-stack" style={{ gap: 2 }}>
                <h2 className="ad-h2" style={{ fontSize: 20 }}>{selected.company}</h2>
                <span style={{ fontSize: 14 }}>{selected.name}{selected.email && <> · <a href={`mailto:${selected.email}`} className="ad-strong">{selected.email}</a></>}</span>
              </div>
              <span className={`ad-badge ${STATUS[selected.status || 'new'][1]}`}>{STATUS[selected.status || 'new'][0]}</span>
            </div>
            <dl className="ad-dl">
              <dt>Brands</dt><dd>{selected.brands || '—'}</dd>
              <dt>Received</dt><dd>{formatWhen(selected.created_at)}</dd>
              <dt>Source</dt><dd>{selected.source || 'Website demo form'}{selected.page ? ` · ${selected.page}` : ''}</dd>
              <dt>Owner</dt><dd>{selected.assigned_to ? who[selected.assigned_to] || 'Admin' : 'Unassigned'}</dd>
              {selected.lost_reason && <><dt>Lost because</dt><dd>{selected.lost_reason}</dd></>}
            </dl>
            <p className="ad-pre">{selected.message || 'No message left.'}</p>
            <div className="ad-row">
              <ActionDialog endpoint={`/api/admin/leads/${selected.id}`} method="PATCH" label="Update status" size="sm" requireReason={false}
                fields={[{ name: 'status', label: 'Status', type: 'select', defaultValue: selected.status || 'new', options: statusOptions },
                  { name: 'next_step', label: 'Next step', defaultValue: selected.next_step || '', hint: 'e.g. Demo Tue 17 Nov 15:00' },
                  { name: 'note', label: 'Note (required if lost: say why)', type: 'textarea' }]} successMessage="Lead updated." />
              {selected.assigned_to !== admin.id && <ActionDialog endpoint={`/api/admin/leads/${selected.id}`} method="PATCH" body={{ assign: 'me' }} label="Assign to me" size="sm" requireReason={false} title="Take this lead?" successMessage="Assigned to you." />}
              <ActionDialog endpoint={`/api/admin/leads/${selected.id}`} method="PATCH" label="Add note" size="sm" requireReason={false} fields={[{ name: 'note', label: 'Note', type: 'textarea', required: true }]} successMessage="Note added." />
            </div>
            {selected.converted_client_id ? (
              <Link href={`/admin/clients/${selected.converted_client_id}`} className="ad-btn">Open client</Link>
            ) : can(admin.role, 'leads.convert') ? (
              <Link href={`/admin/clients/new?lead=${selected.id}`} className="ad-btn primary" style={{ minHeight: 48 }}>Convert to client →</Link>
            ) : (
              <ActionDialog endpoint={`/api/admin/leads/${selected.id}`} method="PATCH" body={{ status: 'won' }} label="Mark won, hand to Owner" variant="primary" requireReason={false}
                title="Mark this lead won?" description="An Owner sets up the account and contract." fields={[{ name: 'note', label: 'Hand-over note', type: 'textarea' }]} successMessage="Marked won." />
            )}
            <section className="ad-stack" aria-label="History">
              <h3 style={{ margin: 0, fontSize: 14 }}>History</h3>
              <ol className="ad-list ad-stack">
                {events.map((e, i) => <li key={i} style={{ fontSize: 13 }}><span>{e.body}</span><div className="ad-muted">{formatWhen(e.at)}</div></li>)}
                <li style={{ fontSize: 13 }}><span>Request received{selected.source && selected.source !== 'manual' ? ` (${selected.source})` : ''}</span><div className="ad-muted">{formatWhen(selected.created_at)}</div></li>
              </ol>
            </section>
          </aside>
        )}
      </div>
    </>
  )
}
