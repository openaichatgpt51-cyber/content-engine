import { cookies } from 'next/headers'
import { MULTI_BRAND_ENABLED } from './featureFlags'

// Server-only. Reads the client's brands and works out which one is active:
// the one in the ce_brand cookie if it belongs to the client, otherwise their
// default brand. The cookie is only ever set by /api/brand/switch after the
// brand is checked against the client, and every query is still protected by
// row-level security, so a forged cookie cannot expose another client's data.
export const BRAND_COOKIE = 'ce_brand'

export async function loadBrandContext(supabase, userId) {
  const [{ data: brands }, { data: client }] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, is_default')
      .eq('client_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase.from('clients').select('max_brands').eq('id', userId).maybeSingle(),
  ])

  const list = brands || []
  // The cookie only counts while multi-brand is on; otherwise always the default brand.
  const wanted = MULTI_BRAND_ENABLED ? (await cookies()).get(BRAND_COOKIE)?.value : undefined
  const active = list.find(b => b.id === wanted) || list.find(b => b.is_default) || list[0] || null

  return {
    brands: list,
    activeBrandId: active ? active.id : null,
    maxBrands: client?.max_brands ?? 1,
  }
}

// The brand that new rows (posts, connections, profile edits) belong to for this
// request: the active brand while multi-brand is on, the default brand otherwise.
// Returns null only if the client has no brands at all (should not happen).
export async function resolveActiveBrandId(supabase, userId) {
  const { activeBrandId } = await loadBrandContext(supabase, userId)
  return activeBrandId
}
