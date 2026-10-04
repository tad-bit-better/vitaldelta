import { describe, expect, it } from 'vitest';
import type { Report, Result } from '../storage/types';
import { buildSeries, buildWordSeries, sinceLastReport } from './series';

// Synthetic data only.
const report = (id: string, collectedAt: string): Report => ({
  id, profileId: 'p', collectedAt, labName: `Lab ${id}`, sourceFileName: null, createdAt: '2026-01-01T00:00:00Z',
});
let n = 0;
const result = (reportId: string, overrides: Partial<Result>): Result => ({
  id: `r${n++}`, reportId, markerId: '718-7', name: 'Haemoglobin', value: 14, unit: 'g/dL', comparator: null,
  refLow: 13, refHigh: 17, labFlag: null, confidence: 1, userEdited: false, original: null, textValue: null, expectedText: null,
  ...overrides,
});

const reports = [report('a', '2024-01-10'), report('b', '2023-06-01'), report('c', '2024-09-15')];

describe('buildSeries', () => {
  it('groups a result saved under a name the matcher has since learned with the recognised test', () => {
    const [tsh, ...rest] = buildSeries(reports, [
      result('b', { markerId: '3016-3', name: 'TSH', value: 2.1, unit: 'µIU/mL', refLow: 0.4, refHigh: 4.2 }),
      result('c', { markerId: null, name: 'TSH -Thyroid-Stimulating Hormone', value: 2.6, unit: 'µIU/mL', refLow: 0.4, refHigh: 4.2 }),
      // A different unit is never merged.
      result('a', { markerId: null, name: 'TSH -Thyroid-Stimulating Hormone', value: 2.6, unit: 'mIU/mL', refLow: 0.4, refHigh: 4.2 }),
    ]);
    expect(tsh).toMatchObject({ key: '3016-3', name: 'TSH' });
    expect(tsh.points.map((p) => p.value)).toEqual([2.1, 2.6]);
    expect(rest.map((s) => s.key)).toEqual(['name:tsh -thyroid-stimulating hormone']);
  });

  it('uses the guideline range only where the report printed none, and says so', () => {
    const series = buildSeries(reports, [
      result('a', { markerId: '4548-4', name: 'HbA1c', unit: '%', value: 6.1, refLow: null, refHigh: null }),
      result('c', { markerId: '4548-4', name: 'HbA1c', unit: '%', value: 6.1, refLow: 4, refHigh: 6.5 }),
      result('c', { markerId: '2085-9', name: 'HDL cholesterol', unit: 'mg/dL', value: 45, refLow: null, refHigh: null }),
    ], 'female');
    const [hba1c, hdl] = series;
    expect(hba1c.points.map((p) => [p.rangeSource, p.status])).toEqual([['guideline', 'above'], ['report', 'in-range']]);
    expect(hba1c.points[0]).toMatchObject({ refHigh: 5.7, refHighStrict: true, guidelineSource: 'ADA' });
    expect(hdl.latest).toMatchObject({ refLow: 50, status: 'below', rangeSource: 'guideline' });
    // Without a known sex, sex-specific limits aren't guessed.
    expect(buildSeries(reports, [result('c', { markerId: '2085-9', unit: 'mg/dL', refLow: null, refHigh: null })])[0].latest.status).toBe('no-range');
  });

  it('groups by marker across reports, oldest first, with status and change', () => {
    const [hb] = buildSeries(reports, [
      result('a', { value: 13.2 }),
      result('b', { value: 12.5 }),
      result('c', { value: 14.4 }),
    ]);
    expect(hb.points.map((p) => [p.date, p.value, p.status])).toEqual([
      ['2023-06-01', 12.5, 'below'],
      ['2024-01-10', 13.2, 'near-low'],
      ['2024-09-15', 14.4, 'in-range'],
    ]);
    expect(hb.latest.value).toBe(14.4);
    expect(hb.change?.from.value).toBe(13.2);
    expect(hb.change?.percent).toBeCloseTo(9.09, 1);
  });

  it('keeps unrecognised tests apart by printed name, case-insensitively', () => {
    const series = buildSeries(reports, [
      result('a', { markerId: null, name: 'Homocysteine', unit: 'µmol/L', value: 12 }),
      result('c', { markerId: null, name: 'HOMOCYSTEINE', unit: 'µmol/L', value: 15 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ key: 'name:homocysteine', markerId: null, unit: 'µmol/L' });
    expect(series[0].points).toHaveLength(2);
  });

  it('never compares results in different units', () => {
    const [ferritin] = buildSeries(reports, [
      result('a', { markerId: '2276-4', name: 'Ferritin', unit: 'ng/mL', value: 80 }),
      result('c', { markerId: '2276-4', name: 'Ferritin', unit: 'mg/furlong', value: 9 }),
    ]);
    expect(ferritin.unit).toBe('ng/mL');
    expect(ferritin.points.map((p) => p.value)).toEqual([80]);
    expect(ferritin.otherUnits.map((p) => p.value)).toEqual([9]);
    expect(ferritin.change).toBeNull();
  });

  it('has no change with a single result', () => {
    expect(buildSeries(reports, [result('a', {})])[0].change).toBeNull();
  });
});

describe('drift', () => {
  it('is attached to series with a steady move', () => {
    const r4 = [...reports, report('d', '2025-02-01')];
    const [hb] = buildSeries(r4, [
      result('b', { value: 15.2 }), result('a', { value: 14.5 }), result('c', { value: 13.9 }), result('d', { value: 13.1 }),
    ]);
    expect(hb.drift).toMatchObject({ direction: 'falling', count: 4 });
  });
});

describe('sinceLastReport', () => {
  const run = (results: Result[]) => sinceLastReport(reports, buildSeries(reports, results))!;
  const kinds = (results: Result[]) => run(results).changes.map((c) => `${c.series.name}:${c.kind}`);

  it('compares the latest report with each test’s previous result', () => {
    const summary = run([result('a', { value: 14 }), result('c', { value: 12.4 })]);
    expect(summary.latestDate).toBe('2024-09-15');
    expect(summary.previousDate).toBe('2024-01-10');
    expect(summary.changes.map((c) => c.kind)).toEqual(['now-outside']);
  });

  it('orders status changes before large moves', () => {
    expect(
      kinds([
        result('a', { markerId: '2093-3', name: 'Total cholesterol', unit: 'mg/dL', value: 205, refLow: null, refHigh: 200 }),
        result('c', { markerId: '2093-3', name: 'Total cholesterol', unit: 'mg/dL', value: 247, refLow: null, refHigh: 200 }),
        result('a', { value: 12 }),
        result('c', { value: 15 }),
        result('a', { markerId: '3016-3', name: 'TSH', value: 2, unit: 'µIU/mL', refLow: 0.4, refHigh: 4.2 }),
        result('c', { markerId: '3016-3', name: 'TSH', value: 4.1, unit: 'µIU/mL', refLow: 0.4, refHigh: 4.2 }),
      ]),
    ).toEqual(['TSH:now-near', 'Haemoglobin:back-in-range', 'Total cholesterol:large-change']);
  });

  it('ignores small moves without a status change, and lists new tests', () => {
    const summary = run([
      result('a', { value: 15 }),
      result('c', { value: 15.5 }),
      result('c', { markerId: '2276-4', name: 'Ferritin', unit: 'ng/mL', value: 80, refLow: 30, refHigh: 400 }),
    ]);
    expect(summary.changes).toEqual([]);
    expect(summary.newTests.map((s) => s.name)).toEqual(['Ferritin']);
  });

  it('only covers tests in the latest report', () => {
    expect(kinds([result('b', { value: 15 }), result('a', { value: 11 })])).toEqual([]);
  });
});

describe('buildWordSeries', () => {
  const word = (reportId: string, name: string, textValue: string, expectedText: string | null) =>
    result(reportId, { markerId: null, name, value: null, unit: null, refLow: null, refHigh: null, textValue, expectedText });

  it('groups word results by name, compares with the expected word, and notes a change', () => {
    const [hbsag] = buildWordSeries(reports, [
      word('b', 'HBsAg', 'Non Reactive', 'Non Reactive'),
      word('c', 'HBSAG', 'Reactive', 'Non-Reactive'),
      result('a', { value: 13 }),
    ]);
    expect(hbsag.points.map((p) => [p.date, p.status])).toEqual([['2023-06-01', 'as-expected'], ['2024-09-15', 'differs']]);
    expect(hbsag.changedFrom?.text).toBe('Non Reactive');
  });

  it('keeps word results out of the numeric series', () => {
    expect(buildSeries(reports, [word('a', 'HBsAg', 'Negative', 'Negative')])).toEqual([]);
  });
});
