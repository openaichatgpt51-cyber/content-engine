'use client'
import { useState } from 'react'
import Link from 'next/link'
import CopyField from './CopyField'

const LANGS = [['en', 'English'], ['pcm', 'Nigerian Pidgin'], ['yo', 'Yoruba'], ['ha', 'Hausa'], ['ig', 'Igbo'], ['fr', 'French'], ['pt', 'Portuguese'], ['sw', 'Swahili'], ['ar', 'Arabic']]
const COUNTRIES = [['NG', 'Nigeria'], ['GH', 'Ghana'], ['CI', 'Côte d’Ivoire'], ['SN', 'Senegal'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['CM', 'Cameroon']]

export default function NewClientForm({ prefill = {}, leadId = null, adminName = '' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const today = new Date().toISOString().slice(0, 10)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const f = Object.fromEntries(new FormData(e.currentTarget).entries())
    try {
      const res = await fetch('/api/admin/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, lead_id: leadId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not set up the client.')
      setDone({ ...data, contact: f.contact_name, company: f.company_name })
    } catch (err) { setError(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }) } finally { setBusy(false) }
  }

  if (done) {
    const first = (done.contact || '').split(' ')[0] || 'there'
    const message = `Hi ${first}, welcome to ContentEngine! Your account for ${done.company} is ready. Open this link to set your password and sign in: ${done.link} — it works once and expires in 24 hours. Reply here if you need help.${adminName ? ` — ${adminName}` : ''}`
    return (
      <section role="status" className="ops-card ops-stack" style={{ maxWidth: 720, borderColor: '#A6E3BF' }}>
        <h2 className="ops-h2" style={{ fontSize: 22 }}>{done.company} is set up</h2>
        <p className="ops-sub">Account, contract and first brand were created. Send the invite yourself; email sending needs custom SMTP in Supabase.</p>
        <CopyField label="Invite link (single use, expires in 24 hours)" value={done.link} />
        <CopyField label="Welcome message (for WhatsApp or email)" value={message} multiline />
        <div className="ops-row">
          <Link href={`/admin/clients/${done.client_id}`} className="ops-btn primary">Open client</Link>
          <Link href="/admin/clients/new" className="ops-btn" onClick={() => setDone(null)}>Set up another</Link>
        </div>
      </section>
    )
  }

  return (
    <form className="ops-split" onSubmit={submit} noValidate={false}>
      <div className="ops-grow ops-form">
        {error && <div role="alert" className="ops-error">{error}</div>}
        <fieldset className="ops-fieldset">
          <legend>1 · Account</legend>
          <label className="ops-field">Company name<input name="company_name" className="ops-input" required defaultValue={prefill.company || ''} /></label>
          <label className="ops-field">Contact name<input name="contact_name" className="ops-input" required defaultValue={prefill.name || ''} /></label>
          <label className="ops-field full">Contact email (receives the invite)<input name="email" type="email" className="ops-input" required defaultValue={prefill.email || ''} /></label>
        </fieldset>
        <fieldset className="ops-fieldset">
          <legend>2 · Contract</legend>
          <label className="ops-field">Plan<input name="plan_name" className="ops-input" required defaultValue="Founder’s Plan" list="plans" /><datalist id="plans"><option value="Founder’s Plan" /><option value="Growth" /><option value="Agency" /></datalist></label>
          <label className="ops-field">Billing cycle<select name="cycle" className="ops-select" defaultValue="monthly"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
          <label className="ops-field">Amount (₦, whole naira)<input name="amount" inputMode="numeric" className="ops-input" required defaultValue="800000" /><span className="ops-hint">Founder’s Plan: ₦800,000 a month or ₦8,400,000 a year.</span></label>
          <label className="ops-field">Start date<input name="start_date" type="date" className="ops-input" required defaultValue={today} /></label>
          <label className="ops-field">Brand allowance<input name="max_brands" type="number" min="1" max="10" className="ops-input" required defaultValue="1" /><span className="ops-hint">Extra brands are a paid add-on.</span></label>
        </fieldset>
        <fieldset className="ops-fieldset">
          <legend>3 · First brand</legend>
          <label className="ops-field">Brand name<input name="brand_name" className="ops-input" required defaultValue={prefill.company || ''} /></label>
          <label className="ops-field">Country<select name="country" className="ops-select" defaultValue="NG">{COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="ops-field">Language<select name="language" className="ops-select" defaultValue="en">{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="ops-field">Timezone<select name="timezone" className="ops-select" defaultValue="Africa/Lagos"><option>Africa/Lagos</option><option>Africa/Accra</option><option>Africa/Abidjan</option><option>Africa/Dakar</option><option>Africa/Nairobi</option><option>Africa/Johannesburg</option></select></label>
          <label className="ops-field full">Brand Voice notes from the sales call (optional)<textarea name="voice_notes" className="ops-textarea" rows={3} defaultValue={prefill.message || ''} placeholder="Who they are, who they talk to, words to avoid…" /></label>
        </fieldset>
      </div>
      <aside className="ops-side ops-card ops-stack">
        <h2 className="ops-h2">Before you create</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
          <li>The client sets their own password from the invite link. No admin sees it.</li>
          <li>They still connect LinkedIn and set a schedule in onboarding.</li>
          <li>Nothing is created until you press the button. If any step fails, nothing is kept.</li>
          {leadId && <li>This lead will be marked won and linked to the new client.</li>}
        </ul>
        <button type="submit" className="ops-btn primary" disabled={busy} style={{ minHeight: 48 }}>{busy ? 'Setting up…' : 'Create client and invite link'}</button>
      </aside>
    </form>
  )
}
