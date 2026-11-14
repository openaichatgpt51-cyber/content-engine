import 'server-only'
import { supabaseAdmin } from '../supabase-admin'

// Pause / resume mirror components/KillSwitch.jsx exactly, so the admin and
// the client's own switch behave the same: set the flag first, then move
// queued posts (PENDING ↔ HALTED). Posts already IN_PROGRESS can't be recalled.
export async function pausePosting(clientId) {
  const now = new Date().toISOString()
  const { error: flagErr } = await supabaseAdmin.from('account_settings')
    .upsert({ client_id: clientId, posting_paused: true, paused_at: now, updated_at: now }, { onConflict: 'client_id' })
  if (flagErr) throw new Error('Could not pause posting, so nothing was changed: ' + flagErr.message)
  const { data: held, error } = await supabaseAdmin.from('posts')
    .update({ posting_status: 'HALTED' }).eq('client_id', clientId).eq('posting_status', 'PENDING').select('id')
  if (error) throw new Error('Posting is paused for new approvals, but queued posts could not be held: ' + error.message)
  return { held: held?.length || 0 }
}

export async function resumePosting(clientId) {
  const { error: flagErr } = await supabaseAdmin.from('account_settings')
    .upsert({ client_id: clientId, posting_paused: false, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
  if (flagErr) throw new Error('Could not resume posting, so it is still paused: ' + flagErr.message)
  const { data: requeued, error } = await supabaseAdmin.from('posts')
    .update({ posting_status: 'PENDING' }).eq('client_id', clientId).eq('posting_status', 'HALTED').select('id')
  if (error) throw new Error('Posting is resumed, but held posts could not be re-queued: ' + error.message)
  return { requeued: requeued?.length || 0 }
}

export async function isPaused(clientId) {
  const { data } = await supabaseAdmin.from('account_settings').select('posting_paused').eq('client_id', clientId).maybeSingle()
  return !!data?.posting_paused
}

// Disable: ban sign-in (blocks token refresh), mark suspended (middleware
// signs them out on their next request), pause posting.
export async function disableAccount(clientId) {
  const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(clientId, { ban_duration: '876000h' })
  if (banErr) throw new Error('Could not block sign-in: ' + banErr.message)
  const { error } = await supabaseAdmin.from('clients').update({ lifecycle: 'suspended' }).eq('id', clientId)
  if (error) throw new Error('Sign-in is blocked, but the account status could not be saved: ' + error.message)
  return pausePosting(clientId)
}

// Enable: lift the ban and mark active. Posting stays paused on purpose.
export async function enableAccount(clientId) {
  const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(clientId, { ban_duration: 'none' })
  if (banErr) throw new Error('Could not restore sign-in: ' + banErr.message)
  const { error } = await supabaseAdmin.from('clients').update({ lifecycle: 'active' }).eq('id', clientId)
  if (error) throw new Error('Sign-in is restored, but the account status could not be saved: ' + error.message)
}

export async function offboardAccount(clientId) {
  await disableAccount(clientId)
  await supabaseAdmin.from('clients').update({ lifecycle: 'offboarded' }).eq('id', clientId)
  await supabaseAdmin.from('contracts').update({ status: 'ended' }).eq('client_id', clientId).eq('status', 'active')
}

export function appOrigin(request) {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/$/, '')
  try { return new URL(request.url).origin } catch { return '' }
}

// Builds a single-use sign-in link that lands on /reset-password so the user
// sets their own password. Uses token_hash + /auth/confirm (verifyOtp), the
// server-side pattern that works with @supabase/ssr's PKCE cookies.
export async function signInLink({ email, origin, isNew, data }) {
  const type = isNew ? 'invite' : 'recovery'
  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
    type, email, options: isNew ? { data } : undefined,
  })
  if (error) throw new Error('Could not create the sign-in link: ' + error.message)
  const hashed = link?.properties?.hashed_token
  if (!hashed) throw new Error('Supabase did not return a token for the link.')
  return {
    userId: link?.user?.id,
    link: `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${type}&next=/reset-password`,
  }
}
