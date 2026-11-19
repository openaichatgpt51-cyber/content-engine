'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Re-fetches the server-rendered page every `seconds` while the tab is
// visible (and straight away when you come back to the tab), so counts on
// admin pages stay current without a manual reload. Pauses while a dialog is
// open so it never interrupts someone mid-action.
export default function LiveRefresh({ seconds = 20 }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [at, setAt] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (document.querySelector('dialog[open]')) return
      startTransition(() => { router.refresh(); setAt(new Date()) })
    }
    const id = setInterval(refresh, seconds * 1000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [router, seconds])

  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Lagos' })
  return (
    <span className="ops-small ops-muted" aria-live="polite" title={`Refreshes every ${seconds} seconds`}>
      <span aria-hidden="true" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: pending ? '#C9A227' : '#2E9E5B', marginRight: 6, verticalAlign: 'middle' }} />
      Live · updated {time} WAT
    </span>
  )
}
