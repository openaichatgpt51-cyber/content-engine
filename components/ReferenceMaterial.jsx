'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useBrand } from './BrandProvider'
import { scopeBrand } from '../lib/brand-scope'

const TABS = [
  { key: 'linkedin',  label: 'LinkedIn',  canImport: false },
  { key: 'instagram', label: 'Instagram', canImport: true  },
  { key: 'twitter',   label: 'X',         canImport: true  },
]
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

// Grabs three still frames from a video in the browser, so the video itself is
// never uploaded or stored. The frames are what the style analysis looks at.
async function captureFrames(file) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.src = url
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error('This video format cannot be read in your browser.')) })
    const dur = video.duration
    if (!isFinite(dur) || dur <= 0) throw new Error('Could not read the video length.')
    const scale = Math.min(1, 768 / (video.videoWidth || 768))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round((video.videoWidth || 768) * scale)
    canvas.height = Math.round((video.videoHeight || 432) * scale)
    const ctx = canvas.getContext('2d')
    const blobs = []
    for (const f of [0.1, 0.5, 0.9]) {
      await new Promise((res, rej) => { video.onseeked = res; video.onerror = () => rej(new Error('Could not read frames from this video.')); video.currentTime = dur * f })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
      if (blob) blobs.push(blob)
    }
    return blobs
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function ReferenceMaterial() {
  const { writeBrandId } = useBrand()
  const [tab, setTab]           = useState('linkedin')
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [link, setLink]         = useState('')
  const [busy, setBusy]         = useState('')       // 'add' | 'upload' | 'import' | 'link' | 'distill'
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')
  const [guide, setGuide]       = useState(null)
  const [guideAt, setGuideAt]   = useState(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: rows, error: e1 }, { data: prof }] = await Promise.all([
      scopeBrand(supabase.from('brand_reference_posts')
        .select('id, platform, source, body, media, source_url, created_at')
        .eq('client_id', user.id), writeBrandId).order('created_at', { ascending: false }).limit(100),
      scopeBrand(supabase.from('brand_profiles').select('style_guide, style_guide_updated_at').eq('client_id', user.id), writeBrandId).maybeSingle(),
    ])
    if (e1) setError("Couldn't load your reference material — " + e1.message)
    setItems(rows || [])
    setGuide(prof?.style_guide || null)
    setGuideAt(prof?.style_guide_updated_at || null)
    setLoading(false)
  }, [writeBrandId])

  useEffect(() => { load() }, [load])

  const tabItems = items.filter(i => i.platform === tab)
  const tabDef = TABS.find(t => t.key === tab)
  const label = tabDef.label

  async function insertRow(row) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Your session has expired — please sign in again.')
    const { error: err } = await supabase.from('brand_reference_posts').insert({
      client_id: user.id, brand_id: writeBrandId, platform: tab, ...row,
    })
    if (err) throw new Error(err.message)
  }

  async function addText() {
    if (!text.trim()) return
    setBusy('add'); setError(''); setNotice('')
    try { await insertRow({ source: 'pasted', body: text.trim().slice(0, 3000) }); setText(''); await load() }
    catch (e) { setError("Couldn't save — " + e.message) }
    setBusy('')
  }

  async function uploadBlob(user, blob, name, type) {
    const ext = EXT_BY_TYPE[type] || 'jpg'
    const path = `${user.id}/ref-${Date.now()}-${name}.${ext}`
    const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { upsert: true, contentType: type })
    if (upErr) throw upErr
    return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy('upload'); setError(''); setNotice('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Your session has expired — please sign in again.')
      const media = []
      for (const [i, f] of files.slice(0, 6).entries()) {
        if (f.type.startsWith('image/')) {
          if (f.size > 8 * 1024 * 1024) throw new Error(`${f.name} is over 8 MB.`)
          media.push({ url: await uploadBlob(user, f, `${i}`, f.type), kind: 'image' })
        } else if (f.type.startsWith('video/')) {
          if (f.size > 300 * 1024 * 1024) throw new Error(`${f.name} is over 300 MB.`)
          const frames = await captureFrames(f)
          for (const [j, b] of frames.entries()) media.push({ url: await uploadBlob(user, b, `v${i}-${j}`, 'image/jpeg'), kind: 'frame' })
        } else {
          throw new Error(`${f.name} is not an image or video.`)
        }
      }
      await insertRow({ source: 'upload', body: text.trim() || null, media })
      setText('')
      setNotice(files.some(f => f.type.startsWith('video/')) ? 'Saved. For videos, three still frames are kept — not the video itself.' : 'Saved.')
      await load()
    } catch (e) { setError("Upload failed — " + e.message) }
    setBusy('')
  }

  async function importPosts() {
    setBusy('import'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/reference/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: tab }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setNotice(body.imported ? `Imported ${body.imported} recent posts.` : (body.message || 'Nothing to import.'))
      await load()
    } catch (e) { setError(e.message) }
    setBusy('')
  }

  async function addLink() {
    if (!link.trim()) return
    setBusy('link'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/reference/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link.trim(), platform: tab }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setLink('')
      setNotice(body.hadText ? 'Saved the caption' + (body.hadImage ? ' and preview image.' : '.') : 'Saved the preview image only — the platform shared no caption.')
      await load()
    } catch (e) { setError(e.message) }
    setBusy('')
  }

  async function remove(id) {
    const { error: err } = await supabase.from('brand_reference_posts').delete().eq('id', id)
    if (err) { setError("Couldn't delete — " + err.message); return }
    setItems(its => its.filter(i => i.id !== id))
  }

  async function distill() {
    setBusy('distill'); setError(''); setNotice('')
    try {
      const res = await fetch('/api/reference/distill', { method: 'POST' })
      const raw = await res.text()
      let body = null; try { body = JSON.parse(raw) } catch {}
      if (!body) throw new Error(`Analysis failed (HTTP ${res.status}${res.status === 504 ? ', timed out' : ''}). Try again.`)
      if (!res.ok) throw new Error(body.error || 'Analysis failed')
      setGuide(body.style_guide); setGuideAt(new Date().toISOString())
      setNotice(`Style guide updated from ${body.usedPosts} posts and ${body.usedImages} images.`)
    } catch (e) { setError(e.message) }
    setBusy('')
  }

  const card = { background: 'var(--white)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-lg)', padding: '22px 24px', marginTop: 28 }
  const btn = (primary) => ({ padding: '8px 16px', fontSize: '0.8125rem', fontWeight: 500, borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: primary ? 'none' : '1px solid var(--fog-60)', background: primary ? 'var(--ink)' : 'var(--fog)', color: primary ? 'white' : 'var(--ink)' })
  const input = { width: '100%', padding: '9px 12px', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', fontFamily: 'var(--font-body)' }

  return (
    <div style={card}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 400, marginBottom: 4 }}>Reference material</h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--ink-20)', lineHeight: 1.5, marginBottom: 16 }}>
        Posts and images that show how this brand really sounds and looks, kept per platform. The more real examples you add, the closer the generated posts get. Press “Build style guide” after adding material.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setError(''); setNotice('') }}
            style={{ ...btn(tab === t.key), padding: '6px 14px' }}>{t.label} ({items.filter(i => i.platform === t.key).length})</button>
        ))}
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        placeholder={`Paste a ${label} post that captures the brand voice…`} style={{ ...input, marginBottom: 8, resize: 'vertical' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={addText} disabled={!!busy || !text.trim()} style={btn(true)}>{busy === 'add' ? 'Saving…' : 'Add post'}</button>
        <label style={{ ...btn(false), display: 'inline-block' }}>
          {busy === 'upload' ? 'Uploading…' : 'Upload images or video'}
          <input type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} disabled={!!busy}
            onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
        </label>
        {tabDef.canImport && (
          <button type="button" onClick={importPosts} disabled={!!busy} style={btn(false)}>
            {busy === 'import' ? 'Importing…' : `Import my recent ${label} posts`}
          </button>
        )}
      </div>

      {tab !== 'linkedin' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
            placeholder="…or paste a public post link (best effort)" style={{ ...input, flex: 1 }} />
          <button type="button" onClick={addLink} disabled={!!busy || !link.trim()} style={btn(false)}>{busy === 'link' ? 'Reading…' : 'Add link'}</button>
        </div>
      )}
      {tab === 'linkedin' && (
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-20)', marginBottom: 14 }}>LinkedIn doesn’t allow posts to be read from a link, so paste the text or upload a screenshot.</p>
      )}

      {error  && <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--failed)', marginBottom: 10, lineHeight: 1.5 }}>{error}</p>}
      {notice && <p style={{ fontSize: '0.8rem', color: 'var(--done)', marginBottom: 10 }}>{notice}</p>}

      {loading ? null : tabItems.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-20)', marginBottom: 14 }}>No {label} examples yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {tabItems.slice(0, 12).map(it => (
            <div key={it.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--fog)', borderRadius: 'var(--radius-sm)', alignItems: 'flex-start' }}>
              {it.media?.[0]?.url && <img src={it.media[0].url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
              <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--ink-40)', lineHeight: 1.45, overflow: 'hidden' }}>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-20)' }}>{it.source}{it.media?.length > 1 ? ` · ${it.media.length} images` : ''}</span>
                <div>{it.body ? (it.body.length > 160 ? it.body.slice(0, 160) + '…' : it.body) : '(image only)'}</div>
              </div>
              <button type="button" onClick={() => remove(it.id)} aria-label="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-20)', fontSize: '1rem' }}>×</button>
            </div>
          ))}
          {tabItems.length > 12 && <p style={{ fontSize: '0.75rem', color: 'var(--ink-20)' }}>Showing the newest 12 of {tabItems.length}.</p>}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--fog-60)', paddingTop: 16 }}>
        <button type="button" onClick={distill} disabled={!!busy} style={btn(true)}>{busy === 'distill' ? 'Analysing…' : 'Build style guide'}</button>
        {guide && (
          <div style={{ marginTop: 14, fontSize: '0.8rem', color: 'var(--ink-40)', lineHeight: 1.55 }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--ink-20)', marginBottom: 6 }}>Last built {guideAt ? new Date(guideAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
            <p style={{ marginBottom: 8 }}><strong>Voice.</strong> {guide.voice}</p>
            {['linkedin', 'instagram', 'twitter'].filter(k => guide.platforms?.[k]).map(k => (
              <p key={k} style={{ marginBottom: 8 }}><strong>{TABS.find(t => t.key === k).label}.</strong> {guide.platforms[k]}</p>
            ))}
            {guide.visual && <p><strong>Visual.</strong> {guide.visual}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
