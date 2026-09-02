import Link from 'next/link'
import { createSupabaseServerClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Belt-and-suspenders — middleware already gates this, but a layout
  // that assumes middleware always ran correctly is one config change
  // away from a real access-control bug. Cheap to check again here.
  const { data: client } = await supabase.from('clients').select('is_admin').eq('id', session.user.id).maybeSingle()
  if (!client?.is_admin) redirect('/dashboard')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--fog)' }}>
      <nav style={{
        width: 220, background: 'var(--ink)', minHeight: '100vh', padding: '24px 16px',
        position: 'fixed', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--white)', marginBottom: 4, padding: '0 8px' }}>
          Admin
        </div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginBottom: 24, padding: '0 8px' }}>
          ContentEngine internal
        </div>
        <Link href="/admin" style={navStyle}>System Health</Link>
        <Link href="/admin/clients" style={navStyle}>Clients</Link>
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <Link href="/dashboard" style={{ ...navStyle, color: 'rgba(255,255,255,0.4)' }}>← Back to dashboard</Link>
        </div>
      </nav>
      <main style={{ flex: 1, marginLeft: 220, padding: '32px 40px' }}>
        {children}
      </main>
    </div>
  )
}

const navStyle = {
  display: 'block', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
  color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: 2, textDecoration: 'none',
}
