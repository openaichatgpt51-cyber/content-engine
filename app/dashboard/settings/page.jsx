'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

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
    key:      'instagram',
    label:    'Instagram',
    icon:     '🟣',
    color:    '#E1306C',
    bg:       '#FDF2F8',
    desc:     'Share visual content to your Instagram Business account',
    authPath: '/api/auth/instagram',
  },
  {
    key:      'twitter',
    label:    'X / Twitter',
    icon:     '⬛',
    color:    '#14171A',
    bg:       '#F5F5F5',
    desc:     'Post threads and hooks to your X account',
    authPath: '/api/auth/twitter',
  },
]

const TONES = ['Professional', 'Casual', 'Provocative', 'Educational', 'Inspiring']

export default function SettingsPage() {
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
  const [activeTab,    setActiveTab]  = useState('platforms')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load platform connections
    const { data: accounts } = await supabase
      .from('platform_accounts')
      .select('platform, account_id, expires_at')
      .eq('client_id', user.id)

    const connMap = {}
    for (const acc of accounts || []) connMap[acc.platform] = acc
    setConnections(connMap)
    setLoadingConns(false)

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
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '12px 20px',
              fontSize: '0.875rem',
              fontWeight: activeTab === t.key ? 600 : 400,
              color: activeTab === t.key ? 'var(--ink)' : 'var(--ink-20)',
              borderBottom: activeTab === t.key ? '2px solid var(--ink)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
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

            return (
              <div key={p.key} style={{
                background: 'var(--white)',
                border: '1px solid var(--fog-60)',
                borderRadius: 'var(--radius-lg)',
                padding: '22px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                boxShadow: 'var(--shadow-sm)',
              }}>
                {/* Platform icon */}
                <div style={{
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
                    {loadingConns ? (
                      <span style={{ fontSize: '0.72rem', color: 'var(--ink-20)' }}>checking…</span>
                    ) : isConn && !expired ? (
                      <span style={{
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
                    ) : expired ? (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        color: 'var(--failed)', background: 'var(--failed-bg)',
                        border: '1px solid var(--failed-border)',
                        borderRadius: 99, padding: '2px 8px',
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                      }}>
                        Expired
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
                    {isConn && conn.account_id ? `Account: ${conn.account_id}` : p.desc}
                  </p>
                  {expired && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--failed)', marginTop: 2 }}>
                      Token expired — please reconnect to resume posting
                    </p>
                  )}
                </div>

                {/* Connect / Reconnect button */}
                <a
                  href={p.authPath}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    background: isConn && !expired ? 'var(--fog)' : 'var(--ink)',
                    color: isConn && !expired ? 'var(--ink-40)' : 'var(--white)',
                    border: `1px solid ${isConn && !expired ? 'var(--fog-60)' : 'transparent'}`,
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  {isConn && !expired ? 'Reconnect' : expired ? 'Reconnect' : 'Connect'}
                </a>
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

          <BrandSection label="Company Description" hint="What does your company do? Who are you?">
            <textarea
              value={brand.company_description}
              onChange={e => updateBrand('company_description', e.target.value)}
              placeholder="e.g. Greenatech Global is a B2B sustainability consultancy helping mid-market manufacturers reduce carbon emissions through AI-powered supply chain analysis."
              rows={3}
              style={textareaStyle}
              onFocus={e => e.target.style.borderColor = 'var(--ink-40)'}
              onBlur={e  => e.target.style.borderColor = 'var(--fog-60)'}
            />
          </BrandSection>

          <BrandSection label="Target Audience" hint="Who reads your posts? Be specific about seniority, industry, and pain points.">
            <textarea
              value={brand.target_audience}
              onChange={e => updateBrand('target_audience', e.target.value)}
              placeholder="e.g. C-suite executives (CFO, COO, CEO) at manufacturing companies with 100-1000 employees, focused on ESG reporting and operational efficiency."
              rows={2}
              style={textareaStyle}
              onFocus={e => e.target.style.borderColor = 'var(--ink-40)'}
              onBlur={e  => e.target.style.borderColor = 'var(--fog-60)'}
            />
          </BrandSection>

          <BrandSection label="Default Tone" hint="Your preferred writing style across all platforms">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TONES.map(t => (
                <button
                  key={t}
                  type="button"
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
                    transition: 'all 0.15s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </BrandSection>

          <BrandSection label="Topics to Avoid" hint="Subjects, angles, or phrases the AI should never write about">
            <textarea
              value={brand.topics_to_avoid}
              onChange={e => updateBrand('topics_to_avoid', e.target.value)}
              placeholder="e.g. Competitor names, political opinions, greenwashing claims, unverified statistics, anything related to our pending litigation."
              rows={2}
              style={textareaStyle}
              onFocus={e => e.target.style.borderColor = 'var(--ink-40)'}
              onBlur={e  => e.target.style.borderColor = 'var(--fog-60)'}
            />
          </BrandSection>

          <BrandSection label="Example Posts" hint="Paste 1–3 posts you love — the AI will match this voice and style">
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
                  onFocus={e => e.target.style.borderColor = 'var(--ink-40)'}
                  onBlur={e  => e.target.style.borderColor = 'var(--fog-60)'}
                />
              </div>
            ))}
          </BrandSection>

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={saving}
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
                transition: 'all 0.15s',
              }}
            >
              {saving && (
                <span style={{
                  width: 14, height: 14,
                  border: '2px solid rgba(0,0,0,0.1)',
                  borderTopColor: 'var(--ink-40)',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                  display: 'inline-block',
                }} />
              )}
              {saving ? 'Saving…' : 'Save Brand Voice'}
            </button>

            {saved && (
              <span className="animate-in" style={{
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
    </div>
  )
}

function BrandSection({ label, hint, children }) {
  return (
    <div style={{
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
  transition: 'border-color 0.15s',
  fontFamily: 'var(--font-body)',
}
