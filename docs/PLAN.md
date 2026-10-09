# 10-day launch plan

## Days 1–5: Reading reports
Done when: a PDF uploads, extracted values can be reviewed, and they save on the device (or for this session only).
- [x] Day 1: pnpm workspace (apps/web + packages/extraction), Vite + React + TS, repo + licence, deploy to Vercel with strict CSP (`connect-src 'self'`), self-hosted fonts, no analytics (live at https://vitaldelta.app)
- [x] Day 2: pdf.js with self-hosted worker; text with coordinates in a Web Worker; row grouping + tests
- [x] Day 3: Row parsing (value, unit, range); dictionary of ~40 markers; collect fixtures/
- [x] Day 4: Name matching, unit conversion, plausibility, confidence; `pnpm harness`
- [x] Day 5: Storage interface with Dexie and in-memory backends; upload flow, report date/lab, review screen (edit/add/reject), save

## Days 6–10: Insights and launch
Done when: live at a public URL with demo mode, linked from the resume.
- [x] Day 6: Out-of-range/borderline flags; marker detail page with trend chart and reference band
- [x] Day 7: Dashboard: flagged first, sparklines, changed since last report, drift
- [x] Day 7 (added): Multiple patients: sidebar, patient confirmed on every report (name/sex suggestions and mismatch warnings), duplicate-report check, rename/delete patient
- [x] Day 8: Doctor summary with print stylesheet (save as PDF); JSON backup export/import; Delete all data (IndexedDB, caches, service worker)
- [x] Day 8 (added): Grid/list layout for tests; guideline ranges for 10 tests (HbA1c, fasting glucose, lipids, eGFR, hs-CRP, vitamin D) when a report prints no range
- [x] Day 9: Demo mode with synthetic reports; PWA + offline; `navigator.storage.persist()`; onboarding (storage choice, shared-computer note, data is per-browser, iPhone install nudge, not-medical-advice); accessibility
- [x] Dashboard redesign: top bar with patient switcher and backup status, count tiles, results by panel with a range bar, reports and backup nudge beside; phones get a bottom Add bar and cards; add a missing range on the test page
- [x] Review redesign: the PDF page beside the results with the selected value highlighted, a snippet of the printed row on each value to check, "Is this Total protein?" for unrecognised names, duplicate banner with Open/Add anyway, "Skip those and save"; phones open the page full screen
- [ ] Day 10: README with architecture diagram + demo GIF (mention the CSP privacy guarantee), custom subdomain, LinkedIn post, add to resume

## Open items
Things decided or found in conversation that aren't done yet.
- [x] README with architecture diagram, screenshots (docs/images, from the demo data via apps/web/scripts/screenshots.mjs) and the CSP privacy guarantee
- [ ] Day 10 still to do: demo GIF for the README, LinkedIn post, resume
- [x] Verify the 71 LOINC codes (NLM LOINC API + FHIR terminology server, 2026-10-09): vitamin D → 62292-8, eGFR → 98979-8, old codes mapped
- [x] Verify the 10 guideline ranges against their sources (values all correct; labels now carry the year; HDL falls back to ≥ 40 without a sex)
- [ ] PDW printed in % is a different LOINC test (51631-0): choose the marker by unit
- [ ] Test on a real iPhone (Add to Home Screen, offline) and Android (Install); automated tests cover desktop Chrome only
- [ ] Add markers with guideline limits: urine albumin/creatinine ratio (KDIGO < 30 mg/g), 2-hour / post-meal glucose (ADA < 140 mg/dL)
- [ ] Maybe later: read the lab's own "Desirable / Borderline / High" guidance table as the report's range, instead of dropping it
- [ ] Verify unit conversion factors against a published SI table (AMA Manual of Style); have someone medical review plausibility bounds
- [ ] MPV and PDW print "%" on the owner's lab report; confirm under "Raw rows" on /dev/rows whether the lab really prints % (then they stay unrecognised) or the parser picked the wrong token
- [ ] Owner's browser has a "Me" patient created before multi-patient support; rename it or delete and re-add the report
- [ ] Lab name isn't auto-detected yet; one PDF per upload
- [ ] A report page (the mockup's "View" next to each report): its results as printed, with edit
- [x] LOINC copyright notice in the README
- [x] About page (/app/about) with the LOINC notice, privacy, sources and licences
- [ ] Optional: switch Cloudflare DNS to Vercel's newer recommended records; make the vitaldelta.vercel.app redirect a 308

## After launch
- [ ] v1.1: Optional passphrase encryption (WebCrypto AES-GCM, key via PBKDF2) and auto-lock after inactivity
- [ ] Play Console signup (US$25, identity verification takes days; new accounts need a 14-day closed test with 12+ testers). Option: list the PWA via a Trusted Web Activity before v2
- [ ] v2: React Native app (Android first) reusing packages/extraction
