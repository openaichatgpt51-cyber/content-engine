'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data?.session) {
      // Force a hard navigation instead of client-side push
      window.location.href = '/dashboard'
    } else {
      setError('No session returned — please try again')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background texture */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(200,150,62,0.12) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.015'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div className="animate-in" style={{
        width: '100%',
        maxWidth: 420,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--radius-lg)',
        padding: '48px 40px',
        backdropFilter: 'blur(20px)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            color: 'var(--white)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span>
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.35)',
            fontSize: '0.8125rem',
            marginTop: 8,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            AI Social Media Dashboard
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'rgba(200,150,62,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(200,150,62,0.12)' }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'rgba(200,150,62,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(200,150,62,0.12)' }}
              onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {error && (
            <div className="animate-in shake-once" style={{
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              color: '#FCA5A5',
              fontSize: '0.8125rem',
              marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="press hover-lift" style={{
            width: '100%',
            padding: '13px 20px',
            background: loading ? 'rgba(200,150,62,0.4)' : 'var(--accent-warm)',
            color: 'var(--white)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9375rem',
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            {loading ? (
              <>
                <Spinner size={16} light />
                Signing in…
              </>
            ) : 'Sign in'}
          </button>
        </form>

        <p style={{
          textAlign: 'center',
          marginTop: 24,
          color: 'rgba(255,255,255,0.2)',
          fontSize: '0.75rem',
        }}>
          Contact your administrator to create an account
        </p>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.5)',
  marginBottom: 6,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--white)',
  fontSize: '0.9375rem',
  outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
}
