'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)

  async function handleReset(e) {
    e.preventDefault()
    setError(''); setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    })

    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <div style={pageStyle}>
      <div style={bgGradient} />
      <div className="animate-in" style={cardStyle}>
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={logoStyle}>Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span></div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📬</div>
            <p style={{ color: 'var(--white)', fontSize: '1rem', fontWeight: 500, marginBottom: 8 }}>Check your email</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8125rem', lineHeight: 1.6 }}>
              If an account exists for <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{email}</strong>,
              we've sent a password reset link.
            </p>
          </div>
        ) : (
          <>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem', marginBottom: 24, textAlign: 'center' }}>
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleReset}>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="you@company.com" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,150,62,0.6)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
              {error && <div style={errorStyle}>{error}</div>}
              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p style={footerLinkStyle}>
          <Link href="/login" style={linkStyle}>← Back to sign in</Link>
        </p>
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
const footerLinkStyle = { textAlign: 'center', marginTop: 24, color: 'rgba(255,255,255,0.35)', fontSize: '0.8125rem' }
const linkStyle = { color: 'var(--accent-warm)', fontWeight: 500 }
