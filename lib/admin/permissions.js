// Admin roles and what each may do. Owner = super admin, Support = sub admin.
// Pure module (no server imports) so it can be unit-tested and used by both
// server routes and client components. The server is the real gate: every
// admin route calls requireAdminApi(action), which checks this table.

export const ROLES = ['owner', 'support']

export const ROLE_LABEL = {
  owner: 'Super admin (Owner)',
  support: 'Sub admin (Support)',
}

const BOTH = ['owner', 'support']
const OWNER = ['owner']

export const PERMISSIONS = {
  'admin.view':          BOTH,  // open the panel, Today, Clients, Posts, Leads, Analytics (non-business), Audit
  'posts.retry':         BOTH,
  'posts.reschedule':    BOTH,
  'posts.to_review':     BOTH,
  'posts.bulk':          OWNER,
  'clients.pause':       BOTH,  // pause / resume posting
  'clients.status':      BOTH,  // enable / disable an account
  'clients.create':      OWNER, // provision a new client
  'clients.edit':        OWNER, // company, contact, brand allowance
  'clients.usage':       OWNER, // switch monthly usage metering on/off, set the cap
  'clients.brands':      OWNER, // add / rename brands
  'clients.invite':      OWNER, // resend invite link
  'clients.offboard':    OWNER,
  'leads.edit':          BOTH,  // status, notes, assignee, add by hand
  'inbox.work':          BOTH,  // hello@ emails: mark handled / spam, turn into a lead
  'leads.convert':       OWNER, // turns a lead into a client + contract
  'money.view':          OWNER, // any naira amount, MRR, invoices, contracts
  'billing.edit':        OWNER, // contracts and invoices
  'analytics.business':  OWNER,
  'admins.manage':       OWNER,
}

export function can(role, action) {
  const allowed = PERMISSIONS[action]
  if (!allowed) return false            // unknown actions are denied
  return allowed.includes(role)
}

export function isRole(value) {
  return ROLES.includes(value)
}
