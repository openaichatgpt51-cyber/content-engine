import { NextResponse } from 'next/server'
import { requireAdminApi, badRequest } from '../../../../../../lib/admin/auth'
import { signInLink, appOrigin } from '../../../../../../lib/admin/clientOps'
import { supabaseAdmin } from '../../../../../../lib/supabase-admin'

// A fresh single-use link that lets the client set a password and sign in.
export async function POST(request, { params }) {
  const { error: authErr, audit } = await requireAdminApi('clients.invite')
  if (authErr) return authErr
  const { data: client } = await supabaseAdmin.from('clients').select('email, lifecycle').eq('id', params.id).maybeSingle()
  if (!client?.email) return badRequest('Client not found.', 404)
  if (client.lifecycle !== 'active') return badRequest('Enable the account first.')
  try {
    const { link } = await signInLink({ email: client.email, origin: appOrigin(request), isNew: false })
    await audit('client.signin_link', { client_id: params.id, reason: 'New sign-in link created' })
    return NextResponse.json({ link })
  } catch (e) {
    return badRequest(e.message, 502)
  }
}
