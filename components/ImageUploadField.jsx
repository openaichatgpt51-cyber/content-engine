'use client'
import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Uploads one image to the user's folder in the public post-images bucket and
// reports { url, name } back. Used on the New Post page for "use my own image".
const MAX_BYTES = 5 * 1024 * 1024 // LinkedIn rejects larger images
const ALLOWED   = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function ImageUploadField({ value, onChange, disabled = false, label = 'Your own image (optional)', hint }) {
  const inputRef = useRef(null)
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file) {
    if (!file) return
    setError('')
    if (!ALLOWED.includes(file.type)) return setError('Use a JPG, PNG, WebP or GIF image')
    if (file.size > MAX_BYTES)        return setError('Image is over 5 MB — please use a smaller file')

    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be logged in')
      const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${user.id}/upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('post-images').getPublicUrl(path)
      onChange({ url: pub.publicUrl, name: file.name })
    } catch (err) {
      setError('Upload failed — ' + (err.message || 'please try again'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-40)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </label>

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', background: 'var(--white)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: 'var(--ink-40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value.name}
          </div>
          <button type="button" onClick={() => onChange(null)} disabled={disabled}
            style={{ padding: '6px 12px', fontSize: '0.8125rem', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', background: 'var(--white)', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || busy}
          style={{ padding: '10px 16px', fontSize: '0.8125rem', fontWeight: 500, border: '1.5px dashed var(--fog-60)', borderRadius: 'var(--radius-sm)', background: 'var(--white)', cursor: busy ? 'default' : 'pointer', color: 'var(--ink-40)' }}>
          {busy ? 'Uploading…' : '📤 Upload an image'}
        </button>
      )}

      <input ref={inputRef} type="file" accept={ALLOWED.join(',')} style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])} />

      {hint && !error && <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--ink-20)' }}>{hint}</div>}
      {error && <div style={{ marginTop: 6, fontSize: '0.8125rem', color: 'var(--failed)' }}>{error}</div>}
    </div>
  )
}
