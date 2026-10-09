# Gotchas

Non-obvious things that have bitten us or will. Add an entry whenever you find one:
what happens, why, and what to do.

## Privacy

- **Don't share `fixtures/` with AI tools or anyone else.** They're real health records.
  The folder is gitignored; `pnpm harness` output (counts and test names only) is safe to share.
  It numbers files (`#1 f2d22733`) instead of printing their names, because file names often
  contain the patient's name; `--names` shows them, for your own terminal only.
- **The shape tool masks everything except a fixed vocabulary** (`harness/privacy.ts`: test
  names from the dictionary, units, common report terms). Never add words that describe the
  patient (sex, titles, places) to that list; `privacy.test.ts` checks names, addresses and
  IDs stay hidden. Pass a fixture number, not a path (`shape 3`): pnpm echoes the command.
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
- **`.expected.json` files in fixtures/ hold real values** and are gitignored with the PDFs.
  The harness and the `expected` tool print only counts, test names and which field differed,
  never values. Scoring rules live in `harness/score.ts`, unit-tested with synthetic data; an
  expected file whose `fingerprint` no longer matches its PDF is treated as a draft.
- **The web app uses pdf.js's legacy build** (`pdfjs-dist/legacy/build/...`, like the harness).
  The modern build relies on very new JavaScript (`Uint8Array.prototype.toHex`, `Math.sumPrecise`,
  `Map.prototype.getOrInsert`) that older iOS Safari lacks; some PDFs (ones whose fonts reach those
  code paths) failed only on iPhone while Android worked. The legacy build polyfills them (~110 KB more).
  Every iPhone/iPad browser, Chrome included, runs Apple's WebKit, so test iOS by iOS version.
- **Don't call `page.getTextContent()`: it fails in every Safari, even Safari 26.** It loops over a
  ReadableStream with `for await`, which WebKit doesn't support, and the legacy build doesn't
  polyfill it ("TypeError: undefined is not a function (near '...e of t...')"). `readPdf` reads
  `page.streamTextContent()` with `getReader()` instead. The e2e deletes
  `ReadableStream.prototype[Symbol.asyncIterator]` before the app loads, so Chrome catches this.
  Mac Safari runs the same WebKit as iPhones and is the quickest way to reproduce an iOS failure.
- **pdf.js detaches the bytes it's given** (they move to its worker). The upload keeps the
  original `Uint8Array` for the review screen and hands pdf.js copies (`bytes.slice()`).
- **The review screen draws pages itself** (`pdf/pageImages.ts`): one page at a time, ~1400 px
  wide, as an in-memory JPEG blob (`img-src blob:` is allowed). Nothing is stored; leaving the
  review frees the document and every blob URL. `disableFontFace` stays on for drawing too:
  glyphs are drawn as outlines, so no font files are loaded (the CSP's `font-src` would refuse them).
- **Each extracted result carries `box`**, the row's position on its page (PDF points,
  top-left origin). The snippet on a check card is a CSS crop of the page image, positioned
  with **margins**, not `top`/`left`: margin percentages are of the container's width (like the
  image's scale), so the crop stays exact when `min-height` makes the strip taller than its aspect ratio.
- **When a PDF can't be read, the upload screen shows "Technical details"** (pdf.js's error and the
  browser version, never report content). Ask for that line when a report fails on someone's device.
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
  backup download → delete all → restore, the demo, axe accessibility checks on every screen,
  and offline use (it stops the server and reloads). Run it before pushing UI changes. `BASE=https://vitaldelta.app
  node apps/web/e2e/run.mjs` checks a deployment. Needs Chrome (`CHROME=` to point at it).

- **pnpm doesn't reliably run `pre*`/`post*` scripts.** Chain steps explicitly
  (`"dev": "node scripts/x.mjs && vite"`).
- **`packages/extraction/src` must stay free of DOM and Node APIs** so the mobile app can
  reuse it. `tsconfig.json` enforces this (`lib: ES2022`, `types: []`); the harness has its
  own `tsconfig.harness.json` with Node types.
