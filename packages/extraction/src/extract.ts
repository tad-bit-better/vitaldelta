import { matchMarker as defaultMatcher, type MarkerMatch } from './match';
import { markers, UNIT_VARIANTS } from './dictionary';
import { isMethod } from './methods';
import { parseRow, readBands, type Comparator, type ParsedRow } from './parse';
import { checkConsistency } from './relations';
import { rowBox, type Box, type Row } from './types';
import { canonicalUnit, convert } from './units';

/** Why a result's confidence was lowered. Shown on the review screen. */
export type Issue =
  | 'fuzzy-name' // name matched with a typo-level difference
  | 'unrecognised' // name isn't in the dictionary
  | 'missing-unit' // no unit printed; assumed to be the standard unit
  | 'unknown-unit' // unit printed but not recognised; value left as printed
  | 'implausible' // value is outside what's physically possible: likely a misread
  | 'inconsistent' // disagrees with the report's own arithmetic (see inconsistentWith)
  | 'flag-mismatch' // the printed H/L flag contradicts the printed range
  | 'ocr' // read from a scan or photo by OCR, where misreads are more likely (see ocr.ts)
  | 'missing-range' // no reference range printed
  | 'odd-range' // reference range doesn't make sense (low ≥ high)
  | 'banded-range' // range printed as bands (deficient / sufficient / ...): the normal band was used, or none found
  | 'duplicate' // same marker appears more than once with different values
  | 'bound-only'; // value is a bound like "<40" with no range: often guidance text, not a result

export type ExtractedResult = {
  /** LOINC id, or null for an unrecognised test kept under its printed name. */
  markerId: string | null;
  /** Marker name, or the printed name when unrecognised. */
  name: string;
  printedName: string;
  /** In the marker's standard unit when it could be converted, otherwise as printed. */
  value: number;
  unit: string | null;
  comparator: Comparator | null;
  /** Reference range from the report, in the same unit as `value`. */
  refLow: number | null;
  refHigh: number | null;
  /** Exactly what the report printed, for checking against the paper. */
  original: { valueText: string; unit: string | null; refText: string | null };
  labFlag: 'high' | 'low' | null;
  /** 0–1. Below REVIEW_THRESHOLD the review screen highlights it. */
  confidence: number;
  issues: Issue[];
  page: number;
  /** The row it was read from, to show it on the page. */
  box: Box;
  /** Assay method printed with the test ("HPLC", "Hexokinase"), if any. */
  method: string | null;
  /** For 'inconsistent': the relation the value disagrees with, e.g. "total − direct bilirubin". */
  inconsistentWith?: string;
};

/**
 * A method printed on the line under a test ("Method : Photometry", or just "Hexokinase"),
 * when that line isn't a result itself.
 */
export function methodLine(next: Row | undefined, row: Row): string | null {
  if (!next || next.page !== row.page || parseRow(next)) return null;
  const labelled = next.text.match(/^\s*method(?:ology)?\s*[:\-–]\s*(.+)$/i);
  const text = labelled ? labelled[1].trim() : next.text.trim();
  return isMethod(text) || (labelled && text.length <= 60) ? text : null;
}

export const REVIEW_THRESHOLD = 0.8;

const PENALTY: Partial<Record<Issue, number>> = {
  'missing-unit': 0.2,
  'unknown-unit': 0.3,
  'missing-range': 0.05,
  'odd-range': 0.1,
  // Always reviewed: the band chosen (or not found) is a judgement the user should see.
  'banded-range': 0.25,
  duplicate: 0.2,
  'bound-only': 0.3,
};
const UNRECOGNISED_CONFIDENCE = 0.5;
// Below REVIEW_THRESHOLD: a value that breaks the report's own arithmetic is always reviewed.
const INCONSISTENT_CONFIDENCE = 0.7;
const IMPLAUSIBLE_CONFIDENCE = 0.1;

const markerById = new Map(markers.map((m) => [m.id, m]));

type Matcher = (name: string) => MarkerMatch | null;

/**
 * Turns grouped rows into lab results: parse each row, match its name to a marker,
 * convert to the standard unit, check plausibility and score confidence.
 * Rows that aren't results (headers, IDs, QR text) are dropped.
 */
export function extractResults(rows: Row[], matchMarker: Matcher = defaultMatcher): ExtractedResult[] {
  const results: ExtractedResult[] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = parseRow(row);
    if (!parsed) continue;

    // Banded ranges often wrap: the normal band can be on the next line or two (lines that
    // aren't results themselves). Look there when this line didn't have it.
    if (parsed.banded && parsed.refLow === null && parsed.refHigh === null) {
      let text = parsed.refText ?? '';
      for (const next of rows.slice(index + 1, index + 3)) {
        if (next.page !== row.page || parseRow(next)) break;
        text += ` ${next.text}`;
        const normal = readBands(text)?.normal;
        if (normal) {
          Object.assign(parsed, { refLow: normal.refLow, refHigh: normal.refHigh, refText: normal.text });
          break;
        }
      }
    }

    const shared = { page: row.page, box: rowBox(row), method: parsed.method ?? methodLine(rows[index + 1], row) };
    for (let p: ParsedRow | undefined = parsed; p; p = p.second) {
      const result = toResult(p, shared, matchMarker);
      if (result) results.push(result);
    }
  }

  return checkConsistency(dedupe(dropGuidance(results)), INCONSISTENT_CONFIDENCE);
}

