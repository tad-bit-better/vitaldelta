import { describe, expect, it } from 'vitest';
import { rangeStatus, describeStatus } from './flags';
import { effectiveRange } from './guideline';

const HBA1C = '4548-4';
const HDL = '2085-9';
const HAEMOGLOBIN = '718-7';
const result = (markerId: string | null, unit: string | null, refLow: number | null = null, refHigh: number | null = null) => ({ markerId, unit, refLow, refHigh });

describe('effectiveRange', () => {
  it('always prefers the range printed on the report', () => {
    expect(effectiveRange(result(HBA1C, '%', 4, 6), null)).toMatchObject({ refLow: 4, refHigh: 6, rangeSource: 'report' });
    // A one-sided printed range still counts as the report's range.
    expect(effectiveRange(result(HBA1C, '%', null, 6), null)).toMatchObject({ refLow: null, refHigh: 6, rangeSource: 'report' });
  });

  it('falls back to the guideline when the report printed none', () => {
    expect(effectiveRange(result(HBA1C, '%'), null)).toEqual({
      refLow: null, refHigh: 5.7, refLowStrict: false, refHighStrict: true, rangeSource: 'guideline', guidelineSource: 'ADA 2026',
    });
  });

  it('uses sex-specific limits when the sex is known, otherwise the general limit', () => {
    expect(effectiveRange(result(HDL, 'mg/dL'), 'male')).toMatchObject({ refLow: 40, rangeSource: 'guideline', guidelineSource: 'NCEP ATP III' });
    // ATP III's "low HDL" is < 40 for everyone; the 50 for women is from its metabolic syndrome criteria.
    expect(effectiveRange(result(HDL, 'mg/dL'), 'female')).toMatchObject({ refLow: 50, guidelineSource: 'ATP III metabolic syndrome' });
    expect(effectiveRange(result(HDL, 'mg/dL'), null)).toMatchObject({ refLow: 40, rangeSource: 'guideline', guidelineSource: 'NCEP ATP III' });
  });

  it('gives no range for tests without a guideline, unknown tests, or values not in the standard unit', () => {
    expect(effectiveRange(result(HAEMOGLOBIN, 'g/dL'), 'male').rangeSource).toBe('report');
    expect(effectiveRange(result(null, '%'), 'male').rangeSource).toBe('report');
    expect(effectiveRange(result(HBA1C, 'mmol/mol'), null).rangeSource).toBe('report');
  });
});

describe('guideline ranges in flags', () => {
  const hba1c = (value: number) => ({ value, ...effectiveRange(result(HBA1C, '%'), null) });

  it('treats a strict limit as outside ("< 5.7")', () => {
    expect(rangeStatus(hba1c(5.7))).toBe('above');
    expect(rangeStatus(hba1c(5.6))).toBe('near-high');
    expect(rangeStatus(hba1c(5.0))).toBe('in-range');
  });

  it('says the range is the guideline’s', () => {
    expect(describeStatus(hba1c(6.5))).toBe('Above the guideline range by 14%');
    expect(describeStatus({ value: 15, refLow: 13, refHigh: 17 })).toBe('Within the report’s range');
  });
});
