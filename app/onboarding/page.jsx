'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { PLANS } from '../../lib/plans'
import { Spinner } from '../../components/ui'

const STEPS = [
  { number: 1, label: 'Company'   },
  { number: 2, label: 'LinkedIn'  },
  { number: 3, label: 'Instagram' },
  { number: 4, label: 'X'        },
  { number: 5, label: 'Schedule' },
]

const DAYS      = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const TIMEZONES = ['Africa/Lagos','Europe/London','America/New_York','America/Los_Angeles','Asia/Dubai','Asia/Singapore']
const INDUSTRIES = ['Technology','Finance','Healthcare','Marketing','Consulting','Education','Legal','Manufacturing','Retail','Other']

function OnboardingFlow() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const initialStep  = parseInt(searchParams.get('step') || '1')

  const [step,    setStep]    = useState(initialStep)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [userId,  setUserId]  = useState(null)

  const [company, setCompany] = useState({ name: '', industry: '', website: '' })
  const [schedule, setSchedule] = useState({ days: ['Monday','Wednesday','Friday'], time: '09:00', timezone: 'Africa/Lagos' })
  const [selectedPlan, setSelectedPlan] = useState('starter')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      // Load existing onboarding state
      supabase.from('onboarding').select('*').eq('client_id', user.id).maybeSingle().then(({ data }) => {
        if (data?.completed) { router.push('/dashboard'); return }
        if (data) {
          setStep(data.step || 1)
          if (data.company_name) setCompany({ name: data.company_name, industry: data.industry || '', website: data.website || '' })
          if (data.posting_days) setSchedule({ days: data.posting_days, time: data.posting_time || '09:00', timezone: data.timezone || 'Africa/Lagos' })
        }
      })
    })
  }, [])

  async function saveStep(stepData) {
    if (!userId) return
    await supabase.from('onboarding').upsert({
      client_id: userId,
      step,
      ...stepData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' })
  }

  async function handleCompany(e) {
    e.preventDefault()
    if (!company.name.trim()) return setError('Company name is required')
    setSaving(true); setError('')
    await saveStep({ company_name: company.name, industry: company.industry, website: company.website })
    setSaving(false); setStep(2)
  }

  function handleConnectPlatform(platform) {
    window.location.href = `/api/auth/${platform}?redirect=/onboarding?step=${step + 1}`
  }

  async function handleSkipPlatform() {
    await saveStep({})
    setStep(s => s + 1)
  }

  async function handleSchedule(e) {
    e.preventDefault()
    setSaving(true); setError('')
    await saveStep({
      posting_days: schedule.days,
      posting_time: schedule.time,
      timezone:     schedule.timezone,
      step:         5,
    })

    try {
      // Billing is disabled for now — mark onboarding complete directly
      // and skip straight to the dashboard. (Re-enable by swapping this
      // block back to `setStep('billing')` once real Stripe Price IDs
      // are configured — see handleCheckout below, left intact.)
      await fetch('/api/onboarding-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company.name,
          timezone:     schedule.timezone,
        }),
      })
      router.push('/dashboard?onboarded=1')
    } catch (err) {
      setError('Something went wrong finishing setup. Please try again.')
      setSaving(false)
    }
  }

  async function handleCheckout(planKey) {
    setSaving(true)
    setError('')
    try {
      // Mark onboarding complete server-side and send the welcome email
      // (see app/api/onboarding-complete/route.js — already handles both)
      await fetch('/api/onboarding-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company.name,
          timezone:     schedule.timezone,
        }),
      })

      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ planKey }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error || 'Failed to create checkout session')
        setSaving(false)
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  function toggleDay(day) {
    setSchedule(s => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter(d => d !== day) : [...s.days, day]
    }))
  }

  const progress = typeof step === 'number' ? (step / 5) * 100 : 100

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fog)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>

      {/* Header */}
      <div className="animate-in" style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span>
        </div>
        <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginTop: 6 }}>Let's get you set up in 5 minutes</p>
      </div>

      {/* Step indicators */}
      {typeof step === 'number' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 40 }}>
          {STEPS.map((s, i) => (
            <div key={s.number} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.78rem', fontWeight: 600,
                  background: step > s.number ? 'var(--done)' : step === s.number ? 'var(--ink)' : 'var(--fog-60)',
                  color: step >= s.number ? 'white' : 'var(--ink-20)',
                  transition: 'background 0.3s var(--ease-out), transform 0.3s var(--ease-spring)',
                  transform: step === s.number ? 'scale(1.08)' : 'scale(1)',
                }}>
                  {step > s.number ? '✓' : s.number}
                </div>
                <span style={{ fontSize: '0.68rem', color: step === s.number ? 'var(--ink)' : 'var(--ink-20)', fontWeight: step === s.number ? 600 : 400, whiteSpace: 'nowrap' }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 48, height: 2, background: step > s.number ? 'var(--done)' : 'var(--fog-60)', margin: '0 4px', marginBottom: 22, transition: 'background 0.3s ease' }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="scale-in" style={{ width: '100%', maxWidth: 520, background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--fog-60)' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--ink)', transition: 'width 0.4s var(--ease-out)' }} />
        </div>

        <div key={step} className="animate-in" style={{ padding: '36px 40px' }}>

          {/* ── STEP 1: Company Details ─────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleCompany}>
              <StepHeader icon="🏢" title="Tell us about your company" subtitle="This helps us tailor your content to your brand" />
              <Field label="Company Name *">
                <input value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} placeholder="e.g. Greenatech Global" required style={inputStyle} onFocus={focusGlow} onBlur={blurGlow} />
              </Field>
              <Field label="Industry">
                <select value={company.industry} onChange={e => setCompany(c => ({ ...c, industry: e.target.value }))} style={inputStyle} onFocus={focusGlow} onBlur={blurGlow}>
                  <option value="">Select industry…</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Website">
                <input value={company.website} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} placeholder="https://yourcompany.com" type="url" style={inputStyle} onFocus={focusGlow} onBlur={blurGlow} />
              </Field>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn type="submit" loading={saving}>Continue →</PrimaryBtn>
            </form>
          )}

          {/* ── STEP 2: LinkedIn ────────────────────────────── */}
          {step === 2 && (
            <div>
              <StepHeader icon="🔵" title="Connect LinkedIn" subtitle="Post articles and updates directly to your LinkedIn profile" />
              <PlatformCard color="#0077B5" bg="#EBF5FB">
                LinkedIn uses OAuth — you'll be redirected to LinkedIn to grant access. We never store your password.
              </PlatformCard>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn onClick={() => handleConnectPlatform('linkedin')} loading={saving}>Connect LinkedIn</PrimaryBtn>
              <SkipBtn onClick={handleSkipPlatform}>Skip for now — connect later in Settings</SkipBtn>
            </div>
          )}

          {/* ── STEP 3: Instagram ───────────────────────────── */}
          {step === 3 && (
            <div>
              <StepHeader icon="🟣" title="Connect Instagram" subtitle="Share visual content to your Instagram Business account" />
              <PlatformCard color="#E1306C" bg="#FDF2F8">
                Requires an Instagram Business account linked to a Facebook Page. You'll be redirected to Meta to grant access.
              </PlatformCard>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn onClick={() => handleConnectPlatform('instagram')} loading={saving}>Connect Instagram</PrimaryBtn>
              <SkipBtn onClick={handleSkipPlatform}>Skip for now — connect later in Settings</SkipBtn>
            </div>
          )}

          {/* ── STEP 4: X / Twitter ─────────────────────────── */}
          {step === 4 && (
            <div>
              <StepHeader icon="⬛" title="Connect X / Twitter" subtitle="Post threads and hooks to grow your X following" />
              <PlatformCard color="#14171A" bg="#F5F5F5">
                You'll be redirected to X to grant Read & Write access. We only post on your behalf — we never read your DMs.
              </PlatformCard>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn onClick={() => handleConnectPlatform('twitter')} loading={saving}>Connect X</PrimaryBtn>
              <SkipBtn onClick={handleSkipPlatform}>Skip for now — connect later in Settings</SkipBtn>
            </div>
          )}

          {/* ── STEP 5: Schedule ────────────────────────────── */}
          {step === 5 && (
            <form onSubmit={handleSchedule}>
              <StepHeader icon="📅" title="Set your posting schedule" subtitle="When should we schedule your content?" />
              <Field label="Preferred posting days">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {DAYS.map(day => (
                    <button key={day} type="button" className="press" onClick={() => toggleDay(day)} style={{
                      padding: '6px 12px', borderRadius: 99, fontSize: '0.8rem', cursor: 'pointer',
                      fontWeight: schedule.days.includes(day) ? 600 : 400,
                      background: schedule.days.includes(day) ? 'var(--ink)' : 'var(--fog)',
                      color: schedule.days.includes(day) ? 'var(--white)' : 'var(--ink-40)',
                      border: `1px solid ${schedule.days.includes(day) ? 'var(--ink)' : 'var(--fog-60)'}`,
                      transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                    }}>
                      {day.slice(0,3)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Preferred posting time">
                <input type="time" value={schedule.time} onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))} style={inputStyle} onFocus={focusGlow} onBlur={blurGlow} />
              </Field>
              <Field label="Timezone">
                <select value={schedule.timezone} onChange={e => setSchedule(s => ({ ...s, timezone: e.target.value }))} style={inputStyle} onFocus={focusGlow} onBlur={blurGlow}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </Field>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn type="submit" loading={saving}>Finish setup →</PrimaryBtn>
            </form>
          )}

          {/* ── BILLING: Plan selection ──────────────────────── */}
          {step === 'billing' && (
            <div>
              <StepHeader icon="💳" title="Choose your plan" subtitle="14-day free trial on all plans. Cancel anytime." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {Object.entries(PLANS).map(([key, plan], i) => (
                  <div key={key} className="stagger-item hover-lift" onClick={() => setSelectedPlan(key)} style={{
                    '--i': i,
                    padding: '16px 20px', border: `2px solid ${selectedPlan === key ? 'var(--ink)' : 'var(--fog-60)'}`,
                    borderRadius: 'var(--radius)', cursor: 'pointer', background: selectedPlan === key ? 'var(--fog)' : 'var(--white)',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selectedPlan === key ? 'var(--ink)' : 'var(--fog-60)'}`, background: selectedPlan === key ? 'var(--ink)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s ease, border-color 0.15s ease' }}>
                          {selectedPlan === key && <div className="pop-in" style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{plan.name}</span>
                        {key === 'growth' && <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'var(--accent-warm)', color: 'white', padding: '2px 7px', borderRadius: 99 }}>POPULAR</span>}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ink)' }}>${plan.price}<span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--ink-20)' }}>/mo</span></span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-20)', marginLeft: 26, marginBottom: 8 }}>{plan.description}</p>
                    <div style={{ marginLeft: 26, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {plan.features.slice(0,3).map(f => (
                        <span key={f} style={{ fontSize: '0.72rem', color: 'var(--ink-40)', background: 'var(--fog-80)', padding: '2px 8px', borderRadius: 99 }}>✓ {f}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <PrimaryBtn onClick={() => handleCheckout(selectedPlan)} loading={saving}>
                Start 14-day free trial →
              </PrimaryBtn>
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-20)', marginTop: 12 }}>
                No credit card charged today. Cancel anytime before trial ends.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* Back link */}
      {typeof step === 'number' && step > 1 && (
        <button className="press" onClick={() => setStep(s => s - 1)} style={{ marginTop: 20, fontSize: '0.8125rem', color: 'var(--ink-20)', cursor: 'pointer', background: 'none', border: 'none' }}>
          ← Back
        </button>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StepHeader({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: '2rem', marginBottom: 10 }}>{icon}</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.2 }}>{title}</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--ink-20)', lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink-40)', marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  )
}

function PlatformCard({ color, bg, children }) {
  return (
    <div style={{ padding: '16px 18px', background: bg, borderRadius: 'var(--radius)', fontSize: '0.875rem', color: 'var(--ink-60)', lineHeight: 1.6, marginBottom: 24, borderLeft: `4px solid ${color}` }}>
      {children}
    </div>
  )
}

function PrimaryBtn({ children, onClick, type = 'button', loading }) {
  return (
    <button type={type} onClick={onClick} disabled={loading} className="press hover-lift" style={{ width: '100%', padding: '14px 20px', background: loading ? 'var(--fog-60)' : 'var(--ink)', color: loading ? 'var(--ink-20)' : 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.9375rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, fontFamily: 'var(--font-body)', border: 'none', transition: 'background 0.15s ease, color 0.15s ease' }}>
      {loading && <Spinner size={16} light />}
      {children}
    </button>
  )
}

function SkipBtn({ children, onClick }) {
  return (
    <button onClick={onClick} className="press" style={{ width: '100%', padding: '10px', fontSize: '0.8125rem', color: 'var(--ink-20)', cursor: 'pointer', marginTop: 10, background: 'none', border: 'none', fontFamily: 'var(--font-body)' }}>
      {children}
    </button>
  )
}

function ErrorMsg({ children }) {
  return (
    <div className="animate-in shake-once" style={{ padding: '10px 14px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)', borderRadius: 'var(--radius-sm)', color: 'var(--failed)', fontSize: '0.8125rem', marginBottom: 16 }}>
      {children}
    </div>
  )
}

function focusGlow(e) {
  e.target.style.borderColor = 'var(--ink-40)'
  e.target.style.boxShadow   = '0 0 0 3px rgba(0,0,0,0.04)'
}
function blurGlow(e) {
  e.target.style.borderColor = 'var(--fog-60)'
  e.target.style.boxShadow   = 'none'
}

const inputStyle = {
  width: '100%', padding: '11px 14px', background: 'var(--fog)',
  border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)',
  color: 'var(--ink)', fontSize: '0.9375rem', outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease', fontFamily: 'var(--font-body)',
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    }>
      <OnboardingFlow />
    </Suspense>
  )
}
