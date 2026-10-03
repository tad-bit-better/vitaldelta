import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Serve the production security headers (strict CSP) from `vite preview` too,
// so CSP problems show up locally before deploying. vercel.json stays the source of truth.
type VercelConfig = { headers: { headers: { key: string; value: string }[] }[] }
const vercel: VercelConfig = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(
  vercel.headers.flatMap((rule) => rule.headers).map((h) => [h.key, h.value]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: securityHeaders },
  build: {
    // Never inline assets as data: URLs; the CSP's font-src 'self' blocks inlined fonts.
    assetsInlineLimit: 0,
  },
})
