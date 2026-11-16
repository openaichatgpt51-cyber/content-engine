import 'server-only'
import { supabaseAdmin } from '../supabase-admin'
import { POST_COLS } from './data'
import { DEFAULT_TZ } from './rules'

export async function loadPostContext(postId) {
  const { data: post } = await supabaseAdmin.from('posts').select(POST_COLS).eq('id', postId).maybeSingle()
  if (!post) return null
  const [{ data: settings }, { data: accounts }, { data: onboarding }] = await Promise.all([
    supabaseAdmin.from('account_settings').select('posting_paused').eq('client_id', post.client_id).maybeSingle(),
    supabaseAdmin.from('platform_accounts').select('platform, brand_id, token_valid, expires_at, handle, display_name').eq('client_id', post.client_id),
    supabaseAdmin.from('onboarding').select('timezone').eq('client_id', post.client_id).maybeSingle(),
  ])
  let tz = onboarding?.timezone || DEFAULT_TZ
  if (post.brand_id) {
    const { data: sched } = await supabaseAdmin.from('brand_schedules').select('timezone').eq('brand_id', post.brand_id).maybeSingle()
    if (sched?.timezone) tz = sched.timezone
  }
  return { post, paused: !!settings?.posting_paused, accounts: accounts || [], tz }
}
