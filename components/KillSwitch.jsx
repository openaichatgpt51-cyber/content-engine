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
  const [error,    setError]    = useState('')    // last action's failure, shown to the user

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); setError('Your session has expired. Please sign in again.'); return }
    const { data, error: loadErr } = await supabase
      .from('account_settings')
      .select('posting_paused, paused_at')
      .eq('client_id', user.id)
      .maybeSingle()
    if (loadErr) {
      // Never show "Posting is active" when we could not actually read the state.
      console.error('Kill switch: could not load state:', loadErr.message)
      setError("Couldn't load your posting status. Reload the page before relying on it.")
    }
    setPaused(Boolean(data?.posting_paused))
    setPausedAt(data?.paused_at || null)
    setLoading(false)
  }

  // Order matters for safety. PAUSE: set the flag first, so anything approved
  // from now on is held, then pull queued posts back. If the flag cannot be
  // saved nothing is changed and the user is told. RESUME: clear the flag
  // first; if that fails the account stays paused (the safe side).
  async function doPause() {
    setWorking(true)
    setConfirm(false)
    setError('')
    setResult(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Your session has expired. Please sign in again.')

      const nowIso = new Date().toISOString()
      const { error: flagErr } = await supabase
        .from('account_settings')
        .upsert({
          client_id:      user.id,
          posting_paused: true,
          paused_at:      nowIso,
          updated_at:     nowIso,
        }, { onConflict: 'client_id' })
      if (flagErr) throw new Error("Couldn't pause posting, so nothing was changed: " + flagErr.message)

      setPaused(true)
      setPausedAt(nowIso)

      // Posts already being published cannot be recalled.
      const { count: inFlight, error: inFlightErr } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('posting_status', 'IN_PROGRESS')
      if (inFlightErr) console.error('Kill switch: in-flight count failed:', inFlightErr.message)

      // Pull every queued post out of the queue the scheduler polls; the rows
      // actually changed are the number recalled.
      const { data: halted, error: haltErr } = await supabase
        .from('posts')
        .update({ posting_status: 'HALTED' })
        .eq('client_id', user.id)
        .eq('posting_status', 'PENDING')
        .select('id')
      if (haltErr) {
        throw new Error("Posting is paused for new approvals, but queued posts could NOT be pulled back: " + haltErr.message + ". Press Pause again, or check the Calendar.")
      }

      setResult({ type: 'paused', recalled: halted?.length || 0, inFlight: inFlightErr ? 0 : (inFlight || 0) })
    } catch (err) {
      console.error('Kill switch pause failed:', err.message)
      setError(err.message)
    }
    setWorking(false)
  }

  async function doResume() {
    setWorking(true)
    setError('')
    setResult(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Your session has expired. Please sign in again.')

      const { error: flagErr } = await supabase
        .from('account_settings')
        .upsert({
          client_id:      user.id,
          posting_paused: false,
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'client_id' })
      if (flagErr) throw new Error("Couldn't resume posting, so it is still paused: " + flagErr.message)

      setPaused(false)
      setPausedAt(null)

      const { data: requeued, error: requeueErr } = await supabase
        .from('posts')
        .update({ posting_status: 'PENDING' })
        .eq('client_id', user.id)
        .eq('posting_status', 'HALTED')
        .select('id')
      if (requeueErr) {
        throw new Error("Posting is resumed, but held posts could NOT be re-queued: " + requeueErr.message + ". They are still on hold. Press Pause then Resume again to retry.")
      }

      setResult({ type: 'resumed', requeued: requeued?.length || 0 })
    } catch (err) {
      console.error('Kill switch resume failed:', err.message)
      setError(err.message)
    }
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

      {error && (
        <div role="alert" style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 'var(--radius)',
          background: 'var(--failed-bg)', border: '1px solid var(--failed-border)',
          color: 'var(--failed)', fontSize: '0.82rem', lineHeight: 1.5,
        }}>
          ⚠️ {error}
        </div>
      )}

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
