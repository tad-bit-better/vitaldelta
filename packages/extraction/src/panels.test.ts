import { describe, expect, it } from 'vitest';
import { markers } from './dictionary';
import { panelFor, panelOrder, panels } from './panels';

describe('panels', () => {
  it('puts every dictionary marker in exactly one panel', () => {
    const listed = panels.flatMap((p) => p.markers);
    expect(new Set(listed).size).toBe(listed.length);
    expect(new Set(listed)).toEqual(new Set(markers.map((m) => m.id)));
  });

  it('keeps each family together, so a report type reads as one block', () => {
    const families = panels.map((p) => p.family).filter((f, i, all) => f !== all[i - 1]);
    expect(new Set(families).size).toBe(families.length);
  });

  it('finds the panel and orders by panel, then position in it', () => {
    expect(panelFor('1742-6')?.label).toBe('Liver enzymes');
    expect(panelFor(null)).toBeNull();
    expect(panelOrder('1742-6')).toBeLessThan(panelOrder('1920-8'));
    expect(panelOrder('1920-8')).toBeLessThan(panelOrder('1975-2'));
    expect(panelOrder(null)).toBeGreaterThan(panelOrder('30522-7'));
  });
});
