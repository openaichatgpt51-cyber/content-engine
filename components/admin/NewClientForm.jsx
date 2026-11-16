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
      <section role="status" className="ad-card ad-stack" style={{ maxWidth: 720, borderColor: '#A6E3BF' }}>
        <h2 className="ad-h2" style={{ fontSize: 22 }}>{done.company} is set up</h2>
        <p className="ad-sub">Account, contract and first brand were created. Send the invite yourself; email sending needs custom SMTP in Supabase.</p>
        <CopyField label="Invite link (single use, expires in 24 hours)" value={done.link} />
        <CopyField label="Welcome message (for WhatsApp or email)" value={message} multiline />
        <div className="ad-row">
          <Link href={`/admin/clients/${done.client_id}`} className="ad-btn primary">Open client</Link>
          <Link href="/admin/clients/new" className="ad-btn" onClick={() => setDone(null)}>Set up another</Link>
        </div>
      </section>
    )
  }

  return (
    <form className="ad-split" onSubmit={submit} noValidate={false}>
      <div className="ad-grow ad-form">
        {error && <div role="alert" className="ad-error">{error}</div>}
        <fieldset className="ad-fieldset">
          <legend>1 · Account</legend>
          <label className="ad-field">Company name<input name="company_name" className="ad-input" required defaultValue={prefill.company || ''} /></label>
          <label className="ad-field">Contact name<input name="contact_name" className="ad-input" required defaultValue={prefill.name || ''} /></label>
          <label className="ad-field full">Contact email (receives the invite)<input name="email" type="email" className="ad-input" required defaultValue={prefill.email || ''} /></label>
        </fieldset>
        <fieldset className="ad-fieldset">
          <legend>2 · Contract</legend>
          <label className="ad-field">Plan<input name="plan_name" className="ad-input" required defaultValue="Founder’s Plan" list="plans" /><datalist id="plans"><option value="Founder’s Plan" /><option value="Growth" /><option value="Agency" /></datalist></label>
          <label className="ad-field">Billing cycle<select name="cycle" className="ad-select" defaultValue="monthly"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
          <label className="ad-field">Amount (₦, whole naira)<input name="amount" inputMode="numeric" className="ad-input" required defaultValue="800000" /><span className="ad-hint">Founder’s Plan: ₦800,000 a month or ₦8,400,000 a year.</span></label>
          <label className="ad-field">Start date<input name="start_date" type="date" className="ad-input" required defaultValue={today} /></label>
          <label className="ad-field">Brand allowance<input name="max_brands" type="number" min="1" max="10" className="ad-input" required defaultValue="1" /><span className="ad-hint">Extra brands are a paid add-on.</span></label>
        </fieldset>
        <fieldset className="ad-fieldset">
          <legend>3 · First brand</legend>
          <label className="ad-field">Brand name<input name="brand_name" className="ad-input" required defaultValue={prefill.company || ''} /></label>
          <label className="ad-field">Country<select name="country" className="ad-select" defaultValue="NG">{COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="ad-field">Language<select name="language" className="ad-select" defaultValue="en">{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="ad-field">Timezone<select name="timezone" className="ad-select" defaultValue="Africa/Lagos"><option>Africa/Lagos</option><option>Africa/Accra</option><option>Africa/Abidjan</option><option>Africa/Dakar</option><option>Africa/Nairobi</option><option>Africa/Johannesburg</option></select></label>
          <label className="ad-field full">Brand Voice notes from the sales call (optional)<textarea name="voice_notes" className="ad-textarea" rows={3} defaultValue={prefill.message || ''} placeholder="Who they are, who they talk to, words to avoid…" /></label>
        </fieldset>
      </div>
      <aside className="ad-side ad-card ad-stack">
        <h2 className="ad-h2">Before you create</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
          <li>The client sets their own password from the invite link. No admin sees it.</li>
          <li>They still connect LinkedIn and set a schedule in onboarding.</li>
          <li>Nothing is created until you press the button. If any step fails, nothing is kept.</li>
          {leadId && <li>This lead will be marked won and linked to the new client.</li>}
        </ul>
        <button type="submit" className="ad-btn primary" disabled={busy} style={{ minHeight: 48 }}>{busy ? 'Setting up…' : 'Create client and invite link'}</button>
      </aside>
    </form>
  )
}
