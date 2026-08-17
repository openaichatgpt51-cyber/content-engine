'use client'
import { useState } from 'react'

// ── Spinner ──────────────────────────────────────────────────────────────
export function Spinner({ size = 14, light = false, style }) {
  return (
    <span
      style={{
        width: size, height: size, flexShrink: 0,
        border: `2px solid ${light ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'}`,
        borderTopColor: light ? 'white' : 'var(--ink-40)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
        ...style,
      }}
    />
  )
}

// ── Skeleton block ───────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, radius = 6, style }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}

// ── FadeImage ────────────────────────────────────────────────────────────
// Shows a shimmering skeleton while the image loads, fades the image in
// smoothly once it's ready, and — critically — shows a clear, styled
// fallback instead of a browser "broken image" icon if the URL 404s or
// returns something that isn't actually image bytes (e.g. an HTML page).
export function FadeImage({ src, alt = '', height, style, imgStyle, radius, aspectRatio, retryable = true }) {
  const [status, setStatus] = useState('loading') // loading | loaded | error
  const [attempt, setAttempt] = useState(0)

  if (!src) {
    return (
      <div style={{
        width: '100%',
        height: height || undefined,
        aspectRatio: aspectRatio,
        background: 'var(--fog)',
        border: '2px dashed var(--fog-60)',
        borderRadius: radius ?? 'var(--radius)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 6,
        color: 'var(--ink-20)',
        ...style,
      }}>
        <ImageIcon />
        <span style={{ fontSize: '0.72rem' }}>No image attached</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: height || undefined,
      aspectRatio: aspectRatio,
      borderRadius: radius ?? 'var(--radius)',
      overflow: 'hidden',
      background: 'var(--fog-60)',
      ...style,
    }}>
      {status !== 'error' && (
        <img
          key={attempt}
          src={src}
          alt={alt}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`img-fade${status === 'loaded' ? ' loaded' : ''}`}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            position: 'absolute', inset: 0,
            ...imgStyle,
          }}
        />
      )}

      {status === 'loading' && (
        <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
      )}

      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--fog)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
          color: 'var(--ink-20)', padding: 12, textAlign: 'center',
        }}>
          <BrokenImageIcon />
          <span style={{ fontSize: '0.72rem' }}>Image failed to load</span>
          {retryable && (
            <button
              type="button"
              className="press"
              onClick={() => { setStatus('loading'); setAttempt(a => a + 1) }}
              style={{
                fontSize: '0.7rem', fontWeight: 600, color: 'var(--ink-40)',
                background: 'var(--white)', border: '1px solid var(--fog-60)',
                borderRadius: 99, padding: '3px 10px', cursor: 'pointer',
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function BrokenImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M21 15l-5-5-2.5 2.5" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  )
}

// ── Toast ────────────────────────────────────────────────────────────────
// toast: { msg, type } | null. Renders nothing when null.
export function Toast({ toast }) {
  if (!toast) return null
  const isError = toast.type === 'error'
  return (
    <div
      className="toast-in"
      style={{
        position: 'absolute', top: 16, left: '50%',
        background: isError ? '#DC2626' : '#059669',
        color: 'white', padding: '9px 20px', borderRadius: 99,
        fontSize: '0.8125rem', fontWeight: 600, zIndex: 10,
        whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        background: 'rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.68rem', flexShrink: 0,
      }}>
        {isError ? '✕' : '✓'}
      </span>
      {toast.msg}
    </div>
  )
}
