/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
    outputFileTracingIncludes: {
      '/api/render-post': ['./node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', './node_modules/@fontsource/inter/files/inter-latin-ext-700-normal.woff', './node_modules/@fontsource/inter/files/inter-vietnamese-700-normal.woff'],
      '/api/webhooks/render-post': ['./node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', './node_modules/@fontsource/inter/files/inter-latin-ext-700-normal.woff', './node_modules/@fontsource/inter/files/inter-vietnamese-700-normal.woff'],
    },
  },
}

module.exports = nextConfig
