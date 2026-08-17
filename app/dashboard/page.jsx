'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { FadeImage, Skeleton, Toast } from '../../components/ui'

const PLATFORMS = ['All', 'LinkedIn', 'Instagram', 'X']

const STATUS_CONFIG = {
  PENDING:           { label: 'Pending',    color: 'var(--pending)',  bg: 'var(--pending-bg)',  border: 'var(--pending-border)'  },
  AWAITING_APPROVAL: { label: 'Review',     color: 'var(--approval)', bg: 'var(--approval-bg)', border: 'var(--approval-border)' },
  DONE:              { label: 'Published',  color: 'var(--done)',     bg: 'var(--done-bg)',     border: 'var(--done-border)'     },
  FAILED:            { label: 'Failed',     color: 'var(--failed)',   bg: 'var(--failed-bg)',   border: 'var(--failed-border)'   },
  IN_PROGRESS:       { label: 'Posting…',  color: 'var(--pending)',  bg: 'var(--pending-bg)',  border: 'var(--pending-border)'  },
  HALTED:            { label: 'Paused',     color: 'var(--ink-40)',   bg: 'var(--fog)',         border: 'var(--fog-60)'          },
}

// Generate week grid: 5 weeks shown
function buildCalendarDays(year, month) {
  const firstDay  = new Date(year, month, 1)
  const lastDay   = new Date(year, month + 1, 0)
  const startDow  = firstDay.getDay() // 0=Sun
  const days      = []

  // Padding before
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1)
    days.push({ date: d, current: false })
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true })
  }
  // Padding after (fill to 42 cells)
  let extra = 1
  while (days.length < 42) {
    days.push({ date: new Date(year, month + 1, extra++), current: false })
  }
  return days
}

