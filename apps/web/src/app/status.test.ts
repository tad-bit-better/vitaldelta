import { describe, expect, it } from 'vitest';
import { groupByStatus } from './status';
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
