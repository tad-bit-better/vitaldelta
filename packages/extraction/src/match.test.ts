import { describe, expect, it } from 'vitest';
import { matchMarker, similarity } from './match';

const id = (name: string) => matchMarker(name)?.marker.id ?? null;

describe('matchMarker', () => {
  it('matches names and synonyms exactly, ignoring spelling and filler', () => {
    expect(matchMarker('Haemoglobin')).toMatchObject({ method: 'exact', marker: { id: '718-7' } });
    expect(id('S. Creatinine')).toBe('2160-0');
    expect(id('SGPT')).toBe('1742-6');
    expect(id('Total Leukocyte Count')).toBe('6690-2');
  });

  it('matches using the bracketed part or the name without it', () => {
    expect(id('Packed Cell Volume (PCV)')).toBe('4544-3');
    expect(id('ALT (SGPT)')).toBe('1742-6');
    expect(id('Haemoglobin (Hb) (Photometry)')).toBe('718-7');
  });

  it('matches small typos in longer names', () => {
    expect(matchMarker('Haemoglobn')).toMatchObject({ method: 'fuzzy', marker: { id: '718-7' } });
    expect(id('Triglycerids')).toBe('2571-8');
  });

  it('never fuzzy-matches when a short distinguishing word differs', () => {
    expect(id('Vitamin B')).toBeNull(); // not Vitamin D
    expect(id('Free T5')).toBeNull(); // not Free T3/T4
    expect(id('LDL/HDL Cholestrol Ratio')).toBe('11054-4'); // typo still matches
    expect(id('HDL/LDL Cholestrol Ratio')).toBeNull(); // the inverse ratio is a different test
  });

  it('never fuzzy-matches short abbreviations', () => {
    expect(id('TSB')).toBeNull();
    expect(id('Ka')).toBeNull();
  });

  it('returns null for things that are not tests', () => {
    expect(id('Scan QR code to verify')).toBeNull();
    expect(id('Age')).toBeNull();
    expect(id('Patient Name')).toBeNull();
  });
});

describe('similarity', () => {
  it('is 1 for equal strings and lower with more edits', () => {
    expect(similarity('abcdef', 'abcdef')).toBe(1);
    expect(similarity('abcdef', 'abcdeg')).toBeCloseTo(5 / 6);
    expect(similarity('abc', 'xyzxyzxyz')).toBe(0);
  });
});
