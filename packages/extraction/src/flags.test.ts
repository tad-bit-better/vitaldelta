import { describe, expect, it } from 'vitest';
import { describeStatus, percentChange, percentOutside, rangeStatus } from './flags';

const r = (value: number, refLow: number | null, refHigh: number | null, comparator: '<' | '>' | null = null) => ({
  value, refLow, refHigh, comparator,
});

describe('rangeStatus', () => {
  it('places values against a two-sided range (bounds inclusive)', () => {
    expect(rangeStatus(r(12, 13, 17))).toBe('below');
    expect(rangeStatus(r(13, 13, 17))).toBe('near-low');
    expect(rangeStatus(r(13.3, 13, 17))).toBe('near-low');
    expect(rangeStatus(r(15, 13, 17))).toBe('in-range');
    expect(rangeStatus(r(16.8, 13, 17))).toBe('near-high');
    expect(rangeStatus(r(17, 13, 17))).toBe('near-high');
    expect(rangeStatus(r(18, 13, 17))).toBe('above');
  });

  it('handles one-sided ranges', () => {
    expect(rangeStatus(r(150, null, 200))).toBe('in-range');
    expect(rangeStatus(r(190, null, 200))).toBe('near-high');
    expect(rangeStatus(r(247, null, 200))).toBe('above');
    expect(rangeStatus(r(95, 90, null))).toBe('near-low');
    expect(rangeStatus(r(110, 90, null))).toBe('in-range');
    expect(rangeStatus(r(60, 90, null))).toBe('below');
  });

  it('never calls a bound-only value near a limit', () => {
    expect(rangeStatus(r(0.5, 0, 5, '<'))).toBe('in-range');
    expect(rangeStatus(r(4.9, 0, 5, '<'))).toBe('in-range');
    expect(rangeStatus(r(60, 90, null, '<'))).toBe('below');
  });

  it('reports no range when the report printed none', () => {
    expect(rangeStatus(r(5, null, null))).toBe('no-range');
  });
});

describe('percentOutside and describeStatus', () => {
  it('measures distance from the crossed bound', () => {
    expect(percentOutside(r(247.5, null, 200))).toBeCloseTo(23.75);
    expect(percentOutside(r(8, 15, 150))).toBeCloseTo(46.67, 1);
    expect(percentOutside(r(15, 13, 17))).toBeNull();
  });

  it('uses non-diagnostic wording', () => {
    expect(describeStatus(r(247.5, null, 200))).toBe('Above the report’s range by 24%');
    expect(describeStatus(r(8, 15, 150))).toBe('Below the report’s range by 47%');
    expect(describeStatus(r(16.8, 13, 17))).toBe('Within the report’s range, near the upper limit');
    expect(describeStatus(r(15, 13, 17))).toBe('Within the report’s range');
    expect(describeStatus(r(5, null, null))).toBe('No reference range on the report');
    expect(describeStatus(r(17.1, 13, 17))).toBe('Above the report’s range'); // under 1%: no figure
  });
});

describe('percentChange', () => {
  it('is relative to the earlier value', () => {
    expect(percentChange(100, 112)).toBeCloseTo(12);
    expect(percentChange(50, 40)).toBeCloseTo(-20);
    expect(percentChange(0, 5)).toBeNull();
  });
});
