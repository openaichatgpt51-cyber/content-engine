import { NextResponse } from 'next/server'
import { requireAdminApi, badRequest } from '../../../../lib/admin/auth'
import { supabaseAdmin } from '../../../../lib/supabase-admin'
import { signInLink, appOrigin } from '../../../../lib/admin/clientOps'
import { parseNaira, cleanReason } from '../../../../lib/admin/rules'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const s = (v, n) => String(v ?? '').trim().slice(0, n)

// Provision a client: invite (no password ever set by an admin), client
// details, first brand + profile, onboarding row, contract, and optionally
// mark a lead as converted. Owner only.
export async function POST(request) {
  const { error: authErr, admin, audit } = await requireAdminApi('clients.create')
  if (authErr) return authErr
  const b = await request.json().catch(() => null)
  if (!b) return badRequest('Send a JSON body.')

  const input = {
    company_name: s(b.company_name, 160), contact_name: s(b.contact_name, 120), email: s(b.email, 200).toLowerCase(),
    plan_name: s(b.plan_name, 80) || 'Founder’s Plan', amount: parseNaira(b.amount), cycle: b.cycle === 'annual' ? 'annual' : 'monthly',
    start_date: s(b.start_date, 10), max_brands: Number(b.max_brands) || 1,
    brand_name: s(b.brand_name, 60), country: s(b.country, 2).toUpperCase() || 'NG', language: s(b.language, 8) || 'en',
    timezone: s(b.timezone, 60) || 'Africa/Lagos', voice_notes: s(b.voice_notes, 2000), lead_id: b.lead_id ? String(b.lead_id) : null,
  }
  if (!input.company_name || !input.contact_name) return badRequest('Company and contact name are required.')
  if (!EMAIL.test(input.email)) return badRequest('Enter a valid contact email.')
  if (input.amount == null) return badRequest('Enter the contract amount in naira.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) return badRequest('Enter a start date.')
  if (!Number.isInteger(input.max_brands) || input.max_brands < 1 || input.max_brands > 10) return badRequest('Brand allowance must be 1 to 10.')
  if (!input.brand_name) return badRequest('Give the first brand a name.')

  const { data: existing } = await supabaseAdmin.from('clients').select('id').ilike('email', input.email).maybeSingle()
  if (existing) return badRequest('An account with this email already exists.', 409)

  // 1. Create the user with an invite link (the auth trigger creates the clients row).
  let userId, link
  try {
    ({ userId, link } = await signInLink({ email: input.email, origin: appOrigin(request), isNew: true, data: { company_name: input.company_name } }))
  } catch (e) { return badRequest(e.message, 502) }
  if (!userId) return badRequest('Supabase did not return the new user.', 502)

  const fail = async (msg) => {
    // Undo the half-made account so the email can be used again.
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {})
    return badRequest(msg + ' Nothing was kept; try again.', 500)
  }

  // 2. Client details
  const now = new Date().toISOString()
  const { error: cErr } = await supabaseAdmin.from('clients').upsert({
    id: userId, email: input.email, company_name: input.company_name, contact_name: input.contact_name,
    max_brands: input.max_brands, lifecycle: 'active', provisioned_by: admin.id, provisioned_at: now,
  }, { onConflict: 'id' })
  if (cErr) return fail('Could not save the client: ' + cErr.message)

  // 3. First brand (reuse the default brand if a trigger already made one)
  let { data: brand } = await supabaseAdmin.from('brands').select('id').eq('client_id', userId).eq('is_default', true).maybeSingle()
  if (brand) {
    await supabaseAdmin.from('brands').update({ name: input.brand_name }).eq('id', brand.id)
  } else {
    const { data: made, error: bErr } = await supabaseAdmin.from('brands').insert({ client_id: userId, name: input.brand_name, is_default: true }).select('id').single()
    if (bErr) return fail('Could not create the brand: ' + bErr.message)
    brand = made
  }
  const profile = { client_id: userId, brand_id: brand.id, language: input.language, country: input.country, ...(input.voice_notes ? { company_description: input.voice_notes } : {}) }
  const { data: prof } = await supabaseAdmin.from('brand_profiles').select('brand_id').eq('brand_id', brand.id).maybeSingle()
  const { error: pErr } = prof
    ? await supabaseAdmin.from('brand_profiles').update(profile).eq('brand_id', brand.id)
    : await supabaseAdmin.from('brand_profiles').insert(profile)
  if (pErr) return fail('Could not create the brand profile: ' + pErr.message)

  // 4. Onboarding: the client still connects accounts and sets a schedule.
  await supabaseAdmin.from('onboarding').upsert({ client_id: userId, company_name: input.company_name, timezone: input.timezone, completed: false, step: 1 }, { onConflict: 'client_id' })

  // 5. Contract
  const { error: kErr } = await supabaseAdmin.from('contracts').insert({
    client_id: userId, plan_name: input.plan_name, amount_ngn: input.amount, cycle: input.cycle, start_date: input.start_date,
  })
  if (kErr) return fail('Could not save the contract: ' + kErr.message)

  // 6. Lead conversion
  if (input.lead_id) {
    await supabaseAdmin.from('leads').update({ status: 'won', converted_client_id: userId, updated_at: now }).eq('id', input.lead_id)
    await supabaseAdmin.from('lead_events').insert({ lead_id: input.lead_id, admin_id: admin.id, kind: 'converted', body: `Converted to client ${input.company_name}` })
  }

  await audit('client.create', {
    client_id: userId, lead_id: input.lead_id,
    after: { company_name: input.company_name, email: input.email, plan_name: input.plan_name, amount_ngn: input.amount, cycle: input.cycle, max_brands: input.max_brands, brand: input.brand_name, language: input.language },
    reason: cleanReason(b.reason) || 'New client provisioned',
  })
  return NextResponse.json({ client_id: userId, link, message: `${input.company_name} is set up.` })
}
