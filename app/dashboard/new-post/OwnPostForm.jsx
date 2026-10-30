'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '../../../components/ui'
import ImageUploadField from '../../../components/ImageUploadField'

// "Write it myself" — no AI. The user supplies the text (and optionally an
// image); the post goes straight to the Review Queue.
const PLATFORMS = [
  { key: 'LinkedIn',  label: 'LinkedIn',    icon: '🔵', limit: 3000 },
  { key: 'Instagram', label: 'Instagram',   icon: '🟣', limit: 2200 },
  { key: 'Twitter',   label: 'X / Twitter', icon: '⬛', limit: 280 },
]

export default function OwnPostForm() {
  const router = useRouter()
  const [enabled, setEnabled] = useState({ LinkedIn: true, Instagram: false, Twitter: false })
  const [texts,   setTexts]   = useState({ LinkedIn: '', Instagram: '', Twitter: '' })
  const [image,   setImage]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const platforms = PLATFORMS.filter(p => enabled[p.key]).map(p => p.key)
    if (!platforms.length) return setError('Select at least one platform')
    for (const p of PLATFORMS) {
      if (!enabled[p.key]) continue
      if (!texts[p.key].trim()) return setError(`Add the text for ${p.label}`)
      if (texts[p.key].length > p.limit) return setError(`${p.label} is over its ${p.limit}-character limit`)
    }
    if (enabled.Instagram && !image) return setError('Instagram posts need an image')

    setLoading(true); setError('')
    try {
      const res = await fetch('/api/create-own-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms, texts, image_url: image?.url || '' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
      router.push(`/dashboard/review?postId=${body.id}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {PLATFORMS.map(p => (
        <div key={p.key} style={{ marginBottom: 16, border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', background: 'var(--white)', opacity: enabled[p.key] ? 1 : 0.5, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: enabled[p.key] ? '1px solid var(--fog-60)' : 'none' }}>
            <input type="checkbox" checked={enabled[p.key]} onChange={() => setEnabled(en => ({ ...en, [p.key]: !en[p.key] }))}
              style={{ width: 18, height: 18, accentColor: 'var(--ink)' }} />
            <span>{p.icon}</span>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{p.label}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-20)', marginLeft: 4 }}>up to {p.limit.toLocaleString()} characters</span>
          </div>
          {enabled[p.key] && (
            <div style={{ padding: '16px 18px' }}>
              <textarea
                value={texts[p.key]}
                onChange={e => setTexts(t => ({ ...t, [p.key]: e.target.value }))}
                placeholder={`Paste or write your ${p.label} post…`}
                rows={p.key === 'LinkedIn' ? 8 : 4}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontFamily: 'var(--font-body)', resize: 'vertical', outline: 'none' }}
              />
              <div style={{ textAlign: 'right', fontSize: '0.75rem', marginTop: 4, color: texts[p.key].length > p.limit ? 'var(--failed)' : 'var(--ink-20)' }}>
                {texts[p.key].length.toLocaleString()} / {p.limit.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      ))}

      <ImageUploadField value={image} onChange={setImage} disabled={loading}
        hint="Optional for LinkedIn and X. Required for Instagram. JPG, PNG, WebP or GIF, up to 5 MB." />

      {error && (
        <div className="animate-in shake-once" style={{ padding: '12px 16px', background: 'var(--failed-bg)', border: '1px solid var(--failed-border)', borderRadius: 'var(--radius-sm)', color: 'var(--failed)', fontSize: '0.875rem', marginBottom: 20 }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} style={{ padding: '12px 28px', background: 'var(--ink)', color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.9375rem', fontWeight: 500, border: 'none', cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        {loading && <Spinner size={16} />}
        {loading ? 'Saving…' : 'Add to review queue'}
      </button>
    </form>
  )
}
