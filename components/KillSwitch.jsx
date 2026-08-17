'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner, Skeleton } from './ui'

export default function KillSwitch() {
  const [paused,   setPaused]   = useState(false)
  const [pausedAt, setPausedAt] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [working,  setWorking]  = useState(false)
  const [confirm,  setConfirm]  = useState(false) // showing the pause confirmation
  const [result,   setResult]   = useState(null)  // last action's outcome summary

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('account_settings')
      .select('posting_paused, paused_at')
      .eq('client_id', user.id)
      .maybeSingle()
    setPaused(Boolean(data?.posting_paused))
    setPausedAt(data?.paused_at || null)
    setLoading(false)
  }

  async function doPause() {
    setWorking(true)
    setConfirm(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWorking(false); return }

    // Count what's still recallable (PENDING — hasn't started processing)
    // vs. what's already out of our hands (IN_PROGRESS — n8n is actively
    // publishing it right now and there's no cancel endpoint on either
    // platform's API once that call has been made).
    const { count: recallable } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .eq('posting_status', 'PENDING')

    const { count: inFlight } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .eq('posting_status', 'IN_PROGRESS')

    // Pull every recallable post out of the queue n8n polls
    await supabase
      .from('posts')
      .update({ posting_status: 'HALTED' })
      .eq('client_id', user.id)
      .eq('posting_status', 'PENDING')

    await supabase
      .from('account_settings')
      .upsert({
        client_id:      user.id,
        posting_paused: true,
        paused_at:      new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'client_id' })

    setPaused(true)
    setPausedAt(new Date().toISOString())
    setResult({ type: 'paused', recalled: recallable || 0, inFlight: inFlight || 0 })
    setWorking(false)
  }

  async function doResume() {
    setWorking(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWorking(false); return }

    const { count: requeued } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .eq('posting_status', 'HALTED')

    await supabase
      .from('posts')
      .update({ posting_status: 'PENDING' })
      .eq('client_id', user.id)
      .eq('posting_status', 'HALTED')

    await supabase
      .from('account_settings')
      .upsert({
        client_id:      user.id,
        posting_paused: false,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'client_id' })

    setPaused(false)
    setPausedAt(null)
    setResult({ type: 'resumed', requeued: requeued || 0 })
    setWorking(false)
  }

  if (loading) return <Skeleton height={110} radius="var(--radius-lg)" />

  return (
    <div className="animate-in" style={{
      background: paused ? 'var(--failed-bg)' : 'var(--white)',
      border: `1px solid ${paused ? 'var(--failed-border)' : 'var(--fog-60)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '24px 26px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '1.1rem' }}>{paused ? '🛑' : '🟢'}</span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 400, color: paused ? 'var(--failed)' : 'var(--ink)' }}>
              {paused ? 'Posting is paused' : 'Posting is active'}
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: paused ? 'var(--failed)' : 'var(--ink-20)', lineHeight: 1.5, maxWidth: 440 }}>
            {paused
              ? `Nothing new will be published while paused${pausedAt ? ` — paused ${new Date(pausedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.`
              : 'Approved posts flow through to LinkedIn as scheduled. Use this if you need to stop everything immediately — e.g. a brand issue, an account compromise, or bad content that slipped through.'}
          </p>
        </div>

        {paused ? (
          <button onClick={doResume} disabled={working} className="press hover-lift" style={{
            padding: '10px 20px', background: 'var(--done)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600,
            cursor: working ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0, fontFamily: 'var(--font-body)',
          }}>
            {working && <Spinner size={14} light />}
            Resume Posting
          </button>
        ) : (
          <button onClick={() => setConfirm(true)} disabled={working} className="press hover-lift" style={{
            padding: '10px 20px', background: 'var(--failed)', color: 'white', border: 'none',
            borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600,
            cursor: working ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0, fontFamily: 'var(--font-body)',
          }}>
            {working && <Spinner size={14} light />}
            🛑 Pause All Posting
          </button>
        )}
      </div>

      {/* Result summary — the visible in-flight-vs-recalled distinction */}
      {result && (
        <div className="scale-in" style={{
          marginTop: 16, padding: '14px 16px', borderRadius: 'var(--radius)',
          background: 'rgba(255,255,255,0.6)', border: '1px solid var(--fog-60)',
          fontSize: '0.82rem', color: 'var(--ink-60)', lineHeight: 1.6,
        }}>
          {result.type === 'paused' ? (
            <>
              <strong>{result.recalled}</strong> post{result.recalled !== 1 ? 's' : ''} pulled back from the queue — they will not be published.
              {result.inFlight > 0 && (
                <div style={{ marginTop: 6, color: 'var(--failed)' }}>
                  ⚠️ <strong>{result.inFlight}</strong> post{result.inFlight !== 1 ? 's were' : ' was'} already being published when you paused and could not be recalled — {result.inFlight !== 1 ? 'they are' : 'it is'} likely already live and can't be undone from here.
                </div>
              )}
            </>
          ) : (
            <><strong>{result.requeued}</strong> post{result.requeued !== 1 ? 's' : ''} re-queued and will resume publishing on schedule.</>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <div
          className="animate-in"
          onClick={e => e.target === e.currentTarget && setConfirm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,15,0.5)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div className="scale-in" style={{ background: 'var(--white)', borderRadius: 'var(--radius-lg)', padding: '28px 32px', width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, marginBottom: 10 }}>Pause all posting?</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-40)', lineHeight: 1.6, marginBottom: 20 }}>
              Every post still waiting in the queue will be pulled back and held. Anything already being published right now can't be recalled — you'll see exactly how many of each right after.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirm(false)} className="press" style={{ flex: 1, padding: '10px 0', background: 'var(--fog)', color: 'var(--ink-40)', border: '1px solid var(--fog-60)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={doPause} className="press" style={{ flex: 1, padding: '10px 0', background: 'var(--failed)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Yes, pause everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
