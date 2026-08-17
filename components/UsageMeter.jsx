'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useUsage } from '../lib/useUsage'
import { Spinner, Skeleton } from './ui'

export default function UsageMeter({ compact = false }) {
  const { usage, loading } = useUsage()
  const [portalLoading, setPortalLoading] = useState(false)

  if (loading) return <Skeleton height={compact ? 40 : 92} radius="var(--radius-sm)" style={compact ? { margin: '8px 12px', width: 'auto' } : {}} />
  if (!usage) return null

  async function openPortal() {
    setPortalLoading(true)
    const res  = await fetch('/api/stripe/portal', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else setPortalLoading(false)
  }

  const isUnlimited = usage.posts_limit >= 999999
  const pct         = isUnlimited ? 0 : Math.min(100, (usage.posts_used / usage.posts_limit) * 100)
  const isWarning   = pct >= 80
  const isCritical  = pct >= 95

  const barColor = isCritical ? 'var(--failed)' : isWarning ? 'var(--approval)' : 'var(--done)'

  if (compact) {
    return (
      <div className="animate-in" style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', margin: '8px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Posts this month</span>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
            {isUnlimited ? `${usage.posts_used} / ∞` : `${usage.posts_used} / ${usage.posts_limit}`}
          </span>
        </div>
        {!isUnlimited && (
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 99 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width 0.5s var(--ease-out)' }} />
          </div>
        )}
        {(isWarning || usage.status === 'past_due') && (
          <div style={{ fontSize: '0.65rem', color: isCritical ? '#FCA5A5' : '#FDE68A', marginTop: 4 }}>
            {isCritical ? '⚠️ Almost at limit' : isWarning ? 'Running low' : ''}
            {usage.status === 'past_due' ? '⚠️ Payment overdue' : ''}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius)', padding: '20px 22px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-40)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Usage this month</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {isUnlimited ? usage.posts_used : `${usage.posts_used} / ${usage.posts_limit}`}
            {isUnlimited && <span style={{ fontSize: '0.9rem', color: 'var(--ink-20)', marginLeft: 4 }}>posts</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            display: 'inline-block',
            fontSize: '0.7rem', fontWeight: 700,
            padding: '3px 9px', borderRadius: 99,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            background: usage.status === 'active' ? 'var(--done-bg)' : usage.status === 'trialing' ? 'var(--pending-bg)' : usage.status === 'past_due' ? 'var(--failed-bg)' : 'var(--fog)',
            color:      usage.status === 'active' ? 'var(--done)'    : usage.status === 'trialing' ? 'var(--pending)'    : usage.status === 'past_due' ? 'var(--failed)'    : 'var(--ink-20)',
            border: `1px solid ${usage.status === 'active' ? 'var(--done-border)' : usage.status === 'trialing' ? 'var(--pending-border)' : usage.status === 'past_due' ? 'var(--failed-border)' : 'var(--fog-60)'}`,
          }}>
            {usage.plan ? usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1) : 'Trial'} · {usage.status}
          </span>
          {usage.current_period_end && (
            <div style={{ fontSize: '0.72rem', color: 'var(--ink-20)', marginTop: 4 }}>
              Resets {new Date(usage.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
          )}
        </div>
      </div>

      {!isUnlimited && (
        <>
          <div style={{ height: 6, background: 'var(--fog-60)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width 0.5s var(--ease-out)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <span style={{ color: isCritical ? 'var(--failed)' : isWarning ? 'var(--approval)' : 'var(--ink-20)' }}>
              {isCritical ? '⚠️ Almost at limit — upgrade to continue' : isWarning ? '⚠️ Running low on posts' : `${usage.posts_remaining} posts remaining`}
            </span>
            <span style={{ color: 'var(--ink-20)' }}>{Math.round(pct)}%</span>
          </div>
        </>
      )}

      {usage.status === 'past_due' && (
        <div className="animate-in" style={{ marginTop: 12, padding: '10px 14px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--failed)' }}>
          ⚠️ Your last payment failed.{' '}
          <button onClick={openPortal} disabled={portalLoading} className="press" style={{ fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: portalLoading ? 'not-allowed' : 'pointer', font: 'inherit', padding: 0 }}>
            {portalLoading ? 'Opening…' : 'Update payment method →'}
          </button>
        </div>
      )}

      {usage.status === 'canceled' && (
        <div className="animate-in" style={{ marginTop: 12, padding: '10px 14px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--failed)' }}>
          Your subscription has been cancelled. <Link href="/onboarding?step=billing" style={{ fontWeight: 600, textDecoration: 'underline' }}>Resubscribe →</Link>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button onClick={openPortal} disabled={portalLoading} className="press hover-lift" style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', background: 'var(--fog)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', cursor: portalLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)' }}>
          {portalLoading && <Spinner size={12} />}
          Manage billing & plan →
        </button>
      </div>
    </div>
  )
}
