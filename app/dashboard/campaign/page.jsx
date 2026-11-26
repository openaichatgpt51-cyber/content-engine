'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Spinner } from '../../../components/ui'
import { supabase } from '../../../lib/supabase'
import { useBrand } from '../../../components/BrandProvider'
import { scopeBrand } from '../../../lib/brand-scope'
import { needsResume } from '../../../lib/campaign-jobs-rules'

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual' },
  { value: 'provocative',  label: 'Provocative' },
]
const PLATFORMS = [
  { key: 'LinkedIn',  label: 'LinkedIn',    icon: '🔵' },
  { key: 'Instagram', label: 'Instagram',   icon: '🟣' },
  { key: 'Twitter',   label: 'X / Twitter', icon: '⬛' },
]

export default function CampaignPage() {
  const { writeBrandId } = useBrand()
  const [checkingProfile, setCheckingProfile] = useState(true)
  const [profileComplete, setProfileComplete] = useState(false)

  const [enabled,  setEnabled]  = useState({ LinkedIn: true, Instagram: true, Twitter: true })
  const [copyFrom, setCopyFrom] = useState({ Instagram: 'LinkedIn', Twitter: 'LinkedIn' })
  const [platformState, setPlatformState] = useState({
    LinkedIn:  { topicsText: '', tone: 'professional', isCarousel: false, slideCount: 5 },
    Instagram: { topicsText: '', tone: 'professional', isCarousel: false, slideCount: 5 },
    Twitter:   { topicsText: '', tone: 'professional', isCarousel: false, slideCount: 5 },
  })

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [errorCode, setErrorCode] = useState(null)
  const [jobId,    setJobId]    = useState(null)
  const [progress, setProgress] = useState(null)   // { job, items, summary, etaMinutes }
  const [suggesting, setSuggesting] = useState({})   // { LinkedIn: true } while loading

  // Pick up a campaign that is still running (refresh, other device).
  useEffect(() => {
    fetch('/api/campaign-jobs').then(r => r.ok ? r.json() : null).then(d => { if (d?.jobId) setJobId(d.jobId) }).catch(() => {})
  }, [])

  // Poll progress; if nothing is moving but work remains, ask the server to continue.
  useEffect(() => {
    if (!jobId) return
    let stop = false
    async function tick() {
      try {
        const r = await fetch(`/api/campaign-jobs/${jobId}`)
        if (!r.ok || stop) return
        const d = await r.json()
        if (stop) return
        setProgress(d)
        if (d.job.status === 'running' && needsResume(d.items)) {
          await fetch(`/api/campaign-jobs/${jobId}/advance`, { method: 'POST' })
        }
      } catch { /* try again on the next tick */ }
    }
    tick()
    const t = setInterval(tick, 4000)
    return () => { stop = true; clearInterval(t) }
  }, [jobId])

  async function retryItem(itemId) {
    await fetch(`/api/campaign-jobs/${jobId}/retry`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }),
    })
    const r = await fetch(`/api/campaign-jobs/${jobId}`)
    if (r.ok) setProgress(await r.json())
  }

  function startAnother() { setJobId(null); setProgress(null) }

  async function suggestTopics(platformKey) {
    setSuggesting(s => ({ ...s, [platformKey]: true }))
    setError('')
    try {
      const res = await fetch('/api/suggest-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformKey, count: 5 }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Suggestion failed')
      // Append to whatever's already there rather than overwrite — the
      // user may have already typed something worth keeping.
      const existing = platformState[platformKey].topicsText.trim()
      const combined = [existing, ...body.topics].filter(Boolean).join('\n')
      updatePlatform(platformKey, 'topicsText', combined)
    } catch (err) {
      setError(err.message)
    } finally {
      setSuggesting(s => ({ ...s, [platformKey]: false }))
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await scopeBrand(supabase
        .from('brand_profiles')
        .select('company_description, target_audience')
        .eq('client_id', user.id), writeBrandId)
        .maybeSingle()
      setProfileComplete(!!(profile?.company_description?.trim() && profile?.target_audience?.trim()))
      setCheckingProfile(false)
    })()
  }, [])

  function togglePlatform(key) {
    setEnabled(e => ({ ...e, [key]: !e[key] }))
  }
  function toggleCopyFrom(key) {
    setCopyFrom(c => ({ ...c, [key]: c[key] ? null : 'LinkedIn' }))
  }
  function updatePlatform(key, field, value) {
    setPlatformState(s => ({ ...s, [key]: { ...s[key], [field]: value } }))
  }
  function effective(key) {
    const source = copyFrom[key] || key
    return platformState[source]
  }
  function topicsFor(key) {
    return effective(key).topicsText.split('\n').map(t => t.trim()).filter(Boolean)
  }

  function removeTopic(key, index) {
    const lines = platformState[key].topicsText.split('\n').map(t => t.trim()).filter(Boolean)
    lines.splice(index, 1)
    updatePlatform(key, 'topicsText', lines.join('\n'))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const activePlatforms = PLATFORMS.filter(p => enabled[p.key]).map(p => p.key)
    if (!activePlatforms.length) return setError('Select at least one platform')

    // ── Build generation groups ─────────────────────────────────────────
    // LinkedIn's list (or whichever platform any other is copying from)
    // sets the "positions" — platforms sharing that list at the same
    // position stay grouped into one post. A platform with its own
    // independent list has no natural position correspondence, so its
    // topics become entirely separate single-platform posts.
    const linkedinTopics = topicsFor('LinkedIn')
    if (enabled.LinkedIn && !linkedinTopics.length) {
      return setError('Add at least one LinkedIn topic — one per line')
    }

    const groups = []

    if (enabled.LinkedIn) {
      const sharing = ['LinkedIn', ...activePlatforms.filter(k => k !== 'LinkedIn' && copyFrom[k] === 'LinkedIn')]
      linkedinTopics.forEach((topic, i) => {
        groups.push({
          topic, platforms: sharing,
          tone: platformState.LinkedIn.tone,
          isCarousel: platformState.LinkedIn.isCarousel,
          slideCount: platformState.LinkedIn.slideCount,
        })
      })
    }

    for (const key of activePlatforms) {
      if (key === 'LinkedIn' || copyFrom[key]) continue   // already covered above
      const ownTopics = topicsFor(key)
      if (!ownTopics.length) return setError(`Add topics for ${key} (or check "Same as LinkedIn")`)
      for (const topic of ownTopics) {
        groups.push({
          topic, platforms: [key],
          tone: platformState[key].tone,
          isCarousel: platformState[key].isCarousel,
          slideCount: platformState[key].slideCount,
        })
      }
    }

    if (!groups.length) return setError('Add at least one topic')
    if (groups.length > 20) return setError(`This would generate ${groups.length} posts — campaigns are limited to 20`)

    setLoading(true)
    setError('')
    setErrorCode(null)
    setProgress(null)

    try {
      const res = await fetch('/api/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      })
      const raw = await res.text()
      let body
      try { body = JSON.parse(raw) } catch {
        throw new Error(res.status === 504 || /error o/i.test(raw.slice(0, 20))
          ? 'The campaign is taking longer than the server allows. Posts already started will still finish — check the Review Queue in a few minutes before retrying.'
          : `Campaign request failed (HTTP ${res.status})`)
      }
      if (!res.ok) {
        if (body.code === 'LIMIT_REACHED') setErrorCode('LIMIT_REACHED')
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      setJobId(body.jobId)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (checkingProfile) {
    return <div style={{ padding: '32px 40px', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  }

  if (!profileComplete) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 560 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>✏️</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 8 }}>Complete your Brand Voice first</h2>
          <p style={{ color: 'var(--ink-40)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: 20 }}>
            A campaign generates several posts at once, meant to stay consistent as a set —
            that needs a defined company description and target audience.
          </p>
          <Link href="/dashboard/settings?tab=brandvoice" style={{
            display: 'inline-block', padding: '10px 20px', background: 'var(--ink)', color: 'var(--white)',
            borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none',
          }}>Go to Brand Voice settings →</Link>
        </div>
      </div>
    )
  }

  if (jobId) {
    const items = progress?.items || []
    const sm = progress?.summary
    const finished = sm ? !sm.active : false
    const pct = sm && sm.total ? Math.round((sm.finished / sm.total) * 100) : 0
    const label = { queued: 'Waiting', running: 'Writing…', done: 'Ready', failed: 'Failed' }
    const color = { queued: 'var(--ink-20)', running: 'var(--ink)', done: 'var(--published, #2e7d32)', failed: 'var(--failed)' }
    return (
      <div style={{ padding: '32px 40px', maxWidth: 640 }}>
        <div style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', padding: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: 6 }}>
            {!sm ? 'Starting your campaign…' : finished
              ? `${sm.done} of ${sm.total} post${sm.total === 1 ? '' : 's'} ready`
              : `Generating ${sm.finished + 1 > sm.total ? sm.total : sm.finished + 1} of ${sm.total}`}
          </h2>
          <p style={{ color: 'var(--ink-40)', fontSize: '0.8125rem', lineHeight: 1.6, marginBottom: 14 }}>
            {finished
              ? (sm.failed ? `${sm.failed} failed. Retry them below.` : 'Scheduled to your next available slots, waiting in the Review Queue.')
              : `About ${progress?.etaMinutes || '…'} min left. You can leave this page. Posts appear in the Review Queue as they finish.`}
          </p>
          <div style={{ height: 6, background: 'var(--fog)', borderRadius: 3, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ink)', transition: 'width .4s' }} />
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map(i => (
              <li key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid var(--fog-60)', fontSize: '0.8125rem' }}>
                <span style={{ minWidth: 22, fontWeight: 600 }}>{i.position}.</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--ink)' }}>{i.topic}</div>
                  <div style={{ color: 'var(--ink-20)', fontSize: '0.75rem', marginTop: 2 }}>{(i.platforms || []).join(' · ')}</div>
                  {i.status === 'failed' && i.error && <div style={{ color: 'var(--failed)', marginTop: 4 }}>{i.error}</div>}
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: color[i.status], fontWeight: 500 }}>
                  {i.status === 'running' && <Spinner size={12} />}
                  {label[i.status]}
                </span>
                {i.status === 'failed' && (
                  <button type="button" onClick={() => retryItem(i.id)} style={{ padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', background: 'var(--white)', cursor: 'pointer' }}>Retry</button>
                )}
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Link href="/dashboard/review" style={{ display: 'inline-block', padding: '10px 20px', background: 'var(--ink)', color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none' }}>Go to Review Queue →</Link>
            <Link href="/dashboard/campaigns" style={{ display: 'inline-block', padding: '10px 20px', background: 'var(--white)', border: '1px solid var(--fog-60)', color: 'var(--ink)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', textDecoration: 'none' }}>See what has gone out</Link>
            {finished && <button type="button" onClick={startAnother} style={{ padding: '10px 20px', background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', cursor: 'pointer' }}>Start another campaign</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 4 }}>New Campaign</h1>
        <Link href="/dashboard/campaigns" style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>Your campaigns →</Link>
      </div>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 28 }}>
        Each platform can have its own topic list — or just copy LinkedIn's.
      </p>

      <form onSubmit={handleSubmit}>
        {PLATFORMS.map((p, idx) => {
          const isSource = p.key === 'LinkedIn'
          const isCopying = !isSource && !!copyFrom[p.key]
          const s = platformState[p.key]
          const count = topicsFor(p.key).length

          return (
            <div key={p.key} className="stagger-item" style={{
              '--i': idx, marginBottom: 16, border: '1.5px solid var(--fog-60)',
              borderRadius: 'var(--radius-lg)', opacity: enabled[p.key] ? 1 : 0.5, background: 'var(--white)', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: enabled[p.key] ? '1px solid var(--fog-60)' : 'none' }}>
                <input type="checkbox" checked={enabled[p.key]} onChange={() => togglePlatform(p.key)} style={{ width: 18, height: 18, accentColor: 'var(--ink)' }} />
                <span>{p.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{p.label}</span>
                {enabled[p.key] && <span style={{ fontSize: '0.75rem', color: 'var(--ink-20)' }}>{count} topic{count === 1 ? '' : 's'}</span>}

                {!isSource && enabled[p.key] && (
                  <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--ink-40)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isCopying} onChange={() => toggleCopyFrom(p.key)} style={{ accentColor: 'var(--ink)' }} />
                    Same as LinkedIn
                  </label>
                )}
              </div>

              {enabled[p.key] && !isCopying && (
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => suggestTopics(p.key)}
                      disabled={suggesting[p.key]}
                      style={{
                        padding: '6px 12px', fontSize: '0.78rem', fontWeight: 500,
                        background: 'var(--fog)', border: '1px solid var(--fog-60)',
                        borderRadius: 'var(--radius-sm)', cursor: suggesting[p.key] ? 'default' : 'pointer',
                        color: 'var(--ink-40)',
                      }}
                    >
                      {suggesting[p.key] ? 'Thinking…' : `✨ Suggest topics for ${p.label}`}
                    </button>
                  </div>
                  <textarea
                    value={s.topicsText}
                    onChange={e => updatePlatform(p.key, 'topicsText', e.target.value)}
                    placeholder={`One topic per line for ${p.label}… or click "Suggest topics" above`}
                    rows={4}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontFamily: 'var(--font-body)', resize: 'vertical', outline: 'none', marginBottom: 12 }}
                  />
                  {topicsFor(p.key).length > 0 && (
                    <ol aria-label={`${p.label} topics, in the order they will be created`} style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
                      {topicsFor(p.key).map((topic, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderTop: i ? '1px solid var(--fog-60)' : 'none', fontSize: '0.8125rem', color: 'var(--ink-40)' }}>
                          <span style={{ minWidth: 22, fontWeight: 600, color: 'var(--ink)' }}>{i + 1}.</span>
                          <span style={{ flex: 1 }}>{topic}</span>
                          <button type="button" onClick={() => removeTopic(p.key, i)} aria-label={`Remove topic ${i + 1}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-20)', fontSize: '0.9rem', lineHeight: 1 }}>×</button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {TONES.map(t => (
                      <button key={t.value} type="button" onClick={() => updatePlatform(p.key, 'tone', t.value)} style={{
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
                        border: `1.5px solid ${s.tone === t.value ? 'var(--ink)' : 'var(--fog-60)'}`,
                        background: s.tone === t.value ? 'var(--ink)' : 'var(--white)',
                        color: s.tone === t.value ? 'var(--white)' : 'var(--ink-40)',
                      }}>{t.label}</button>
                    ))}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--ink-40)' }}>
                    <input type="checkbox" checked={s.isCarousel} onChange={e => updatePlatform(p.key, 'isCarousel', e.target.checked)} style={{ accentColor: 'var(--ink)' }} />
                    Generate as carousel
                    {s.isCarousel && (
                      <input type="number" min={2} max={10} value={s.slideCount}
                        onChange={e => updatePlatform(p.key, 'slideCount', Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
                        style={{ width: 50, padding: '4px 6px', border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', textAlign: 'center', marginLeft: 6 }}
                      />
                    )}
                  </label>
                </div>
              )}

              {enabled[p.key] && isCopying && (
                <div style={{ padding: '10px 18px', fontSize: '0.8125rem', color: 'var(--ink-20)' }}>
                  Will use LinkedIn's topics, tone, and format above.
                </div>
              )}
            </div>
          )
        })}

        {error && errorCode === 'LIMIT_REACHED' ? (
          <div className="animate-in" style={{ padding: '18px 20px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#92400E', marginBottom: 4 }}>You've reached your plan's limit</div>
            <div style={{ fontSize: '0.8125rem', color: '#92400E' }}>{error}</div>
          </div>
        ) : error && (
          <div className="animate-in shake-once" style={{ padding: '12px 16px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)', borderRadius: 'var(--radius-sm)', color: 'var(--failed)', fontSize: '0.875rem', marginBottom: 20 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '12px 28px', background: 'var(--ink)', color: 'var(--white)', borderRadius: 'var(--radius-sm)',
          fontSize: '0.9375rem', fontWeight: 500, border: 'none', cursor: loading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {loading && <Spinner size={16} />}
          {loading ? 'Generating campaign…' : 'Generate campaign'}
        </button>
      </form>
    </div>
  )
}
