import { describe, expect, it } from 'vitest';
import type { ExtractedResult, ExtractedWordResult } from '../src/index';
import { parseExpected, scoreFile, type ExpectedFile } from './score';

// Synthetic results only.
const result = (overrides: Partial<ExtractedResult>): ExtractedResult => ({
  markerId: '718-7', name: 'Haemoglobin', printedName: 'Hemoglobin', value: 13.5, unit: 'g/dL', comparator: null,
  refLow: 13, refHigh: 17, original: { valueText: '13.5', unit: 'g/dL', refText: '13 - 17' }, labFlag: null,
  confidence: 1, issues: [], page: 1, box: { page: 1, x: 40, y: 100, width: 300, height: 10 }, method: null,
  ...overrides,
});
const word = (name: string, text: string, expected: string | null = null): ExtractedWordResult => ({
  name, text, expected, page: 1, box: { page: 1, x: 40, y: 100, width: 300, height: 10 }, method: null,
});
const file = (...results: ExpectedFile['results']): ExpectedFile => ({ confirmed: true, results });

describe('scoreFile', () => {
  it('counts a row correct only when every present field matches', () => {
    const expected = file({ markerId: '718-7', name: 'Haemoglobin', value: 13.5, unit: 'g/dL', refLow: 13, refHigh: 17 });
    expect(scoreFile(expected, [result({})], [])).toEqual({ expected: 1, correct: 1, mismatches: [], extras: 0 });
    expect(scoreFile(expected, [result({ value: 15.3 })], []).mismatches).toEqual([{ name: 'Haemoglobin', problem: 'value' }]);
    expect(scoreFile(expected, [result({ unit: 'g/L' })], []).mismatches).toEqual([{ name: 'Haemoglobin', problem: 'unit' }]);
    expect(scoreFile(expected, [result({ refHigh: 16 })], []).mismatches).toEqual([{ name: 'Haemoglobin', problem: 'range' }]);
    expect(scoreFile(expected, [], []).mismatches).toEqual([{ name: 'Haemoglobin', problem: 'missing' }]);
  });

  it('checks only the fields present, so unverifiable ones can be deleted', () => {
    const valueOnly = file({ markerId: '718-7', value: 13.5 });
    expect(scoreFile(valueOnly, [result({ unit: 'wrong', refLow: null, refHigh: null })], []).correct).toBe(1);
  });

  it('treats a missing range as null, matching only a result without one', () => {
    const noRange = file({ markerId: '718-7', name: 'Haemoglobin', value: 13.5, refLow: null, refHigh: null });
    expect(scoreFile(noRange, [result({ refLow: null, refHigh: null })], []).correct).toBe(1);
    expect(scoreFile(noRange, [result({})], []).mismatches).toEqual([{ name: 'Haemoglobin', problem: 'range' }]);
  });

  it('matches unrecognised tests by printed name, ignoring case and punctuation', () => {
    const expected = file({ name: 'Homocysteine', value: 12.8, unit: 'µmol/L' });
    const extracted = result({ markerId: null, name: 'HOMOCYSTEINE', printedName: 'HOMOCYSTEINE', value: 12.8, unit: 'µmol/L' });
    expect(scoreFile(expected, [extracted], []).correct).toBe(1);
  });

  it('reads expected files written before a LOINC code was corrected', () => {
    const expected = file({ markerId: '1989-3', name: 'Vitamin D (25-OH)', value: 26 });
    expect(scoreFile(expected, [result({ markerId: '62292-8', name: 'Vitamin D (25-OH)', value: 26 })], []).correct).toBe(1);
  });

  it('prefers the copy with the expected value when a test is printed twice', () => {
    const expected = file({ markerId: '718-7', value: 13.5 });
    const { correct, extras } = scoreFile(expected, [result({ value: 99 }), result({})], []);
    expect(correct).toBe(1);
    expect(extras).toBe(1);
  });

  it('scores word results by name and text, ignoring hyphens and case', () => {
    const expected = file({ name: 'HBsAg', textValue: 'Non Reactive', expectedText: 'Non Reactive' });
    expect(scoreFile(expected, [], [word('HBsAg', 'Non-reactive', 'NON REACTIVE')]).correct).toBe(1);
    expect(scoreFile(expected, [], [word('HBsAg', 'Reactive', 'Non Reactive')]).mismatches).toEqual([{ name: 'HBsAg', problem: 'text' }]);
    expect(scoreFile(expected, [], []).mismatches).toEqual([{ name: 'HBsAg', problem: 'missing' }]);
  });

  it('counts extracted results the expected file does not list', () => {
    const expected = file({ markerId: '718-7', value: 13.5 });
    const extra = result({ markerId: '4544-3', name: 'Haematocrit', value: 41, unit: '%' });
    expect(scoreFile(expected, [result({}), extra], []).extras).toBe(1);
  });

  it('allows display rounding but not a misread digit', () => {
    const expected = file({ markerId: '718-7', value: 13.5 });
    expect(scoreFile(expected, [result({ value: 13.52 })], []).correct).toBe(1);
    expect(scoreFile(expected, [result({ value: 13.9 })], []).correct).toBe(0);
  });
});

describe('parseExpected', () => {
  it('reads the old bare-array format as confirmed, and the new object format as written', () => {
    expect(parseExpected('[{ "markerId": "718-7", "value": 13.5 }]')).toEqual({ confirmed: true, results: [{ markerId: '718-7', value: 13.5 }] });
    expect(parseExpected('{ "confirmed": false, "results": [] }')).toEqual({ confirmed: false, results: [] });
  });
});
