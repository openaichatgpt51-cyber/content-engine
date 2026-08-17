'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'

const DISMISS_KEY = 'ce_connect_banner_dismissed'

export default function ConnectPlatformBanner() {
  const pathname = usePathname()
  const [state, setState] = useState(null) // null | 'missing' | 'reconnect'

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1') return
    checkConnection()
  }, [])

  async function checkConnection() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // LinkedIn is the only platform that actually posts right now
    // (Instagram is disabled, Twitter is connect-only pre-launch) —
    // that's the one thing worth nagging about.
    const { data } = await supabase
      .from('platform_accounts')
      .select('expires_at, token_valid')
      .eq('client_id', user.id)
      .eq('platform', 'linkedin')
      .maybeSingle()

    if (!data) {
      setState('missing')
      return
    }

    const expired = data.expires_at && new Date(data.expires_at) < new Date()
    // Strict === false, same rule as Settings: null/undefined token_valid
    // means "never validated yet", not "confirmed broken" — don't nag over it.
    const invalid = data.token_valid === false

    if (expired || invalid) setState('reconnect')
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setState(null)
  }

  if (!state || pathname === '/dashboard/settings') return null

  const isReconnect = state === 'reconnect'

  return (
    <div className="animate-in" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '12px 24px',
      background: isReconnect ? 'var(--failed-bg)' : 'rgba(200,150,62,0.1)',
      borderBottom: `1px solid ${isReconnect ? 'var(--failed-border)' : 'rgba(200,150,62,0.25)'}`,
    }}>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{isReconnect ? '⚠️' : '🔗'}</span>
      <span style={{ flex: 1, fontSize: '0.85rem', color: isReconnect ? 'var(--failed)' : 'var(--ink-60)' }}>
        {isReconnect
          ? "Your LinkedIn connection needs to be reconnected — posts won't go out until it's fixed."
          : "Connect your LinkedIn account to start publishing — nothing goes live until it's connected."}
      </span>
      <Link href="/dashboard/settings" className="press hover-lift" style={{
        fontSize: '0.8125rem', fontWeight: 600, color: 'var(--white)',
        background: isReconnect ? 'var(--failed)' : 'var(--accent-warm)', padding: '7px 16px',
        borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {isReconnect ? 'Reconnect now →' : 'Connect now →'}
      </Link>
      <button onClick={dismiss} className="press tap-scale" style={{
        color: 'var(--ink-20)', fontSize: '0.9rem', flexShrink: 0,
        width: 22, height: 22, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        ✕
      </button>
    </div>
  )
}
