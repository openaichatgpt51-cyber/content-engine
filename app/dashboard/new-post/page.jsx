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

// NOTE: values must match exactly what the n8n workflow's Filter nodes check
// for (case-sensitive "contains" against "LinkedIn" / "Instagram" / "Twitter").
const PLATFORMS = [
  { key: 'LinkedIn',  label: 'LinkedIn',    icon: '🔵', limit: '1,200 char post' },
  { key: 'Instagram', label: 'Instagram',   icon: '🟣', limit: '2,200 char caption' },
  { key: 'Twitter',   label: 'X / Twitter', icon: '⬛', limit: '280 char hook' },
]

const emptyContent = () => ({
  topic: '', tone: 'professional', format: 'single', slideCount: 5,
})

export default function NewPostPage() {
  const router = useRouter()
  const [enabled, setEnabled] = useState({ LinkedIn: true, Instagram: true, Twitter: true })
  // Instagram/Twitter default to copying LinkedIn — the common case (same
  // content everywhere) needs zero extra input; unchecking reveals that
  // platform's own fields for full customization.
  const [copyFrom, setCopyFrom] = useState({ Instagram: 'LinkedIn', Twitter: 'LinkedIn' })
  const [content, setContent] = useState({
    LinkedIn: emptyContent(), Instagram: emptyContent(), Twitter: emptyContent(),
  })

  const [brandVoice, setBrandVoice]   = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [errorCode,   setErrorCode]   = useState(null)
  const [limitInfo,   setLimitInfo]   = useState(null)
  const [progress,    setProgress]    = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('brand_profiles')
        .select('company_description, target_audience, topics_to_avoid, example_posts')
        .eq('client_id', user.id)
        .maybeSingle()
      if (cancelled || !profile) return
      const parts = []
      if (profile.company_description) parts.push(`Company: ${profile.company_description}`)
      if (profile.target_audience)      parts.push(`Audience: ${profile.target_audience}`)
      if (profile.topics_to_avoid)      parts.push(`Avoid discussing: ${profile.topics_to_avoid}`)
      if (profile.example_posts?.filter(Boolean).length) {
        parts.push(`Match the style of these examples:\n${profile.example_posts.filter(Boolean).join('\n---\n')}`)
      }
      setBrandVoice(parts.join('\n\n'))
    })()
    return () => { cancelled = true }
  }, [])

  function togglePlatform(key) {
    setEnabled(e => ({ ...e, [key]: !e[key] }))
  }

  function toggleCopyFrom(key) {
    setCopyFrom(c => ({ ...c, [key]: c[key] ? null : 'LinkedIn' }))
  }

  function updateContent(key, field, value) {
    setContent(c => ({ ...c, [key]: { ...c[key], [field]: value } }))
  }

  // The values actually used for a platform — its own, or LinkedIn's if
  // it's set to copy.
  function effective(key) {
    const source = copyFrom[key] || key
    return content[source]
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const activePlatforms = PLATFORMS.filter(p => enabled[p.key]).map(p => p.key)
    if (!activePlatforms.length) return setError('Select at least one platform')
    for (const key of activePlatforms) {
      if (!effective(key).topic.trim()) {
        return setError(`Add a topic for ${key}${copyFrom[key] ? ' (or check "Same as LinkedIn")' : ''}`)
      }
    }

    setLoading(true)
    setError('')
    setErrorCode(null)
    setLimitInfo(null)
    setProgress(0)

    const interval = setInterval(() => {
      setProgress(p => p < 88 ? p + Math.random() * 4 : p)
    }, 400)

    try {
      // Per-platform content payload — each platform carries its own topic,
      // tone, and format (single/carousel/video), not one shared topic.
      const perPlatform = {}
      for (const key of activePlatforms) {
        const c = effective(key)
        perPlatform[key] = {
          topic:       c.topic.trim(),
          tone:        c.tone,
          is_carousel: c.format === 'carousel',
          slide_count: c.format === 'carousel' ? c.slideCount : null,
          is_video:    c.format === 'video',
        }
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms:    activePlatforms,
          content:      perPlatform,
          brand_voice:  brandVoice,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.code === 'LIMIT_REACHED') {
          setErrorCode('LIMIT_REACHED')
          setLimitInfo({ posts_used: body.posts_used, posts_limit: body.posts_limit })
        }
        throw new Error(body.error || `Request failed (${res.status})`)
      }

      setProgress(100)
      setTimeout(() => router.push('/dashboard/review'), 400)
    } catch (err) {
      setError(err.message)
    } finally {
      clearInterval(interval)
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 4 }}>New Post</h1>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 28 }}>
        Each platform can have its own topic, tone, and format — or just copy LinkedIn.
      </p>

      <form onSubmit={handleSubmit}>
        {PLATFORMS.map((p, idx) => {
          const isSource = p.key === 'LinkedIn'
          const isCopying = !isSource && !!copyFrom[p.key]
          const c = content[p.key]

          return (
            <div key={p.key} className="stagger-item" style={{
              '--i': idx,
              marginBottom: 16,
              border: `1.5px solid ${enabled[p.key] ? 'var(--fog-60)' : 'var(--fog-60)'}`,
              borderRadius: 'var(--radius-lg)',
              opacity: enabled[p.key] ? 1 : 0.5,
              background: 'var(--white)',
              overflow: 'hidden',
            }}>
              {/* Platform header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
                borderBottom: enabled[p.key] ? '1px solid var(--fog-60)' : 'none',
              }}>
                <input
                  type="checkbox"
                  checked={enabled[p.key]}
                  onChange={() => togglePlatform(p.key)}
                  style={{ width: 18, height: 18, accentColor: 'var(--ink)' }}
                />
                <span>{p.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{p.label}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-20)', marginLeft: 4 }}>{p.limit}</span>

                {!isSource && enabled[p.key] && (
                  <label style={{
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: '0.8125rem', color: 'var(--ink-40)', cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={isCopying}
                      onChange={() => toggleCopyFrom(p.key)}
                      style={{ accentColor: 'var(--ink)' }}
                    />
                    Same as LinkedIn
                  </label>
                )}
              </div>

              {/* Content fields — hidden when copying from LinkedIn */}
              {enabled[p.key] && !isCopying && (
                <div style={{ padding: '16px 18px' }}>
                  <textarea
                    value={c.topic}
                    onChange={e => updateContent(p.key, 'topic', e.target.value)}
                    placeholder={`Topic for ${p.label}…`}
                    rows={2}
                    style={{
                      width: '100%', padding: '10px 12px', border: '1.5px solid var(--fog-60)',
                      borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontFamily: 'var(--font-body)',
                      resize: 'vertical', outline: 'none', marginBottom: 12,
                    }}
                  />

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {TONES.map(t => (
                      <button key={t.value} type="button" onClick={() => updateContent(p.key, 'tone', t.value)} style={{
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
                        border: `1.5px solid ${c.tone === t.value ? 'var(--ink)' : 'var(--fog-60)'}`,
                        background: c.tone === t.value ? 'var(--ink)' : 'var(--white)',
                        color: c.tone === t.value ? 'var(--white)' : 'var(--ink-40)',
                      }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {[
                      { value: 'single',   label: 'Single image' },
                      { value: 'carousel', label: 'Carousel' },
                      { value: 'video',    label: 'Video (beta)' },
                    ].map(f => (
                      <button key={f.value} type="button" onClick={() => updateContent(p.key, 'format', f.value)} style={{
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
                        border: `1.5px solid ${c.format === f.value ? 'var(--ink)' : 'var(--fog-60)'}`,
                        background: c.format === f.value ? 'var(--ink)' : 'var(--white)',
                        color: c.format === f.value ? 'var(--white)' : 'var(--ink-40)',
                      }}>
                        {f.label}
                      </button>
                    ))}
                    {c.format === 'carousel' && (
                      <>
                        <input
                          type="number" min={2} max={10} value={c.slideCount}
                          onChange={e => updateContent(p.key, 'slideCount', Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
                          style={{ width: 60, padding: '6px 8px', border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-20)' }}>slides</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {enabled[p.key] && isCopying && (
                <div style={{ padding: '10px 18px', fontSize: '0.8125rem', color: 'var(--ink-20)' }}>
                  Will use LinkedIn's topic, tone, and format above.
                </div>
              )}
            </div>
          )
        })}

        {error && errorCode === 'LIMIT_REACHED' ? (
          <div className="animate-in" style={{
            padding: '18px 20px', background: '#FEF3C7', border: '1px solid #FDE68A',
            borderRadius: 'var(--radius-md)', marginBottom: 20,
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#92400E', marginBottom: 4 }}>
              You've reached your plan's limit
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#92400E', marginBottom: 14 }}>
              {limitInfo ? `${limitInfo.posts_used} of ${limitInfo.posts_limit} posts used this month. ` : ''}
              Upgrade to keep generating.
            </div>
            <Link href="/dashboard/settings" style={{
              display: 'inline-block', padding: '9px 18px', background: '#92400E',
              color: 'white', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none',
            }}>
              View plans →
            </Link>
          </div>
        ) : error && (
          <div className="animate-in shake-once" style={{
            padding: '12px 16px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--failed)', fontSize: '0.875rem', marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ marginBottom: 20, fontSize: '0.875rem', color: 'var(--ink-40)' }}>
            Generating… {Math.round(progress)}%
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '12px 28px', background: 'var(--ink)', color: 'var(--white)',
          borderRadius: 'var(--radius-sm)', fontSize: '0.9375rem', fontWeight: 500,
          border: 'none', cursor: loading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {loading && <Spinner size={16} />}
          {loading ? 'Generating…' : 'Generate posts'}
        </button>
      </form>
    </div>
  )
}
