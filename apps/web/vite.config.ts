import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'

// Serve the production security headers (strict CSP) from `vite preview` too,
// so CSP problems show up locally before deploying. vercel.json stays the source of truth.
type VercelConfig = { headers: { source: string; headers: { key: string; value: string }[] }[] }
const vercel: VercelConfig = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(
  vercel.headers
    .filter((rule) => rule.source === '/(.*)')
    .flatMap((rule) => rule.headers)
    .map((h) => [h.key, h.value]),
)

/**
 * Emits /sw.js (from sw/sw.js) with the list of files to cache for offline use: every built
 * file, plus the public icons, manifest and pdf.js standard fonts. pdf.js character maps are
 * left to the runtime cache. The version changes whenever any of those files change.
 */
function serviceWorker(): Plugin {
  const publicDir = new URL('./public/', import.meta.url)
  const list = (dir: string): string[] =>
    readdirSync(new URL(dir, publicDir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? list(`${dir}${e.name}/`) : [`${dir}${e.name}`],
    )
  const pdfjsVersion = (createRequire(import.meta.url)('pdfjs-dist/package.json') as { version: string }).version
  return {
    name: 'vitaldelta-service-worker',
    apply: 'build',
    // After Vite's HTML plugin, so index.html is in the bundle.
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      const fromPublic = list('').filter((f) => !f.startsWith('pdfjs/cmaps/') && !f.endsWith('.DS_Store'))
      if (!built.includes('index.html')) this.error('index.html missing from the bundle; the offline app needs it')
      const files = [...new Set([...built, ...fromPublic])].sort()
      const hash = createHash('sha256')
      for (const f of files) {
        const item = bundle[f]
        hash.update(f)
        if (item?.type === 'asset') hash.update(item.source)
        else if (item?.type === 'chunk') hash.update(item.code)
        else hash.update(readFileSync(new URL(f, publicDir)))
      }
      const template = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
      hash.update(template)
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        // The page itself is cached as "/" (some servers redirect /index.html to /).
        .replace('__PRECACHE__', JSON.stringify(files.map((f) => (f === 'index.html' ? '/' : `/${f}`))))
        .replace('__RUNTIME_CACHE__', `vitaldelta-pdfjs-${pdfjsVersion}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  preview: { headers: securityHeaders },
  build: {
    // Never inline assets as data: URLs; the CSP's font-src 'self' blocks inlined fonts.
    assetsInlineLimit: 0,
  },
})
