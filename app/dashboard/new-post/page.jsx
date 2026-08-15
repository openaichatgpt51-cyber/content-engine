'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TONES = [
  { value: 'professional', label: 'Professional', desc: 'Formal, authoritative, data-driven' },
  { value: 'casual',       label: 'Casual',       desc: 'Conversational, approachable, warm' },
  { value: 'provocative',  label: 'Provocative',  desc: 'Bold, contrarian, thought-provoking' },
]

// NOTE: values must match exactly what the n8n workflow's Filter nodes check for
// (Filter Ready Posts / Filter Ready Instagram / Filter Ready Twitter all do a
// case-sensitive "contains" match against "LinkedIn" / "Instagram" / "Twitter").
// Lowercase values here would silently pass the case-sensitive filter and every
// generated post would sit in PENDING forever without ever being picked up for posting.
const PLATFORM_OPTIONS = [
  { value: 'LinkedIn',  label: 'LinkedIn',  icon: '🔵', desc: '1,200 char post' },
  { value: 'Instagram', label: 'Instagram', icon: '🟣', desc: '2,200 char caption' },
  { value: 'Twitter',   label: 'X / Twitter', icon: '⬛', desc: '280 char hook' },
]

export default function NewPostPage() {
  const router = useRouter()
  const [topic,     setTopic]     = useState('')
  const [tone,      setTone]      = useState('professional')
  const [platforms, setPlatforms] = useState(['LinkedIn', 'Instagram', 'Twitter'])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [progress,  setProgress]  = useState(0)

  function togglePlatform(val) {
    setPlatforms(prev =>
      prev.includes(val) ? prev.filter(p => p !== val) : [...prev, val]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!topic.trim())       return setError('Please enter a topic')
    if (!platforms.length)   return setError('Select at least one platform')

    setLoading(true)
    setError('')
    setProgress(0)

    // Animate progress bar while waiting
    const interval = setInterval(() => {
      setProgress(p => p < 88 ? p + Math.random() * 4 : p)
    }, 1200)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), tone, platforms }),
      })

      clearInterval(interval)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }

      setProgress(100)
      await new Promise(r => setTimeout(r, 600)) // let user see 100%
      router.push('/dashboard/review')

    } catch (err) {
      clearInterval(interval)
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
      setProgress(0)
    }
  }

  return (
    <div style={{ padding: '32px 36px', flex: 1, maxWidth: 720 }}>

      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <a href="/dashboard" style={{ fontSize: '0.8rem', color: 'var(--ink-20)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, width: 'fit-content' }}>
          ← Back to Calendar
        </a>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          lineHeight: 1.1,
        }}>
          Generate New Post
        </h1>
        <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginTop: 6 }}>
          Enter a topic and we'll research, write, and schedule content for each platform.
        </p>
      </div>

      <form onSubmit={handleSubmit}>

        {/* Topic input */}
        <Section label="What's the topic?" step="01">
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. How AI is reshaping enterprise cybersecurity in 2026"
            rows={3}
            required
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'var(--white)',
              border: '1.5px solid var(--fog-60)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9375rem',
              color: 'var(--ink)',
              resize: 'vertical',
              outline: 'none',
              transition: 'border-color 0.15s',
              lineHeight: 1.6,
            }}
            onFocus={e  => e.target.style.borderColor = 'var(--ink-40)'}
            onBlur={e   => e.target.style.borderColor = 'var(--fog-60)'}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-20)', marginTop: 6 }}>
            Be specific — include an angle, year, or target audience for best results.
          </div>
        </Section>

        {/* Tone selector */}
        <Section label="Tone of voice" step="02">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {TONES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  background: tone === t.value ? 'var(--ink)' : 'var(--white)',
                  color: tone === t.value ? 'var(--white)' : 'var(--ink)',
                  border: `1.5px solid ${tone === t.value ? 'var(--ink)' : 'var(--fog-60)'}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6, lineHeight: 1.4 }}>{t.desc}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* Platform checkboxes */}
        <Section label="Publish to" step="03">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PLATFORM_OPTIONS.map(p => {
              const checked = platforms.includes(p.value)
              return (
                <label
                  key={p.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    background: checked ? 'var(--fog)' : 'var(--white)',
                    border: `1.5px solid ${checked ? 'var(--ink-60)' : 'var(--fog-60)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(p.value)}
                    style={{ width: 16, height: 16, accentColor: 'var(--ink)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '1.2rem' }}>{p.icon}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{p.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-20)' }}>{p.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </Section>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'var(--failed-bg)',
            border: '1px solid var(--failed-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--failed)',
            fontSize: '0.875rem',
            marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Progress bar */}
        {loading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--ink-40)', marginBottom: 8 }}>
              <span>
                {progress < 20  ? '🔍 Researching topic…'   :
                 progress < 50  ? '✍️  Writing content…'    :
                 progress < 80  ? '🎨 Fetching images…'     :
                 progress < 100 ? '📤 Exporting to sheet…'  :
                                  '✅ Complete!'}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress)}%</span>
            </div>
            <div style={{
              height: 6,
              background: 'var(--fog-60)',
              borderRadius: 99,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: progress === 100 ? 'var(--done)' : 'var(--ink)',
                borderRadius: 99,
                transition: 'width 1s ease, background 0.3s ease',
              }} />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-20)', marginTop: 8 }}>
              Generation typically takes 30–90 seconds. Don't close this tab.
            </p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '15px 24px',
            background: loading ? 'var(--fog-60)' : 'var(--ink)',
            color: loading ? 'var(--ink-20)' : 'var(--white)',
            borderRadius: 'var(--radius)',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          {loading ? (
            <>
              <span style={{
                width: 18, height: 18,
                border: '2px solid rgba(0,0,0,0.15)',
                borderTopColor: 'var(--ink-40)',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
                flexShrink: 0,
              }} />
              Generating…
            </>
          ) : (
            <>Generate Content →</>
          )}
        </button>
      </form>
    </div>
  )
}

function Section({ label, step, children }) {
  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--fog-60)',
      borderRadius: 'var(--radius-lg)',
      padding: '24px 24px',
      marginBottom: 20,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{
          width: 24, height: 24,
          background: 'var(--ink)',
          color: 'var(--white)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}>
          {step}
        </span>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--ink)' }}>{label}</h2>
      </div>
      {children}
    </div>
  )
}
