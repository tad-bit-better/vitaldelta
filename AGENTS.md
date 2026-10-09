# Lab Report Tracker — project context for AI assistants

## What this app is
An open-source app that reads medical lab reports (PDFs), extracts the values,
and shows how each marker changes across reports over time. The main use is walking
into a doctor's visit with a one-page summary of what changed or is out of range,
because doctors often skim long reports and miss off values.

## Non-negotiables
- **Data never leaves the device.** No backend, no analytics, no cloud OCR or cloud LLM calls.
  PDFs are read in the browser; data lives in IndexedDB. Do not add any network request
  without the owner explicitly asking.
- **No diagnosis.** UI text says "outside the report's range" or "changed by X%", never
  "you may have <condition>".
- **Users confirm extracted values.** Low-confidence rows must be shown for review before saving.
- **No per-lab templates.** Extraction is layout-agnostic; lab knowledge is only added as
  marker synonyms in the dictionary.
- **All storage goes through one storage interface.** Never call Dexie/IndexedDB directly
  from components. The interface has two backends: persistent (Dexie) and session-only
  (in-memory, nothing written to disk).

## Privacy and offline (web specifics)
- Strict Content Security Policy in `vercel.json` with `connect-src 'self'`, so the browser
  itself blocks any data leaving the app. Don't loosen it.
- No analytics or trackers (Vercel Analytics stays off). Self-host the pdf.js worker and
  fonts; the app makes no third-party requests.
- PWA with a service worker: first visit needs internet, then the app works fully offline.
- Call `navigator.storage.persist()` when the user chooses to save, to reduce eviction.
  Safari may clear data for sites unused for 7 days unless installed to the home screen,
  so onboarding nudges iPhone users to install.
- Data is tied to one browser on one device; onboarding says so, and JSON backup export
  is the way to move or keep it.

## Shared and public computers
- First use asks: **Save on this device** or **Just this session**. Session mode uses the
  in-memory backend; closing the tab erases everything.
- **Delete all data** clears IndexedDB, Cache Storage and service worker storage for the site.
- Onboarding note: on a shared computer, choose Just this session or a private window,
  and delete the downloaded PDF afterwards (the app can't remove it).

## v1 scope (10-day launch)
Web app (PWA) at a public URL, PDF reports only, multiple patients (profiles), demo mode with synthetic
sample reports, session-only mode for shared computers.
Next (v1.1): optional passphrase encryption and auto-lock.
Native mobile (React Native) is v2 and will reuse `packages/extraction`.

## Stack
- pnpm workspace
  - `apps/web` — Vite + React + TypeScript (strict), deployed on Vercel
  - `packages/extraction` — pure TypeScript, no DOM or React imports, so mobile can reuse it
- pdf.js in a Web Worker for PDF text with coordinates
- Dexie (IndexedDB) behind the storage interface; in-memory backend for session mode
- Vitest for unit tests

## Extraction pipeline (packages/extraction)
1. Text items with coordinates `{text, x, y, page}` (pdf.js adapter lives in apps/web)
2. Group into rows by vertical position (tolerance), sort left to right
3. Parse each row into name / value / unit / reference range
4. Match name to a canonical marker via `dictionary.json`
   (synonyms + LOINC code + standard unit), exact first, then fuzzy
5. Normalise units, apply plausibility bounds, compute a confidence score
6. Prefer the reference range printed on the report over dictionary defaults

## Data model
- `Profile` — one per patient: id, name, aliases (names printed on their reports), sex.
  The user always confirms which patient a report belongs to; names are only suggestions.
- `Report` — id, profileId, collectedAt, labName, sourceFileName, createdAt
- `Result` — id, reportId, markerId, value, unit, refLow, refHigh, confidence, userEdited;
  results printed as words have value null and textValue/expectedText; method is the assay
  method printed with the test ("HPLC"), split off the name
- `Marker` — id (LOINC where possible), name, synonyms[], unit, plausibleMin/Max
- Dates as ISO strings; refLow/refHigh nullable (one-sided ranges like "<200")

## Conventions
- Sample report PDFs live in `fixtures/` and are **gitignored** (real personal data)
- Demo data in `apps/web/src/demo/` is synthetic only — never derived from real reports
- `pnpm harness` reports the extraction match rate across fixtures, and accuracy against
  hand-confirmed `.expected.json` files (draft one per fixture with `pnpm --filter
  @vitaldelta/extraction expected <n>`); don't let either regress
- Keep components small; no state library until it's clearly needed

## Gotchas
Read `docs/GOTCHAS.md` before changing PDF reading, CSP, tooling or extraction, and add an
entry whenever you hit something non-obvious. Dictionary rules are in `docs/dictionary.md`.

## Current status
See `docs/PLAN.md` for the 10-day plan and what's done. Tick the checkboxes there
as tasks are completed.
