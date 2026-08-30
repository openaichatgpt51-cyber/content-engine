// Builds a notifications list from data that already exists — no dedicated
// notifications table. Three sources, each mapped to a consistent shape:
//   - posts stuck at FAILED or PARTIAL (posting_status)
//   - platform_accounts with a known-invalid or soon-expiring token
//   - the current subscription sitting at/near its usage limit
//
// Call this with a session-bound Supabase client (see lib/supabase-server.js)
// so RLS naturally scopes everything to the signed-in user — no client_id
// filtering needed here.

const EXPIRY_WARNING_DAYS = 7

export async function getNotifications(supabase) {
  const notifications = []

  // ── Failed / partially-failed posts ────────────────────────────────
  const { data: failedPosts } = await supabase
    .from('posts')
    .select('id, topic, posting_status, reject_reason, updated_at')
    .in('posting_status', ['FAILED', 'PARTIAL'])
    .order('updated_at', { ascending: false })
    .limit(20)

  // error_logs now exists (see create-error-logs-table.sql) — pull the
  // most recent log per post so failures show the actual API error
  // instead of the generic fallback text.
  const postIds = (failedPosts || []).map(p => p.id)
  let errorsByPost = {}
  if (postIds.length) {
    const { data: errors } = await supabase
      .from('error_logs')
      .select('post_id, node_name, error_message, platform, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: false })

    for (const e of errors || []) {
      // keep only the most recent error per post (first one wins, since
      // already ordered newest-first)
      if (!errorsByPost[e.post_id]) errorsByPost[e.post_id] = e
    }
  }

  for (const post of failedPosts || []) {
    const err = errorsByPost[post.id]
    notifications.push({
      id:       `post-${post.id}`,
      type:     post.posting_status === 'FAILED' ? 'post_failed' : 'post_partial',
      severity: 'error',
      title:    post.posting_status === 'FAILED' ? 'Post failed to publish' : 'Post partially published',
      detail:   err
        ? `${err.node_name}${err.platform ? ` (${cap(err.platform)})` : ''}: ${err.error_message}`
        : (post.reject_reason || `"${post.topic}" — check the platform connection and retry.`),
      time:     post.updated_at,
      actionHref:  `/dashboard/review?postId=${post.id}`,
      actionLabel: 'View post',
    })
  }

  // ── Platform connections needing attention ──────────────────────────
  const { data: accounts } = await supabase
    .from('platform_accounts')
    .select('platform, token_valid, expires_at')

  const now = Date.now()
  for (const acc of accounts || []) {
    if (acc.token_valid === false) {
      notifications.push({
        id:       `token-invalid-${acc.platform}`,
        type:     'token_invalid',
        severity: 'error',
        title:    `${cap(acc.platform)} connection needs attention`,
        detail:   `Your ${cap(acc.platform)} token failed validation. Reconnect to resume posting.`,
        time:     null,
        actionHref:  '/dashboard/settings',
        actionLabel: 'Reconnect',
      })
    } else if (acc.expires_at) {
      const daysLeft = (new Date(acc.expires_at).getTime() - now) / 86_400_000
      if (daysLeft <= EXPIRY_WARNING_DAYS) {
        notifications.push({
          id:       `token-expiring-${acc.platform}`,
          type:     'token_expiring',
          severity: daysLeft <= 0 ? 'error' : 'warning',
          title:    daysLeft <= 0
            ? `${cap(acc.platform)} connection expired`
            : `${cap(acc.platform)} connection expiring soon`,
          detail:   daysLeft <= 0
            ? `Reconnect ${cap(acc.platform)} to resume posting.`
            : `Expires in ${Math.max(1, Math.round(daysLeft))} day${daysLeft >= 1.5 ? 's' : ''} — reconnect to avoid an interruption.`,
          time:     acc.expires_at,
          actionHref:  '/dashboard/settings',
          actionLabel: 'Reconnect',
        })
      }
    }
  }

  // ── Usage limit ──────────────────────────────────────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('posts_used, posts_limit, status')
    .maybeSingle()

  if (sub && sub.posts_used >= sub.posts_limit) {
    notifications.push({
      id:       'usage-limit',
      type:     'usage_limit',
      severity: 'warning',
      title:    "You've reached your plan's limit",
      detail:   `${sub.posts_used} of ${sub.posts_limit} posts used this month.`,
      time:     null,
      actionHref:  '/dashboard/settings',
      actionLabel: 'View plans',
    })
  }

  notifications.sort((a, b) => (a.time && b.time ? new Date(b.time) - new Date(a.time) : 0))
  return notifications
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
