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
2. **Official LOINC table** (planned): a script checks every id exists in the downloaded
   LOINC table (free account, kept out of git) and its official name matches.
3. **Real reports** (planned, `pnpm harness`): hand-confirmed expected values per fixture,
   kept out of git; match rate and accuracy must not regress.
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

| Test | Limit | Source |
|---|---|---|
| HbA1c | < 5.7 % | ADA Standards of Care (normal; 5.7–6.4 prediabetes) |
| Fasting glucose | ≥ 70 and < 100 mg/dL | ADA (< 100 normal fasting; < 70 is the hypoglycaemia alert level) |
| Total cholesterol | < 200 mg/dL | NCEP ATP III (desirable) |
| LDL cholesterol | < 100 mg/dL | NCEP ATP III (optimal) |
| Triglycerides | < 150 mg/dL | NCEP ATP III (normal) |
| Non-HDL cholesterol | < 130 mg/dL | National Lipid Association (desirable) |
| HDL cholesterol | ≥ 40 mg/dL (male), ≥ 50 mg/dL (female) | NCEP ATP III (low HDL; the female limit is from its metabolic syndrome criteria) |
| eGFR | ≥ 60 mL/min/1.73m² | KDIGO 2012 (below 60 is stage G3a or lower; 60–89 is G2, not flagged on its own) |
| hs-CRP | ≤ 3 mg/L | AHA/CDC 2003 (cardiovascular risk: < 1 low, 1–3 average, > 3 high) |
| Vitamin D (25-OH) | ≥ 20 ng/mL | IOM 2011 (below 20 is inadequate; IOM and the Endocrine Society agree on this floor, but not on 30, so 30 isn't used and there's no upper limit) |

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
- **Sex-specific limits** go in `bySex`; with no known sex, no guideline range is used.
- **The app always says which range it used** ("Above the guideline range", "< 200 · NCEP ATP
  III guideline"), and the doctor summary names each guideline in full.
- Guideline ranges are applied when displaying (`effectiveRange` in `src/guideline.ts`), never
  stored, so saved reports pick up changes here and nothing needs migrating.
- `dictionary.test.ts` lists the markers allowed to have one; adding a guideline means
  updating that list and this table together.

## Known open questions

- All codes were written from memory and pass only the check-digit test; verify against
  loinc.org (step 2 above).
- `1989-3` may be 25-hydroxyvitamin D3 specifically rather than total D2+D3.
- Guideline limits above were written from memory; check them against the current ADA
  Standards of Care, NCEP ATP III / NLA, KDIGO, AHA/CDC and IOM documents, and have someone
  medical review them.
- eGFR variants (CKD-EPI, MDRD) have different LOINC codes but share one marker here.
- "Neutrophils", "Lymphocytes" etc. are the % markers; absolute counts aren't in the
  dictionary yet. Matching rejects a name match whose unit can't convert (e.g. 10^3/µL
  for a % marker), so absolute counts are kept as unrecognised rather than mixed up.

## Licence

LOINC codes are © Regenstrief Institute, Inc., used under the LOINC licence
(https://loinc.org/license/). The notice must also appear in the README and the app's About page.