- **The dictionary JSON is cast to `Marker[]`** in `dictionary.ts` (TypeScript's JSON
  inference can't express optional keys). `dictionary.test.ts` is what checks the shape.
- **Run one dev server at a time.** Two `pnpm dev` servers for this app share
  `apps/web/node_modules/.vite` and keep invalidating each other's bundled dependencies: the
  page goes blank with "504 (Outdated Optimize Dep)" errors for react.js. If Vite says "Port
  5173 is in use", check it isn't an old VitalDelta dev server (`lsof -iTCP:5173 -sTCP:LISTEN`).
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
- **"Not backed up" compares report `createdAt` with `lastBackupAt`** (kept in Dexie's `meta`
  table, schema version 2), so any report added after the last download makes the backup "out
  of date". Renames and deletes don't count: they lose nothing. Session mode and the demo never nag.
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

- **Flags compare a value with the range printed on its own report** (`rangeStatus` in
  `packages/extraction/src/flags.ts`). Only when the report printed none, and only for the few
  tests with a guideline limit (`docs/dictionary.md`), the guideline range is used instead, and
  every screen says so. Wording must stay non-diagnostic ("above the report's range by 24%",
  "above the guideline range"); `describeStatus` / `rangeText` are the places for it.
- **Guideline ranges are worked out on display** (`buildSeries` → `effectiveRange`), never
  saved into results, so `refLow`/`refHigh` in storage always mean "what the report printed".
  `buildSeries` needs the patient's sex for sex-specific limits (HDL); pass `profile.sex`.
- **Guideline bounds can be strict** ("< 5.7": 5.7 is above). Report ranges are inclusive.
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
- **The summary's page title is the PDF's file name** (browsers name the saved PDF after it). It's set
  in `pageTitle` in `AppShell.tsx`, like every page's title.
- **Check print layout with `SHOTS=dir pnpm e2e`**, which also saves `summary.pdf` (Chrome's
  print engine). `pnpm dev` won't show print problems unless you open the print preview.

## Landing page prerender and link previews

- **The landing page is rendered to HTML at build time** (`prerenderLanding` in
  `vite.config.ts`, using `react-dom/server`), because crawlers and link previews (LinkedIn,
  Google, Slack) don't run JavaScript. `main.tsx` then hydrates it instead of re-rendering.
- **So `Landing.tsx` must render the same on the server and in the browser**: no `window`,
  `document`, dates, random values or browser checks during render (use an effect). A mismatch
  shows up as React error #418 in `pnpm e2e`.
- **Two HTML files**: `index.html` (prerendered landing) and `app.html` (empty shell,
  `noindex`) for every `/app` route. vercel.json rewrites `/app/*` to `app.html`; the same
  plugin rewrites them for `vite preview` (it must not be `apply: 'build'`, or the preview
  rewrite silently doesn't run and deep `/app/...` links get the landing page). The service
  worker's offline fallback picks the matching file. `pnpm dev` serves the unrendered page.
- **Open Graph tags are in `index.html`; the image is `public/og.png`** (1200×630, the hero).
  Regenerate it with `scripts/og-image.mjs` when the hero changes. LinkedIn caches previews:
  use its Post Inspector to refresh after changing them.

## Offline (service worker)

- **The service worker is hand-written** (`apps/web/sw/sw.js`); a small plugin in
  `vite.config.ts` fills in the list of files and a version hash and emits `/sw.js`. It caches
  every built file, the icons, manifest and pdf.js standard fonts (needed to read PDFs that
  use non-embedded fonts like Helvetica). pdf.js character maps are cached the first time
  they're used. It only exists in production builds: `pnpm dev` never has it.
- **The plugin runs with `enforce: 'post'`**, otherwise `index.html` isn't in the bundle yet.
- **The page is cached as `/`, not `/index.html`**: some servers redirect `/index.html`, and
  browsers refuse a redirected response for a page load.
- **Cache lookups use `ignoreVary`.** Module scripts are requested with an Origin header; the
  copies cached at install have none, so with `Vary: Origin` they never matched offline.
- **Page loads are network-first** (a deploy shows up at once), files are cache-first, and a
  new worker takes over immediately (`skipWaiting`) and deletes old caches.
- **`/sw.js` is served with `Cache-Control: no-cache`** (vercel.json) so updates are found.
  `vite preview` copies only the site-wide `/(.*)` headers from vercel.json.
- **A stuck old version in your browser**: DevTools → Application → Service workers →
  Unregister, or Your data → Delete all data (which also removes caches and the worker).

## Demo and onboarding

- **Demo data is made up** (`apps/web/src/demo/`) and loads into the in-memory backend through
  `importBackup`, so the demo never touches IndexedDB. `/app?demo=1` starts it (the landing
  page links there). "Use a made-up sample report" builds a PDF in the browser and runs the
  real extraction; `demo.test.ts` fails if extraction stops reading it.
- **iPhone/iPad note** (`IosNote`) shows only in Safari when not opened from the home screen.
  The Install button only appears where the browser offers installing (Chrome, Edge, Android).

## Phones

- **Below 560px the app drops its outer box** (the screen is the frame), uses smaller type and
  shorter labels: `.app-wide-only` is hidden and `.app-narrow-only` shows. Both hide with
  `!important` inside their own media query, because component rules like `.app-btn
  { display: inline-flex }` would otherwise undo them. Don't add a plain `display` rule to them.
- **On phones the top bar shrinks to icons**: the patient switcher keeps only the name, backup
  status becomes an icon with a dot, the rest goes in a "⋯" menu, and "Add a report" is a fixed
  bar at the bottom (`.app-main:has(.app-bottom-bar)` gets matching bottom padding).
- **The dashboard's results table turns into one card per group on phones** by making table
  parts `display: block` and each row a grid. The row selector must beat `.app-results-table td`
  in specificity (`tr.app-results-row`), or rows silently stay blocks.
- **Check layouts with `scripts/screenshots.mjs`** (phone and desktop screenshots of every
  screen using the demo data). The e2e test runs at desktop width only.

## Accessibility

- **AppShell sets each page's title and moves focus to the page's `<h1>`** after navigation,
  so screen readers announce the new page. Every page needs exactly one `<h1>`.
- **`pnpm e2e` runs axe-core on every screen** and fails on serious or critical problems.
- **Page entrance animations** (`app-enter` in `app.css`) use `animation-fill-mode: backwards`
  so no transform is left on the page afterwards; a leftover transform would break any
  `position: fixed` inside it. Every animation has a `prefers-reduced-motion` fallback (a short
  fade, no movement). The e2e axe check waits for animations to finish before measuring contrast.
- **Status is never shown by the range bar alone**: out-of-range and near-limit rows add a
  visible badge; in-range rows add visually hidden text. The bar itself is `aria-hidden`.
- **e2e: `innerText` applies CSS `text-transform`**, so uppercase group headings read as
  "LIPIDS". Compare `textContent` instead.
- **Focusable SVG elements need a role** (chart points use `role="img"` with an `aria-label`).

## Extraction

- **Ranges printed as bands** ("Deficiency <20 · Insufficiency 20-30 · Sufficiency 30-100") use
  the band labelled normal/sufficient/desirable/optimal/non-diabetic/adequate, looking up to
  two lines ahead when the bands wrap (`readBands` in `parse.ts`). Without such a band the range
  stays empty (so a guideline range can apply). Banded rows are always flagged for review.
  Never take the first bound of banded text: that's the deficient or high band.
- **Word results** ("Non Reactive", "Negative", "Nil") are read by `extractWordResults`
  (`words.ts`): a name, then a word from a fixed list in its own column, then optionally the
  expected word. They aren't matched to the dictionary (grouped by printed name) and are only
  compared with the expected word on the same report (`wordStatus`). Stored as `value: null`
  with `textValue`/`expectedText`; anything numeric (charts, series, duplicates) must skip
  `value === null`, and TypeScript enforces it. To read more words, extend `WORD` in `words.ts`
  (only words that are never test names).
- **Debug a real report without exposing it**: `pnpm --filter @vitaldelta/extraction shape 3`
  prints the 3rd fixture's layout with everything but test names, units and report terms masked.
- **Run `pnpm harness` after any extraction or dictionary change.** It fails if the match
  rate or accuracy drops below the saved baseline (`fixtures/.harness-baseline.json`).
  After an intended improvement, run `pnpm harness --update`.
- **Plausibility bounds are in the marker's standard unit**, checked only after conversion.
- **Don't list same-kind unit conversions in the dictionary** (g/L ↔ g/dL, pmol/L ↔ nmol/L,
  cell counts); they're generic in `units.ts`, and a test rejects them.
- **"Abbreviation - full name"** ("TSH -Thyroid-Stimulating Hormone"): a dash with a space on at
  least one side splits the name; it matches when the parts agree, and an abbreviation-only match is
  sent for review ("Bilirubin - Conjugated" must never become total bilirubin).
- **Saved "not in our list" results are matched again when shown** (`resolveMarkerId` in
  `series.ts`), so a name the matcher learns later joins the test's history. Only exact matches whose
  unit is already the marker's standard unit; stored data is never rewritten.
- **Assay methods are split off test names** (`methods.ts`): "HbA1c (HPLC)", "Glucose -
  Hexokinase", "Creatinine, Jaffe", a method column before the value or after the range, and a
  "Method: …" line under the test. Text counts as a method only if every word is a method word
  and one is a specific method name; generic words ("rapid", "modified") never count alone, and
  "direct"/"indirect" only in "direct ISE", so "Bilirubin (Direct)" stays direct bilirubin.
  Words that are also test names (microscopy, electrophoresis, esterase, peroxidase) are left out.
  **Small print is a stronger signal than the vocabulary**: text-only items between the name and
  the value in a font under 80% of the name's height are the method, whatever they say ("SF Cube
  cell analysis", "Microscopic"); see `smallPrint()` in `parse.ts`.
  The method is stored on the result; names saved before this still have it, so `testName()`
  in `series.ts` strips it when grouping.
- **"Is this the same test as …?" (`suggestMarker`) is only a question.** It suggests a marker
  when every word of the unrecognised name appears in that marker's name or a synonym, the unit
  converts, and it's the closest fit (fewest extra words; a tie suggests nothing). Accepting it
  converts the value and range into the marker's unit; nothing changes until the user says yes.
- **Two results on one row** ("Neutrophils | 73 | % | 40 - 80 | 7716 | /cmm | 2000 - 6700"): a
  second value with a unit after the first range becomes its own result with the same name
  (`second` in `parseRow`). A unit that can't convert to the matched marker tries "Absolute
  <name>", so the /cmm value lands on the absolute count. Without a unit, a trailing number is ignored.
- **A flag in its own column before the value** ("TSH | H | 5.2") is the value's flag, not part of the name.
- **Fuzzy name matching requires short words to match exactly and in order**
  (Vitamin B ≠ Vitamin D, LDL/HDL ≠ HDL/LDL). Short abbreviations never fuzzy-match.
- **Results are cross-checked against the report's own arithmetic** (`relations.ts`): indirect
  bilirubin, globulin, A/G and the other printed ratios, non-HDL, VLDL = TG/5, absolute counts
  = % × WBC, red-cell indices, TIBC/UIBC/saturation. A value that disagrees (beyond display
  rounding, per-relation tolerances) gets `inconsistent` and is reviewed; only the derived row
  is flagged, and a relation is skipped when a test appears twice with different values. A
  printed H/L flag that contradicts the printed range gets `flag-mismatch` (1% boundary margin).
  These checks found a real bug: "High Performance Liquid Chromatography" in a trailing method
  column was being read as an H flag, so the method column is split off before flags and units.
- **"Neutrophils" etc. are ambiguous** (% or absolute count); the unit decides. A name match
  whose unit can't convert is rejected and kept as unrecognised.
- **LOINC codes and conversion factors were written from memory** and pass only automated
  checks. Verify before launch (see `docs/dictionary.md`).
