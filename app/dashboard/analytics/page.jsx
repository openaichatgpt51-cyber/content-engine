import { createSupabaseServerClient } from '../../../lib/supabase-server'

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: rows } = await supabase
    .from('post_analytics')
    .select('*, posts(topic, linkedin_posted_at)')
    .order('fetched_at', { ascending: false })
    .limit(100)

  const posts = rows || []
  const totalImpressions = posts.reduce((sum, p) => sum + (p.impressions || 0), 0)
  const totalEngagement  = posts.reduce((sum, p) => sum + (p.reactions || 0) + (p.comments || 0) + (p.reposts || 0), 0)
  const avgEngagementRate = totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(1) : '—'

  const topPosts = [...posts]
    .sort((a, b) => ((b.reactions || 0) + (b.comments || 0) + (b.reposts || 0)) - ((a.reactions || 0) + (a.comments || 0) + (a.reposts || 0)))
    .slice(0, 5)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: 4 }}>Analytics</h1>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginBottom: 28 }}>
        LinkedIn engagement — data appears roughly 24h after a post publishes.
      </p>

      {posts.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center', background: 'var(--white)',
          border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)',
        }}>
          <p style={{ color: 'var(--ink-40)', fontSize: '0.875rem' }}>
            No data yet — check back once a few posts have been live for at least a day.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
            <StatCard label="Total impressions" value={totalImpressions.toLocaleString()} />
            <StatCard label="Total engagement" value={totalEngagement.toLocaleString()} />
            <StatCard label="Avg. engagement rate" value={`${avgEngagementRate}%`} />
          </div>

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Top performing posts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topPosts.map(p => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 18px', background: 'var(--white)', border: '1px solid var(--fog-60)',
                borderRadius: 'var(--radius-md)',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{p.posts?.topic || 'Untitled'}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--ink-40)' }}>
                  {p.reactions || 0} reactions · {p.comments || 0} comments · {p.impressions || 0} impressions
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{
      flex: 1, padding: '18px 20px', background: 'var(--white)',
      border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
