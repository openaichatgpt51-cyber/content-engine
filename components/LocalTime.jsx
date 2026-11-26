'use client'
// Shows a timestamp in the viewer's own time zone (server pages render in UTC).
export default function LocalTime({ iso }) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  return <time dateTime={iso} suppressHydrationWarning>
    {d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
  </time>
}
