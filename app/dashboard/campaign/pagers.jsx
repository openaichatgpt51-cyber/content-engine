'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Spinner } from '../../../components/ui'
import { supabase } from '../../../lib/supabase'

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual' },
  { value: 'provocative',  label: 'Provocative' },
]
const PLATFORM_OPTIONS = [
  { value: 'LinkedIn',   label: 'LinkedIn',    icon: '🔵' },
  { value: 'Instagram',  label: 'Instagram',   icon: '🟣' },
  { value: 'Twitter',    label: 'X / Twitter', icon: '⬛' },
]

export default function CampaignPage() {
  const router = useRouter()
  const [checkingProfile, setCheckingProfile] = useState(true)
  const [profileComplete, setProfileComplete] = useState(false)

  const [topicsText, setTopicsText] = useState('')
  const [tone,       setTone]       = useState('professional')
  const [platforms,  setPlatforms]  = useState(['LinkedIn', 'Instagram', 'Twitter'])

  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error,    setError]    = useState('')
  const [result,   setResult]   = useState(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('brand_profiles')
        .select('company_description, target_audience')
        .eq('client_id', user.id)
        .maybeSingle()
      setProfileComplete(!!(profile?.company_description?.trim() && profile?.target_audience?.trim()))
      setCheckingProfile(false)
    })()
  }, [])

  const topics = topicsText.split('\n').map(t => t.trim()).filter(Boolean)

  function togglePlatform(val) {
    setPlatforms(prev => prev.includes(val) ? prev.filter(p => p !== val) : [...prev, val])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!topics.length)     return setError('Add at least one topic — one per line')
    if (!platforms.length)  return setError('Select at least one platform')

    setLoading(true)
    setError('')
    setResult(null)
    setProgress({ done: 0, total: topics.length })

    try {
      const res = await fetch('/api/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, tone, platforms }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
      setResult(body)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (checkingProfile) {
    return (
      <div style={{ padding: '32px 40px', display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  if (!profileComplete) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 560 }}>
        <div style={{
          background: 'var(--white)', border: '1px solid var(--fog-60)',
          borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>✏️</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 8 }}>
            Complete your Brand Voice first
          </h2>
          <p style={{ color: 'var(--ink-40)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: 20 }}>
            A campaign generates several posts at once, meant to stay consistent as a set —
            that needs a defined company description and target audience so every post stays
            on-brand, not just the tone of whoever's prompting it that day.
          </p>
          <Link href="/dashboard/settings?tab=brandvoice" style={{
            display: 'inline-block', padding: '10px 20px', background: 'var(--ink)',
            color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem',
            fontWeight: 500, textDecoration: 'none',
          }}>
            Go to Brand Voice settings →
          </Link>
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 560 }}>
        <div style={{
          background: 'var(--white)', border: '1px solid var(--fog-60)',
          borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>
            {result.failed === 0 ? '✅' : '⚠️'}
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 8 }}>
            {result.generated} post{result.generated === 1 ? '' : 's'} generated
          </h2>
          {result.failed > 0 && (
            <p style={{ color: 'var(--failed)', fontSize: '0.875rem', marginBottom: 12 }}>
              {result.failed} topic{result.failed === 1 ? '' : 's'} failed to generate — check Notifications for details.
            </p>
          )}
          <p style={{ color: 'var(--ink-40)', fontSize: '0.875rem', marginBottom: 20 }}>
            Each post is scheduled to your next available preferred posting slots and is
            waiting for your approval in the Review Queue.
          </p>
          <Link href="/dashboard/review" style={{
            display: 'inline-block', padding: '10px 20px', background: 'var(--ink)',
            color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem',
            fontWeight: 500, textDecoration: 'none',
          }}>
            Go to Review Queue →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 640 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 4 }}>
        New Campaign
      </h1>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 28 }}>
        Generate several posts at once, spread across your preferred posting schedule.
      </p>

      <form onSubmit={handleSubmit}>
        <Section label="Topics" step="01">
          <textarea
            value={topicsText}
            onChange={e => setTopicsText(e.target.value)}
            placeholder={'One topic per line, e.g.\nQ3 product roadmap update\nWhy we switched to a remote-first model\nLessons from our biggest client win this year'}
            rows={6}
            style={{
              width: '100%', padding: '12px 14px', border: '1.5px solid var(--fog-60)',
              borderRadius: 'var(--radius-md)', fontSize: '0.9375rem', fontFamily: 'var(--font-body)',
              resize: 'vertical', outline: 'none',
            }}
          />
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-20)', marginTop: 6 }}>
            {topics.length} topic{topics.length === 1 ? '' : 's'} · up to 20 per campaign
          </div>
        </Section>

        <Section label="Tone of voice" step="02">
          <div style={{ display: 'flex', gap: 8 }}>
            {TONES.map(t => (
              <button key={t.value} type="button" onClick={() => setTone(t.value)} style={{
                padding: '8px 16px', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem',
                border: `1.5px solid ${tone === t.value ? 'var(--ink)' : 'var(--fog-60)'}`,
                background: tone === t.value ? 'var(--ink)' : 'var(--white)',
                color: tone === t.value ? 'var(--white)' : 'var(--ink-40)',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Publish to" step="03">
          <div style={{ display: 'flex', gap: 8 }}>
            {PLATFORM_OPTIONS.map(p => (
              <label key={p.value} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: `1.5px solid ${platforms.includes(p.value) ? 'var(--ink)' : 'var(--fog-60)'}`,
                background: platforms.includes(p.value) ? 'var(--fog)' : 'var(--white)',
              }}>
                <input type="checkbox" checked={platforms.includes(p.value)} onChange={() => togglePlatform(p.value)} style={{ display: 'none' }} />
                <span>{p.icon}</span>
                <span style={{ fontSize: '0.875rem' }}>{p.label}</span>
              </label>
            ))}
          </div>
        </Section>

        {error && (
          <div style={{
            padding: '12px 16px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--failed)', fontSize: '0.875rem', marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ marginBottom: 20, fontSize: '0.875rem', color: 'var(--ink-40)' }}>
            Generating {progress.total} post{progress.total === 1 ? '' : 's'}… this can take a minute or two for larger campaigns.
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '12px 28px', background: 'var(--ink)', color: 'var(--white)',
          borderRadius: 'var(--radius-sm)', fontSize: '0.9375rem', fontWeight: 500,
          border: 'none', cursor: loading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {loading && <Spinner size={16} />}
          {loading ? 'Generating campaign…' : `Generate ${topics.length || ''} post${topics.length === 1 ? '' : 's'}`}
        </button>
      </form>
    </div>
  )
}

function Section({ label, step, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: 'var(--white)',
          fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
        }}>{step}</span>
        <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{label}</span>
      </div>
      {children}
    </div>
  )
}
