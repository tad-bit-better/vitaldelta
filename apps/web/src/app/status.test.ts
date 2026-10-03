import { describe, expect, it } from 'vitest';
import { changeHeadline, groupByStatus, rangeCell, rangeText, rangeValue } from './status';
import type { RangeStatus } from '@vitaldelta/extraction';

const items: [string, RangeStatus][] = [
  ['A', 'in-range'], ['B', 'above'], ['C', 'no-range'], ['D', 'near-low'], ['E', 'below'], ['F', 'in-range'],
];
const summary = (order: 'attention-first' | 'in-range-first') =>
  groupByStatus(items, ([, s]) => s, order).map((g) => [g.tone, g.items.map(([n]) => n).join('')]);

describe('groupByStatus', () => {
  it('puts tests outside the range first by default order', () => {
    expect(summary('attention-first')).toEqual([['out', 'BE'], ['near', 'D'], ['ok', 'AF'], ['none', 'C']]);
  });

  it('can put in-range tests first, keeping "no range" last', () => {
    expect(summary('in-range-first')).toEqual([['ok', 'AF'], ['near', 'D'], ['out', 'BE'], ['none', 'C']]);
  });

  it('omits empty groups', () => {
    const one: [string, RangeStatus][] = [['A', 'in-range']];
    expect(groupByStatus(one, ([, s]) => s, 'attention-first')).toHaveLength(1);
  });
});

describe('range wording', () => {
  const range = (refLow: number | null, refHigh: number | null, extra = {}) => ({ refLow, refHigh, ...extra });

  it('shows inclusive and strict bounds', () => {
    expect(rangeValue(range(13, 17))).toBe('13–17');
    expect(rangeValue(range(null, 200))).toBe('≤ 200');
    expect(rangeValue(range(40, null))).toBe('≥ 40');
    expect(rangeValue(range(null, 5.7, { refHighStrict: true }))).toBe('< 5.7');
    expect(rangeValue(range(70, 100, { refHighStrict: true }))).toBe('≥ 70 and < 100');
    expect(rangeValue(range(null, null))).toBeNull();
  });

  it('names a guideline range and its source', () => {
    const guideline = range(null, 200, { refHighStrict: true, rangeSource: 'guideline', guidelineSource: 'NCEP ATP III' });
    expect(rangeText(guideline)).toBe('Guideline range < 200 (NCEP ATP III)');
    expect(rangeCell(guideline)).toBe('< 200 · NCEP ATP III guideline');
    expect(rangeText(range(13, 17))).toBe('Range 13–17');
    expect(rangeCell(range(null, null))).toBe('None printed');
    expect(changeHeadline('HbA1c', 'now-outside', 'above', 8, 'guideline')).toBe('HbA1c moved above the guideline range');
  });
});
