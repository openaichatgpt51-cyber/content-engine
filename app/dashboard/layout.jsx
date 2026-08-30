import Sidebar from '../../components/Sidebar'
import ConnectPlatformBanner from '../../components/ConnectPlatformBanner'
import { createSupabaseServerClient } from '../../lib/supabase-server'
import { getNotifications } from '../../lib/notifications'

export default async function DashboardLayout({ children }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  const [{ count: pendingCount }, notifications] = await Promise.all([
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('posting_status', 'AWAITING_APPROVAL'),
    getNotifications(supabase),
  ])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--fog)' }}>
      <Sidebar
        userEmail={session?.user?.email}
        pendingCount={pendingCount || 0}
        notificationCount={notifications.length}
      />
      <main style={{
        flex: 1,
        marginLeft: 220,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <ConnectPlatformBanner />
        {children}
      </main>
    </div>
  )
}
