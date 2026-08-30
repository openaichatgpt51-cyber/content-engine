export default function AccountDeletedPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--ink)', padding: 24, textAlign: 'center',
    }}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>✅</div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.5rem',
          color: 'var(--white)', marginBottom: 12,
        }}>
          Your account has been deleted
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          All your posts, connected platforms, and account data have been permanently removed.
          Thanks for trying ContentEngine.
        </p>
      </div>
    </div>
  )
}
