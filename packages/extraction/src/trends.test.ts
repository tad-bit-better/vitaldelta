import { describe, expect, it } from 'vitest';
import { detectDrift } from './trends';

describe('detectDrift', () => {
  it('finds a steady rise ending at the latest value', () => {
    expect(detectDrift([5.1, 5.4, 5.8, 6.3])).toMatchObject({ direction: 'rising', count: 4 });
    expect(detectDrift([5.1, 5.4, 5.8, 6.3])!.percent).toBeCloseTo(23.5, 1);
  });

  it('counts only the run at the end', () => {
    expect(detectDrift([9, 6, 5.4, 5.8, 6.3])).toMatchObject({ direction: 'rising', count: 3 });
  });

  it('finds a steady fall', () => {
    expect(detectDrift([14.6, 13.9, 13.3, 12.4])).toMatchObject({ direction: 'falling', count: 4 });
  });

  it('needs at least three results', () => {
    expect(detectDrift([5, 6])).toBeNull();
  });

  it('treats tiny steps as flat and ignores small totals', () => {
    expect(detectDrift([100, 100.5, 101, 101.4])).toBeNull(); // each step < 1%
    expect(detectDrift([100, 101.5, 103, 104])).toBeNull(); // total 4% < 5%
  });

  it('breaks on a change of direction', () => {
    expect(detectDrift([5, 6, 5.5, 6.5])).toBeNull();
  });

  it('handles empty and zero values', () => {
    expect(detectDrift([])).toBeNull();
    expect(detectDrift([0, 1, 2])).toBeNull();
  });
});
