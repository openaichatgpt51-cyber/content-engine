'use client'
import { useState } from 'react'

export default function CopyField({ label, value, multiline = false }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* user can select manually */ }
  }
  return (
    <label className="ops-field">
      {label}
      <div className="ops-row" style={{ alignItems: 'stretch' }}>
        {multiline
          ? <textarea readOnly className="ops-textarea" rows={5} value={value} style={{ flex: '1 1 280px', background: '#FAFAF8' }} />
          : <input readOnly className="ops-input" value={value} style={{ flex: '1 1 280px', background: '#FAFAF8' }} />}
        <button type="button" className="ops-btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </label>
  )
}
