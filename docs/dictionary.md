# Marker dictionary

`packages/extraction/src/dictionary.json` is the list of lab tests the app recognises.
Extraction never uses per-lab templates; all lab-specific knowledge lives here as synonyms.

## What each marker has

| Field | Meaning |
|---|---|
| `id` | LOINC code |
| `name` | Name shown in the app |
| `synonyms` | Other names labs print for the same test |
| `unit` | Standard unit values are converted to (canonical form from `src/units.ts`) |
| `conversions` | Other units labs use → factor (or factor + offset) into `unit` |
| `plausibleMin` / `plausibleMax` | Wide bounds; values outside are almost certainly misreads, not diagnoses |
| `guideline` | Optional. Limits from a clinical guideline, used only when a report prints no range (below) |

Panels (how the dashboard groups tests: "Liver enzymes" within "Liver function test") live in
`src/panels.ts`, keyed by marker id; a test checks every marker is in exactly one panel, so add
a new marker there too.

Assay methods (HPLC, Hexokinase, Jaffe…) are not synonyms: they're split off names using the
vocabulary in `src/methods.ts`, and stored as the result's method. Add a method there, not as a synonym.

## Synonym policy

- **Exhaustive up front.** Each marker lists every genuinely different name we know of
  (SGPT, ALT, Alanine Aminotransferase…). Anything missed is added by a pull request.
- **Don't list mechanical variants.** `nameKey()` in `src/names.ts` already ignores case,
  punctuation, spacing, UK/US spelling (haem/hem, leuc/leuk) and filler words
  (Serum, Plasma, Blood, Level, Estimation, "S."). A test fails if a synonym is redundant.
- **Leave out ambiguous names.** If a name means different tests at different labs
  (e.g. "TC" = total count or total cholesterol), don't add it. A test guards known cases.
- **One name, one marker.** A test fails if any name maps to two markers.

## Adding or changing a marker

