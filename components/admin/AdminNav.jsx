'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ROLE_LABEL } from '../../lib/admin/permissions'

const ITEMS = [
  { href: '/admin',           label: 'Today',       countKey: 'today' },
  { href: '/admin/clients',   label: 'Clients' },
  { href: '/admin/leads',     label: 'Leads',       countKey: 'leads' },
  { href: '/admin/posts',     label: 'Posts queue', countKey: 'posts' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/audit',     label: 'Audit log' },
  { href: '/admin/admins',    label: 'Admins',      ownerOnly: true },
]

export default function AdminNav({ admin, counts = {} }) {
  const pathname = usePathname()
  const items = ITEMS.filter(i => !i.ownerOnly || admin.role === 'owner')
  return (
    <nav className="ad-nav" aria-label="Admin">
      <div className="ad-brand">
        <span className="ad-brand-name">Content<span>Engine</span></span>
        <span className="ad-tag">ADMIN</span>
      </div>
      <ul>
        {items.map(i => {
          const active = i.href === '/admin' ? pathname === '/admin' : pathname.startsWith(i.href)
          const n = i.countKey ? counts[i.countKey] : 0
          return (
            <li key={i.href}>
              <Link href={i.href} className="ad-link" aria-current={active ? 'page' : undefined}>
                <span>{i.label}</span>
                {n > 0 && <span className="ad-count" aria-label={`${n} need attention`}>{n}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="ad-me">
        <span className="ad-me-dot" aria-hidden="true">{(admin.name || '?').slice(0, 1).toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{admin.name}</span>
          <small>{ROLE_LABEL[admin.role]}</small>
        </div>
      </div>
    </nav>
  )
}
