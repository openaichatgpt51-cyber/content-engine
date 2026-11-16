'use client'
import { useRef, useState } from 'react'
import CopyField from './CopyField'

// Creates a fresh sign-in link for a client and shows it to copy (for
// WhatsApp, or email until custom SMTP is set up).
export default function InviteLinkButton({ clientId, contactName }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')

  async function create() {
    setBusy(true); setError(''); setLink('')
    ref.current?.showModal()
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not create a link.')
      setLink(data.link)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const message = link ? `Hi ${contactName || 'there'}, here is your ContentEngine sign-in link: ${link} — it works once and expires in 24 hours.` : ''
  return (
    <>
      <button type="button" className="ad-btn" onClick={create}>New sign-in link</button>
      <dialog ref={ref} className="ad-dialog" aria-labelledby={`inv-${clientId}`}>
        <div className="ad-form">
          <h2 id={`inv-${clientId}`}>Sign-in link</h2>
          {busy && <p role="status" className="ad-muted">Creating link…</p>}
          {error && <div role="alert" className="ad-error">{error}</div>}
          {link && <>
            <CopyField label="Link (single use, expires in 24 hours)" value={link} />
            <CopyField label="Message to send" value={message} multiline />
          </>}
          <div className="ad-row" style={{ justifyContent: 'flex-end' }}><button type="button" className="ad-btn" onClick={() => ref.current?.close()}>Close</button></div>
        </div>
      </dialog>
    </>
  )
}