1. Look up the code on [loinc.org](https://loinc.org/search/) and confirm the component,
   specimen (serum/plasma/blood) and property (mass vs. substance concentration, %).
2. Use the unit most labs print as `unit`; any unit conversion needs a cited source.
3. Plausibility bounds must be wide (they catch misreads, not illness), with a cited source.
4. Add synonyms per the policy above; include an example of the printed name in the PR.
5. Run `pnpm test` (LOINC check digit, uniqueness, redundancy) and `pnpm harness`
   (match rate must not drop).

## How we confirm the dictionary is correct

1. **Automated tests** on every change: LOINC check digits, unique ids, no shared names,
   no redundant synonyms, bounds in order.
2. **LOINC codes checked against LOINC** (done 2026-10-09 for all 71): long name, component,
   property, specimen and unit through the NLM Clinical Tables LOINC API, and status through
   the HL7 FHIR terminology server (tx.fhir.org). loinc.org itself blocks automated access. Two
   codes were corrected (below). Re-check any new code the same way.
3. **Real reports** (`pnpm harness`): per fixture, a hand-confirmed `<file>.expected.json`
   (draft it with `pnpm --filter @vitaldelta/extraction expected <n>`, check it against the
   PDF, set `"confirmed": true`). The harness scores each row per field (found, value, unit,
   range; words by text) and fails when confirmed accuracy regresses. Drafts are shown but
   don't gate. Expected files hold real values, so they live in fixtures/ (gitignored) and
   output only ever prints test names and which field differed.
4. **Human review**: PR checklist above; a one-time review of bounds and conversions by
   someone with a medical background before launch.
5. **In the app**: users confirm every value before saving; low-confidence rows are highlighted.

## Unrecognised tests

Rows that don't match the dictionary but have a value, unit and reference range are kept
as unrecognised tests under their printed name (compared by exact name only, no unit
conversion or plausibility check). They're the main signal for what to add next.

## Units and conversions

- `src/units.ts` maps printed spellings to canonical units (mg/dl, mg% → mg/dL; IU/L → U/L;
  mIU/L → µIU/mL; /cumm, 1000/µL → /µL, 10^3/µL). Units convert generically within their kind:
  cell counts (/µL, 10^3/µL, lakh/µL, 10^6/µL), mass (g/dL, mg/L, ng/mL…) and molar (mmol/L, nmol/L…).
  Don't list those in `conversions`; a test fails if you do.
- Conversions across kinds (molar ↔ mass) are per marker in `conversions`. Factors are derived from molar mass
  (e.g. glucose 180.16 g/mol → mmol/L × 18.016 = mg/dL); HbA1c uses the IFCC→NGSP master
  equation (% = 0.09148 × mmol/mol + 2.152). **Verify each against a published SI conversion
  table (e.g. AMA Manual of Style) before launch.**
- Plausibility bounds are in the standard unit and are checked only after conversion.
  An unrecognised unit is never guessed: the value stays as printed and is flagged for review.

## Guideline ranges

Most reference ranges belong to the lab: they depend on its method and the patient's age
and sex, so the app never invents one. A few tests are different: their limits come from
clinical guidelines and labs print the same numbers. For those, a `guideline` range is used
when the report printed no range (often because the lab printed a "Desirable / Borderline /
High" table instead, which extraction drops as guidance).

| Test | Limit | Source (label in the app) |
|---|---|---|
| HbA1c | < 5.7 % | ADA 2026, Standards of Care §2 (5.7–6.4 % prediabetes, ≥ 6.5 % diabetes) |
| Fasting glucose | ≥ 70 and < 100 mg/dL | ADA 2026: < 100 normal (§2). ADA sets no lower normal limit; 70 is its level 1 hypoglycaemia threshold (§6), so below 70 is flagged |
| Total cholesterol | < 200 mg/dL | NCEP ATP III (2001), "desirable" |
| LDL cholesterol | < 100 mg/dL | NCEP ATP III, "optimal" |
| Triglycerides | < 150 mg/dL | NCEP ATP III, "normal" |
| Non-HDL cholesterol | < 130 mg/dL | NLA 2015 (Jacobson et al., J Clin Lipidol), "desirable" |
| HDL cholesterol | ≥ 40 mg/dL; women ≥ 50 mg/dL | NCEP ATP III: < 40 is low for everyone (used when sex is unknown, and for men). The women's 50 is ATP III's metabolic syndrome criterion, labelled "ATP III metabolic syndrome" |
| eGFR | ≥ 60 mL/min/1.73m² | KDIGO 2024: < 60 (G3a or lower) for 3 months is CKD by GFR alone. 60–89 is G2 "mildly decreased", so the app says "within the guideline range", never "normal" |
| hs-CRP | ≤ 3 mg/L | AHA/CDC 2003 (Pearson et al., Circulation): < 1 low, 1–3 average, > 3 high risk |
| Vitamin D (25-OH) | ≥ 20 ng/mL | IOM 2011 (now National Academy of Medicine): ≥ 20 adequate. The Endocrine Society 2024 guideline sets no thresholds, so it isn't cited; 30 isn't used and there's no upper limit |

Checked against the sources on 2026-10-09 (ADA Standards of Care 2026 §2 and §6, ATP III
Executive Summary tables 2 and 8, NLA 2015 Part 1, KDIGO 2024 CKD guideline, Pearson 2003,
NIH ODS vitamin D fact sheet). Strict / inclusive limits match each source's wording.

Considered and left out, because the lab sets the range or guidelines disagree: haemoglobin and
the rest of the CBC, TSH and thyroid hormones, liver enzymes, creatinine, urea, electrolytes,
calcium, uric acid (gout targets are treatment goals, not normal ranges), ferritin and iron
studies, vitamin B12, CRP (not hs-CRP), random glucose, VLDL and the cholesterol ratios (no
guideline cut-off; labs print their own).

Worth adding as new markers with guideline limits: urine albumin/creatinine ratio (KDIGO < 30
mg/g) and 2-hour glucose (ADA < 140 mg/dL for the OGTT; labs often apply it to post-meal
glucose too). They need LOINC codes and synonyms first.

Rules:
- **The report's range always wins**, even a one-sided one. The guideline is only a fallback.
- **Only add a guideline when labs don't set the limit themselves**: a published, method-
  independent cut-off. Haemoglobin, TSH, liver enzymes, B12 etc. never get one. Contested
  limits (vitamin D) stay out.
- **Strict bounds** (`highStrict` / `lowStrict`) mean the limit itself is outside, matching
  how guidelines are written ("< 5.7").
- **Sex-specific limits** go in `bySex` (with their own `source` when they come from a different
  part of the guideline); with no known sex, the top-level limit is used, or none if there isn't one.
- **Every source carries its year** ("ADA 2026"), so it's clear which edition the limit comes from.
- **The app always says which range it used** ("Above the guideline range", "< 200 · NCEP ATP
  III guideline"), and the doctor summary names each guideline in full.
- Guideline ranges are applied when displaying (`effectiveRange` in `src/guideline.ts`), never
  stored, so saved reports pick up changes here and nothing needs migrating.
- `dictionary.test.ts` lists the markers allowed to have one; adding a guideline means
  updating that list and this table together.

## Known open questions

- **Corrected codes**: vitamin D 1989-3 was 25-OH vitamin D3 only; it's now 62292-8 (D2 + D3,
  what labs report). eGFR 62238-1 was the CKD-EPI 2009 equation; it's now 98979-8 (CKD-EPI 2021,
  race-free). Saved results and old backups with the old codes are read under the new ones
  (`RENAMED_MARKERS` in `src/dictionary.ts`). Any future code change must go there too.
- **LDL** stays on 2089-1, which doesn't say how LDL was measured: reports print calculated LDL
  (13457-7) or direct LDL (18262-6) and often don't say which.
- **PDW is picked by its printed unit** (`UNIT_VARIANTS` in `src/dictionary.ts`): fL is the
  width (32207-3), % is its CV (51631-0, name "PDW (CV)"). MPV has no % form, so an MPV printed
  in % stays unrecognised rather than guessed. Use `UNIT_VARIANTS` for future same-name cases.
- Two names for one test joined by a slash ("PCV/HAEMATOCRIT") match only when **every** part
  names the same marker, so "HDL/LDL Cholesterol Ratio" never matches either side.
- Seen on real reports but not added, pending verified LOINC codes: RDW-SD (fL), total IgE,
  HDL/LDL cholesterol ratio, urea/creatinine ratio (distinct from BUN/creatinine).
- eGFR by MDRD (33914-3) or a printed CKD-EPI 2009 still lands on the 2021 marker; the
  equation isn't detected.
- Unit conversion factors and plausibility bounds still need a review by someone medical.

## Licence

LOINC codes are © Regenstrief Institute, Inc., used under the LOINC licence
(https://loinc.org/license/). The notice must also appear in the README and the app's About page.
