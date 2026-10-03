# 10-day launch plan

## Days 1–5: Reading reports
Done when: a PDF uploads, extracted values can be reviewed, and they save on the device (or for this session only).
- [ ] Day 1: pnpm workspace (apps/web + packages/extraction), Vite + React + TS, repo + licence, deploy to Vercel with strict CSP (`connect-src 'self'`), self-hosted fonts, no analytics; start Play Console signup
- [x] Day 2: pdf.js with self-hosted worker; text with coordinates in a Web Worker; row grouping + tests
- [x] Day 3: Row parsing (value, unit, range); dictionary of ~40 markers; collect fixtures/
- [x] Day 4: Name matching, unit conversion, plausibility, confidence; `pnpm harness`
- [x] Day 5: Storage interface with Dexie and in-memory backends; upload flow, report date/lab, review screen (edit/add/reject), save

## Days 6–10: Insights and launch
Done when: live at a public URL with demo mode, linked from the resume.
- [ ] Day 6: Out-of-range/borderline flags; marker detail page with trend chart and reference band
- [ ] Day 7: Dashboard: flagged first, sparklines, changed since last report, drift
- [ ] Day 8: Doctor summary with print stylesheet (save as PDF); JSON backup export/import; Delete all data (IndexedDB, caches, service worker)
- [ ] Day 9: Demo mode with synthetic reports; PWA + offline; `navigator.storage.persist()`; onboarding (storage choice, shared-computer note, data is per-browser, iPhone install nudge, not-medical-advice); accessibility
- [ ] Day 10: README with architecture diagram + demo GIF (mention the CSP privacy guarantee), custom subdomain, LinkedIn post, add to resume

## After launch
- [ ] v1.1: Optional passphrase encryption (WebCrypto AES-GCM, key via PBKDF2) and auto-lock after inactivity
- [ ] v2: React Native app (Android first) reusing packages/extraction
