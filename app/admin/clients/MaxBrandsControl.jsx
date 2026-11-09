'use client'
import { useState } from 'react'

export default function MaxBrandsControl({ clientId, brands, initialMax }) {
  const [value,  setValue]  = useState(initialMax)
  const [saved,  setSaved]  = useState(initialMax)
  const [busy,   setBusy]   = useState(false)
  const [error,  setError]  = useState('')

  async function save() {
    setBusy(true); setError('')
    try {
      const res  = await fetch('/api/admin/max-brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, max_brands: value }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Save failed')
      setSaved(body.max_brands)
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{brands} of</span>
      <input
        type="number" min={1} max={10} value={value}
        onChange={e => setValue(Number(e.target.value))}
        style={{ width: 52, padding: '3px 6px', border: '1px solid var(--fog-60)', borderRadius: 6, fontSize: '0.8125rem' }}
      />
      {value !== saved && (
        <button onClick={save} disabled={busy} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--ink)', color: 'white', fontSize: '0.75rem', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
      {error && <span style={{ color: 'var(--failed)', fontSize: '0.72rem' }}>{error}</span>}
    </span>
  )
}
