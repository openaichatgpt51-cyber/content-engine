'use client'
import Script from 'next/script'
import { usePathname } from 'next/navigation'

// Google Tag Manager for the client app. Not loaded on /admin: the admin
// panel shows client data and money, and our own usage shouldn't skew the
// numbers. Client-side route changes are picked up by GA4's enhanced
// measurement (browser history events), configured inside GTM.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || 'GTM-MSDT4P7L'

export default function GoogleTagManager() {
  const pathname = usePathname() || ''
  if (!GTM_ID || pathname.startsWith('/admin')) return null
  return (
    <>
      <Script id="gtm" strategy="afterInteractive">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}</Script>
      <noscript>
        <iframe src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} title="Google Tag Manager" />
      </noscript>
    </>
  )
}
