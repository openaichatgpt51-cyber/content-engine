'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { Spinner, Skeleton } from '../../../components/ui'
import KillSwitch from '../../../components/KillSwitch'

const PLATFORMS = [
  {
    key:      'linkedin',
    label:    'LinkedIn',
    icon:     '🔵',
    color:    '#0077B5',
    bg:       '#EBF5FB',
    desc:     'Post articles and updates to your LinkedIn profile',
    authPath: '/api/auth/linkedin',
  },
  {
    key:        'instagram',
    label:      'Instagram',
    icon:       '🟣',
    color:      '#E1306C',
    bg:         '#FDF2F8',
    desc:       'Share visual content to your Instagram Business account',
    authPath:   '/api/auth/instagram',
    comingSoon: true,
  },
  {
    key:      'twitter',
    label:    'X / Twitter',
    icon:     '⬛',
    color:    '#14171A',
    bg:       '#F5F5F5',
    desc:     'Post threads and hooks to your X account',
    authPath: '/api/auth/twitter',
    caveat:   "You can connect now, but posts won't go out until launch — LinkedIn only for now",
  },
]

const TONES = ['Professional', 'Casual', 'Provocative', 'Educational', 'Inspiring']

function SettingsFlow() {
  const searchParams = useSearchParams()
  const validTabs = ['platforms', 'brandvoice', 'posting', 'schedule', 'privacy']
  const requestedTab = searchParams.get('tab')
  const [connections, setConnections] = useState({})
  const [brand, setBrand]             = useState({
    company_description: '',
    target_audience:     '',
    tone:                'Professional',
    topics_to_avoid:     '',
    example_posts:       ['', '', ''],
  })
  const [saving,       setSaving]     = useState(false)
  const [saved,        setSaved]      = useState(false)
  const [loadingConns, setLoadingConns] = useState(true)
  const [activeTab,    setActiveTab]  = useState(validTabs.includes(requestedTab) ? requestedTab : 'platforms')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting,          setDeleting]          = useState(false)
  const [schedule, setSchedule] = useState({
    LinkedIn:  { days: [], time: '09:00' },
    Instagram: { days: [], time: '09:00' },
    Twitter:   { days: [], time: '09:00' },
    timezone:  'Africa/Lagos',
  })
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSaved,  setScheduleSaved]  = useState(false)
  const [deleteError,       setDeleteError]       = useState('')
  const [testResults, setTestResults] = useState({})   // { linkedin: 'testing'|'ok'|'failed' }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    setDeleteError('')
    try {
      const res  = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: deleteConfirmText }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Deletion failed')

      // The auth user no longer exists at this point — no session to sign
      // out of. Just send them to a plain confirmation page.
      window.location.href = '/account-deleted'
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  async function testConnection(platformKey) {
    setTestResults(r => ({ ...r, [platformKey]: 'testing' }))
    try {
      const res  = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformKey }),
      })
      const body = await res.json()
      setTestResults(r => ({ ...r, [platformKey]: body.ok ? 'ok' : 'failed' }))
    } catch {
      setTestResults(r => ({ ...r, [platformKey]: 'failed' }))
    }
    setTimeout(() => setTestResults(r => ({ ...r, [platformKey]: null })), 5000)
  }

  function toggleScheduleDay(platform, day) {
    setSchedule(s => ({
      ...s,
      [platform]: {
        ...s[platform],
        days: s[platform].days.includes(day) ? s[platform].days.filter(d => d !== day) : [...s[platform].days, day],
      },
    }))
  }

  async function saveSchedule() {
    setScheduleSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('onboarding').upsert({
      client_id:               user.id,
      linkedin_posting_days:   schedule.LinkedIn.days,
      linkedin_posting_time:   schedule.LinkedIn.time,
      instagram_posting_days:  schedule.Instagram.days,
      instagram_posting_time:  schedule.Instagram.time,
      twitter_posting_days:    schedule.Twitter.days,
      twitter_posting_time:    schedule.Twitter.time,
      timezone:                schedule.timezone,
    }, { onConflict: 'client_id' })
    setScheduleSaving(false)
    setScheduleSaved(true)
    setTimeout(() => setScheduleSaved(false), 2500)
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load platform connections
    const { data: accounts } = await supabase
      .from('platform_accounts')
      .select('platform, account_id, expires_at, token_valid')
      .eq('client_id', user.id)

    const connMap = {}
    for (const acc of accounts || []) connMap[acc.platform] = acc
    setConnections(connMap)
    setLoadingConns(false)

    // Load posting schedule (set during onboarding, editable here) —
    // per-platform columns first; falls back to the old shared columns
    // for anyone who saved before this migration and hasn't touched
    // Settings since (the migration SQL also backfills these, so this
    // fallback is mostly belt-and-suspenders).
    const { data: onboarding } = await supabase
      .from('onboarding')
      .select('linkedin_posting_days, linkedin_posting_time, instagram_posting_days, instagram_posting_time, twitter_posting_days, twitter_posting_time, posting_days, posting_time, timezone')
      .eq('client_id', user.id)
      .maybeSingle()
    if (onboarding) {
      setSchedule({
        LinkedIn: {
          days: onboarding.linkedin_posting_days || onboarding.posting_days || [],
          time: onboarding.linkedin_posting_time || onboarding.posting_time || '09:00',
        },
        Instagram: {
          days: onboarding.instagram_posting_days || onboarding.posting_days || [],
          time: onboarding.instagram_posting_time || onboarding.posting_time || '09:00',
        },
        Twitter: {
          days: onboarding.twitter_posting_days || onboarding.posting_days || [],
          time: onboarding.twitter_posting_time || onboarding.posting_time || '09:00',
        },
        timezone: onboarding.timezone || 'Africa/Lagos',
      })
    }

    // Load brand profile
    const { data: profile } = await supabase
      .from('brand_profiles')
      .select('*')
      .eq('client_id', user.id)
      .single()

    if (profile) {
      setBrand({
        company_description: profile.company_description || '',
        target_audience:     profile.target_audience     || '',
        tone:                profile.tone                || 'Professional',
        topics_to_avoid:     profile.topics_to_avoid     || '',
        example_posts:       profile.example_posts?.length ? profile.example_posts : ['', '', ''],
      })
    }
  }

  async function saveBrand(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      client_id:           user.id,
      company_description: brand.company_description,
      target_audience:     brand.target_audience,
      tone:                brand.tone,
      topics_to_avoid:     brand.topics_to_avoid,
      example_posts:       brand.example_posts.filter(Boolean),
      updated_at:          new Date().toISOString(),
    }

    await supabase
      .from('brand_profiles')
      .upsert(payload, { onConflict: 'client_id' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function updateBrand(field, value) {
    setBrand(b => ({ ...b, [field]: value }))
  }

  function updateExample(idx, value) {
    setBrand(b => {
      const updated = [...b.example_posts]
      updated[idx]  = value
      return { ...b, example_posts: updated }
    })
  }

  return (
    <div style={{ padding: '32px 36px', flex: 1, maxWidth: 800 }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2rem',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
        }}>
          Settings
        </h1>
        <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginTop: 4 }}>
          Manage platform connections and configure your brand voice
        </p>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '1px solid var(--fog-60)' }}>
        {[
          { key: 'platforms',  label: 'Platform Connections' },
          { key: 'brandvoice', label: 'Brand Voice' },
          { key: 'posting',    label: 'Posting Control' },
          { key: 'schedule',   label: 'Posting Schedule' },
          { key: 'privacy',    label: 'Privacy & Data' },
        ].map(t => (
          <button
            key={t.key}
            className="press"
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '12px 20px',
              fontSize: '0.875rem',
              fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? 'var(--ink)' : 'var(--ink-20)',
              borderBottom: activeTab === t.key ? '2px solid var(--ink)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.15s ease, border-color 0.15s ease',
              marginBottom: -1,
              fontFamily: 'var(--font-body)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Platforms Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'platforms' && (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {PLATFORMS.map(p => {
            const conn    = connections[p.key]
            const isConn  = Boolean(conn)
            const expired = conn?.expires_at && new Date(conn.expires_at) < new Date()
            // Strict === false (not just falsy) so legacy rows with token_valid
            // still null/undefined — never run through the new validation check —
            // aren't wrongly flagged as broken. Only an explicit failed validation
            // triggers the reconnect prompt.
            const invalid  = conn && conn.token_valid === false
            const needsReconnect = expired || invalid

            return (
              <div key={p.key} className="stagger-item hover-lift" style={{
                '--i': PLATFORMS.indexOf(p),
                background: 'var(--white)',
                border: '1px solid var(--fog-60)',
                borderRadius: 'var(--radius-lg)',
                padding: '22px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                boxShadow: 'var(--shadow-sm)',
                opacity: p.comingSoon ? 0.75 : 1,
              }}>
                {/* Platform icon */}
                <div className="tap-scale" style={{
                  width: 48, height: 48,
                  borderRadius: 'var(--radius)',
                  background: p.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0,
                }}>
                  {p.icon}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{p.label}</span>
                    {p.comingSoon ? (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'var(--accent-warm)', background: 'rgba(200,150,62,0.12)',
                        border: '1px solid rgba(200,150,62,0.3)',
                        borderRadius: 99, padding: '2px 8px',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        Coming Soon
                      </span>
                    ) : loadingConns ? (
                      <Skeleton width={64} height={16} radius={99} />
                    ) : isConn && !needsReconnect ? (
                      <span className="pop-in" style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'var(--done)',
                        background: 'var(--done-bg)',
                        border: '1px solid var(--done-border)',
                        borderRadius: 99,
                        padding: '2px 8px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>
                        Connected
                      </span>
                    ) : needsReconnect ? (
                      <span className="pop-in" style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'var(--failed)', background: 'var(--failed-bg)',
                        border: '1px solid var(--failed-border)',
                        borderRadius: 99, padding: '2px 8px',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        {expired ? 'Expired' : 'Invalid — reconnect'}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'var(--ink-20)', background: 'var(--fog)',
                        border: '1px solid var(--fog-60)',
                        borderRadius: 99, padding: '2px 8px',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--ink-20)', marginTop: 3 }}>
                    {p.comingSoon ? p.desc : (isConn && conn.account_id ? `Account: ${conn.account_id}` : p.desc)}
                  </p>
                  {needsReconnect && !p.comingSoon && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--failed)', marginTop: 2 }}>
                      {expired ? 'Token expired — please reconnect to resume posting' : 'Token failed validation — please reconnect to resume posting'}
                    </p>
                  )}
                  {p.caveat && (
                    <p title={p.caveat} style={{ fontSize: '0.75rem', color: 'var(--accent-warm)', marginTop: 2, cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
                      ⓘ ({p.caveat})
                    </p>
                  )}
                </div>

                {/* Connect / Reconnect button */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {isConn && !needsReconnect && !p.comingSoon && (
                  <button
                    onClick={() => testConnection(p.key)}
                    disabled={testResults[p.key] === 'testing'}
                    style={{
                      padding: '9px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
                      fontWeight: 500, background: 'var(--white)',
                      color: testResults[p.key] === 'ok' ? '#16A34A' : testResults[p.key] === 'failed' ? 'var(--failed)' : 'var(--ink-40)',
                      border: '1px solid var(--fog-60)', cursor: testResults[p.key] === 'testing' ? 'default' : 'pointer',
                    }}
                  >
                    {testResults[p.key] === 'testing' ? 'Testing…'
                      : testResults[p.key] === 'ok' ? '✓ Working'
                      : testResults[p.key] === 'failed' ? '✕ Failed'
                      : 'Test Connection'}
                  </button>
                )}
                {p.comingSoon ? (
                  <span style={{
                    padding: '9px 18px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    background: 'var(--fog)',
                    color: 'var(--ink-20)',
                    border: '1px solid var(--fog-60)',
                    flexShrink: 0,
                    cursor: 'not-allowed',
                  }}>
                    Coming Soon
                  </span>
                ) : (
                  <a
                    href={p.authPath}
                    title={p.caveat || undefined}
                    className="press hover-lift"
                    style={{
                      padding: '9px 18px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      background: isConn && !needsReconnect ? 'var(--fog)' : 'var(--ink)',
                      color: isConn && !needsReconnect ? 'var(--ink-40)' : 'var(--white)',
                      border: `1px solid ${isConn && !needsReconnect ? 'var(--fog-60)' : 'transparent'}`,
                      flexShrink: 0,
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {needsReconnect ? 'Reconnect' : isConn ? 'Reconnect' : 'Connect'}
                  </a>
                )}
                </div>
              </div>
            )
          })}

          <div style={{
            padding: '16px 20px',
            background: 'var(--approval-bg)',
            border: '1px solid var(--approval-border)',
            borderRadius: 'var(--radius)',
            fontSize: '0.8125rem',
            color: 'var(--approval)',
            lineHeight: 1.6,
          }}>
            <strong>Note:</strong> Clicking Connect will redirect you through each platform's official OAuth flow.
            Your credentials are stored encrypted and never shared. LinkedIn tokens expire after 60 days and will need reconnecting.
          </div>
        </div>
      )}

      {/* ── Brand Voice Tab ───────────────────────────────────────────────── */}
      {activeTab === 'brandvoice' && (
        <form className="animate-in" onSubmit={saveBrand}>

          <BrandSection label="Company Description" hint="What does your company do? Who are you?" index={0}>
            <textarea
              value={brand.company_description}
              onChange={e => updateBrand('company_description', e.target.value)}
              placeholder="e.g. Greenatech Global is a B2B sustainability consultancy helping mid-market manufacturers reduce carbon emissions through AI-powered supply chain analysis."
              rows={3}
              style={textareaStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--ink-40)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.04)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--fog-60)'; e.target.style.boxShadow = 'none' }}
            />
          </BrandSection>

          <BrandSection label="Target Audience" hint="Who reads your posts? Be specific about seniority, industry, and pain points." index={1}>
            <textarea
              value={brand.target_audience}
              onChange={e => updateBrand('target_audience', e.target.value)}
              placeholder="e.g. C-suite executives (CFO, COO, CEO) at manufacturing companies with 100-1000 employees, focused on ESG reporting and operational efficiency."
              rows={2}
              style={textareaStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--ink-40)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.04)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--fog-60)'; e.target.style.boxShadow = 'none' }}
            />
          </BrandSection>

          <BrandSection label="Default Tone" hint="Your preferred writing style across all platforms" index={2}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TONES.map(t => (
                <button
                  key={t}
                  type="button"
                  className="press"
                  onClick={() => updateBrand('tone', t)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 99,
                    fontSize: '0.8125rem',
                    fontWeight: brand.tone === t ? 600 : 400,
                    background: brand.tone === t ? 'var(--ink)' : 'var(--white)',
                    color: brand.tone === t ? 'var(--white)' : 'var(--ink-40)',
                    border: `1.5px solid ${brand.tone === t ? 'var(--ink)' : 'var(--fog-60)'}`,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </BrandSection>

          <BrandSection label="Topics to Avoid" hint="Subjects, angles, or phrases the AI should never write about" index={3}>
            <textarea
              value={brand.topics_to_avoid}
              onChange={e => updateBrand('topics_to_avoid', e.target.value)}
              placeholder="e.g. Competitor names, political opinions, greenwashing claims, unverified statistics, anything related to our pending litigation."
              rows={2}
              style={textareaStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--ink-40)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.04)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--fog-60)'; e.target.style.boxShadow = 'none' }}
            />
          </BrandSection>

          <BrandSection label="Example Posts" hint="Paste 1–3 posts you love — the AI will match this voice and style" index={4}>
            {brand.example_posts.map((ex, i) => (
              <div key={i} style={{ marginBottom: i < 2 ? 10 : 0 }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--ink-20)', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Example {i + 1}
                </label>
                <textarea
                  value={ex}
                  onChange={e => updateExample(i, e.target.value)}
                  placeholder={`Paste a LinkedIn post that captures your voice…`}
                  rows={3}
                  style={{ ...textareaStyle, marginBottom: 0 }}
                  onFocus={e => { e.target.style.borderColor = 'var(--ink-40)'; e.target.style.boxShadow = '0 0 0 3px rgba(0,0,0,0.04)' }}
                  onBlur={e  => { e.target.style.borderColor = 'var(--fog-60)'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            ))}
          </BrandSection>

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={saving}
              className="press hover-lift"
              style={{
                padding: '12px 28px',
                background: saving ? 'var(--fog-60)' : 'var(--ink)',
                color: saving ? 'var(--ink-20)' : 'var(--white)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-body)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {saving && <Spinner size={14} />}
              {saving ? 'Saving…' : 'Save Brand Voice'}
            </button>

            {saved && (
              <span className="pop-in" style={{
                fontSize: '0.8125rem',
                color: 'var(--done)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                ✓ Saved successfully
              </span>
            )}
          </div>
        </form>
      )}

      {/* ── Posting Control Tab ─────────────────────────────────────────── */}
      {activeTab === 'posting' && (
        <div className="animate-in">
          <KillSwitch />
        </div>
      )}

      {/* ── Posting Schedule Tab ─────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div className="animate-in" style={{ maxWidth: 620 }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', marginBottom: 18 }}>
            Each platform posts on its own schedule — approved content is scheduled to
            that platform's next available day/time.
          </p>

          {[
            { key: 'LinkedIn',  icon: '🔵', label: 'LinkedIn' },
            { key: 'Instagram', icon: '🟣', label: 'Instagram' },
            { key: 'Twitter',   icon: '⬛', label: 'X / Twitter' },
          ].map((p, idx) => (
            <div key={p.key} className="stagger-item" style={{
              '--i': idx, background: 'var(--white)', border: '1px solid var(--fog-60)',
              borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span>{p.icon}</span>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{p.label}</h3>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleScheduleDay(p.key, day)}
                    style={{
                      padding: '7px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
                      border: `1.5px solid ${schedule[p.key].days.includes(day) ? 'var(--ink)' : 'var(--fog-60)'}`,
                      background: schedule[p.key].days.includes(day) ? 'var(--ink)' : 'var(--white)',
                      color: schedule[p.key].days.includes(day) ? 'var(--white)' : 'var(--ink-40)',
                    }}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: '0.8125rem', color: 'var(--ink-40)' }}>Time</label>
                <input
                  type="time"
                  value={schedule[p.key].time}
                  onChange={e => setSchedule(s => ({ ...s, [p.key]: { ...s[p.key], time: e.target.value } }))}
                  style={{ padding: '7px 10px', border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem' }}
                />
              </div>

              {!schedule[p.key].days.length && (
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-20)', marginTop: 10 }}>
                  No days selected — posts for this platform won't have a schedule to follow.
                </p>
              )}
            </div>
          ))}

          <div style={{
            background: 'var(--white)', border: '1px solid var(--fog-60)',
            borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20,
          }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 10 }}>Timezone</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-40)', marginBottom: 12 }}>
              Shared across all platforms — the times above are all in this timezone.
            </p>
            <select
              value={schedule.timezone}
              onChange={e => setSchedule(s => ({ ...s, timezone: e.target.value }))}
              style={{ padding: '9px 12px', border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', width: '100%' }}
            >
              {['Africa/Lagos','Europe/London','America/New_York','America/Los_Angeles','Asia/Dubai','Asia/Singapore'].map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <button
            onClick={saveSchedule}
            disabled={scheduleSaving}
            style={{
              padding: '10px 22px', fontSize: '0.875rem', fontWeight: 500,
              background: 'var(--ink)', color: 'var(--white)', border: 'none',
              borderRadius: 'var(--radius-sm)', cursor: scheduleSaving ? 'default' : 'pointer',
            }}
          >
            {scheduleSaving ? 'Saving…' : scheduleSaved ? '✓ Saved' : 'Save schedule'}
          </button>
        </div>
      )}

      {/* ── Privacy & Data Tab ───────────────────────────────────────────── */}
      {activeTab === 'privacy' && (
        <div className="animate-in" style={{ maxWidth: 560 }}>
          <div style={{
            background: 'var(--white)', border: '1px solid var(--fog-60)',
            borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 20,
          }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 6 }}>Your data</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', lineHeight: 1.6 }}>
              ContentEngine stores your generated posts, connected platform tokens, brand voice
              settings, and usage history. See our{' '}
              <a href="/privacy-policy" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>Privacy Policy</a>{' '}
              for full details on what's collected and how long it's kept.
            </p>
          </div>

          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 'var(--radius-lg)', padding: 24,
          }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#991B1B', marginBottom: 6 }}>
              Delete my data
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#991B1B', lineHeight: 1.6, marginBottom: 16 }}>
              This permanently deletes your account, all generated posts, connected platform
              tokens, brand voice settings, and billing history. <strong>This cannot be undone.</strong>
            </p>

            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: '#991B1B', marginBottom: 6 }}>
              Type DELETE to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{
                width: '100%', padding: '9px 12px', marginBottom: 12,
                border: '1.5px solid #FECACA', borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem', outline: 'none',
              }}
            />

            {deleteError && (
              <div style={{ fontSize: '0.8125rem', color: '#991B1B', marginBottom: 12 }}>
                {deleteError}
              </div>
            )}

            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              style={{
                padding: '10px 20px', fontSize: '0.8125rem', fontWeight: 600,
                background: deleteConfirmText === 'DELETE' ? '#DC2626' : '#FCA5A5',
                color: 'white', border: 'none', borderRadius: 'var(--radius-sm)',
                cursor: deleteConfirmText === 'DELETE' && !deleting ? 'pointer' : 'not-allowed',
              }}
            >
              {deleting ? 'Deleting…' : 'Permanently delete my account'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BrandSection({ label, hint, children, index = 0 }) {
  return (
    <div className="stagger-item" style={{
      '--i': index,
      background: 'var(--white)',
      border: '1px solid var(--fog-60)',
      borderRadius: 'var(--radius-lg)',
      padding: '22px 24px',
      marginBottom: 16,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--ink)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--ink-20)' }}>{hint}</div>
      </div>
      {children}
    </div>
  )
}

const textareaStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--fog)',
  border: '1.5px solid var(--fog-60)',
  borderRadius: 'var(--radius)',
  fontSize: '0.875rem',
  color: 'var(--ink)',
  resize: 'vertical',
  outline: 'none',
  lineHeight: 1.6,
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'var(--font-body)',
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    }>
      <SettingsFlow />
    </Suspense>
  )
}
