import './globals.css'

export const metadata = {
  title: 'ContentEngine — AI Social Media Dashboard',
  description: 'Generate, review and schedule AI-powered social content',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
