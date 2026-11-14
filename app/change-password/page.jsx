'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 10) return setError('Password must be at least 10 characters')
    if (password !== confirm) return setError('Passwords do not match')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } })
    if (error) { setError(error.message); setLoading(false); return }
    await supabase.auth.refreshSession()
    window.location.href = '/dashboard'
  }

  const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '0.9rem', marginBottom: 14 }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
      <form onSubmit={submit} style={{ width: 380, maxWidth: '90vw', color: 'white' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 6 }}>Choose your password</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: 20 }}>
          You signed in with a temporary password. Set your own to continue.
        </p>
        <input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} style={input} autoComplete="new-password" />
        <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} style={input} autoComplete="new-password" />
        {error && <p style={{ color: '#ff8a8a', fontSize: '0.8rem', marginBottom: 12 }}>{error}</p>}
        <button disabled={loading} style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', background: 'var(--accent-warm)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </div>
  )
}
