import './admin.css'
import AdminNav from '../../components/admin/AdminNav'
import { requireAdminPage } from '../../lib/admin/auth'
import { loadNavCounts } from '../../lib/admin/data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · ContentEngine' }

// Access is checked three times: middleware (admin_users own-row read),
// here, and again inside every admin route handler.
export default async function AdminLayout({ children }) {
  const admin = await requireAdminPage()
  const counts = await loadNavCounts()
  return (
    <div className="ad">
      <AdminNav admin={admin} counts={counts} />
      <main className="ad-main" id="main">
        <div className="ad-wrap">{children}</div>
      </main>
    </div>
  )
}
