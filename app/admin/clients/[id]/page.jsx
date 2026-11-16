import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminPage } from '../../../../lib/admin/auth'
import { can } from '../../../../lib/admin/permissions'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { POST_COLS } from '../../../../lib/admin/data'
import { statusOf } from '../../../../lib/admin/clients'
import {
  formatNaira, formatDate, formatWhen, riskFlags, FLAG_LABEL, earliestScheduled, invoiceIsOverdue, median, LIVE_PLATFORMS,
} from '../../../../lib/admin/rules'
import ActionDialog from '../../../../components/admin/ActionDialog'
import InviteLinkButton from '../../../../components/admin/InviteLinkButton'

const LANG = { en: 'English', fr: 'French', pcm: 'Nigerian Pidgin', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', pt: 'Portuguese', sw: 'Swahili', ar: 'Arabic' }

export default async function ClientDetail({ params, searchParams }) {
  const admin = await requireAdminPage()
  const money = can(admin.role, 'money.view')
  const id = params.id
  const tabs = [['overview', 'Overview'], ['brands', 'Brands'], ['posts', 'Posts'], ['connections', 'Connections'], ...(money ? [['billing', 'Billing']] : []), ['activity', 'Activity']]
  const tab = tabs.some(([k]) => k === searchParams?.tab) ? searchParams.tab : 'overview'

  const [{ data: client }, { data: summary }, { data: settings }, { data: onboarding }, { data: brands }, { data: profiles }, { data: accounts }, { data: contract }] = await Promise.all([
    supabaseAdmin.from('clients').select('id, email, company_name, contact_name, lifecycle, max_brands, created_at, provisioned_at').eq('id', id).maybeSingle(),
    supabaseAdmin.from('admin_client_summary').select('*').eq('client_id', id).maybeSingle(),
    supabaseAdmin.from('account_settings').select('posting_paused, paused_at').eq('client_id', id).maybeSingle(),
    supabaseAdmin.from('onboarding').select('completed, step, timezone').eq('client_id', id).maybeSingle(),
    supabaseAdmin.from('brands').select('id, name, is_default, created_at').eq('client_id', id).order('is_default', { ascending: false }),
    supabaseAdmin.from('brand_profiles').select('brand_id, company_description, target_audience, language, country, example_posts').eq('client_id', id),
    supabaseAdmin.from('platform_accounts').select('platform, brand_id, handle, display_name, account_id, token_valid, expires_at').eq('client_id', id),
    supabaseAdmin.from('contracts').select('*').eq('client_id', id).eq('status', 'active').maybeSingle(),
  ])
  if (!client) notFound()
  const { data: isAdminRow } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', id).maybeSingle()
  if (isAdminRow) notFound() // admins are managed on the Admins page

  const status = statusOf({ ...client, posting_paused: settings?.posting_paused })
  const name = client.company_name || client.email
  const brandName = Object.fromEntries((brands || []).map(b => [b.id, b.name]))
  const profileBy = Object.fromEntries((profiles || []).map(p => [p.brand_id, p]))
  const disabled = client.lifecycle !== 'active'

  return (
    <>
      <Link href="/admin/clients" className="ad-back">← Clients</Link>
      <header className="ad-card ad-row" style={{ justifyContent: 'space-between', gap: 20, padding: '22px 24px' }}>
        <div className="ad-stack" style={{ gap: 8, minWidth: 0 }}>
          <div className="ad-row">
            <h1 className="ad-h1" style={{ fontSize: 30 }}>{name}</h1>
            <span className={`ad-badge ${status.tone}`} role="status">{status.label}</span>
          </div>
          <p className="ad-sub" style={{ fontSize: 14 }}>
            {[client.email, contract ? `${contract.plan_name}${money ? `, ${formatNaira(contract.amount_ngn)} / ${contract.cycle === 'annual' ? 'year' : 'month'}` : ''}` : 'No contract', `client since ${formatDate(client.provisioned_at || client.created_at)}`, `${(brands || []).length} of ${client.max_brands ?? 1} brands`].join(' · ')}
          </p>
        </div>
        <div className="ad-row">
          {!disabled && can(admin.role, 'clients.pause') && (settings?.posting_paused ? (
            <ActionDialog endpoint={`/api/admin/clients/${id}/posting`} body={{ action: 'resume' }} label="Resume posting"
              title={`Resume posting for ${name}?`} points={['Held posts go back into the queue and publish at their scheduled times.', 'Posts whose time has passed go out within about a minute.']} successMessage="Posting resumed." />
          ) : (
            <ActionDialog endpoint={`/api/admin/clients/${id}/posting`} body={{ action: 'pause' }} label="Pause posting"
              title={`Pause posting for ${name}?`} points={['Queued posts are held, not deleted.', 'Posts already publishing can’t be recalled.', 'The client sees “Posting is paused” in their Settings.']} successMessage="Posting paused." />
          ))}
          {can(admin.role, 'clients.status') && (disabled && client.lifecycle === 'suspended' ? (
            <ActionDialog endpoint={`/api/admin/clients/${id}/status`} body={{ action: 'enable' }} label="Enable account" variant="primary"
              title={`Enable ${name}?`} points={['Users can sign in again.', 'Posting stays paused until you resume it.']} successMessage="Account enabled." />
          ) : !disabled ? (
            <ActionDialog endpoint={`/api/admin/clients/${id}/status`} body={{ action: 'disable' }} label="Disable account" variant="danger"
              title={`Disable ${name}?`} confirmText={name}
              points={['All users are signed out and can’t sign in.', 'Posting is paused; scheduled posts are held, not deleted.', 'Nothing is deleted. You can enable the account again.']} successMessage="Account disabled." />
          ) : null)}
          {!disabled && can(admin.role, 'clients.invite') && <InviteLinkButton clientId={id} contactName={client.contact_name} />}
          {can(admin.role, 'clients.offboard') && client.lifecycle !== 'offboarded' && (
            <ActionDialog endpoint={`/api/admin/clients/${id}/status`} body={{ action: 'offboard' }} label="Offboard" variant="danger"
              title={`Offboard ${name}?`} confirmText={name}
              points={['Disables the account and pauses posting.', 'Ends the active contract.', 'Data is kept; deletion only on request.']} successMessage="Client offboarded." />
          )}
        </div>
      </header>

      {disabled && (
        <div className="ad-banner" role="note">
          <b>{client.lifecycle === 'suspended' ? 'Account disabled.' : 'Client offboarded.'}</b> Users can’t sign in and posting is paused. See Activity for who did this and why.
        </div>
      )}

      <nav aria-label="Client sections" className="ad-tabs">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/admin/clients/${id}${k === 'overview' ? '' : `?tab=${k}`}`} className="ad-tab" aria-current={tab === k ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>

      {tab === 'overview' && <Overview id={id} summary={summary} onboarding={onboarding} contract={contract} money={money} brandName={brandName} />}
      {tab === 'brands' && <Brands id={id} admin={admin} brands={brands || []} profileBy={profileBy} accounts={accounts || []} max={client.max_brands ?? 1} />}
      {tab === 'posts' && <Posts id={id} brandName={brandName} />}
      {tab === 'connections' && <Connections accounts={accounts || []} brandName={brandName} />}
      {tab === 'billing' && money && <Billing id={id} contract={contract} />}
      {tab === 'activity' && <Activity id={id} />}
    </>
  )
}

async function Overview({ id, summary, onboarding, contract, money, brandName }) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [{ data: posts }, { data: upcoming }] = await Promise.all([
    supabaseAdmin.from('posts').select('id, posting_status, created_at').eq('client_id', id).gte('created_at', since),
    supabaseAdmin.from('posts').select(POST_COLS).eq('client_id', id).in('posting_status', ['PENDING', 'HALTED']).limit(100),
  ])
  const list = posts || []
  const published = list.filter(p => p.posting_status === 'DONE' || p.posting_status === 'PARTIAL').length
  const rejected = list.filter(p => p.posting_status === 'REJECTED').length
  const decided = list.filter(p => !['AWAITING_APPROVAL'].includes(p.posting_status)).length
  const failed = list.filter(p => p.posting_status === 'FAILED').length
  const ids = list.map(p => p.id)
  let medianHours = null
  if (ids.length) {
    const { data: events } = await supabaseAdmin.from('post_status_events').select('post_id, to_status, at').in('post_id', ids.slice(0, 500))
    const firstAt = {}, approvedAt = {}
    for (const e of events || []) {
      if (e.to_status === 'AWAITING_APPROVAL' && (!firstAt[e.post_id] || e.at < firstAt[e.post_id])) firstAt[e.post_id] = e.at
      if (['PENDING', 'HALTED'].includes(e.to_status) && (!approvedAt[e.post_id] || e.at < approvedAt[e.post_id])) approvedAt[e.post_id] = e.at
    }
    medianHours = median(Object.keys(approvedAt).filter(k => firstAt[k]).map(k => (new Date(approvedAt[k]) - new Date(firstAt[k])) / 3_600_000))
  }
  const next = (upcoming || []).map(p => ({ p, at: earliestScheduled(p) })).filter(x => x.at && x.at > new Date()).sort((a, b) => a.at - b.at).slice(0, 5)

  return (
    <>
      <section aria-label="Last 30 days" className="ad-stats">
        <div className="ad-card ad-stat"><span className="ad-stat-label">Published (30 days)</span><span className="ad-stat-value">{published}</span></div>
        <div className="ad-card ad-stat"><span className="ad-stat-label">Approval rate</span><span className="ad-stat-value">{decided ? Math.round(((decided - rejected) / decided) * 100) + '%' : '—'}</span><span className="ad-small ad-muted">{rejected} rejected of {decided} decided</span></div>
        <div className="ad-card ad-stat"><span className="ad-stat-label">Median time to approve</span><span className="ad-stat-value">{medianHours == null ? '—' : medianHours < 1 ? '<1 h' : Math.round(medianHours) + ' h'}</span><span className="ad-small ad-muted">from status history</span></div>
        <div className={`ad-card ad-stat ${failed ? 'bad' : ''}`}><span className="ad-stat-label">Failed (30 days)</span><span className="ad-stat-value">{failed}</span></div>
      </section>
      <div className="ad-split">
        <section className="ad-card ad-grow ad-stack" aria-label="Coming up">
          <h2 className="ad-h2">Next scheduled posts</h2>
          {next.length === 0 ? <p className="ad-muted" style={{ margin: 0 }}>Nothing scheduled.</p> : (
            <ul className="ad-list ad-stack">
              {next.map(({ p, at }) => (
                <li key={p.id} className="ad-row" style={{ justifyContent: 'space-between' }}>
                  <Link href={`/admin/posts/${p.id}`} className="ad-strong" style={{ textDecoration: 'none' }}>{p.topic || 'Untitled'}</Link>
                  <span className="ad-small ad-muted">{brandName[p.brand_id] || ''} · {formatWhen(at.toISOString())}{p.posting_status === 'HALTED' ? ' · held' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ad-card ad-side ad-stack" aria-label="Setup">
          <h2 className="ad-h2">Setup</h2>
          <dl className="ad-dl">
            <dt>Onboarding</dt><dd>{onboarding?.completed ? 'Complete' : `Step ${onboarding?.step || 1} of 5`}</dd>
            <dt>Timezone</dt><dd>{onboarding?.timezone || 'Africa/Lagos'}</dd>
            <dt>Plan</dt><dd>{contract ? contract.plan_name : 'No contract'}</dd>
            {money && contract && <><dt>Amount</dt><dd>{formatNaira(contract.amount_ngn)} / {contract.cycle === 'annual' ? 'year' : 'month'}</dd></>}
            {contract?.renewal_date && <><dt>Renews</dt><dd>{formatDate(contract.renewal_date)}</dd></>}
            <dt>Waiting approval</dt><dd>{summary?.stale_approvals ? `${summary.stale_approvals} over 48 h` : 'None over 48 h'}</dd>
          </dl>
          {!money && <p className="ad-small ad-muted" style={{ margin: 0 }}>Amounts and invoices are handled by an Owner.</p>}
        </section>
      </div>
    </>
  )
}

function Brands({ id, admin, brands, profileBy, accounts, max }) {
  const owner = can(admin.role, 'clients.brands')
  return (
    <section className="ad-card flush" aria-label="Brands">
      <div className="ad-card-head">
        <h2 className="ad-h2">Brands <span className="ad-muted" style={{ fontWeight: 500 }}>{brands.length} of {max} allowed</span></h2>
        {owner && (
          <div className="ad-row">
            <ActionDialog endpoint={`/api/admin/clients/${id}`} method="PATCH" label="Change allowance" size="sm"
              title="Brand allowance" description="Extra brands are a paid add-on. You can’t go below the brands the client already has."
              fields={[{ name: 'max_brands', label: 'Brands allowed', type: 'number', min: Math.max(1, brands.length), max: 10, defaultValue: max, required: true }]} successMessage="Allowance saved." />
            <ActionDialog endpoint={`/api/admin/clients/${id}/brands`} label="+ Add brand" size="sm" disabled={brands.length >= max} disabledReason="Raise the allowance first"
              fields={[{ name: 'name', label: 'Brand name', required: true },
                { name: 'language', label: 'Language', type: 'select', defaultValue: 'en', options: Object.entries(LANG).map(([value, label]) => ({ value, label })) },
                { name: 'country', label: 'Country code', defaultValue: 'NG', hint: 'Two letters, e.g. NG, GH, CI' }]} successMessage="Brand added." />
          </div>
        )}
      </div>
      <div className="ad-table-box">
        <table className="ad-table" style={{ minWidth: 640 }}>
          <thead><tr><th scope="col">Brand</th><th scope="col">Language</th><th scope="col">Brand Voice</th><th scope="col">Connections</th></tr></thead>
          <tbody>
            {brands.map(b => {
              const pr = profileBy[b.id] || {}
              const done = [pr.company_description, pr.target_audience, pr.language, (pr.example_posts || []).filter(Boolean).length ? 'x' : ''].filter(Boolean).length
              const conns = accounts.filter(a => a.brand_id === b.id)
              return (
                <tr key={b.id}>
                  <td className="ad-strong">{b.name}{b.is_default && <span className="ad-badge" style={{ marginLeft: 8 }}>Default</span>}</td>
                  <td>{LANG[pr.language] || pr.language || <span className="ad-text-warn">Not set</span>}{pr.country ? ` · ${pr.country}` : ''}</td>
                  <td>{done === 4 ? <span className="ad-text-good">Complete 4/4</span> : <span className="ad-text-warn">{done}/4 filled</span>}</td>
                  <td>{conns.length ? conns.map(a => a.platform).join(', ') : <span className="ad-muted">None</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

async function Posts({ id, brandName }) {
  const { data: posts } = await supabaseAdmin.from('posts').select(POST_COLS).eq('client_id', id).order('created_at', { ascending: false }).limit(50)
  return (
    <section className="ad-card flush ad-table-box" aria-label="Posts">
      <table className="ad-table" style={{ minWidth: 820 }}>
        <caption className="ad-sr">Latest 50 posts</caption>
        <thead><tr><th scope="col">Post</th><th scope="col">Brand</th><th scope="col">Status</th><th scope="col">Scheduled</th><th scope="col">Flags</th></tr></thead>
        <tbody>
          {(posts || []).length === 0 && <tr><td colSpan={5}><div className="ad-empty">No posts yet.</div></td></tr>}
          {(posts || []).map(p => {
            const flags = riskFlags(p)
            const at = earliestScheduled(p)
            return (
              <tr key={p.id}>
                <td><Link href={`/admin/posts/${p.id}`} className="ad-strong" style={{ textDecoration: 'none' }}>{p.topic || 'Untitled'}</Link></td>
                <td>{brandName[p.brand_id] || '—'}</td>
                <td><span className="ad-badge">{p.posting_status}</span></td>
                <td className="nowrap">{at ? formatWhen(at.toISOString()) : '—'}</td>
                <td>{flags.length ? flags.map(f => <span key={f} className={`ad-badge ${['failed', 'stuck'].includes(f) ? 'bad' : 'warn'}`} style={{ marginRight: 6 }}>{FLAG_LABEL[f]}</span>) : <span className="ad-muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Connections({ accounts, brandName }) {
  const now = new Date()
  return (
    <section className="ad-card flush ad-table-box" aria-label="Connections">
      <table className="ad-table" style={{ minWidth: 720 }}>
        <thead><tr><th scope="col">Platform</th><th scope="col">Brand</th><th scope="col">Account</th><th scope="col">Health</th><th scope="col">Publishing</th></tr></thead>
        <tbody>
          {accounts.length === 0 && <tr><td colSpan={5}><div className="ad-empty">No platforms connected yet.</div></td></tr>}
          {accounts.map((a, i) => {
            const expired = a.expires_at && new Date(a.expires_at) <= now
            const days = a.expires_at ? Math.ceil((new Date(a.expires_at) - now) / 86_400_000) : null
            return (
              <tr key={i}>
                <td className="ad-strong">{a.platform}</td>
                <td>{brandName[a.brand_id] || '—'}</td>
                <td>{a.handle ? `@${a.handle}` : a.display_name || <span className="ad-muted">Name not synced</span>}</td>
                <td>{a.token_valid === false || expired ? <span className="ad-text-bad">Reconnect needed</span> : days != null && days <= 7 ? <span className="ad-text-warn">Expires in {days} day(s)</span> : <span className="ad-text-good">Connected</span>}</td>
                <td>{LIVE_PLATFORMS.includes(a.platform) ? 'Live' : <span className="ad-muted">Import only (not live)</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

async function Billing({ id, contract }) {
  const { data: invoices } = await supabaseAdmin.from('invoices').select('*').eq('client_id', id).order('due_date', { ascending: false })
  const now = new Date()
  const contractFields = [
    { name: 'plan_name', label: 'Plan', required: true, defaultValue: contract?.plan_name || 'Founder’s Plan' },
    { name: 'amount', label: 'Amount (₦, whole naira)', required: true, defaultValue: contract ? String(contract.amount_ngn) : '800000' },
    { name: 'cycle', label: 'Billing cycle', type: 'select', defaultValue: contract?.cycle || 'monthly', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }] },
    { name: 'start_date', label: 'Start date', type: 'date', required: true, defaultValue: contract?.start_date || now.toISOString().slice(0, 10) },
    { name: 'renewal_date', label: 'Renewal date', type: 'date', defaultValue: contract?.renewal_date || '' },
  ]
  return (
    <div className="ad-split">
      <section className="ad-card ad-side ad-stack" aria-label="Contract">
        <h2 className="ad-h2">Contract</h2>
        {contract ? (
          <dl className="ad-dl">
            <dt>Plan</dt><dd>{contract.plan_name}</dd>
            <dt>Amount</dt><dd>{formatNaira(contract.amount_ngn)} / {contract.cycle === 'annual' ? 'year' : 'month'}</dd>
            <dt>Started</dt><dd>{formatDate(contract.start_date)}</dd>
            <dt>Renews</dt><dd>{contract.renewal_date ? formatDate(contract.renewal_date) : '—'}</dd>
          </dl>
        ) : <p className="ad-muted" style={{ margin: 0 }}>No active contract.</p>}
        <ActionDialog endpoint="/api/admin/contracts" body={{ client_id: id }} label={contract ? 'Change contract' : 'Add contract'} fields={contractFields}
          description={contract ? 'Saving ends the current contract and starts this one, so the history is kept.' : undefined} successMessage="Contract saved." />
      </section>
      <section className="ad-card flush ad-grow" aria-label="Invoices">
        <div className="ad-card-head">
          <h2 className="ad-h2">Invoices</h2>
          <ActionDialog endpoint="/api/admin/invoices" body={{ client_id: id }} label="Record invoice" size="sm" requireReason={false}
            fields={[
              { name: 'number', label: 'Invoice number', required: true, hint: 'e.g. CE-2026-0015' },
              { name: 'amount', label: 'Amount (₦)', required: true, defaultValue: contract ? String(contract.amount_ngn) : '' },
              { name: 'period_start', label: 'Period start', type: 'date', required: true },
              { name: 'period_end', label: 'Period end', type: 'date', required: true },
              { name: 'due_date', label: 'Due date', type: 'date', required: true },
              { name: 'status', label: 'Status', type: 'select', defaultValue: 'sent', options: [{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'paid', label: 'Paid' }] },
            ]} successMessage="Invoice recorded." />
        </div>
        <div className="ad-table-box">
          <table className="ad-table" style={{ minWidth: 640 }}>
            <thead><tr><th scope="col">Number</th><th scope="col">Period</th><th scope="col">Amount</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span className="ad-sr">Actions</span></th></tr></thead>
            <tbody>
              {(invoices || []).length === 0 && <tr><td colSpan={6}><div className="ad-empty">No invoices recorded.</div></td></tr>}
              {(invoices || []).map(inv => {
                const overdue = invoiceIsOverdue(inv, now)
                return (
                  <tr key={inv.id}>
                    <td className="ad-strong nowrap">{inv.number}</td>
                    <td className="nowrap">{formatDate(inv.period_start)} – {formatDate(inv.period_end)}</td>
                    <td className="nowrap">{formatNaira(inv.amount_ngn)}</td>
                    <td className="nowrap">{formatDate(inv.due_date)}</td>
                    <td>{overdue ? <span className="ad-badge bad">Overdue</span> : <span className={`ad-badge ${inv.status === 'paid' ? 'good' : ''}`}>{inv.status[0].toUpperCase() + inv.status.slice(1)}</span>}</td>
                    <td className="nowrap">{!['paid', 'void'].includes(inv.status) && (
                      <span className="ad-row">
                        <ActionDialog endpoint={`/api/admin/invoices/${inv.id}`} method="PATCH" body={{ status: 'paid' }} label="Mark paid" size="sm" title={`Mark ${inv.number} paid?`} successMessage="Marked paid." />
                        <ActionDialog endpoint={`/api/admin/invoices/${inv.id}`} method="PATCH" body={{ status: 'void' }} label="Void" size="sm" variant="danger" title={`Void ${inv.number}?`} successMessage="Invoice voided." />
                      </span>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

async function Activity({ id }) {
  const { data: rows } = await supabaseAdmin.from('admin_audit_log').select('id, at, action, reason, admin_id').eq('client_id', id).order('at', { ascending: false }).limit(100)
  const adminIds = [...new Set((rows || []).map(r => r.admin_id))]
  const { data: admins } = adminIds.length ? await supabaseAdmin.from('admin_users').select('user_id, full_name').in('user_id', adminIds) : { data: [] }
  const who = Object.fromEntries((admins || []).map(a => [a.user_id, a.full_name || 'Admin']))
  return (
    <section className="ad-card flush" aria-label="Activity">
      {(rows || []).length === 0 ? <div className="ad-empty">No admin actions on this client yet.</div> : (
        <ul className="ad-list">
          {rows.map(r => (
            <li key={r.id} className="ad-item">
              <div className="ad-item-body">
                <span className="ad-item-title">{r.action.replace(/[._]/g, ' ')}</span>
                <span className="ad-item-meta">{who[r.admin_id] || 'Former admin'}{r.reason ? ` · “${r.reason}”` : ''}</span>
              </div>
              <span className="ad-small ad-muted">{formatWhen(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
