import Sidebar from '../../components/Sidebar'
import ConnectPlatformBanner from '../../components/ConnectPlatformBanner'

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--fog)' }}>
      <Sidebar />
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
