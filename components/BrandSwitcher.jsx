'use client'
import { useState } from 'react'
import { useBrand } from './BrandProvider'
import { EXTRA_BRAND_PRICE_NOTE } from '../lib/featureFlags'

// Sidebar brand switcher. Renders nothing while multi-brand is switched off.
export default function BrandSwitcher() {
  const { enabled, brands, activeBrandId, maxBrands } = useBrand()
  const [open, setOpen]       = useState(false)
  const [adding, setAdding]   = useState(false)
  const [name, setName]       = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  // A client with one brand and no extra allowance has nothing to switch to or
  // add, so the switcher (and the default brand's name) stays hidden. It shows
  // once there are 2+ brands, or when the client has been granted room for more
  // so they can add one.
  if (!enabled || brands.length === 0) return null
  if (brands.length < 2 && maxBrands < 2) return null

  const active   = brands.find(b => b.id === activeBrandId) || brands[0]
  const atLimit  = brands.length >= maxBrands

  async function switchTo(id) {
    if (id === activeBrandId || busy) { setOpen(false); return }
    setBusy(true)
    const res = await fetch('/api/brand/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: id }),
    })
    if (res.ok) {
      // full reload so every page refetches for the new brand
      window.location.reload()
    } else {
      setBusy(false)
      setError('Could not switch brand. Try again.')
    }
  }

  async function addBrand(e) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    const res = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      window.location.reload()
    } else {
      setBusy(false)
      setError(body.error || 'Could not add the brand.')
    }
  }

  const item = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
    borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.7)', background: 'transparent', border: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ padding: '12px 12px 0', position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); setError('') }}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '9px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
          color: 'var(--white)', fontSize: '0.8rem', cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active.name}
        </span>
        <span aria-hidden style={{ opacity: 0.5 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div role="listbox" style={{
          marginTop: 6, padding: 6, borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
        }}>
          {brands.map(b => (
            <button key={b.id} role="option" aria-selected={b.id === activeBrandId}
              onClick={() => switchTo(b.id)}
              style={{ ...item, color: b.id === activeBrandId ? 'var(--white)' : item.color,
                       background: b.id === activeBrandId ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
              {b.name}
            </button>
          ))}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />

          {!adding && (
            <button style={item} onClick={() => setAdding(true)} disabled={atLimit}>
              + Add brand
            </button>
          )}

          {atLimit && (
            <div style={{ padding: '4px 10px 6px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
              Your plan includes {maxBrands} {maxBrands === 1 ? 'brand' : 'brands'}.
              {' '}{EXTRA_BRAND_PRICE_NOTE || 'Extra brands are a paid add-on.'} Contact us to add one.
            </div>
          )}

          {adding && !atLimit && (
            <form onSubmit={addBrand} style={{ padding: 4 }}>
              <input
                autoFocus value={name} maxLength={60}
                onChange={e => setName(e.target.value)} placeholder="Brand name"
                style={{ width: '100%', padding: '7px 9px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
                         border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.25)', color: 'var(--white)' }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="submit" disabled={busy || !name.trim()} style={{ ...item, textAlign: 'center', background: 'rgba(255,255,255,0.1)', color: 'var(--white)' }}>
                  {busy ? 'Adding…' : 'Add'}
                </button>
                <button type="button" onClick={() => { setAdding(false); setName(''); setError('') }} style={{ ...item, textAlign: 'center' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {error && <div role="alert" style={{ padding: '6px 10px', fontSize: '0.72rem', color: '#ff9b8f' }}>{error}</div>}
        </div>
      )}
    </div>
  )
}
