'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import UsageMeter from './UsageMeter'
import BrandSwitcher from './BrandSwitcher'

const NAV = [
  { href: '/dashboard',              label: 'Calendar',      short: 'Calendar', icon: CalIcon },
  { href: '/dashboard/new-post',     label: 'New Post',      short: 'New',      icon: PlusIcon },
  { href: '/dashboard/review',       label: 'Review Queue',  short: 'Review',   icon: EyeIcon,  badge: 'pending' },
  { href: '/dashboard/campaign',     label: 'Campaign',      short: 'Campaign', icon: MegaphoneIcon },
  { href: '/dashboard/notifications',label: 'Notifications', short: 'Alerts',   icon: BellIcon, badge: 'notifications' },
  { href: '/dashboard/analytics',    label: 'Analytics',     short: 'Stats',    icon: ChartIcon },
  { href: '/dashboard/settings',     label: 'Settings',      short: 'Settings', icon: CogIcon },
]

export default function Sidebar({ userEmail = '', pendingCount = 0, notificationCount = 0, isAdmin = false }) {
  const pathname = usePathname()
  const router   = useRouter()
  const badgeCounts = { pending: pendingCount, notifications: notificationCount }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
    {/* Phone-only top bar: logo, brand switcher and sign out. On phones the
        sidebar itself becomes a bottom tab bar (see .ce-sidebar in globals.css). */}
    <header className="ce-mobile-top">
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--white)' }}>
        Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span>
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div className="ce-mobile-brand"><BrandSwitcher /></div>
        <button onClick={handleSignOut} aria-label="Sign out" className="press" style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.75)', borderRadius: 'var(--radius-sm)' }}>
          <LogOutIcon size={18} />
        </button>
      </div>
    </header>
    <aside className="ce-sidebar" style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--ink)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <div className="animate-in ce-side-extra" style={{
        padding: '28px 24px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--white)', letterSpacing: '-0.01em' }}>
          Content<span style={{ color: 'var(--accent-warm)' }}>Engine</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          AI Social Dashboard
        </div>
      </div>

      {/* Brand switcher (renders nothing while multi-brand is off) */}
      <div className="ce-side-extra"><BrandSwitcher /></div>

      {/* Nav */}
      <nav aria-label="Main" className="ce-nav" style={{ flex: 1, padding: '16px 12px' }}>
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href
          const count  = badge ? badgeCounts[badge] : 0
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`nav-item${active ? ' nav-item--active' : ''}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 2,
              color: active ? 'var(--white)' : 'rgba(255,255,255,0.45)',
              background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
              fontSize: '0.875rem',
              fontWeight: active ? 500 : 400,
              position: 'relative',
            }}>
              <Icon size={16} />
              <span className="ce-label-long">{label}</span>
              <span className="ce-label-short">{NAV.find(n => n.href === href)?.short || label}</span>
              {badge && count > 0 && (
                <span key={count} className="badge-pop ce-badge" style={{
                  marginLeft: 'auto',
                  background: 'var(--accent-warm)',
                  color: 'var(--white)',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 99,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Usage — hidden for admins, who aren't metered (see fix below) */}
      {!isAdmin && <div className="ce-side-extra"><UsageMeter compact /></div>}

      {isAdmin && (
        <div className="ce-side-extra" style={{ padding: '0 12px 8px' }}>
          <Link href="/admin" className={`nav-item${pathname.startsWith('/admin') ? ' nav-item--active' : ''}`} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.12)',
            color: pathname.startsWith('/admin') ? 'var(--white)' : 'rgba(255,255,255,0.55)',
            background: pathname.startsWith('/admin') ? 'rgba(255,255,255,0.08)' : 'transparent',
            fontSize: '0.875rem', fontWeight: 500,
          }}>
            <ShieldIcon size={16} />
            Admin
          </Link>
        </div>
      )}

      {/* Signed in as */}
      {userEmail && (
        <div className="ce-side-extra" style={{
          padding: '12px 24px 4px',
          fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.3)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          Signed in as <span style={{ color: 'rgba(255,255,255,0.5)' }}>{userEmail}</span>
        </div>
      )}

      {/* Sign out */}
      <div className="ce-side-extra" style={{ padding: '12px 12px 16px', borderTop: userEmail ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={handleSignOut} className="signout-btn press" style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: '0.875rem',
        }}>
          <LogOutIcon size={16} />
          Sign out
        </button>
      </div>
    </aside>
    </>
  )
}

// ── Inline SVG icons ───────────────────────────────────────────────────────
function CalIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function PlusIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
}
function EyeIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function CogIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function ChartIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
}
function MegaphoneIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
}
function BellIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
}
function LogOutIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
}
function ShieldIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3z"/></svg>
}
