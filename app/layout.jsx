import './globals.css'
import GoogleTagManager from '../components/GoogleTagManager'

export const metadata = {
  title: 'ContentEngine — AI Social Media Dashboard',
  description: 'Generate, review and schedule AI-powered social content',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <GoogleTagManager />
        {children}
      </body>
    </html>
  )
}
