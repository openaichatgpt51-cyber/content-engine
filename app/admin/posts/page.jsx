import Link from 'next/link'
import { requireAdminPage } from '../../../lib/admin/auth'
import { supabaseAdmin } from '../../../lib/supabase-admin'
import { POST_COLS, loadDirectory, whoLine } from '../../../lib/admin/data'
import { riskFlags, FLAG_LABEL, earliestScheduled, formatWhen, ageLabel } from '../../../lib/admin/rules'

const FILTERS = [
  ['problems', 'All problems'], ['failed', 'Failed'], ['partial', 'Partly published'], ['stuck', 'Stuck'],
  ['stale_approval', 'Waiting > 48h'], ['past_due', 'Past its time'], ['over_limit', 'Over limit'], ['not_live', 'Platform not live'],
]

export default async function AdminPosts({ searchParams }) {
  await requireAdminPage()
  const filter = FILTERS.some(([k]) => k === searchParams?.flag) ? searchParams.flag : 'problems'
  const now = new Date()
  const { data: posts } = await supabaseAdmin.from('posts').select(POST_COLS)
    .in('posting_status', ['FAILED', 'PARTIAL', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'PENDING', 'HALTED'])
    .order('updated_at', { ascending: false }).limit(1000)
  const withFlags = (posts || []).map(p => ({ p, flags: riskFlags(p, now) })).filter(x => x.flags.length)
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === 'problems' ? withFlags.length : withFlags.filter(x => x.flags.includes(k)).length]))
  const shown = (filter === 'problems' ? withFlags : withFlags.filter(x => x.flags.includes(filter))).slice(0, 200)
  const dir = await loadDirectory([...new Set(shown.map(x => x.p.client_id))])

  return (
    <>
      <header className="ad-head">
        <div className="ad-stack" style={{ gap: 4 }}>
          <h1 className="ad-h1">Posts queue</h1>
          <p className="ad-sub">Posts across all clients that need a look. Times in WAT.</p>
        </div>
      </header>
      <nav aria-label="Filter posts" className="ad-pills" style={{ alignSelf: 'flex-start' }}>
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k === 'problems' ? '/admin/posts' : `/admin/posts?flag=${k}`} className="ad-pill" aria-current={filter === k ? 'page' : undefined}>{label} <span className="ad-muted">{counts[k]}</span></Link>
        ))}
      </nav>
      <div className="ad-card flush ad-table-box">
        <table className="ad-table" style={{ minWidth: 900 }}>
          <caption className="ad-sr">Posts needing attention</caption>
          <thead><tr><th scope="col">Post</th><th scope="col">Client · brand</th><th scope="col">Status</th><th scope="col">Scheduled</th><th scope="col">Flags</th><th scope="col">Updated</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6}><div className="ad-empty"><strong>Nothing to look at</strong><span className="ad-muted">No posts match this filter.</span></div></td></tr>}
            {shown.map(({ p, flags }) => {
              const at = earliestScheduled(p)
              return (
                <tr key={p.id}>
                  <td><Link href={`/admin/posts/${p.id}`} className="ad-strong" style={{ textDecoration: 'none' }}>{p.topic || 'Untitled post'}</Link></td>
                  <td>{whoLine(dir, p.client_id, p.brand_id)}</td>
                  <td><span className="ad-badge">{p.posting_status}</span></td>
                  <td className="nowrap">{at ? formatWhen(at.toISOString()) : '—'}</td>
                  <td>{flags.map(f => <span key={f} className={`ad-badge ${['failed', 'stuck'].includes(f) ? 'bad' : 'warn'}`} style={{ margin: '2px 6px 2px 0' }}>{FLAG_LABEL[f]}</span>)}</td>
                  <td className="nowrap ad-muted">{ageLabel(p.updated_at, now)} ago</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
