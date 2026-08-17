'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ResetPasswordPage() {
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [done,            setDone]            = useState(false)

  // Supabase's reset-link redirect automatically exchanges the token and
  // creates a temporary session for this page — no extra token handling needed.
  async function handleUpdate(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirmPassword) return setError('Passwords do not match')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 1800)
  }

  return (
    <div style={pageStyle}>
      <div style={bgGradient} />
      <div className="animate-in" style={cardStyle}>
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={logoStyle}>Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span></div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
            <p style={{ color: 'var(--white)', fontSize: '1rem', fontWeight: 500 }}>Password updated</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8125rem', marginTop: 4 }}>Taking you to your dashboard…</p>
          </div>
        ) : (
          <>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem', marginBottom: 24, textAlign: 'center' }}>
              Choose a new password for your account.
            </p>
            <form onSubmit={handleUpdate}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>New password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="At least 8 characters" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,150,62,0.6)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Confirm new password</label>
                <input
                  type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  required placeholder="••••••••" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,150,62,0.6)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
              {error && <div style={errorStyle}>{error}</div>}
              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh', background: 'var(--ink)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden',
}
const bgGradient = {
  position: 'absolute', inset: 0,
  backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(200,150,62,0.12) 0%, transparent 60%)',
  pointerEvents: 'none',
}
const cardStyle = {
  width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-lg)',
  padding: '48px 40px', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 1,
}
const logoStyle = { fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--white)', letterSpacing: '-0.02em' }
const labelStyle = {
  display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)',
  marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase',
}
const inputStyle = {
  width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)',
  color: 'var(--white)', fontSize: '0.9375rem', outline: 'none', transition: 'border-color 0.15s ease',
}
const errorStyle = {
  background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)',
  borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: '#FCA5A5', fontSize: '0.8125rem', marginBottom: 20,
}
const buttonStyle = (loading) => ({
  width: '100%', padding: '13px 20px',
  background: loading ? 'rgba(200,150,62,0.4)' : 'var(--accent-warm)',
  color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.9375rem',
  fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease',
})
