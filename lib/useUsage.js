'use client'
import { useState, useEffect } from 'react'

export function useUsage() {
  const [usage,   setUsage]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.json())
      .then(data => { setUsage(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return { usage, loading }
}
