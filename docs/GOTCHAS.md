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

## Deployment (Vercel)

- **Every push to `main` deploys to production.** Use a branch (Vercel builds a preview
  URL for it) for anything you want to check first.
- **Vercel project settings that must stay**: root directory `apps/web`, preset Vite,
  default build/output/install commands, and env var `ENABLE_EXPERIMENTAL_COREPACK=1` so
  Vercel uses the pnpm version pinned in `package.json` (the lockfile is pnpm 12's format).
- **Keep Web Analytics and Speed Insights off** in the Vercel dashboard; they add trackers.
- **Cloudflare DNS records for vitaldelta.app must be "DNS only" (grey cloud)**, not
  proxied. Proxying puts Cloudflare in the request path and can break Vercel's certificate
  and headers. `.app` is HTTPS-only, so the site doesn't load until Vercel's cert is issued.
- **One public address: `vitaldelta.app`.** In Vercel's Domains settings, `www.vitaldelta.app`
  and `vitaldelta.vercel.app` both redirect to it. When editing a redirect, pick the target
  from the dropdown; typing it without selecting doesn't save.
- **Check production after deploys**: `curl -sI https://vitaldelta.app/app` should show the
  CSP header and `server: Vercel` (not `cloudflare`), and `/dev/rows` must 404.

## Tooling

- **`pnpm e2e`** builds the app, serves it with `vite preview` (real CSP), and drives headless
  Chrome through upload → review → save in both storage modes, two patients, duplicate and
  mismatch checks, dashboard and test pages, and fails on any CSP violation, console error or
  request to another host. It also covers the doctor summary (including the print view) and
  backup download → delete all → restore. Run it before pushing UI changes. `BASE=https://vitaldelta.app
  node apps/web/e2e/run.mjs` checks a deployment. Needs Chrome (`CHROME=` to point at it).

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

- **Backups keep every id** (`apps/web/src/storage/backup.ts`, format `vitaldelta-backup` version 1).
  Restore adds only records whose id isn't already here, all or nothing, so restoring twice is
  harmless and local edits win. Results come only with a report that's new here. If the data
  model changes, bump `BACKUP_VERSION` and teach `parseBackup` to read the old version; old
  backup files live on in people's downloads.
- **Backup files are unencrypted health data.** The Your data page says so. Passphrase
  encryption (v1.1) should cover backups too.
- **Delete all data** (`deleteEverything` in `storage/wipe.ts`) deletes the database, Cache
  Storage and service worker registrations, then AppShell drops its in-memory state and shows
  the first-use choice. It can't touch files the user downloaded.

## Patients

- **A report is never assigned to a patient automatically.** Detected name/sex only produce a
  "Suggested" label and mismatch warnings; the user must pick a patient (and tick "same
  person" on a mismatch) before Save is enabled. Keep it that way: mixing two people's
  results silently corrupts every trend.
- **The patient name ends at the next column, found by layout** (a gap wider than 1.5× the
  text height), not by a list of label words. The word list in `patient.ts` is only a
  fallback for PDFs that store a whole line as one piece of text, so don't rely on extending
  it for new labs.
- **Names printed on reports are stored as profile `aliases`** (on the device only) so future
  reports can be suggested. Fuzzy matching needs them as text, so they can't be hashed.
- **Duplicate check**: same collection date plus the same file name or ≥80% identical values
  for that patient. It blocks Save until the user confirms it's a different report.
- **Everything is per patient**: `forProfile()` in `DataContext.ts` scopes reports/results, and
  URLs are `/app/p/<id>` and `/app/p/<id>/tests/<key>`. Use `Link`/`navigate` for in-app links.

## Insights and charts

- **Flags compare a value only with the range printed on its own report** (`rangeStatus` in
  `packages/extraction/src/flags.ts`), never a dictionary default. Wording must stay
  non-diagnostic ("above the report's range by 24%"); `describeStatus` is the one place for it.
- **Status always has three cues: colour, shape/icon and a label** (▲▼ outside, ◆ near a
  limit, ● in range, ○ no range). Green vs amber is only ~6.6 apart for colour-blind readers,
  so never show status by colour alone. Status colours were checked with the dataviz
  palette validator against `--card`; re-run it if the palette or surface changes.
- **Dashboard thresholds live in code, not the UI**: "near a limit" is within 10% of the
  range (`NEAR_FRACTION`), a "large change" is 10% or more (`NOTABLE_CHANGE` in `series.ts`),
  and drift needs 3+ results moving the same way, each step ≥1% and ≥5% overall
  (`detectDrift` options). Change them there so every screen agrees.
- **Changes are shown in neutral colours.** Whether "up" is good depends on the test, and
  the app doesn't judge; only range status gets colour.
- **Charts only plot results in one unit** (`buildSeries` in `apps/web/src/app/series.ts`);
  others are listed as "different unit" and never compared.
- **Every `/app/...` path must reach `AppShell`** (`App.tsx` matches the `/app/` prefix).
  A new top-level route outside `/app` also needs a `vercel.json` rewrite.
- **The tooltip is positioned with inline `style`** (React sets it through the DOM, which
  the CSP allows). Keep any other styling in CSS classes.

## Doctor summary and printing

- **Printing uses the browser's print dialog** (`window.print()`); "Save as PDF" there is the
  PDF export, so no PDF library is needed. The `@media print` block in `app.css` hides
  everything but the summary and switches to black on white with darker status colours.
  Status keeps its icon and label because many printers are black and white.
- **The summary sets `document.title`** while open, because browsers name the saved PDF after it.
- **Check print layout with `SHOTS=dir pnpm e2e`**, which also saves `summary.pdf` (Chrome's
  print engine). `pnpm dev` won't show print problems unless you open the print preview.

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
