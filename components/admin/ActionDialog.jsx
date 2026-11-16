'use client'
import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// One accessible pattern for every admin write: a button opens a native
// <dialog> (focus trap, Escape to close, role="dialog" for free) that asks
// for any inputs, a reason (saved to the audit log) and, for destructive
// actions, a typed confirmation. On success the page data is refreshed.
//
// fields: [{ name, label, type: 'text'|'textarea'|'number'|'datetime-local'|'date'|'select'|'email',
//            options?: [{value,label}], required?, defaultValue?, hint?, min?, max? }]
export default function ActionDialog({
  endpoint, method = 'POST', body = {}, label, title, description, points = [],
  fields = [], requireReason = true, confirmText = null, confirmLabel,
  variant = '', size = '', successMessage = 'Done.', onDone, disabled = false, disabledReason,
}) {
  const ref = useRef(null)
  const router = useRouter()
  const uid = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function open() { setError(''); ref.current?.showModal() }
  function close() { ref.current?.close() }

  async function submit(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const values = {}
    for (const f of fields) {
      const v = form.get(f.name)
      values[f.name] = f.type === 'number' ? (v === '' ? null : Number(v)) : v
    }
    if (confirmText && String(form.get('__confirm') || '').trim() !== confirmText) {
      setError(`Type ${confirmText} exactly to confirm.`)
      return
    }
    setBusy(true); setError('')
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ...values, reason: form.get('__reason') || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'That didn’t work. Nothing was changed.')
      close()
      setNotice(data.message || successMessage)
      onDone?.(data)
      router.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const cls = `ops-btn ${variant} ${size}`.trim()
  return (
    <>
      <button type="button" className={cls} onClick={open} disabled={disabled} title={disabled ? disabledReason : undefined}>
        {label}
      </button>
      {notice && <span role="status" className="ops-small ops-text-good">{notice}</span>}
      <dialog ref={ref} className="ops-dialog" aria-labelledby={`${uid}-t`}>
        <form method="dialog" onSubmit={submit} className="ops-form">
          <h2 id={`${uid}-t`}>{title || label}</h2>
          {description && <p className="ops-sub" style={{ margin: 0 }}>{description}</p>}
          {points.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
              {points.map(p => <li key={p}>{p}</li>)}
            </ul>
          )}
          {fields.map(f => (
            <label key={f.name} className="ops-field">
              {f.label}
              {f.type === 'textarea' ? (
                <textarea name={f.name} className="ops-textarea" rows={3} required={f.required} defaultValue={f.defaultValue} />
              ) : f.type === 'select' ? (
                <select name={f.name} className="ops-select" required={f.required} defaultValue={f.defaultValue}>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input name={f.name} type={f.type || 'text'} className="ops-input" required={f.required}
                  defaultValue={f.defaultValue} min={f.min} max={f.max} />
              )}
              {f.hint && <span className="ops-hint">{f.hint}</span>}
            </label>
          ))}
          {requireReason && (
            <label className="ops-field">
              Reason (saved to the audit log)
              <textarea name="__reason" className="ops-textarea" rows={2} required minLength={3} maxLength={500} />
            </label>
          )}
          {confirmText && (
            <label className="ops-field">
              Type <code style={{ background: '#F2F1EE', padding: '0 4px', borderRadius: 4 }}>{confirmText}</code> to confirm
              <input name="__confirm" className="ops-input" autoComplete="off" required />
            </label>
          )}
          {error && <div role="alert" className="ops-error">{error}</div>}
          <div className="ops-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ops-btn" onClick={close}>Cancel</button>
            <button type="submit" className={`ops-btn ${variant.includes('danger') ? 'danger-solid' : 'primary'}`} disabled={busy}>
              {busy ? 'Working…' : (confirmLabel || label)}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
