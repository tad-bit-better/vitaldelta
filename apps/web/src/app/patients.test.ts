import { describe, expect, it } from 'vitest';
import type { Profile, Report, Result } from '../storage/types';
import { findDuplicate, mismatchReasons, suggestProfile } from './patients';

// Synthetic people only.
const profile = (id: string, name: string, aliases: string[], sex: Profile['sex'] = null): Profile => ({
  id, name, aliases, sex, createdAt: '2026-01-01T00:00:00Z',
});
const arjun = profile('a', 'Me', ['Arjun Mehta'], 'male');
const priya = profile('p', 'Mum', ['Priya Nair'], 'female');

describe('suggestProfile', () => {
  it('suggests the profile whose earlier names match', () => {
    expect(suggestProfile([arjun, priya], { name: 'Mr. A Mehta', sex: 'male', age: 34 })?.id).toBe('a');
    expect(suggestProfile([arjun, priya], { name: 'PRIYA NAIR', sex: null, age: null })?.id).toBe('p');
  });

  it('suggests nobody for an unknown name or a conflicting sex', () => {
    expect(suggestProfile([arjun, priya], { name: 'Rohan Shah', sex: null, age: null })).toBeNull();
    expect(suggestProfile([arjun], { name: 'Arjun Mehta', sex: 'female', age: null })).toBeNull();
    expect(suggestProfile([arjun], { name: null, sex: null, age: null })).toBeNull();
  });
});

describe('mismatchReasons', () => {
  it('explains a different name or sex', () => {
    expect(mismatchReasons(arjun, { name: 'Priya Nair', sex: 'female', age: null })).toEqual([
      'The report is for “Priya Nair”, but Me’s earlier reports say “Arjun Mehta”.',
      'The report says female, but Me’s earlier reports say male.',
    ]);
  });

  it('is empty when things match or nothing is known', () => {
    expect(mismatchReasons(arjun, { name: 'A. Mehta', sex: 'male', age: null })).toEqual([]);
    expect(mismatchReasons(profile('n', 'New', []), { name: 'Anyone', sex: null, age: null })).toEqual([]);
  });
});

describe('findDuplicate', () => {
  const report = (id: string, collectedAt: string, sourceFileName: string): Report => ({
    id, profileId: 'a', collectedAt, labName: null, sourceFileName, createdAt: '2026-01-01T00:00:00Z',
  });
  const result = (reportId: string, markerId: string, value: number) => ({ id: `${reportId}-${markerId}`, reportId, markerId, value }) as Result;
  const reports = [report('r1', '2026-05-02', 'march.pdf')];
  const results = [result('r1', '718-7', 14.8), result('r1', '3016-3', 4.79), result('r1', '2093-3', 247.5)];

  it('flags the same date and file name', () => {
    expect(findDuplicate(reports, results, { collectedAt: '2026-05-02', sourceFileName: 'march.pdf', results: [] })?.id).toBe('r1');
  });

  it('flags the same date with mostly identical values, even if renamed', () => {
    const draft = [{ markerId: '718-7', value: 14.8 }, { markerId: '3016-3', value: 4.79 }, { markerId: '2093-3', value: 247.5 }];
    expect(findDuplicate(reports, results, { collectedAt: '2026-05-02', sourceFileName: 'copy.pdf', results: draft })?.id).toBe('r1');
  });

  it('does not flag a different date or different values', () => {
    expect(findDuplicate(reports, results, { collectedAt: '2026-06-01', sourceFileName: 'march.pdf', results: [] })).toBeNull();
    const other = [{ markerId: '718-7', value: 13.1 }, { markerId: '3016-3', value: 2.2 }];
    expect(findDuplicate(reports, results, { collectedAt: '2026-05-02', sourceFileName: 'other.pdf', results: other })).toBeNull();
  });
});
