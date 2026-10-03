import type { Row } from './types';

export type DetectedDate = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Which label it came from; the user confirms it either way. */
  source: 'collected' | 'received' | 'reported' | 'other';
};

const LABELS: { source: DetectedDate['source']; re: RegExp }[] = [
  { source: 'collected', re: /collect(?:ed|ion)|sample\s*(?:drawn|date|taken)|drawn\s*(?:on|date)|specimen\s*date/i },
  { source: 'received', re: /receiv(?:ed|ing)|registr(?:ed|ation)|registered/i },
  { source: 'reported', re: /report(?:ed|ing)?\s*(?:on|date|time)?|released|authori[sz]ed/i },
];
const NOT_A_REPORT_DATE = /birth|\bdob\b|d\.o\.b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const DATE_PATTERNS: { re: RegExp; read: (m: RegExpMatchArray) => [number, number, number] }[] = [
  // 2024-03-12
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, read: (m) => [+m[1], +m[2], +m[3]] },
  // 12/03/2024, 12-03-24, 12.03.2024 (day first, unless only month-first makes sense)
  {
    re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/,
    read: (m) => {
      const [a, b] = [+m[1], +m[2]];
      const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b];
      return [fullYear(m[3]), month, day];
    },
  },
  // 12-Mar-2024, 12 March 2024
  {
    re: new RegExp(String.raw`\b(\d{1,2})[\s/-]*${MONTH}[\s/,-]*(\d{4}|\d{2})\b`, 'i'),
    read: (m) => [fullYear(m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]],
  },
  // Mar 12, 2024
  {
    re: new RegExp(String.raw`\b${MONTH}\s*(\d{1,2}),?\s*(\d{4})\b`, 'i'),
    read: (m) => [+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]],
  },
];

function fullYear(text: string): number {
  const n = Number(text);
  return text.length === 2 ? 2000 + n : n;
}

function toIso([year, month, day]: [number, number, number]): string | null {
  if (year < 1950 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** First valid date in the text, as ISO. */
export function findDate(text: string): string | null {
  let best: { index: number; iso: string } | null = null;
  for (const { re, read } of DATE_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const iso = toIso(read(m));
    if (iso && (!best || m.index! < best.index)) best = { index: m.index!, iso };
  }
  return best?.iso ?? null;
}

/**
 * Finds the report's date for the review screen: the sample collection date if
 * printed, else when it was received, else reported, else the first date that
 * isn't a date of birth. Only a suggestion; the user confirms it.
 */
export function detectReportDate(rows: Row[]): DetectedDate | null {
  for (const { source, re } of LABELS) {
    for (const row of rows) {
      const label = row.text.match(re);
      if (!label || NOT_A_REPORT_DATE.test(row.text)) continue;
      const date = findDate(row.text.slice(label.index! + label[0].length));
      if (date) return { date, source };
    }
  }
  for (const row of rows) {
    if (NOT_A_REPORT_DATE.test(row.text)) continue;
    const date = findDate(row.text);
    if (date) return { date, source: 'other' };
  }
  return null;
}
