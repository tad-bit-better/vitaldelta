import { describe, expect, it } from 'vitest';
import type { Report, Result } from '../storage/types';
import { reportTypes, resultGroups, sinceText, tileCounts } from './dashboard';
import { buildSeries, buildWordSeries, sinceLastReport } from './series';

// Synthetic data only.
const report = (id: string, collectedAt: string): Report => ({
  id, profileId: 'p', collectedAt, labName: null, sourceFileName: null, createdAt: '2026-01-01T00:00:00Z',
});
let n = 0;
const result = (reportId: string, overrides: Partial<Result>): Result => ({
  id: `r${n++}`, reportId, markerId: '718-7', name: 'Haemoglobin', value: 14, unit: 'g/dL', comparator: null,
  refLow: 13, refHigh: 17, labFlag: null, confidence: 1, userEdited: false, original: null, textValue: null, expectedText: null,
  ...overrides,
});

const ast = { markerId: '1920-8', name: 'AST', unit: 'U/L', refLow: 0, refHigh: 37 };
const alt = { markerId: '1742-6', name: 'ALT', unit: 'U/L', refLow: 13, refHigh: 40 };
const bili = { markerId: '1975-2', name: 'Total bilirubin', unit: 'mg/dL', refLow: 0.2, refHigh: 1.2 };
const one = [report('a', '2024-10-17')];
const oneResults = [
  result('a', { ...ast, value: 32 }),
  result('a', { ...bili, value: 0.9 }),
  result('a', { ...alt, value: 36 }),
  result('a', { markerId: '6768-6', name: 'Alkaline phosphatase', unit: 'U/L', value: 11, refLow: null, refHigh: null }),
  result('a', { markerId: null, name: 'Some lab-only test', unit: 'U/L', value: 5, refLow: 1, refHigh: 3 }),
  result('a', { markerId: null, name: 'HBsAg', value: null, unit: null, refLow: null, refHigh: null, textValue: 'Non Reactive', expectedText: 'Non Reactive' }),
];

describe('dashboard', () => {
  const tests = buildSeries(one, oneResults);
  const words = buildWordSeries(one, oneResults);

  it('groups by panel in dictionary order, then other tests, then words', () => {
    const groups = resultGroups(tests, words, sinceLastReport(one, tests), 'panel');
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.series.name)])).toEqual([
      ['Liver enzymes', ['ALT', 'AST', 'Alkaline phosphatase']],
      ['Bilirubin', ['Total bilirubin']],
      ['Other tests', ['Some lab-only test']],
      ['Results in words', ['HBsAg']],
    ]);
  });

  it('groups by status with outside the range first, keeping panel order inside', () => {
    const groups = resultGroups(tests, words, null, 'attention');
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.series.name)])).toEqual([
      ['Outside the range', ['Some lab-only test']],
      ['In range', ['ALT', 'AST', 'Total bilirubin']],
      ['No range on the report', ['Alkaline phosphatase']],
      ['Results in words', ['HBsAg']],
    ]);
  });

  it('counts tiles, with an expected word result as in range', () => {
    expect(tileCounts(tests, words)).toEqual({ inRange: 4, outside: 1, noRange: 1 });
  });

  it('names the report types found, in panel order', () => {
    expect(reportTypes(oneResults)).toEqual(['Liver function test']);
    expect(reportTypes([{ markerId: '2093-3', name: 'Total cholesterol', unit: 'mg/dL' }, ...oneResults])).toEqual(['Lipid profile', 'Liver function test']);
  });

  it('says what changed since the previous report', () => {
    expect(sinceText('Dad', sinceLastReport(one, tests), tests, words)).toMatch(/^This is Dad’s first report/);
    const two = [report('a', '2024-10-17'), report('b', '2024-04-20')];
    const results = [
      result('b', { ...alt, value: 30 }),
      result('a', { ...alt, value: 45 }),
      result('b', { ...ast, value: 20 }),
      result('a', { ...ast, value: 30 }),
    ];
    const series = buildSeries(two, results);
    expect(sinceText('Dad', sinceLastReport(two, series), series, [])).toBe(
      'Compared with 20 Apr 2024: 1 moved outside the range and 1 changed by 10% or more.',
    );
    const steady = [result('b', { ...ast, value: 20 }), result('a', { ...ast, value: 20.5 })];
    const flat = buildSeries(two, steady);
    expect(sinceText('Dad', sinceLastReport(two, flat), flat, [])).toBe(
      'Compared with 20 Apr 2024: no test moved in or out of its range, and none changed by 10% or more.',
    );
  });
});
