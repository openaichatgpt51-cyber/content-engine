import Link from 'next/link'
import { createSupabaseServerClient } from '../../../lib/supabase-server'
import { getNotifications } from '../../../lib/notifications'

const SEVERITY_STYLE = {
  error:   { bg: 'var(--failed-bg)',   border: 'var(--failed-border)',   dot: 'var(--failed)' },
  warning: { bg: '#FEF3C7',            border: '#FDE68A',                dot: '#B45309' },
}

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient()
  const notifications = await getNotifications(supabase)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 4 }}>
        Notifications
      </h1>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 28 }}>
        {notifications.length === 0
          ? 'Nothing needs your attention right now.'
          : `${notifications.length} item${notifications.length === 1 ? '' : 's'} need${notifications.length === 1 ? 's' : ''} attention.`}
      </p>

      {notifications.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center', background: 'var(--white)',
          border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
          <p style={{ color: 'var(--ink-40)', fontSize: '0.875rem' }}>You're all caught up.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifications.map(n => {
            const s = SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.warning
            return (
              <div key={n.id} style={{
                display: 'flex', gap: 14, padding: '16px 18px',
                background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: 'var(--radius-lg)', alignItems: 'flex-start',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: s.dot,
                  marginTop: 6, flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--ink)', marginBottom: 2 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', lineHeight: 1.5 }}>
                    {n.detail}
                  </div>
                  {n.time && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--ink-20)', marginTop: 6 }}>
                      {new Date(n.time).toLocaleString()}
                    </div>
                  )}
                </div>
                {n.actionHref && (
                  <Link href={n.actionHref} style={{
                    flexShrink: 0, padding: '7px 14px', background: 'var(--ink)',
                    color: 'var(--white)', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.78rem', fontWeight: 500, textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    {n.actionLabel}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
