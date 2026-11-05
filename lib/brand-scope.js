// Adds a brand filter to a Supabase query builder. With no active brand (the
// feature is off) the query is returned unchanged, so callers can always wrap
// their queries: scopeBrand(supabase.from('posts').select('*'), activeBrandId)
export function scopeBrand(query, brandId) {
  return brandId ? query.eq('brand_id', brandId) : query
}
