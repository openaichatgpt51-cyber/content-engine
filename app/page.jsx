import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '../lib/supabase-server'
import { supabaseAdmin } from '../lib/supabase-admin'

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const { data: onboarding } = await supabaseAdmin
    .from('onboarding')
    .select('completed')
    .eq('client_id', session.user.id)
    .maybeSingle()

  if (onboarding?.completed) redirect('/dashboard')
  redirect('/onboarding')
}
