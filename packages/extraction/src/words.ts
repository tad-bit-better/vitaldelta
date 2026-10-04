import { nameKey } from './names';
import type { Row } from './types';

// Results printed as words: serology, urine routine, cultures. Kept to words that only
// ever appear as a result, so a row's name column can't be mistaken for one.
const WORD = String.raw`(?:non[-\s]?reactive|weakly\s+reactive|reactive|negative|positive|not\s+detected|detected|absent|present|nil|trace|not\s+seen|seen|normal|abnormal|clear|turbid|slightly\s+turbid|sterile|no\s+growth)`;
const WORD_RESULT = new RegExp(String.raw`^${WORD}$`, 'i');
// Labels that can sit beside these words but aren't tests ("Remarks : Normal").
const NOT_A_TEST = /^(?:remarks?|comments?|impression|interpretation|results?|notes?|status|sample|specimen|method|conclusion|summary|advice|findings?)\b/i;

export type ExtractedWordResult = {
  /** Name as printed, cleaned of trailing punctuation. Word results aren't matched to the dictionary. */
  name: string;
  /** The result as printed, e.g. "Non Reactive". */
  text: string;
  /** The expected result printed beside it (the "reference" column), if any. */
  expected: string | null;
  page: number;
};

/** Compares two word results ignoring case, spacing and hyphens: "Non-Reactive" = "non reactive". */
export function sameWord(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '');
  return norm(a) === norm(b);
}

export type WordStatus = 'as-expected' | 'differs' | 'no-expected';

/** Only ever compares with the report's own expected word; it never judges what a word means. */
export function wordStatus(text: string, expected: string | null): WordStatus {
  if (!expected) return 'no-expected';
  return sameWord(text, expected) ? 'as-expected' : 'differs';
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Rows whose result is a word: a name, then a word result in its own column, optionally
 * followed by the expected word. Rows with a number before the word are left to the numeric
 * extractor. One result per name per page (repeated headers on later pages are dropped).
 */
export function extractWordResults(rows: Row[]): ExtractedWordResult[] {
  const results: ExtractedWordResult[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const at = row.items.findIndex((item, i) => i > 0 && WORD_RESULT.test(clean(item.text)));
    if (at < 0) continue;
    // A number column before the word means a numeric result with a note ("95 | mg/dL | Normal").
    if (row.items.slice(1, at).some((i) => /^[<>≤≥]?\d[\d,.]*$/.test(clean(i.text)))) continue;
    const name = row.items.slice(0, at).map((i) => clean(i.text)).join(' ').replace(/[\s:,.-]+$/, '');
    if (!/[a-z]{2}/i.test(name) || name.length > 80 || NOT_A_TEST.test(name)) continue;
    const next = row.items[at + 1] ? clean(row.items[at + 1].text) : '';
    const result: ExtractedWordResult = {
      name,
      text: clean(row.items[at].text),
      expected: WORD_RESULT.test(next) ? next : null,
      page: row.page,
    };
    const key = `${nameKey(name)}|${result.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(result);
  }
  return results;
}

/**
 * True when a report has results printed as words, so the app can say what it found even
 * when there are no numeric results.
 */
export function hasWordResults(rows: Row[]): boolean {
  return extractWordResults(rows).length > 0;
}
