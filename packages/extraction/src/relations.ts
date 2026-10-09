/**
 * Cross-checks between results on one report. Labs print values that must agree
 * arithmetically (indirect bilirubin = total − direct, absolute count = % × WBC…), and a
 * printed H/L flag must agree with the printed range. A misread digit usually breaks one of
 * these, so a result that disagrees is sent for review. Lab-independent: pure arithmetic on
 * what the report itself printed, never a judgement about the patient.
 */
import type { ExtractedResult } from './extract';

type Relation = {
  /** The marker whose printed value is checked (and flagged when it disagrees). */
  target: string;
  /** The markers it's computed from, in `f`'s argument order. */
  terms: string[];
  f: (...values: number[]) => number;
  /** Allowed difference: `abs` + `rel` × |printed|, covering the operands' display rounding. */
  abs: number;
  rel: number;
  /** Shown to the user: "expected ≈ <text>". */
  text: string;
};

const count = (pct: string, name: string): Relation => ({
  target: { neutrophil: '751-8', lymphocyte: '731-0', monocyte: '742-7', eosinophil: '711-2', basophil: '704-7' }[name]!,
  terms: [pct, '6690-2'],
  f: (p, wbc) => (p * wbc) / 100,
  abs: 0.15,
  rel: 0.08,
  text: `${name} % × WBC count`,
});

const RELATIONS: Relation[] = [
  { target: '1971-1', terms: ['1975-2', '1968-7'], f: (t, d) => t - d, abs: 0.15, rel: 0.02, text: 'total − direct bilirubin' },
  { target: '10834-0', terms: ['2885-2', '1751-7'], f: (tp, alb) => tp - alb, abs: 0.15, rel: 0.02, text: 'total protein − albumin' },
  { target: '43396-1', terms: ['2093-3', '2085-9'], f: (tc, hdl) => tc - hdl, abs: 2, rel: 0.02, text: 'total − HDL cholesterol' },
  { target: '2501-5', terms: ['2500-7', '2498-4'], f: (tibc, fe) => tibc - fe, abs: 6, rel: 0.03, text: 'TIBC − iron' },
  { target: '1759-0', terms: ['1751-7', '10834-0'], f: (alb, glob) => alb / glob, abs: 0.08, rel: 0.04, text: 'albumin ÷ globulin' },
  { target: '9830-1', terms: ['2093-3', '2085-9'], f: (tc, hdl) => tc / hdl, abs: 0.1, rel: 0.04, text: 'total ÷ HDL cholesterol' },
  { target: '11054-4', terms: ['2089-1', '2085-9'], f: (ldl, hdl) => ldl / hdl, abs: 0.1, rel: 0.04, text: 'LDL ÷ HDL cholesterol' },
  { target: '3097-3', terms: ['3094-0', '2160-0'], f: (bun, cr) => bun / cr, abs: 1, rel: 0.05, text: 'BUN ÷ creatinine' },
  { target: '2502-3', terms: ['2498-4', '2500-7'], f: (fe, tibc) => (fe / tibc) * 100, abs: 2.5, rel: 0.05, text: 'iron ÷ TIBC × 100' },
  // Labs compute VLDL as TG/5 (Friedewald); a lab using TG/2.2 for mmol/L converts the same.
  { target: '13458-5', terms: ['2571-8'], f: (tg) => tg / 5, abs: 3, rel: 0.08, text: 'triglycerides ÷ 5' },
  count('770-8', 'neutrophil'),
  count('736-9', 'lymphocyte'),
  count('5905-5', 'monocyte'),
  count('713-8', 'eosinophil'),
  count('706-2', 'basophil'),
  // Red cell indices, as analysers derive them.
  { target: '786-4', terms: ['718-7', '4544-3'], f: (hb, hct) => (hb / hct) * 100, abs: 0.8, rel: 0.03, text: 'haemoglobin ÷ haematocrit × 100' },
  { target: '785-6', terms: ['718-7', '789-8'], f: (hb, rbc) => (hb / rbc) * 10, abs: 0.8, rel: 0.03, text: 'haemoglobin ÷ RBC count × 10' },
  { target: '787-2', terms: ['4544-3', '789-8'], f: (hct, rbc) => (hct / rbc) * 10, abs: 2.5, rel: 0.03, text: 'haematocrit ÷ RBC count × 10' },
];

/** The marker's single trustworthy copy: in its standard unit, and not printed twice with different values. */
function only(results: ExtractedResult[], markerId: string): ExtractedResult | null {
  const found = results.filter((r) => r.markerId === markerId && !r.issues.includes('unknown-unit') && !r.issues.includes('implausible'));
  return found.length === 1 ? found[0] : null;
}

/** Within 1% of a range bound, the lab's own rounding may flag either way; don't second-guess it. */
const FLAG_MARGIN = 0.01;

/**
 * Flags results that disagree with the report's own arithmetic ('inconsistent', saying which
 * relation) or whose printed H/L flag contradicts the printed range ('flag-mismatch'). Both
 * mean something was probably misread, so the result is held for review.
 */
export function checkConsistency(results: ExtractedResult[], reviewConfidence: number): ExtractedResult[] {
  const flagged = new Map<ExtractedResult, string>();

  for (const relation of RELATIONS) {
    const target = only(results, relation.target);
    const terms = relation.terms.map((id) => only(results, id));
    if (!target || !terms.every((t) => t !== null)) continue;
    const computed = relation.f(...terms.map((t) => t!.value));
    if (!Number.isFinite(computed)) continue;
    if (Math.abs(computed - target.value) > relation.abs + relation.rel * Math.abs(target.value)) {
      flagged.set(target, relation.text);
    }
  }

  return results.map((r) => {
    const relation = flagged.get(r);
    const flagWrong =
      r.labFlag !== null &&
      (r.labFlag === 'high'
        ? r.refHigh !== null && r.value < r.refHigh * (1 - FLAG_MARGIN) && (r.refLow === null || r.value > r.refLow * (1 + FLAG_MARGIN))
        : r.refLow !== null && r.value > r.refLow * (1 + FLAG_MARGIN) && (r.refHigh === null || r.value < r.refHigh * (1 - FLAG_MARGIN)));
    if (!relation && !flagWrong) return r;
    return {
      ...r,
      issues: [...r.issues, ...(relation ? ['inconsistent' as const] : []), ...(flagWrong ? ['flag-mismatch' as const] : [])],
      ...(relation ? { inconsistentWith: relation } : {}),
      confidence: Math.min(r.confidence, reviewConfidence),
    };
  });
}
