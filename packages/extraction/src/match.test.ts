import { describe, expect, it } from 'vitest';
import { matchMarker, similarity, suggestMarker } from './match';

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

  it('matches "abbreviation - full name", trusting it when both parts agree', () => {
    expect(matchMarker('TSH - Thyroid Stimulating Hormone')).toMatchObject({ marker: { id: '3016-3' }, method: 'exact' });
    expect(matchMarker('TSH -Thyroid-Stimulating Hormone')).toMatchObject({ marker: { id: '3016-3' }, method: 'exact' });
    expect(matchMarker('TSH- Thyroid Stimulating Hormone')).toMatchObject({ marker: { id: '3016-3' }, method: 'exact' });
    expect(matchMarker('Non-HDL Cholesterol')?.marker.id).toBe('43396-1');
    // Only the abbreviation is known: matched, but marked for review.
    expect(matchMarker('TSH - Ultrasensitive 3rd Generation')).toMatchObject({ marker: { id: '3016-3' }, method: 'fuzzy' });
    // A general word on one side must never decide it.
    expect(matchMarker('Bilirubin - Conjugated')?.marker.id).not.toBe('1975-2');
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

describe('slash-joined names', () => {
  it('matches two names for the same test joined by a slash', () => {
    expect(id('PCV/HAEMATOCRIT')).toBe('4544-3');
    expect(id('PCV / HCT')).toBe('4544-3');
  });

  it('never matches a ratio of two different tests to either side', () => {
    expect(id('HDL/LDL Cholesterol Ratio')).toBeNull();
    expect(id('Urea / Creatinine Ratio')).toBeNull();
    // Whole-name synonyms with slashes still match as themselves.
    expect(id('A/G Ratio')).toBe('1759-0');
    expect(id('BUN/Creatinine Ratio')).toBe('3097-3');
  });
});

describe('suggestMarker', () => {
  it('suggests the one test whose name contains every printed word', () => {
    expect(suggestMarker('Serum protein', 'g/dL')?.name).toBe('Total protein');
  });

  it('suggests nothing when several tests fit, the unit can’t convert, or a word is extra', () => {
    expect(suggestMarker('Bilirubin', 'mg/dL')).toBeNull();
    expect(suggestMarker('Serum protein', '%')).toBeNull();
    expect(suggestMarker('Urine protein', 'mg/dL')).toBeNull();
    expect(suggestMarker('Homocysteine', 'µmol/L')).toBeNull();
  });
});