function platformsForPost(post) {
  const p = []
  if (post.linkedin_scheduled_time) p.push('LinkedIn')
  if (post.instagram_scheduled_time) p.push('Instagram')
  if (post.twitter_scheduled_time) p.push('X')
  return p
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

export default function DashboardPage() {
  const router = useRouter()
  const [posts,      setPosts]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [platform,   setPlatform]   = useState('All')
  const [today]                     = useState(new Date())
  const [viewYear,   setViewYear]   = useState(today.getFullYear())
  const [viewMonth,  setViewMonth]  = useState(today.getMonth())
  const [selected,   setSelected]   = useState(null) // selected post for detail panel
  const [dayList,    setDayList]    = useState(null) // { date, posts } — full list for a clicked day
  const [postingDays, setPostingDays] = useState(null) // e.g. ['Monday','Wednesday','Friday'] — null while loading
  const [dragPost,    setDragPost]    = useState(null) // post currently being dragged
  const [dragOverKey,  setDragOverKey]  = useState(null) // date key of the cell currently under the drag
  const [toast,        setToast]        = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        router.push('/login')
        return
      }

      const [postsRes, onboardingRes] = await Promise.all([
        supabase.from('posts').select('*').eq('client_id', user.id).order('linkedin_scheduled_time', { ascending: true }),
        supabase.from('onboarding').select('posting_days').eq('client_id', user.id).maybeSingle(),
      ])

      if (!postsRes.error) setPosts(postsRes.data || [])
      setPostingDays(onboardingRes.data?.posting_days || null)
      setLoading(false)
    }
    load()
  }, [])

  const calDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth])

  // A day is a valid scheduling target if it's one of the client's chosen
  // posting days (from onboarding) and isn't in the past. If posting_days
  // was never set, every day is treated as available (nothing to grey out).
  function isDayAvailable(date) {
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (date < startOfToday) return false
    if (!postingDays || postingDays.length === 0) return true
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()]
    return postingDays.includes(dayName)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Drag and drop rescheduling ──────────────────────────────────────────
  function handleDragStart(e, post) {
    setDragPost(post)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox requires data to be set for drag to initiate at all
    e.dataTransfer.setData('text/plain', post.id)
  }

  function handleDragEnd() {
    setDragPost(null)
    setDragOverKey(null)
  }

  function handleDragOverDay(e, date, available) {
    e.preventDefault()
    e.dataTransfer.dropEffect = available ? 'move' : 'none'
    const key = date.toDateString()
    if (dragOverKey !== key) setDragOverKey(key)
  }

  async function handleDropOnDay(e, date, available) {
    e.preventDefault()
    setDragOverKey(null)
    const post = dragPost
    setDragPost(null)
    if (!post) return

    if (!available) {
      showToast(
        date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
          ? "Can't schedule into the past"
          : 'Not a posting day — check Settings to change your schedule',
        'error'
      )
      return
    }

    const refDate = new Date(post.linkedin_scheduled_time || post.instagram_scheduled_time || post.twitter_scheduled_time)
    if (sameDay(refDate, date)) return // dropped on the same day it's already on

    const dayDelta = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate())) / 86400000)

    const changes = {}
    for (const field of ['linkedin_scheduled_time', 'instagram_scheduled_time', 'twitter_scheduled_time']) {
      if (post[field]) {
        const d = new Date(post[field])
        d.setDate(d.getDate() + dayDelta)
        changes[field] = d.toISOString()
      }
    }

    // Optimistic update
    setPosts(ps => ps.map(p => p.id === post.id ? { ...p, ...changes } : p))

    const { error } = await supabase.from('posts').update(changes).eq('id', post.id)

    if (error) {
      // Roll back on failure
      setPosts(ps => ps.map(p => p.id === post.id ? post : p))
      showToast('Failed to reschedule — ' + error.message, 'error')
      return
    }

    showToast(`Moved to ${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`)
  }

  // Filter posts by platform
  const filteredPosts = useMemo(() =>
    platform === 'All'
      ? posts
      : posts.filter(p => platformsForPost(p).includes(platform)),
    [posts, platform]
  )

  // Map posts to calendar days
  function postsOnDay(date) {
    return filteredPosts.filter(p => {
      const d = new Date(p.linkedin_scheduled_time || p.instagram_scheduled_time || p.twitter_scheduled_time)
      return sameDay(d, date)
    })
  }

  // Stats
  const stats = useMemo(() => ({
    total:    posts.length,
    pending:  posts.filter(p => p.posting_status === 'PENDING').length,
    review:   posts.filter(p => p.posting_status === 'AWAITING_APPROVAL').length,
    done:     posts.filter(p => p.posting_status === 'DONE').length,
    failed:   posts.filter(p => p.posting_status === 'FAILED').length,
  }), [posts])

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div style={{ padding: '32px 36px', flex: 1, position: 'relative' }}>
      <Toast toast={toast} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 400,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            lineHeight: 1.1,
          }}>
            Content Calendar
          </h1>
          <p style={{ color: 'var(--ink-20)', fontSize: '0.875rem', marginTop: 4 }}>
            {posts.length} posts scheduled · {stats.review} awaiting review
          </p>
        </div>
        <Link href="/dashboard/new-post" className="press hover-lift" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 20px',
          background: 'var(--ink)',
          color: 'var(--white)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
          New Post
        </Link>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Scheduled',  value: stats.pending,  status: 'PENDING' },
          { label: 'In Review',  value: stats.review,   status: 'AWAITING_APPROVAL' },
          { label: 'Published',  value: stats.done,     status: 'DONE' },
          { label: 'Failed',     value: stats.failed,   status: 'FAILED' },
        ].map(({ label, value, status }, i) => {
          const cfg = STATUS_CONFIG[status]
          return (
            <div key={status} className="stagger-item hover-lift" style={{
              '--i': i,
              background: 'var(--white)',
              border: `1px solid var(--fog-60)`,
              borderRadius: 'var(--radius)',
              padding: '18px 20px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 600, color: cfg.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-40)', marginTop: 4, letterSpacing: '0.02em' }}>
                {label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Platform filter + month nav */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        {/* Platform pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {PLATFORMS.map(p => (
            <button key={p} className="press" onClick={() => setPlatform(p)} style={{
              padding: '6px 14px',
              borderRadius: 99,
              fontSize: '0.8125rem',
              fontWeight: platform === p ? 500 : 400,
              background: platform === p ? 'var(--ink)' : 'var(--white)',
              color: platform === p ? 'var(--white)' : 'var(--ink-40)',
              border: `1px solid ${platform === p ? 'var(--ink)' : 'var(--fog-60)'}`,
              transition: 'all 0.15s ease',
              cursor: 'pointer',
            }}>
              {p === 'LinkedIn' ? '🔵' : p === 'Instagram' ? '🟣' : p === 'X' ? '⬛' : ''} {p}
            </button>
          ))}
        </div>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="press hover-lift" onClick={prevMonth} style={{ ...navBtn }}>←</button>
          <span key={monthLabel} className="animate-in" style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--ink)', minWidth: 180, textAlign: 'center', display: 'inline-block' }}>
            {monthLabel}
          </span>
          <button className="press hover-lift" onClick={nextMonth} style={{ ...navBtn }}>→</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'IN_PROGRESS').map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-40)' }}>{cfg.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 12, height: 8, borderRadius: 2, display: 'inline-block',
            backgroundImage: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 2px, transparent 2px, transparent 4px)',
            border: '1px solid var(--fog-60)',
          }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-40)' }}>Not a posting day — drag here is blocked</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div style={{
        background: 'var(--white)',
        border: '1px solid var(--fog-60)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Day of week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--fog-60)' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{
              padding: '10px 0',
              textAlign: 'center',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-20)',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: 35 }).map((_, idx) => (
              <div
                key={idx}
                className="stagger-item"
                style={{
                  '--i': Math.floor(idx / 7),
                  minHeight: 110,
                  padding: '8px 10px',
                  borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--fog-60)' : 'none',
                  borderBottom: idx < 28 ? '1px solid var(--fog-60)' : 'none',
                }}
              >
                <Skeleton width={22} height={22} radius={99} style={{ marginBottom: 8 }} />
                {(idx % 5 === 0) && <Skeleton height={14} radius={4} style={{ marginBottom: 4 }} />}
                {(idx % 7 === 0) && <Skeleton height={14} width="70%" radius={4} />}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {calDays.map(({ date, current }, idx) => {
              const dayPosts   = postsOnDay(date)
              const isToday    = sameDay(date, today)
              const isWeekend  = date.getDay() === 0 || date.getDay() === 6
              const available  = isDayAvailable(date)
              const isDragOver = dragOverKey === date.toDateString()
              const isDropTarget = Boolean(dragPost)

              return (
                <div
                  key={idx}
                  className={`cal-day stagger-item${dayPosts.length ? ' cal-day--clickable' : ''}${!available ? ' cal-day--unavailable' : ''}`}
                  style={{
                    '--i': Math.floor(idx / 7),
                    '--drop-opacity': current ? 1 : 0.35,
                    minHeight: 110,
                    padding: '8px 10px',
                    borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--fog-60)' : 'none',
                    borderBottom: idx < 35 ? '1px solid var(--fog-60)' : 'none',
                    background: isDragOver
                      ? (available ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.08)')
                      : (isWeekend && current ? 'rgba(0,0,0,0.012)' : 'transparent'),
                    outline: isDragOver ? `2px dashed ${available ? 'var(--done)' : 'var(--failed)'}` : 'none',
                    outlineOffset: '-2px',
                    cursor: dayPosts.length ? 'pointer' : 'default',
                    transition: 'background 0.12s ease',
                  }}
                  onClick={() => dayPosts.length && setDayList({ date, posts: dayPosts })}
                  onDragOver={e => isDropTarget && handleDragOverDay(e, date, available)}
                  onDragLeave={() => setDragOverKey(k => k === date.toDateString() ? null : k)}
                  onDrop={e => handleDropOnDay(e, date, available)}
                >
                  {/* Date number */}
                  <div className="cal-day-date" style={{
                    fontSize: '0.78rem',
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--white)' : 'var(--ink-40)',
                    background: isToday ? 'var(--ink)' : 'transparent',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 6,
                  }}>
                    {date.getDate()}
                  </div>

                  {/* Post chips — clicking a chip jumps straight to that post;
                      clicking anywhere else in the cell (including "+N more")
                      opens the full list for the day via the cell's onClick above.
                      Chips are draggable to reschedule (only PENDING/HALTED/
                      AWAITING_APPROVAL posts make sense to move — published/
                      in-flight ones are locked). */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {dayPosts.slice(0, 3).map((post, i) => {
                      const cfg = STATUS_CONFIG[post.posting_status] || STATUS_CONFIG['PENDING']
                      const locked = !['PENDING', 'HALTED', 'AWAITING_APPROVAL'].includes(post.posting_status)
                      return (
                        <div
                          key={post.id || i}
                          className="cal-chip"
                          title={locked ? `${post.topic} — already ${cfg.label.toLowerCase()}, can't be rescheduled` : `${post.topic} (drag to reschedule)`}
                          draggable={!locked}
                          onDragStart={e => { e.stopPropagation(); handleDragStart(e, post) }}
                          onDragEnd={handleDragEnd}
                          onClick={e => { e.stopPropagation(); setSelected(post) }}
                          style={{
                            background: cfg.bg,
                            border: `1px solid ${cfg.border}`,
                            borderLeft: `3px solid ${cfg.color}`,
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: '0.68rem',
                            color: cfg.color,
                            fontWeight: 500,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            cursor: locked ? 'pointer' : 'grab',
                            opacity: dragPost?.id === post.id ? 0.4 : 1,
                          }}
                        >
                          {locked && '🔒 '}{post.topic?.split(' ').slice(0, 4).join(' ')}…
                        </div>
                      )
                    })}
                    {dayPosts.length > 3 && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--ink-20)', paddingLeft: 4, fontWeight: 600 }}>
                        +{dayPosts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Post detail side panel */}
      {selected && (
        <div
          className="animate-in"
          onClick={e => e.target === e.currentTarget && setSelected(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(13,13,15,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div className="slide-in-right" style={{
            width: 400,
            height: '100vh',
            background: 'var(--white)',
            boxShadow: 'var(--shadow-xl)',
            overflowY: 'auto',
            padding: '28px 28px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400 }}>Post Detail</h2>
              <button className="press tap-scale" onClick={() => setSelected(null)} style={{ color: 'var(--ink-20)', fontSize: '1.2rem', cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Status badge */}
            {(() => {
              const cfg = STATUS_CONFIG[selected.posting_status] || STATUS_CONFIG['PENDING']
              return (
                <span style={{
                  display: 'inline-block',
                  background: cfg.bg,
                  color: cfg.color,
                  border: `1px solid ${cfg.border}`,
                  borderRadius: 99,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 10px',
                  marginBottom: 16,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {cfg.label}
                </span>
              )
            })()}

            {/* Topic */}
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>
              {selected.topic}
            </h3>

            {/* Image */}
            {(selected.image_1_url || selected.image_1_view_url) && (
              <div style={{ marginBottom: 16, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--fog-60)' }}>
                <FadeImage src={selected.image_1_url || selected.image_1_view_url} alt="Post image" height={180} />
              </div>
            )}

            {/* LinkedIn body */}
            {selected.linkedin_body_clean && (
              <DetailSection icon="🔵" label="LinkedIn">
                {selected.linkedin_body_clean.substring(0, 300)}…
              </DetailSection>
            )}

            {/* Instagram */}
            {selected.insta_caption_clean && (
              <DetailSection icon="🟣" label="Instagram">
                {selected.insta_caption_clean.substring(0, 200)}…
              </DetailSection>
            )}

            {/* Twitter */}
            {selected.twitter_hook_clean && (
              <DetailSection icon="⬛" label="X / Twitter">
                {selected.twitter_hook_clean}
              </DetailSection>
            )}

            {/* Scheduled times */}
            <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--fog)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-20)', marginBottom: 8 }}>
                Scheduled Times
              </div>
              {[
                ['🔵 LinkedIn',  selected.linkedin_scheduled_time],
                ['🟣 Instagram', selected.instagram_scheduled_time],
                ['⬛ X',         selected.twitter_scheduled_time],
              ].filter(([,t]) => t).map(([label, time]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--ink-40)' }}>{label}</span>
                  <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Link href={`/dashboard/review?postId=${selected.id}`} className="press hover-lift" style={{
                flex: 1,
                padding: '10px 0',
                textAlign: 'center',
                background: 'var(--ink)',
                color: 'var(--white)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}>
                Open in Review
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Day list — full list of posts for a day with 4+ items ────────── */}
      {dayList && (
        <div
          className="animate-in"
          onClick={e => e.target === e.currentTarget && setDayList(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(13,13,15,0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 250,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div className="scale-in" style={{
            width: '100%', maxWidth: 420, maxHeight: '70vh',
            background: 'var(--white)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--fog-60)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400 }}>
                {dayList.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <button className="press tap-scale" onClick={() => setDayList(null)} style={{ color: 'var(--ink-20)', fontSize: '1.1rem', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 12px' }}>
              {dayList.posts.map((post, i) => {
                const cfg = STATUS_CONFIG[post.posting_status] || STATUS_CONFIG['PENDING']
                return (
                  <div
                    key={post.id || i}
                    className="stagger-item hover-lift press"
                    style={{ '--i': i, padding: '12px 14px', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => { setSelected(post); setDayList(null) }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.topic}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ink-20)' }}>{cfg.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailSection({ icon, label, children }) {
  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--fog)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--ink-40)', lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, color: 'var(--ink-60)', marginBottom: 4, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon} {label}
      </div>
      {children}
    </div>
  )
}

const navBtn = {
  width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--white)',
  border: '1px solid var(--fog-60)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.9rem',
  color: 'var(--ink-40)',
  cursor: 'pointer',
  transition: 'all 0.15s',
}
