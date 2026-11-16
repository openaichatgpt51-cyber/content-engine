import Link from 'next/link'
import { requireAdminPage } from '../../../lib/admin/auth'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { formatWhen, ageLabel, LEAD_RESPONSE_HOURS } from '../../../lib/admin/rules'
import ActionDialog from '../../../components/admin/ActionDialog'

const STATUS = { new: ['New', 'good'], handled: ['Handled', 'info'], lead: ['Lead', 'dark'], spam: ['Spam', ''] }
const TABS = [['new', 'New'], ['handled', 'Handled'], ['lead', 'Turned into lead'], ['spam', 'Spam'], ['all', 'All']]

// Emails sent to hello@contentengine.social. Both roles work this page.
export default async function AdminInbox({ searchParams }) {
  await requireAdminPage()
  const tab = TABS.some(([k]) => k === searchParams?.status) ? searchParams.status : 'new'
  const now = new Date()
  const { data: raw, error } = await supabaseAdmin.from('inbox_messages')
    .select('id, received_at, from_email, from_name, to_email, subject, text_body, status, lead_id, handled_by, handled_at, note')
    .order('received_at', { ascending: false }).limit(500)
  const all = raw || []
  const counts = Object.fromEntries(TABS.map(([k]) => [k, k === 'all' ? all.length : all.filter(m => m.status === k).length]))
  const shown = tab === 'all' ? all : all.filter(m => m.status === tab)
  const selected = all.find(m => String(m.id) === String(searchParams?.id)) || shown[0] || null

  const handlerIds = [...new Set(all.map(m => m.handled_by).filter(Boolean))]
  const { data: admins } = handlerIds.length ? await supabaseAdmin.from('admin_users').select('user_id, full_name').in('user_id', handlerIds) : { data: [] }
  const who = Object.fromEntries((admins || []).map(a => [a.user_id, a.full_name || 'Admin']))

  const replyHref = (m) => `mailto:${m.from_email}?subject=${encodeURIComponent('Re: ' + (m.subject || ''))}`
  const guessCompany = (m) => {
    const domain = (m.from_email.split('@')[1] || '').split('.')[0]
    return ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'live', 'aol', 'proton', 'protonmail'].includes(domain) ? '' : domain.charAt(0).toUpperCase() + domain.slice(1)
  }

  return (
    <>
      <header className="ops-head">
        <div className="ops-stack" style={{ gap: 4 }}>
          <h1 className="ops-h1">Inbox</h1>
          <p className="ops-sub">Emails sent to hello@contentengine.social. Reply from your mail app, then mark handled. Times in WAT.</p>
        </div>
      </header>

      {error && <div className="ops-error" role="alert">Couldn’t read the inbox: {error.message}. Apply the inbox migration first.</div>}

      <nav aria-label="Inbox status" className="ops-pills" style={{ alignSelf: 'flex-start' }}>
        {TABS.map(([k, label]) => <Link key={k} href={k === 'new' ? '/admin/inbox' : `/admin/inbox?status=${k}`} className="ops-pill" aria-current={tab === k ? 'page' : undefined}>{label} <span className="ops-muted">{counts[k]}</span></Link>)}
      </nav>

      <div className="ops-split">
        <div className="ops-grow ops-card flush ops-table-box">
          <table className="ops-table" style={{ minWidth: 560 }}>
            <caption className="ops-sr">Emails, newest first</caption>
            <thead><tr><th scope="col">From</th><th scope="col">Subject</th><th scope="col">Received</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={4}><div className="ops-empty"><strong>{tab === 'new' ? 'Inbox zero' : 'Nothing here'}</strong><span className="ops-muted">New emails to hello@ appear automatically.</span></div></td></tr>}
              {shown.map(m => {
                const st = STATUS[m.status] || STATUS.new
                const late = m.status === 'new' && now - new Date(m.received_at) > LEAD_RESPONSE_HOURS * 3_600_000
                const href = `/admin/inbox?${new URLSearchParams({ ...(tab !== 'new' ? { status: tab } : {}), id: String(m.id) })}`
                return (
                  <tr key={m.id} style={selected && selected.id === m.id ? { background: '#FAF7EF' } : undefined}>
                    <td><Link href={href} className="ops-strong" style={{ textDecoration: 'none' }}>{m.from_name || m.from_email}</Link>{m.from_name && <div className="ops-small ops-muted">{m.from_email}</div>}</td>
                    <td><Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{m.subject || '(no subject)'}</Link><div className="ops-small ops-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{(m.text_body || '').slice(0, 120)}</div></td>
                    <td className="nowrap">{formatWhen(m.received_at)}{late && <div className="ops-small ops-text-warn">waiting {ageLabel(m.received_at, now)}</div>}</td>
                    <td><span className={`ops-badge ${st[1]}`}>{st[0]}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="ops-side ops-card ops-stack" aria-label="Email">
            <div className="ops-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="ops-stack" style={{ gap: 2, minWidth: 0 }}>
                <h2 className="ops-h2" style={{ fontSize: 20, overflowWrap: 'anywhere' }}>{selected.subject || '(no subject)'}</h2>
                <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{selected.from_name ? `${selected.from_name} · ` : ''}<a href={replyHref(selected)} className="ops-strong">{selected.from_email}</a></span>
              </div>
              <span className={`ops-badge ${(STATUS[selected.status] || STATUS.new)[1]}`}>{(STATUS[selected.status] || STATUS.new)[0]}</span>
            </div>
            <dl className="ops-dl">
              <dt>Received</dt><dd>{formatWhen(selected.received_at)}</dd>
              <dt>To</dt><dd>{selected.to_email || 'hello@contentengine.social'}</dd>
              {selected.handled_at && <><dt>Handled</dt><dd>{who[selected.handled_by] || 'Admin'} · {formatWhen(selected.handled_at)}</dd></>}
            </dl>
            <p className="ops-pre" style={{ maxHeight: 420, overflow: 'auto' }}>{selected.text_body || 'No text in this email.'}</p>
            {selected.note && <p className="ops-pre ops-small" style={{ background: '#FFFBEB' }}>{selected.note}</p>}

            <div className="ops-row">
              <a href={replyHref(selected)} className="ops-btn primary">Reply by email</a>
              {selected.status === 'new' && <ActionDialog endpoint={`/api/admin/inbox/${selected.id}`} method="PATCH" body={{ action: 'handled' }} label="Mark handled" requireReason={false} title="Mark this email handled?" fields={[{ name: 'note', label: 'Note (optional)', type: 'textarea' }]} successMessage="Marked handled." />}
              {selected.status === 'new' && <ActionDialog endpoint={`/api/admin/inbox/${selected.id}`} method="PATCH" body={{ action: 'spam' }} label="Spam" size="sm" requireReason={false} title="Mark as spam?" successMessage="Marked as spam." />}
              {selected.status !== 'new' && selected.status !== 'lead' && <ActionDialog endpoint={`/api/admin/inbox/${selected.id}`} method="PATCH" body={{ action: 'reopen' }} label="Move back to New" size="sm" requireReason={false} title="Move back to New?" successMessage="Moved back." />}
              <ActionDialog endpoint={`/api/admin/inbox/${selected.id}`} method="PATCH" body={{ action: 'note' }} label="Add note" size="sm" requireReason={false} fields={[{ name: 'note', label: 'Note', type: 'textarea', required: true }]} successMessage="Note saved." />
            </div>

            {selected.lead_id ? (
              <Link href={`/admin/leads?id=${selected.lead_id}`} className="ops-btn">Open lead</Link>
            ) : selected.status !== 'spam' && (
              <ActionDialog endpoint={`/api/admin/inbox/${selected.id}`} method="PATCH" body={{ action: 'lead' }} label="Turn into lead →" variant="primary" requireReason={false}
                title="Turn this email into a lead" description="The lead is assigned to you and the email is marked done."
                fields={[{ name: 'company', label: 'Company', required: true, defaultValue: guessCompany(selected) },
                  { name: 'name', label: 'Contact name', defaultValue: selected.from_name || '' },
                  { name: 'brands', label: 'Number of brands', type: 'select', defaultValue: '1', options: ['1', '2 to 3', '4 to 10', 'More than 10'].map(v => ({ value: v, label: v })) }]}
                successMessage="Lead created." />
            )}
          </aside>
        )}
      </div>
    </>
  )
}
