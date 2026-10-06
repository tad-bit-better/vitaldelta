import { describe, expect, it } from 'vitest';
import { barPositions } from './rangeBar';

const round = (p: ReturnType<typeof barPositions>) => p && { bandStart: Math.round(p.bandStart), bandEnd: Math.round(p.bandEnd), dot: Math.round(p.dot) };

describe('barPositions', () => {
  it('puts a two-sided range in the middle fifth to four-fifths', () => {
    expect(round(barPositions(26.5, 13, 40))).toEqual({ bandStart: 20, bandEnd: 80, dot: 50 });
  });

  it('runs a "≤ 200" range from the left edge and a "≥ 60" range to the right edge', () => {
    expect(round(barPositions(100, null, 200))).toEqual({ bandStart: 0, bandEnd: 75, dot: 38 });
    expect(round(barPositions(90, 60, null))).toEqual({ bandStart: 25, bandEnd: 100, dot: 63 });
  });

  it('stretches the view so a value far outside the range stays on the bar', () => {
    const high = barPositions(400, 13, 40)!;
    expect(high.dot).toBeGreaterThan(95);
    expect(high.dot).toBeLessThan(100);
    expect(high.bandEnd).toBeLessThan(20);
    const low = barPositions(-5, 13, 40)!;
    expect(low.dot).toBeGreaterThan(0);
    expect(low.dot).toBeLessThan(5);
  });

  it('handles a range of one value and no range', () => {
    expect(barPositions(5, 5, 5)!.dot).toBeCloseTo(50);
    expect(barPositions(5, null, null)).toBeNull();
  });
});
