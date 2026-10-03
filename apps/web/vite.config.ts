import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createServer, defineConfig, type Plugin } from 'vite'

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

const APP_PATH = /^\/app(?:[/?#]|$)/

/**
 * Prerenders the landing page into index.html, so crawlers and link previews (which don't
 * run JavaScript) see the real text; React then hydrates it. The app routes get their own
 * unrendered copy, app.html (vercel.json rewrites /app/* to it), so they never flash the
 * landing page. vite preview gets the same rewrite.
 */
function prerenderLanding(): Plugin {
  return {
    name: 'vitaldelta-prerender-landing',
    // Not build-only: configurePreviewServer must run for `vite preview` (generateBundle only runs in builds).
    // After Vite's HTML plugin (index.html must be in the bundle), before the service worker.
    enforce: 'post',
    async generateBundle(_, bundle) {
      const index = bundle['index.html']
      if (index?.type !== 'asset') this.error('index.html missing from the bundle')
      const shell = String(index.source)
      const server = await createServer({
        configFile: false,
        root: fileURLToPath(new URL('.', import.meta.url)),
        logLevel: 'error',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false },
        // Its own cache and no dependency pre-bundling: sharing node_modules/.vite would mark
        // a running `pnpm dev` server's bundled dependencies as outdated (blank page, 504s).
        cacheDir: 'node_modules/.vite-prerender',
        optimizeDeps: { noDiscovery: true, include: [] },
        plugins: [react()],
      })
      try {
        const { default: Landing } = await server.ssrLoadModule('/src/pages/Landing.tsx')
        const markup = renderToString(createElement(Landing))
        if (!shell.includes('<div id="root"></div>')) this.error('index.html has no empty #root to fill')
        index.source = shell.replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
      } finally {
        await server.close()
      }
      // App pages aren't for search engines; the landing page is the one to index.
      this.emitFile({ type: 'asset', fileName: 'app.html', source: shell.replace('<head>', '<head>\n    <meta name="robots" content="noindex" />') })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && APP_PATH.test(req.url)) req.url = '/app.html'
        next()
      })
    },
  }
}

/**
 * Emits /sw.js (from sw/sw.js) with the list of files to cache for offline use: every built
 * file (including both HTML pages), plus the public icons, manifest and pdf.js standard fonts. pdf.js character maps are
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
      // og.png is only for link previews, so it isn't stored for offline use.
      const fromPublic = list('').filter((f) => !f.startsWith('pdfjs/cmaps/') && f !== 'og.png' && !f.endsWith('.DS_Store'))
      if (!built.includes('index.html')) this.error('index.html missing from the bundle; the offline app needs it')
      // app.html is emitted by prerenderLanding; it's index.html's shell, so index.html's hash covers it.
      const files = [...new Set([...built, ...fromPublic, 'app.html'])].sort()
      const hash = createHash('sha256')
      for (const f of files) {
        const item = bundle[f]
        hash.update(f)
        if (item?.type === 'asset') hash.update(item.source)
        else if (item?.type === 'chunk') hash.update(item.code)
        else if (f !== 'app.html') hash.update(readFileSync(new URL(f, publicDir)))
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
  plugins: [react(), prerenderLanding(), serviceWorker()],
  preview: { headers: securityHeaders },
  build: {
    // Never inline assets as data: URLs; the CSP's font-src 'self' blocks inlined fonts.
    assetsInlineLimit: 0,
  },
})
