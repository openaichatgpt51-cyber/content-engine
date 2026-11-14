'use client'
import { useState } from 'react'

export default function CreateClientForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [made, setMade] = useState(null)

  async function create(e) {
    e.preventDefault()
    setErr(''); setMade(null); setBusy(true)
    const res = await fetch('/api/admin/create-client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setErr(j.error || 'Failed')
    setMade(j); setEmail('')
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Create client account</div>
      <form onSubmit={create} style={{ display: 'flex', gap: 8 }}>
        <input type="email" required placeholder="client@company.com" value={email} onChange={e => setEmail(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--fog-60)', borderRadius: 8, fontSize: '0.85rem' }} />
        <button disabled={busy} style={{ padding: '8px 16px', background: 'var(--ink)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </form>
      {err && <p style={{ color: 'var(--failed)', fontSize: '0.8rem', marginTop: 8 }}>{err}</p>}
      {made && (
        <div style={{ marginTop: 12, padding: 12, background: 'var(--fog)', borderRadius: 8, fontSize: '0.85rem' }}>
          <div>Account created for <b>{made.email}</b>. Share this temporary password once; it is shown only now and they must change it on first sign-in.</div>
          <code style={{ display: 'block', marginTop: 8, fontSize: '1rem', userSelect: 'all' }}>{made.temp_password}</code>
        </div>
      )}
    </div>
  )
}
