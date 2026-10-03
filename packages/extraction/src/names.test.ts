import { describe, expect, it } from 'vitest';
import { nameKey } from './names';

describe('nameKey', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(nameKey('HbA1c')).toBe(nameKey('Hb A1c'));
    expect(nameKey('HBA1C')).toBe(nameKey('hba1c'));
    expect(nameKey('RDW-CV')).toBe(nameKey('RDW CV'));
    expect(nameKey('Na+')).toBe('na');
  });

  it('treats UK and US spellings alike', () => {
    expect(nameKey('Haemoglobin')).toBe(nameKey('Hemoglobin'));
    expect(nameKey('Total Leucocyte Count')).toBe(nameKey('Total Leukocyte Count'));
    expect(nameKey('γ-GT')).toBe(nameKey('Gamma GT'));
  });

  it('drops specimen and filler words', () => {
    expect(nameKey('Serum Creatinine')).toBe('creatinine');
    expect(nameKey('S. Creatinine')).toBe('creatinine');
    expect(nameKey('Hb Estimation')).toBe('hb');
    expect(nameKey('Ferritin Level')).toBe('ferritin');
  });

  it('keeps words that change the test', () => {
    expect(nameKey('Bilirubin Total')).not.toBe(nameKey('Bilirubin Direct'));
    expect(nameKey('Free T3')).not.toBe(nameKey('T3'));
    expect(nameKey('Blood Urea Nitrogen')).not.toBe(nameKey('Blood Urea'));
  });
});
