// With Facebook Login, the Instagram Business account hangs off a Facebook Page the user
// administers, not off the user. List the user's Pages, then take the first Page that has an
// Instagram professional account linked to it.
export const GRAPH_VERSION = 'v21.0'

export async function findInstagramAccount(accessToken, fetchImpl = fetch) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetchImpl(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    throw new Error(`Instagram account lookup failed: ${body.error?.message || `HTTP ${res.status}`}`)
  }
  const pages = Array.isArray(body.data) ? body.data : []
  const linked = pages.filter(p => p.instagram_business_account?.id)
  if (!linked.length) return null
  const first = linked[0]
  return {
    igAccountId: first.instagram_business_account.id,
    username: first.instagram_business_account.username || null,
    pageId: first.id,
    pageName: first.name || null,
    linkedCount: linked.length,
  }
}
