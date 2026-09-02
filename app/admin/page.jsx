import { supabaseAdmin } from '../../lib/supabase-admin'

export default async function AdminSystemHealthPage() {
  // Deliberately uses supabaseAdmin (service role) — this page needs to
  // see across ALL clients, which normal RLS-scoped queries can't do.
  // Safe specifically because middleware + the layout above already
  // confirmed the requesting user is_admin before this ever renders.

  const [{ data: failedPosts }, { data: recentErrors }, { data: badTokens }, { count: totalClients }, { count: activeToday }] = await Promise.all([
    supabaseAdmin.from('posts').select('id, topic, client_id, posting_status, updated_at').in('posting_status', ['FAILED', 'PARTIAL']).order('updated_at', { ascending: false }).limit(20),
    supabaseAdmin.from('error_logs').select('id, client_id, node_name, platform, error_message, created_at').order('created_at', { ascending: false }).limit(30),
    supabaseAdmin.from('platform_accounts').select('client_id, platform, token_valid, expires_at').or('token_valid.eq.false,expires_at.lte.' + new Date(Date.now() + 7 * 86_400_000).toISOString()),
    supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('posts').select('client_id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString()),
  ])

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)', marginBottom: 24 }}>System Health</h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total clients" value={totalClients ?? 0} />
        <StatCard label="Posts created (24h)" value={activeToday ?? 0} />
        <StatCard label="Failed/partial posts" value={failedPosts?.length ?? 0} accent={failedPosts?.length > 0 ? 'var(--failed)' : undefined} />
        <StatCard label="Connections needing attention" value={badTokens?.length ?? 0} accent={badTokens?.length > 0 ? '#B45309' : undefined} />
      </div>

      <Section title="Failed / Partial Posts">
        {!failedPosts?.length ? <Empty text="No failed posts right now." /> : (
          <Table headers={['Topic', 'Client', 'Status', 'When']}>
            {failedPosts.map(p => (
              <tr key={p.id}>
                <td style={td}>{p.topic}</td>
                <td style={td}><code style={{ fontSize: '0.72rem' }}>{p.client_id?.slice(0, 8)}</code></td>
                <td style={td}><StatusBadge status={p.posting_status} /></td>
                <td style={td}>{new Date(p.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Platform Connections Needing Attention">
        {!badTokens?.length ? <Empty text="All connections healthy." /> : (
          <Table headers={['Client', 'Platform', 'Issue']}>
            {badTokens.map((t, i) => (
              <tr key={i}>
                <td style={td}><code style={{ fontSize: '0.72rem' }}>{t.client_id?.slice(0, 8)}</code></td>
                <td style={td}>{t.platform}</td>
                <td style={td}>{t.token_valid === false ? 'Invalid token' : 'Expiring within 7 days'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Recent Errors (all clients)">
        {!recentErrors?.length ? <Empty text="No errors logged." /> : (
          <Table headers={['Node', 'Platform', 'Client', 'Message', 'When']}>
            {recentErrors.map(e => (
              <tr key={e.id}>
                <td style={td}>{e.node_name}</td>
                <td style={td}>{e.platform || '—'}</td>
                <td style={td}><code style={{ fontSize: '0.72rem' }}>{e.client_id?.slice(0, 8)}</code></td>
                <td style={{ ...td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.error_message}</td>
                <td style={td}>{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
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
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>{title}</h2>
      {children}
    </div>
  )
}
function Table({ headers, children }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead><tr>{headers.map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
function Empty({ text }) {
  return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-20)', fontSize: '0.875rem', background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)' }}>{text}</div>
}
function StatusBadge({ status }) {
  const color = status === 'FAILED' ? 'var(--failed)' : '#B45309'
  return <span style={{ color, fontWeight: 500 }}>{status}</span>
}

const th = { textAlign: 'left', padding: '10px 14px', fontSize: '0.72rem', color: 'var(--ink-20)', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--fog-60)' }
const td = { padding: '10px 14px', borderBottom: '1px solid var(--fog)', color: 'var(--ink)' }