/** One parsed result as an extracted one: matched, converted, checked and scored. Null to drop it. */
function toResult(parsed: ParsedRow, shared: Pick<ExtractedResult, 'page' | 'box' | 'method'>, matchMarker: Matcher): ExtractedResult | null {
  const issues: Issue[] = [];
  const unit = parsed.unit ? canonicalUnit(parsed.unit) : null;
  let match = matchMarker(parsed.name);

  // A recognised unit that can't convert to the marker's unit means a different quantity
  // with the same name: "PDW" in % is the CV, not the width in fL, and "Neutrophils 7716 /cmm"
  // is the absolute count, not the percentage.
  const converts = (m: MarkerMatch | null) => !m || !unit || convert(1, unit, m.marker.unit, m.marker.conversions) !== null;
  if (!converts(match)) {
    const variant = unit && markerById.get(UNIT_VARIANTS[match!.marker.id]?.[unit] ?? '');
    const absolute = variant ? null : matchMarker(`Absolute ${parsed.name}`);
    match = variant ? { ...match!, marker: variant } : absolute && converts(absolute) ? absolute : null;
  }

  const base = {
    ...shared,
    printedName: parsed.name,
    comparator: parsed.comparator,
    original: { valueText: parsed.valueText, unit: parsed.unit, refText: parsed.refText },
    labFlag: parsed.flag,
  };

  if (!match) {
    // Keep unknown tests only when the row clearly looks like a result.
    if (!parsed.unit || !parsed.refText) return null;
    return {
      ...base,
      markerId: null,
      name: parsed.name,
      value: parsed.value,
      unit: unit ?? parsed.unit,
      refLow: parsed.refLow,
      refHigh: parsed.refHigh,
      confidence: UNRECOGNISED_CONFIDENCE,
      issues: parsed.banded ? ['unrecognised', 'banded-range'] : ['unrecognised'],
    };
  }

  const { marker } = match;
  let confidence = 1;
  if (match.method === 'fuzzy') {
    issues.push('fuzzy-name');
    confidence -= (1 - match.similarity) * 2;
  }

  let value = parsed.value;
  let resultUnit: string | null = marker.unit;
  let { refLow, refHigh } = parsed;
  if (!parsed.unit) {
    if (marker.unit !== 'ratio') issues.push('missing-unit');
  } else if (!unit) {
    issues.push('unknown-unit');
    resultUnit = parsed.unit;
  } else {
    const to = (v: number | null) => (v === null ? null : convert(v, unit, marker.unit, marker.conversions));
    value = to(value)!;
    refLow = to(refLow);
    refHigh = to(refHigh);
  }

  if (parsed.banded) issues.push('banded-range');
  else if (!parsed.refText) issues.push(parsed.comparator ? 'bound-only' : 'missing-range');
  else if (refLow !== null && refHigh !== null && refLow >= refHigh) issues.push('odd-range');

  for (const issue of issues) confidence -= PENALTY[issue] ?? 0;
  if (resultUnit === marker.unit && (value < marker.plausibleMin || value > marker.plausibleMax)) {
    issues.push('implausible');
    confidence = Math.min(confidence, IMPLAUSIBLE_CONFIDENCE);
  }

  return {
    ...base,
    markerId: marker.id,
    name: marker.name,
    value: round(value),
    unit: resultUnit,
    refLow: refLow === null ? null : round(refLow),
    refHigh: refHigh === null ? null : round(refHigh),
    confidence: clamp(confidence),
    issues,
  };
}

/**
 * Labs often print guidance such as "HDL <40 Low" or "LDL <100 Optimal" below the
 * results. When a marker also has a real result, its bound-only rows are guidance.
 */
function dropGuidance(results: ExtractedResult[]): ExtractedResult[] {
  const hasRealResult = new Set(results.filter((r) => r.markerId && !r.issues.includes('bound-only')).map((r) => r.markerId));
  return results.filter((r) => !(r.issues.includes('bound-only') && hasRealResult.has(r.markerId)));
}

/** Values this close are the same result, e.g. HbA1c printed as % and as mmol/mol. */
const SAME_VALUE_TOLERANCE = 0.02;

const sameValue = (a: ExtractedResult, b: ExtractedResult) =>
  a.unit === b.unit && Math.abs(a.value - b.value) <= Math.max(Math.abs(a.value), Math.abs(b.value)) * SAME_VALUE_TOLERANCE;

/** Prefer the result printed in the standard unit, then the more confident one. */
const better = (a: ExtractedResult, b: ExtractedResult) => {
  const printedInStandard = (r: ExtractedResult) => (r.original.unit ? canonicalUnit(r.original.unit) === r.unit : false);
  if (printedInStandard(a) !== printedInStandard(b)) return printedInStandard(a) ? a : b;
  return b.confidence > a.confidence ? b : a;
};

/**
 * Reports often repeat a value (a summary page, or one result in two units).
 * Repeats of the same value are collapsed, keeping the copy printed in the standard
 * unit; differing values for the same marker are kept and flagged for review.
 */
function dedupe(results: ExtractedResult[]): ExtractedResult[] {
  const kept: ExtractedResult[] = [];
  for (const result of results) {
    const same = result.markerId ? kept.filter((r) => r.markerId === result.markerId) : [];
    const repeat = same.find((r) => sameValue(r, result));
    if (repeat) {
      kept[kept.indexOf(repeat)] = better(repeat, result);
      continue;
    }
    if (same.length) {
      for (const r of [...same, result]) {
        if (!r.issues.includes('duplicate')) {
          r.issues.push('duplicate');
          r.confidence = clamp(r.confidence - PENALTY.duplicate!);
        }
      }
    }
    kept.push(result);
  }
  return kept;
}

const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
/** Avoids float noise from unit conversion (99.08800000001). */
const round = (n: number) => Number(n.toPrecision(6));
