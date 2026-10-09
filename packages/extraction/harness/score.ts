/**
 * Scores extraction against a hand-confirmed expected-values file (see expected.ts).
 * Pure functions, no I/O, so the rules are unit-tested; the harness prints only test names
 * and which field differed, never values.
 */
import { currentMarkerId, nameKey, sameWord, type ExtractedResult, type ExtractedWordResult } from '../src/index';

/** One confirmed result. Only the fields present are checked, so unverifiable ones can be deleted. */
export type ExpectedResult = {
  /** LOINC code for recognised tests; omit for tests kept under their printed name. */
  markerId?: string | null;
  name?: string;
  /** In the test's standard unit (the `unit` field), as the app stores it. */
  value?: number;
  unit?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  /** A result printed as a word ("Non Reactive"); checked against word results instead. */
  textValue?: string;
  expectedText?: string | null;
};

export type ExpectedFile = {
  /** False while it's a draft the owner hasn't checked against the PDF yet. */
  confirmed?: boolean;
  /** First 8 hex chars of the PDF's sha256; a different PDF under the same name is caught. */
  fingerprint?: string;
  results: ExpectedResult[];
};

export type Mismatch = { name: string; problem: 'missing' | 'value' | 'unit' | 'range' | 'text' };
export type Score = { expected: number; correct: number; mismatches: Mismatch[]; extras: number };

/** Older expected files were a bare `[{ markerId, value }]` array, hand-confirmed by definition. */
export function parseExpected(text: string): ExpectedFile {
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? { confirmed: true, results: parsed as ExpectedResult[] } : (parsed as ExpectedFile);
}

/** Within 0.5%: covers display rounding, never a misread digit. */
const close = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.005;
const sameBound = (a: number | null, b: number | null) => (a === null || b === null ? a === b : close(a, b));

/**
 * Checks each expected row against what was extracted: found at all, then value, unit and
 * range (words: the text). `extras` counts extracted numeric results not in the expected file,
 * which on a confirmed, complete file are false extractions.
 */
export function scoreFile(expected: ExpectedFile, results: ExtractedResult[], words: ExtractedWordResult[]): Score {
  const mismatches: Mismatch[] = [];
  const used = new Set<ExtractedResult>();
  let correct = 0;

  for (const e of expected.results) {
    const name = e.name ?? e.markerId ?? '?';

    if (e.textValue !== undefined) {
      const found = e.name && words.find((w) => nameKey(w.name) === nameKey(e.name!));
      if (!found) mismatches.push({ name, problem: 'missing' });
      else if (!sameWord(found.text, e.textValue) || (e.expectedText != null && !(found.expected && sameWord(found.expected, e.expectedText)))) {
        mismatches.push({ name, problem: 'text' });
      } else correct++;
      continue;
    }

    // Expected files may predate a corrected LOINC code; read old codes as the current one.
    const id = e.markerId ? currentMarkerId(e.markerId) : null;
    const candidates = results.filter((r) =>
      id ? r.markerId === id : e.name !== undefined && !r.markerId && (nameKey(r.name) === nameKey(e.name) || nameKey(r.printedName) === nameKey(e.name)),
    );
    // A test printed twice: prefer the copy with the expected value, so only real misses count.
    const found = candidates.find((r) => e.value === undefined || close(r.value, e.value)) ?? candidates[0];
    if (!found) {
      mismatches.push({ name, problem: 'missing' });
      continue;
    }
    used.add(found);
    const problem =
      e.value !== undefined && !close(found.value, e.value)
        ? 'value'
        : e.unit !== undefined && (found.unit ?? null) !== e.unit
          ? 'unit'
          : (e.refLow !== undefined && !sameBound(found.refLow, e.refLow)) || (e.refHigh !== undefined && !sameBound(found.refHigh, e.refHigh))
            ? 'range'
            : null;
    if (problem) mismatches.push({ name, problem });
    else correct++;
  }

  return { expected: expected.results.length, correct, mismatches, extras: results.filter((r) => !used.has(r)).length };
}
