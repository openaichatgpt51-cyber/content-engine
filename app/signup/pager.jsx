'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export default function SignupPage() {
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [checkEmail,      setCheckEmail]      = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      return setError('Password must be at least 8 characters')
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match')
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data?.session) {
      // Email confirmation is off for this project — user is logged in immediately
      window.location.href = '/onboarding'
    } else {
      // Email confirmation is required — no session until they click the link
      setCheckEmail(true)
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={bgGradient} />
      <div style={bgTexture} />

      <div className="animate-in" style={cardStyle}>
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={logoStyle}>
            Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span>
          </div>
          <p style={taglineStyle}>AI Social Media Dashboard</p>
        </div>

        {checkEmail ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📬</div>
            <p style={{ color: 'var(--white)', fontSize: '1rem', fontWeight: 500, marginBottom: 8 }}>
              Check your email
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.8125rem', lineHeight: 1.6 }}>
              We sent a confirmation link to <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{email}</strong>.
              Click it to activate your account and get started.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSignup}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,150,62,0.6)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="At least 8 characters"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,150,62,0.6)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(200,150,62,0.6)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              {error && <div style={errorStyle}>{error}</div>}

              <button type="submit" disabled={loading} style={buttonStyle(loading)}>
                {loading ? (
                  <>
                    <span style={spinnerStyle} />
                    Creating account…
                  </>
                ) : 'Create account'}
              </button>
            </form>

            <p style={footerLinkStyle}>
              Already have an account? <Link href="/login" style={linkStyle}>Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh', background: 'var(--ink)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 24,
  position: 'relative', overflow: 'hidden',
}
const bgGradient = {
  position: 'absolute', inset: 0,
  backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(200,150,62,0.12) 0%, transparent 60%)',
  pointerEvents: 'none',
}
const bgTexture = {
  position: 'absolute', inset: 0,
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
  pointerEvents: 'none',
}
const cardStyle = {
  width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-lg)',
  padding: '48px 40px', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 1,
}
const logoStyle = {
  fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--white)',
  letterSpacing: '-0.02em', lineHeight: 1,
}
const taglineStyle = {
  color: 'rgba(255,255,255,0.35)', fontSize: '0.8125rem', marginTop: 8,
  letterSpacing: '0.05em', textTransform: 'uppercase',
}
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
  borderRadius: 'var(--radius-sm)', padding: '10px 14px', color: '#FCA5A5',
  fontSize: '0.8125rem', marginBottom: 20,
}
const buttonStyle = (loading) => ({
  width: '100%', padding: '13px 20px',
  background: loading ? 'rgba(200,150,62,0.4)' : 'var(--accent-warm)',
  color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.9375rem',
  fontWeight: 500, fontFamily: 'var(--font-body)', cursor: loading ? 'not-allowed' : 'pointer',
  transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
})
const spinnerStyle = {
  width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
  borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block',
}
const footerLinkStyle = {
  textAlign: 'center', marginTop: 24, color: 'rgba(255,255,255,0.35)', fontSize: '0.8125rem',
}
const linkStyle = { color: 'var(--accent-warm)', fontWeight: 500 }
