'use client'
import { useState } from 'react'
import ActionDialog from './ActionDialog'
import CopyField from './CopyField'

export default function AddAdminButton() {
  const [link, setLink] = useState('')
  return (
    <div className="ad-stack" style={{ alignItems: 'flex-end' }}>
      <ActionDialog endpoint="/api/admin/admins" label="+ Add admin" variant="primary"
        description="Promote someone who already has an account, or invite a new person by email."
        fields={[
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'full_name', label: 'Name' },
          { name: 'role', label: 'Role', type: 'select', defaultValue: 'support', options: [{ value: 'support', label: 'Support (sub admin)' }, { value: 'owner', label: 'Owner (super admin)' }] },
        ]}
        onDone={(d) => setLink(d.link || '')} successMessage="Admin added." />
      {link && <div className="ad-card" style={{ width: 'min(560px, 100%)' }}><CopyField label="Sign-in link for the new admin (single use, 24 hours)" value={link} /></div>}
    </div>
  )
}
