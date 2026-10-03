import { describe, expect, it } from 'vitest';
import { formatDate, formatPercent } from './format';

describe('format', () => {
  it('formats signed percentages compactly', () => {
    expect(formatPercent(-6.7669)).toBe('−6.8%');
    expect(formatPercent(9.09)).toBe('+9.1%');
    expect(formatPercent(24.4)).toBe('+24%');
    expect(formatPercent(3)).toBe('+3%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('formats plain dates without timezone shifts', () => {
    expect(formatDate('2024-03-20')).toBe('20 Mar 2024');
  });
});
