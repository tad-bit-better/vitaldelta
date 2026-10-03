# Gotchas

Non-obvious things that have bitten us or will. Add an entry whenever you find one:
what happens, why, and what to do.

## Privacy

- **Don't share `fixtures/` with AI tools or anyone else.** They're real health records.
  The folder is gitignored; `pnpm harness` output (counts and test names only) is safe to share.
  The same goes for `fixtures/passwords.json` and `*.expected.json`.

## PDF reading

- **pdf.js is a dependency of both `apps/web` and `packages/extraction`** (the harness uses
  its Node build). Keep both pinned to the same exact version, or the harness and the
  browser may read PDFs differently.
- **pdf.js position → TextItem conversion lives in one place**: `fromPdfJsItem` in
  `packages/extraction/src/pdfjs.ts`. Don't re-implement it in the web app or the harness.
- **pdf.js data files are copied, not committed.** `apps/web/scripts/copy-pdfjs-assets.mjs`
  copies cmaps and standard fonts into `apps/web/public/pdfjs/` (gitignored) as part of
  `dev` and `build`. Running `vite` directly skips the copy.
- **pdf.js's image-decoding WASM isn't shipped.** Text extraction doesn't need it, and it
  would require `'wasm-unsafe-eval'` in the CSP. If OCR or image decoding is ever added,
  that's a CSP decision.
- **pdf.js 6 API changes from older docs**: `isEvalSupported` no longer exists, and
  `destroy()` is on the loading task, not the document.

## Security headers (CSP)

- **The CSP only exists in `apps/web/vercel.json`**, which only Vercel applies.
  `vite preview` reuses those headers (see `vite.config.ts`), so test CSP with
  `pnpm build && pnpm --filter web preview`. `pnpm dev` has no CSP (Vite's hot reload
  needs inline scripts), so CSP bugs never show up in dev.
- **Inline `style` attributes**: React sets them through the DOM, which `style-src 'self'`
  allows, but prefer CSS classes so the policy stays easy to reason about.
- **Vite inlines small assets as `data:` URLs by default**, and `font-src 'self'` blocks
  inlined fonts. `build.assetsInlineLimit: 0` in `vite.config.ts` turns that off; keep it.
- **pdf.js is told not to load fonts** (`disableFontFace: true` in `readPdf.ts`). We only
  read text. If PDF pages are ever rendered, revisit this together with the CSP.
- **New routes need a Vercel rewrite.** The app is a single page; `vercel.json` rewrites
  `/app` to `index.html`. Without it, opening `/app` directly 404s on Vercel (Vite's dev
  and preview servers fall back automatically, so this never shows up locally).

## Tooling

- **pnpm doesn't reliably run `pre*`/`post*` scripts.** Chain steps explicitly
  (`"dev": "node scripts/x.mjs && vite"`).
- **`packages/extraction/src` must stay free of DOM and Node APIs** so the mobile app can
  reuse it. `tsconfig.json` enforces this (`lib: ES2022`, `types: []`); the harness has its
  own `tsconfig.harness.json` with Node types.
- **The dictionary JSON is cast to `Marker[]`** in `dictionary.ts` (TypeScript's JSON
  inference can't express optional keys). `dictionary.test.ts` is what checks the shape.
- **Port 5173 may be taken** by another project; Vite then uses 5174. Check the dev
  server's output for the real URL.
- **Dev-only pages** (`/dev/rows`) are loaded behind `import.meta.env.DEV`, so they're
  left out of production builds. Keep that pattern for any debug tooling.

## Storage

- **Components never touch Dexie/IndexedDB directly**; everything goes through the
  `Storage` interface (`apps/web/src/storage`). `storage.test.ts` runs one contract against
  both backends; add new methods to the contract test, not to one backend.
- **"Save on this device" is remembered by the database existing** (`Dexie.exists`), so
  nothing else is stored to remember the choice. Deleting all data brings the choice back.
- **Session mode must never create the database**; a test checks this. Don't open Dexie
  (even to "check" something) before the user has chosen a mode, except `hasPersistentData`.
- **A recognised result isn't always in its marker's standard unit**: when the printed unit
  wasn't recognised, the value is kept as printed (`unknown-unit`). Trends and comparisons
  must only compare results with the same unit.

## Extraction

- **Run `pnpm harness` after any extraction or dictionary change.** It fails if the match
  rate or accuracy drops below the saved baseline (`fixtures/.harness-baseline.json`).
  After an intended improvement, run `pnpm harness --update`.
- **Plausibility bounds are in the marker's standard unit**, checked only after conversion.
- **Don't list same-kind unit conversions in the dictionary** (g/L ↔ g/dL, pmol/L ↔ nmol/L,
  cell counts); they're generic in `units.ts`, and a test rejects them.
- **Fuzzy name matching requires short words to match exactly and in order**
  (Vitamin B ≠ Vitamin D, LDL/HDL ≠ HDL/LDL). Short abbreviations never fuzzy-match.
- **"Neutrophils" etc. are ambiguous** (% or absolute count); the unit decides. A name match
  whose unit can't convert is rejected and kept as unrecognised.
- **LOINC codes and conversion factors were written from memory** and pass only automated
  checks. Verify before launch (see `docs/dictionary.md`).
