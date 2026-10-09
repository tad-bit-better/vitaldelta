import { describe, expect, it } from 'vitest';
import { extractResults, REVIEW_THRESHOLD } from './extract';
import type { Row, TextItem } from './types';

// Synthetic rows only. Each string is one PDF item (roughly one column).
let y = 100;
function row(...cells: string[]): Row {
  let x = 40;
  const items: TextItem[] = cells.map((text) => {
    const item = { text, x, y, width: text.length * 5, height: 10, page: 1 };
    x += text.length * 5 + 20;
    return item;
  });
  return { page: 1, y: (y += 20), items, text: cells.join(' ') };
}

const bilirubin = (indirect: string) => [
  row('Total Bilirubin', '0.9', 'mg/dL', '0.2 - 1.2'),
  row('Direct Bilirubin', '0.24', 'mg/dL', '0 - 0.3'),
  row('Indirect Bilirubin', indirect, 'mg/dL', '0.2 - 1'),
];

describe('arithmetic cross-checks', () => {
  it('accepts values that agree once display rounding is allowed for', () => {
    // 0.9 − 0.24 = 0.66, printed as 0.7.
    const results = extractResults(bilirubin('0.7'));
    expect(results.flatMap((r) => r.issues)).toEqual([]);
    expect(results.every((r) => r.confidence >= REVIEW_THRESHOLD)).toBe(true);
  });

  it('holds a value that breaks the report’s own arithmetic for review, naming the relation', () => {
    // A misread leading digit: 1.7 can't be 0.9 − 0.24.
    const results = extractResults(bilirubin('1.7'));
    const indirect = results.find((r) => r.markerId === '1971-1')!;
    expect(indirect.issues).toContain('inconsistent');
    expect(indirect.inconsistentWith).toBe('total − direct bilirubin');
    expect(indirect.confidence).toBeLessThan(REVIEW_THRESHOLD);
    // The operands aren't flagged: the user sees the relation on the flagged row.
    expect(results.find((r) => r.markerId === '1975-2')!.issues).toEqual([]);
  });

  it('checks absolute counts against % × WBC', () => {
    const rows = (anc: string) => [
      row('WBC Count', '10570', '/cmm', '4000 - 10000'),
      row('Neutrophils', '73', '%', '40 - 80'),
      row('Absolute Neutrophil Count', anc, '/cmm', '2000 - 7000'),
    ];
    expect(extractResults(rows('7716')).flatMap((r) => r.issues)).toEqual([]);
    const bad = extractResults(rows('2716')).find((r) => r.markerId === '751-8')!;
    expect(bad.issues).toContain('inconsistent');
    expect(bad.inconsistentWith).toBe('neutrophil % × WBC count');
  });

  it('checks printed ratios', () => {
    const rows = (ratio: string) => [
      row('Total Protein', '7.2', 'g/dL', '6.4 - 8.3'),
      row('Albumin', '4.7', 'g/dL', '3.5 - 5.2'),
      row('Globulin', '2.5', 'g/dL', '1.8 - 3.6'),
      row('A/G Ratio', ratio, '', '1.1 - 2.1'),
    ];
    expect(extractResults(rows('1.88')).flatMap((r) => r.issues)).toEqual([]);
    expect(extractResults(rows('2.88')).find((r) => r.markerId === '1759-0')!.issues).toContain('inconsistent');
  });

  it('skips a relation when a test is printed twice with different values', () => {
    const results = extractResults([...bilirubin('1.7'), row('Total Bilirubin', '1.9', 'mg/dL', '0.2 - 1.2')]);
    expect(results.find((r) => r.markerId === '1971-1')!.issues).not.toContain('inconsistent');
  });
});

describe('printed flag vs printed range', () => {
  const tsh = (flag: string, value: string) => extractResults([row('TSH', flag, value, 'µIU/mL', '0.4 - 4.2')])[0];

  it('holds a result whose H/L flag contradicts the range it was printed with', () => {
    const wrong = tsh('H', '2.5');
    expect(wrong.issues).toContain('flag-mismatch');
    expect(wrong.confidence).toBeLessThan(REVIEW_THRESHOLD);
    expect(tsh('L', '2.5').issues).toContain('flag-mismatch');
  });

  it('accepts a flag that agrees, and never second-guesses near the boundary', () => {
    expect(tsh('H', '5.2').issues).toEqual([]);
    expect(tsh('L', '0.2').issues).toEqual([]);
    // Within 1% of the bound the lab's own rounding decides.
    expect(tsh('H', '4.19').issues).toEqual([]);
  });
});
