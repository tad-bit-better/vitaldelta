import { convert, markers, REVIEW_THRESHOLD, suggestMarker, type ExtractedResult, type Issue, type Marker } from '@vitaldelta/extraction';
import type { NewResult } from '../storage/types';

export type Status = 'pending' | 'confirmed' | 'rejected';

/** A result being reviewed. Numbers are kept as text while the user edits them. */
export type Draft = {
  key: number;
  status: Status;
  /** Low confidence at extraction: shown under "Needs your check" for the whole review. */
  flagged: boolean;
  markerId: string | null;
  name: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
  edited: boolean;
  source: ExtractedResult | null;
};

export const markerById = new Map(markers.map((m) => [m.id, m]));
export const sortedMarkers = [...markers].sort((a, b) => a.name.localeCompare(b.name));

export const toText = (n: number | null) => (n === null ? '' : String(Number(n.toPrecision(6))));
const toNumber = (s: string) => (s.trim() === '' ? null : Number(s));
export const isNumber = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));

export const rowId = (key: number) => `result-${key}`;

export function fromExtracted(r: ExtractedResult, key: number): Draft {
  return {
    key,
    status: r.confidence < REVIEW_THRESHOLD ? 'pending' : 'confirmed',
    flagged: r.confidence < REVIEW_THRESHOLD,
    markerId: r.markerId,
    name: r.name,
    value: toText(r.value),
    unit: r.unit ?? '',
    refLow: toText(r.refLow),
    refHigh: toText(r.refHigh),
    edited: false,
    source: r,
  };
}

/** A result the reader missed, typed in by the user. */
export function blankDraft(key: number): Draft {
  return { key, status: 'confirmed', flagged: false, markerId: null, name: '', value: '', unit: '', refLow: '', refHigh: '', edited: true, source: null };
}

export function problems(d: Draft): string[] {
  const list: string[] = [];
  if (!d.name.trim()) list.push('Enter a name.');
  if (!isNumber(d.value)) list.push('Enter a number for the value.');
  if (d.refLow && !isNumber(d.refLow)) list.push('Range low must be a number.');
  if (d.refHigh && !isNumber(d.refHigh)) list.push('Range high must be a number.');
  return list;
}

export function toNewResult(d: Draft): NewResult {
  return {
    markerId: d.markerId,
    name: d.name.trim(),
    value: Number(d.value),
    textValue: null,
    expectedText: null,
    method: d.source?.method ?? null,
    unit: d.unit.trim() || null,
    comparator: d.source?.comparator ?? null,
    refLow: toNumber(d.refLow),
    refHigh: toNumber(d.refHigh),
    labFlag: d.source?.labFlag ?? null,
    confidence: d.source?.confidence ?? 1,
    userEdited: d.edited || !d.source,
    original: d.source?.original ?? null,
  };
}

/** "12–15.5", "≤ 200", "≥ 40" or "—", from the draft's range fields. */
export function draftRange(d: Pick<Draft, 'refLow' | 'refHigh'>): string {
  if (d.refLow && d.refHigh) return `${d.refLow}–${d.refHigh}`;
  if (d.refHigh) return `≤ ${d.refHigh}`;
  if (d.refLow) return `≥ ${d.refLow}`;
  return '—';
}

/** Most important first: the chip on a check card names the first one present. */
const ISSUE_ORDER: Issue[] = ['implausible', 'inconsistent', 'flag-mismatch', 'unrecognised', 'fuzzy-name', 'unknown-unit', 'missing-unit', 'bound-only', 'duplicate', 'odd-range', 'banded-range', 'missing-range'];

export const ISSUE_CHIP: Record<Issue, string> = {
  implausible: 'Unusual value',
  inconsistent: 'Doesn’t add up',
  'flag-mismatch': 'Flag disagrees',
  unrecognised: 'Name not recognised',
  'fuzzy-name': 'Name matched loosely',
  'unknown-unit': 'Unit not recognised',
  'missing-unit': 'No unit printed',
  'bound-only': 'A limit, not a value',
  duplicate: 'Printed twice',
  'odd-range': 'Range looks odd',
  'banded-range': 'Range in bands',
  'missing-range': 'No range printed',
};

export function mainIssue(d: Draft): Issue | null {
  const issues = d.source?.issues ?? [];
  return ISSUE_ORDER.find((i) => issues.includes(i)) ?? null;
}

/** What to check, in plain words, for a result held for review. Says what looks off, never what it means. */
export function issueMessages(d: Draft): string[] {
  const issues = d.source?.issues ?? [];
  const marker = d.markerId ? markerById.get(d.markerId) : undefined;
  const value = `${d.value}${d.unit ? ` ${d.unit}` : ''}`;
  const out: string[] = [];
  if (issues.includes('implausible') && marker) {
    const low = Number(d.value) < marker.plausibleMin;
    out.push(
      `${value} is much ${low ? 'lower' : 'higher'} than this test usually reads${issues.includes('missing-range') ? ', and no range was printed' : ''}. ` +
        `A digit${low ? '' : ' or decimal point'} may have been ${low ? 'missed' : 'misread'}. Check the value on the PDF.`,
    );
  } else if (issues.includes('implausible')) {
    out.push(`${value} looks impossible for this test. It was probably misread; check it on the PDF.`);
  }
  if (issues.includes('inconsistent') && d.source?.inconsistentWith) {
    out.push(
      `This should roughly equal ${d.source.inconsistentWith}, using the other values on this report, but it doesn’t. ` +
        'One of those values or this one may have been misread; check them on the PDF.',
    );
  }
  if (issues.includes('flag-mismatch')) {
    out.push(`The report marks this ${d.source?.labFlag === 'high' ? 'high (H)' : 'low (L)'}, but the value sits inside the range that was read. The value or the range may have been misread.`);
  }
  if (issues.includes('unknown-unit')) out.push('The unit wasn’t recognised, so the value is kept as printed.');
  if (issues.includes('missing-unit')) out.push('No unit was printed, so the test’s usual unit is assumed. Check it.');
  if (issues.includes('bound-only')) out.push('The value is a limit (like “<60”) with no range. It may be a note rather than a result.');
  if (issues.includes('duplicate')) out.push('This test appears more than once on the report with different values. Keep the right one.');
  if (issues.includes('odd-range')) out.push('The range looks wrong. Check the limits against the PDF.');
  if (issues.includes('banded-range')) out.push('The report gives the range as categories (like deficient / sufficient / toxic). The normal category was used; check it.');
  if (issues.includes('missing-range') && !issues.includes('implausible')) out.push('No range was found. Add it if the report prints one.');
  return out;
}

/** A known test an unrecognised name is probably the same as, for the review to ask about. */
export function suggestionFor(d: Draft): Marker | null {
  if (d.markerId || !d.source) return null;
  return suggestMarker(d.source.printedName, d.source.original.unit ?? d.unit);
}

/**
 * The draft as the suggested test: its name, standard unit, and the value and range
 * converted into that unit. Null when the unit can't be converted.
 */
export function asMarker(d: Draft, marker: Marker): Partial<Draft> | null {
  const from = d.unit || marker.unit;
  const conv = (s: string) => (s.trim() === '' ? '' : toText(convert(Number(s), from, marker.unit, marker.conversions)));
  const value = conv(d.value);
  if (value === '' || value === 'NaN') return null;
  return { markerId: marker.id, name: marker.name, unit: marker.unit, value, refLow: conv(d.refLow), refHigh: conv(d.refHigh) };
}
