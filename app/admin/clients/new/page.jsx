import Link from 'next/link'
import { requireAdminPage } from '../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import NewClientForm from '../../../../components/admin/NewClientForm'

export default async function NewClientPage({ searchParams }) {
  const admin = await requireAdminPage('clients.create')
  let prefill = {}
  let leadId = null
  if (searchParams?.lead) {
    const { data: lead } = await supabaseAdmin.from('leads').select('id, name, email, company, message').eq('id', searchParams.lead).maybeSingle()
    if (lead) { prefill = lead; leadId = lead.id }
  }
  return (
    <>
      <Link href={leadId ? `/admin/leads?id=${leadId}` : '/admin/clients'} className="ad-back">← {leadId ? 'Lead' : 'Clients'}</Link>
      <header className="ad-stack" style={{ gap: 4 }}>
        <h1 className="ad-h1">New client</h1>
        <p className="ad-sub">About 3 minutes.{leadId ? ` Filled in from the demo request by ${prefill.name}.` : ''}</p>
      </header>
      <NewClientForm prefill={prefill} leadId={leadId} adminName={admin.name} />
    </>
  )
}
