'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'

// Google Tag Manager for the client app.
// Never loads for staff: middleware sets the `ce_staff` cookie for anyone in
// admin_users, on every page, so admins are excluded even when they open the
// client dashboard first and then move to /admin in the same tab. /admin is
// also skipped outright as a second guard. Client-side route changes are
// picked up by GA4's enhanced measurement (browser history events).
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-MSDT4P7L'

const isStaff = () => typeof document !== 'undefined' && /(?:^|;\s*)ce_staff=1(?:;|$)/.test(document.cookie)

export default function GoogleTagManager() {
  const pathname = usePathname() || ''
  // Decide after mount so server and client render the same markup.
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    if (!isStaff() && !pathname.startsWith('/admin')) setAllowed(true)
  }, [pathname])

  if (!GTM_ID || !allowed) return null
  return (
    <Script id="gtm" strategy="afterInteractive">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}</Script>
  )
}
