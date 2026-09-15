import { supabaseAdmin } from '../../../lib/supabase-admin'

export default async function AdminClientsPage() {
  const [{ data: clients }, { data: subs }, { data: posts }] = await Promise.all([
    supabaseAdmin.from('clients').select('id, created_at'),
    supabaseAdmin.from('subscriptions').select('client_id, plan, status, posts_used, posts_limit'),
    supabaseAdmin.from('posts').select('client_id, posting_status, created_at'),
  ])

  const subByClient = Object.fromEntries((subs || []).map(s => [s.client_id, s]))
  const postsByClient = {}
  for (const p of posts || []) {
    (postsByClient[p.client_id] ||= []).push(p)
  }

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000
  const fourteenDaysAgo = Date.now() - 14 * 86_400_000

  const rows = (clients || []).map(c => {
    const clientPosts = postsByClient[c.id] || []
    const recentPosts = clientPosts.filter(p => new Date(p.created_at).getTime() > thirtyDaysAgo)
    const lastPostAt = clientPosts.length ? Math.max(...clientPosts.map(p => new Date(p.created_at).getTime())) : null
    const sub = subByClient[c.id]

    let churnRisk = 'low'
    if (!lastPostAt || lastPostAt < fourteenDaysAgo) churnRisk = 'high'
    else if (recentPosts.length <= 1) churnRisk = 'medium'

    return {
      id: c.id,
      plan: sub?.plan || 'trial',
      status: sub?.status || 'trialing',
      posts_used: sub?.posts_used ?? 0,
      posts_limit: sub?.posts_limit ?? 5,
      totalPosts: clientPosts.length,
      postsLast30d: recentPosts.length,
      lastPostAt,
      churnRisk,
    }
  }).sort((a, b) => b.postsLast30d - a.postsLast30d)

  const atRisk = rows.filter(r => r.churnRisk === 'high').length

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)', marginBottom: 4 }}>Clients</h1>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 24 }}>
        Sorted by activity in the last 30 days — most active first.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <StatCard label="Total clients" value={rows.length} />
        <StatCard label="Active (posted in 30d)" value={rows.filter(r => r.postsLast30d > 0).length} />
        <StatCard label="At churn risk" value={atRisk} accent={atRisk > 0 ? 'var(--failed)' : undefined} />
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              {['Client', 'Plan', 'Usage', 'Total posts', 'Last 30 days', 'Last post', 'Risk'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={td}><code style={{ fontSize: '0.72rem' }}>{r.id.slice(0, 8)}</code></td>
                <td style={td}>{r.plan}</td>
                <td style={td}>{r.posts_used}/{r.posts_limit}</td>
                <td style={td}>{r.totalPosts}</td>
                <td style={td}>{r.postsLast30d}</td>
                <td style={td}>{r.lastPostAt ? new Date(r.lastPostAt).toLocaleDateString() : 'Never'}</td>
                <td style={td}><RiskBadge risk={r.churnRisk} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ flex: 1, padding: '16px 18px', background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: accent || 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--ink-40)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
function RiskBadge({ risk }) {
  const styles = {
    low:    { color: '#16A34A', label: 'Low' },
    medium: { color: '#B45309', label: 'Medium' },
    high:   { color: 'var(--failed)', label: 'High' },
  }
  const s = styles[risk]
  return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>
}

const th = { textAlign: 'left', padding: '10px 14px', fontSize: '0.72rem', color: 'var(--ink-20)', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--fog-60)' }
const td = { padding: '10px 14px', borderBottom: '1px solid var(--fog)', color: 'var(--ink)' }
