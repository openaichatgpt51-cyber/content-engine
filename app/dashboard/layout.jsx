import Sidebar from '../../components/Sidebar'
import ConnectPlatformBanner from '../../components/ConnectPlatformBanner'
import { createSupabaseServerClient } from '../../lib/supabase-server'
import { getNotifications } from '../../lib/notifications'
import { BrandProvider } from '../../components/BrandProvider'
import { loadBrandContext } from '../../lib/brand'
import { scopeBrand } from '../../lib/brand-scope'
import { MULTI_BRAND_ENABLED } from '../../lib/featureFlags'

export default async function DashboardLayout({ children }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  // Reads are filtered by brand only while the flag is on (readBrandId is null
  // otherwise). Writes always know their brand (writeBrandId).
  const loaded = session
    ? await loadBrandContext(supabase, session.user.id)
    : { brands: [], activeBrandId: null, maxBrands: 1 }
  const brandCtx = {
    brands: MULTI_BRAND_ENABLED ? loaded.brands : [],
    activeBrandId: MULTI_BRAND_ENABLED ? loaded.activeBrandId : null,
    writeBrandId: loaded.activeBrandId,
    maxBrands: loaded.maxBrands,
  }

  const [{ count: pendingCount }, notifications, { data: client }] = await Promise.all([
    scopeBrand(
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('posting_status', 'AWAITING_APPROVAL'),
      brandCtx.activeBrandId
    ),
    getNotifications(supabase, brandCtx.activeBrandId),
    session ? supabase.from('clients').select('is_admin').eq('id', session.user.id).maybeSingle() : { data: null },
  ])

  return (
    <BrandProvider value={{ enabled: MULTI_BRAND_ENABLED, ...brandCtx }}>
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--fog)' }}>
      <Sidebar
        userEmail={session?.user?.email}
        pendingCount={pendingCount || 0}
        notificationCount={notifications.length}
        isAdmin={!!client?.is_admin}
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
    </BrandProvider>
  )
}
