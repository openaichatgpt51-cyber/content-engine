'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { Spinner, FadeImage, Toast, Skeleton } from '../../../components/ui'

const TABS = [
  { key: 'linkedin',  label: '🔵 LinkedIn',    field: 'linkedin_body_clean',  scheduledField: 'linkedin_scheduled_time',  charLimit: 1200 },
  { key: 'instagram', label: '🟣 Instagram',   field: 'insta_caption_clean',  scheduledField: 'instagram_scheduled_time', charLimit: 2200 },
  { key: 'twitter',   label: '⬛ X / Twitter',  field: 'twitter_hook_clean',   scheduledField: 'twitter_scheduled_time',   charLimit: 280  },
]

export default function ReviewPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const targetPostId = searchParams.get('postId')

  const [posts,     setPosts]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [accounts,  setAccounts]  = useState({}) // { linkedin: {...}, twitter: {...} }
  const [postingPaused, setPostingPaused] = useState(false)
  const scrolledRef = useRef(false)

  useEffect(() => { loadPosts(); loadAccounts(); loadPauseState() }, [])

  // Deep-link support: when arriving with ?postId=..., scroll to and
  // highlight that specific card once the list has rendered.
  useEffect(() => {
    if (!targetPostId || loading || scrolledRef.current) return
    const el = document.querySelector(`[data-post-id="${targetPostId}"]`)
    if (el) {
      scrolledRef.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [targetPostId, loading, posts])

  async function loadAccounts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('platform_accounts')
      .select('platform, account_id')
      .eq('client_id', user.id)
    const map = {}
    for (const a of data || []) map[a.platform] = a.account_id
    setAccounts(map)
  }

  async function loadPauseState() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('account_settings')
      .select('posting_paused')
      .eq('client_id', user.id)
      .maybeSingle()
    setPostingPaused(Boolean(data?.posting_paused))
  }

  async function loadPosts() {
  setLoading(true)

  // Require a session — do NOT fall back to an unfiltered query. Without this,
  // an unauthenticated visitor would see every client's review queue.
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user

  if (!user) {
    setLoading(false)
    router.push('/login')
    return
  }

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('client_id', user.id)
    .eq('posting_status', 'AWAITING_APPROVAL')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading posts:', error.message)
  } else {
    setPosts(data || [])
  }

  setLoading(false)
}

  function updateLocalPost(postId, changes) {
    setPosts(p => p.map(pp => pp.id === postId ? { ...pp, ...changes } : pp))
  }

  function removePost(postId) {
    setPosts(p => p.filter(pp => pp.id !== postId))
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div style={{ padding: '32px 36px', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1.1 }}>
            Review Queue
          </h1>
          <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginTop: 4 }}>
            {posts.length} post{posts.length !== 1 ? 's' : ''} awaiting your approval
          </p>
        </div>
        <Link href="/dashboard/new-post" className="press hover-lift" style={{ padding: '10px 18px', background: 'var(--ink)', color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none' }}>
          + New Post
        </Link>
      </div>

      {postingPaused && (
        <div className="animate-in" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', marginBottom: 24,
          background: 'var(--failed-bg)', border: '1px solid var(--failed-border)',
          borderRadius: 'var(--radius)', fontSize: '0.85rem', color: 'var(--failed)',
        }}>
          🛑 Posting is paused. Approvals below will be held, not published, until you resume in{' '}
          <Link href="/dashboard/settings" style={{ fontWeight: 600, textDecoration: 'underline' }}>Settings</Link>.
        </div>
      )}

      {posts.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              index={i}
              accounts={accounts}
              postingPaused={postingPaused}
              highlighted={post.id === targetPostId}
              onUpdate={changes => updateLocalPost(post.id, changes)}
              onRemove={() => removePost(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Post Card ─────────────────────────────────────────────────────────────
function PostCard({ post, index = 0, accounts = {}, postingPaused = false, highlighted = false, onUpdate, onRemove }) {
  const [tab,          setTab]          = useState('linkedin')
  const [editing,      setEditing]      = useState(false)
  const [draftText,    setDraftText]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [localPost,    setLocalPost]    = useState(post)
  const [showReject,   setShowReject]   = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [toast,        setToast]        = useState(null)
  const [leaving,       setLeaving]     = useState(false)

  const cfg         = TABS.find(t => t.key === tab)
  const currentText = localPost[cfg.field] || ''
  const charCount   = editing ? draftText.length : currentText.length
  // image_1_view_url points at a Google Drive *webpage* (drive.google.com/file/d/.../view),
  // not raw image bytes — it can never render inside an <img> tag. image_1_url is the
  // actual embeddable image (lh3.googleusercontent.com), so it must take priority.
  const imageUrl    = localPost.image_1_url || localPost.image_1_view_url

  function showMsg(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────
  async function handleApprove() {
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      showMsg('You must be logged in to approve posts', 'error')
      setSaving(false)
      return
    }

    const nextStatus = postingPaused ? 'HALTED' : 'PENDING'

    const { data, error } = await supabase
      .from('posts')
      .update({ posting_status: nextStatus })
      .eq('id', localPost.id)
      .select()

    if (error) {
      showMsg('Failed to approve — ' + error.message, 'error')
      setSaving(false)
      return
    }

    if (!data || data.length === 0) {
      showMsg('RLS Error: Your user account does not have permission to edit this post', 'error')
      setSaving(false)
      return
    }

    showMsg(postingPaused ? 'Approved — held until you resume posting' : 'Post approved and scheduled')
    setLeaving(true)
    setTimeout(() => onRemove(), 1200)
    setSaving(false)
  }

  // ── REJECT ───────────────────────────────────────────────────────────────
  async function handleReject() {
    setSaving(true)
    const { error } = await supabase
      .from('posts')
      .update({
        posting_status: 'REJECTED',
        reject_reason:  rejectReason || null,
      })
      .eq('id', localPost.id)

    if (error) {
      showMsg('Failed to reject — ' + error.message, 'error')
      setSaving(false)
      return
    }
    setShowReject(false)
    showMsg('Post rejected')
    setLeaving(true)
    setTimeout(() => onRemove(), 1200)
    setSaving(false)
  }

  // ── EDIT + SAVE ───────────────────────────────────────────────────────────
  function startEdit() {
    setDraftText(currentText)
    setEditing(true)
  }

  function cancelEdit() {
    setDraftText('')
    setEditing(false)
  }

  async function saveEdit() {
    if (draftText === currentText) { cancelEdit(); return }
    setSaving(true)
    const changes = {
      [cfg.field]:    draftText,
      posting_status: postingPaused ? 'HALTED' : 'PENDING',    // save + approve in one step
    }
    const { error } = await supabase
      .from('posts')
      .update(changes)
      .eq('id', localPost.id)

    if (error) {
      showMsg('Failed to save — ' + error.message, 'error')
      setSaving(false)
      return
    }
    const updated = { ...localPost, ...changes }
    setLocalPost(updated)
    onUpdate(changes)
    setEditing(false)
    showMsg(postingPaused ? 'Saved — held until you resume posting' : 'Saved and approved')
    setLeaving(true)
    setTimeout(() => onRemove(), 1200)
    setSaving(false)
  }

  // ── RESCHEDULE ────────────────────────────────────────────────────────────
  async function reschedule(field, value) {
    const iso = new Date(value).toISOString()
    const { error } = await supabase
      .from('posts')
      .update({ [field]: iso })
      .eq('id', localPost.id)
    if (!error) {
      const updated = { ...localPost, [field]: iso }
      setLocalPost(updated)
      onUpdate({ [field]: iso })
    }
  }

  // ── IMAGE UPDATE ──────────────────────────────────────────────────────────
  function handleImageUpdated(changes) {
    setLocalPost(p => ({ ...p, ...changes }))
    onUpdate(changes)
  }

  return (
    <>
      <div
        data-post-id={post.id}
        className={`stagger-item${highlighted ? ' highlight-ring' : ''}`}
        style={{
          '--i': index,
          background: 'var(--white)',
          border: '1px solid var(--fog-60)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
          position: 'relative',
          transition: 'opacity 0.4s var(--ease-in-out), transform 0.4s var(--ease-in-out), max-height 0.4s var(--ease-in-out) 0.15s, margin 0.4s var(--ease-in-out) 0.15s',
          opacity: leaving ? 0 : undefined,
          transform: leaving ? 'scale(0.97) translateY(-4px)' : undefined,
          pointerEvents: leaving ? 'none' : undefined,
        }}
      >
        {/* Toast */}
        <Toast toast={toast} />

        {/* Card header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--fog-60)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16,
          background: 'var(--fog)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 2, lineHeight: 1.3 }}>
              {localPost.topic}
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-20)' }}>
              Generated {new Date(localPost.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {localPost.tone && <span style={{ marginLeft: 8, background: 'var(--fog-60)', padding: '1px 7px', borderRadius: 99, fontSize: '0.68rem', color: 'var(--ink-40)', fontWeight: 500 }}>{localPost.tone}</span>}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="press"
              onClick={() => setShowReject(true)}
              disabled={saving}
              style={{ ...btn, background: 'var(--failed-bg)', color: 'var(--failed)', border: '1px solid var(--failed-border)' }}
            >
              ✕ Reject
            </button>
            <button
              className="press"
              onClick={handleApprove}
              disabled={saving}
              style={{ ...btn, background: 'var(--done)', color: 'white', border: 'none' }}
            >
              {saving ? <Spinner light /> : '✓ Approve'}
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

          {/* LEFT — image + editor */}
          <div style={{ padding: '20px 20px 20px 24px', borderRight: '1px solid var(--fog-60)' }}>
            {/* Image display */}
            <div style={{ marginBottom: 16, border: (localPost.image_1_url || localPost.image_1_view_url) ? '1px solid var(--fog-60)' : 'none', borderRadius: 'var(--radius)' }}>
              <FadeImage
                src={localPost.image_1_url || localPost.image_1_view_url}
                alt="Post image"
                height={180}
                radius="var(--radius)"
              />
            </div>

            {/* Platform tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--fog-60)', marginBottom: 14 }}>
              {TABS.map(t => (
                <button key={t.key}
                  onClick={() => { setTab(t.key); setEditing(false) }}
                  style={{
                    padding: '8px 12px', fontSize: '0.78rem',
                    fontWeight: tab === t.key ? 600 : 400,
                    color: tab === t.key ? 'var(--ink)' : 'var(--ink-20)',
                    borderBottom: tab === t.key ? '2px solid var(--ink)' : '2px solid transparent',
                    cursor: 'pointer', background: 'none', border: 'none',
                    borderBottomWidth: 2, borderBottomStyle: 'solid',
                    fontFamily: 'var(--font-body)', marginBottom: -1,
                    transition: 'color 0.18s ease, border-color 0.18s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Scheduled time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--ink-20)', flexShrink: 0 }}>⏰</span>
              <input
                type="datetime-local"
                defaultValue={localPost[cfg.scheduledField]
                  ? new Date(localPost[cfg.scheduledField]).toISOString().slice(0, 16)
                  : ''}
                onChange={e => reschedule(cfg.scheduledField, e.target.value)}
                style={{
                  fontSize: '0.78rem', padding: '4px 8px',
                  border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)', background: 'var(--fog)', outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            {/* Text editor */}
            {editing ? (
              <div>
                <textarea
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  rows={9}
                  style={{
                    width: '100%', padding: '12px 14px',
                    border: '1.5px solid var(--ink-40)',
                    borderRadius: 'var(--radius)', fontSize: '0.875rem',
                    color: 'var(--ink)', lineHeight: 1.7,
                    resize: 'vertical', outline: 'none',
                    background: 'var(--white)', fontFamily: 'var(--font-body)',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{
                    fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums',
                    color: charCount > cfg.charLimit * 0.9 ? 'var(--failed)' : 'var(--ink-20)',
                  }}>
                    {charCount} / {cfg.charLimit}
                    {charCount > cfg.charLimit && ' — over limit!'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="press" onClick={cancelEdit} style={{ ...btn, background: 'var(--fog)', color: 'var(--ink-40)', border: '1px solid var(--fog-60)', fontSize: '0.78rem', padding: '5px 12px' }}>
                      Cancel
                    </button>
                    <button className="press" onClick={saveEdit} disabled={saving || charCount > cfg.charLimit} style={{ ...btn, background: charCount > cfg.charLimit ? 'var(--fog-60)' : 'var(--done)', color: charCount > cfg.charLimit ? 'var(--ink-20)' : 'white', border: 'none', fontSize: '0.78rem', padding: '5px 12px' }}>
                      {saving ? <Spinner light /> : 'Save & Approve'}
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--ink-20)', marginTop: 6 }}>
                  Saving will approve this post for scheduling.
                </p>
              </div>
            ) : (
              <div>
                <div style={{
                  fontSize: '0.875rem', color: 'var(--ink-60)', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'hidden',
                  maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)',
                  marginBottom: 10,
                }}>
                  {currentText || <span style={{ color: 'var(--ink-20)', fontStyle: 'italic' }}>No content for this platform</span>}
                </div>
                {currentText && (
                  <button className="press hover-lift" onClick={startEdit} style={{
                    fontSize: '0.78rem', color: 'var(--ink-40)',
                    display: 'flex', alignItems: 'center', gap: 5,
                    cursor: 'pointer', padding: '5px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--fog-60)',
                    background: 'var(--fog)', fontFamily: 'var(--font-body)',
                  }}>
                    ✏️ Edit {tab === 'linkedin' ? 'LinkedIn' : tab === 'instagram' ? 'Instagram' : 'X'} copy
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — platform preview */}
          <div style={{ padding: '20px 24px 20px 20px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ink-40)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Preview
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 560 }}>
              {tab === 'linkedin'  && <LinkedInPreview  text={editing ? draftText : currentText} imageUrl={imageUrl} handle={accounts.linkedin} />}
              {tab === 'instagram' && <InstagramPreview caption={editing ? draftText : currentText} imageUrl={imageUrl} handle={accounts.instagram} />}
              {tab === 'twitter'   && <XPreview         text={editing ? draftText : currentText} imageUrl={imageUrl} handle={accounts.twitter} />}
            </div>

            {tab === 'twitter' && (
              <div style={{
                marginTop: 10, padding: '7px 12px',
                background: charCount > 280 ? 'var(--failed-bg)' : charCount > 250 ? 'var(--approval-bg)' : 'var(--fog)',
                border: `1px solid ${charCount > 280 ? 'var(--failed-border)' : charCount > 250 ? 'var(--approval-border)' : 'var(--fog-60)'}`,
                borderRadius: 'var(--radius-sm)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--ink-40)' }}>X character limit</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: charCount > 280 ? 'var(--failed)' : charCount > 250 ? 'var(--approval)' : 'var(--done)' }}>
                  {charCount} / 280
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Reject modal ─────────────────────────────────────────────────── */}
      {showReject && (
        <div
          className="animate-in"
          onClick={e => e.target === e.currentTarget && setShowReject(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div className="scale-in" style={{
            background: 'var(--white)', borderRadius: 'var(--radius-lg)',
            padding: '32px 36px', width: '100%', maxWidth: 420,
            boxShadow: 'var(--shadow-xl)',
          }}>
            <div style={{ fontSize: '1.75rem', textAlign: 'center', marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, textAlign: 'center', marginBottom: 6 }}>
              Reject this post?
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink-40)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
              It will be moved out of the queue. Add an optional reason to help improve future generation.
            </p>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-40)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Reason (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Tone too casual, topic not relevant this week…"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1.5px solid var(--fog-60)', borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem', color: 'var(--ink)', resize: 'none',
                outline: 'none', fontFamily: 'var(--font-body)', lineHeight: 1.6,
                marginBottom: 18,
              }}
              onFocus={e => e.target.style.borderColor = 'var(--ink-40)'}
              onBlur={e  => e.target.style.borderColor = 'var(--fog-60)'}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="press"
                onClick={() => { setShowReject(false); setRejectReason('') }}
                style={{ flex: 1, ...btn, background: 'var(--fog)', color: 'var(--ink-40)', border: '1px solid var(--fog-60)', justifyContent: 'center' }}
              >
                Cancel
              </button>
              <button
                className="press"
                onClick={handleReject}
                disabled={saving}
                style={{ flex: 1, ...btn, background: 'var(--failed)', color: 'white', border: 'none', justifyContent: 'center' }}
              >
                {saving ? <Spinner light /> : 'Reject Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="pop-in" style={{ textAlign: 'center', padding: '80px 40px', background: 'var(--white)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--fog-60)' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 400, marginBottom: 8 }}>Queue is clear</h2>
      <p style={{ color: 'var(--ink-20)', fontSize: '0.9rem', marginBottom: 24 }}>No posts awaiting approval.</p>
      <Link href="/dashboard/new-post" className="press hover-lift" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: 'var(--ink)', color: 'var(--white)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'none' }}>
        + Generate New Post
      </Link>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <Skeleton height={36} width={200} radius={6} style={{ marginBottom: 8 }} />
      <Skeleton height={16} width={140} radius={6} style={{ marginBottom: 32 }} />
      {[0, 1].map(i => (
        <div key={i} className="stagger-item" style={{ '--i': i, height: 480, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--fog-60)', marginBottom: 24 }}>
          <Skeleton height="100%" radius={0} />
        </div>
      ))}
    </div>
  )
}

const btn = {
  padding: '8px 16px', borderRadius: 'var(--radius-sm)',
  fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--font-body)', display: 'flex',
  alignItems: 'center', gap: 6,
}

// ── Platform Preview Helpers ────────────────────────────────────────────────
function LinkedInPreview({ text, imageUrl }) {
  return (
    <div style={{ border: '1px solid var(--fog-60)', borderRadius: 8, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0a66c2', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 'bold' }}>LI</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Your Name</div>
          <div style={{ fontSize: '0.75rem', color: 'gray' }}>Your Title • Just now</div>
        </div>
      </div>
      <p style={{ fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{text || 'Your post text here...'}</p>
      {imageUrl && <FadeImage src={imageUrl} alt="Preview" height={220} radius={6} retryable={false} />}
    </div>
  )
}

function InstagramPreview({ caption, imageUrl }) {
  return (
    <div style={{ border: '1px solid var(--fog-60)', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: 12, fontWeight: 600, fontSize: '0.875rem', borderBottom: '1px solid var(--fog-60)' }}>Instagram Preview</div>
      <FadeImage src={imageUrl} alt="Preview" aspectRatio="1/1" radius={0} retryable={false} />
      <div style={{ padding: 12 }}>
        <p style={{ fontSize: '0.8125rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{caption || 'Your caption here...'}</p>
      </div>
    </div>
  )
}

function XPreview({ text, imageUrl, handle }) {
  return (
    <div style={{ border: '1px solid var(--fog-60)', borderRadius: 8, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#000', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 'bold' }}>X</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>
            {handle ? (
              <span style={{ color: 'gray', fontWeight: 400 }}>@{handle}</span>
            ) : (
              <span style={{ color: 'var(--ink-20)', fontWeight: 400, fontStyle: 'italic' }}>No X account connected — connect in Settings</span>
            )}
          </div>
        </div>
      </div>
      <p style={{ fontSize: '0.875rem', lineHeight: 1.4, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{text || 'What is happening?!'}</p>
      {imageUrl && <FadeImage src={imageUrl} alt="Preview" height={220} radius={8} retryable={false} />}
    </div>
  )
}