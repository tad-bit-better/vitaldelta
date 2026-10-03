import { describe, expect, it } from 'vitest';
import { canonicalUnit, convert } from './units';

describe('canonicalUnit', () => {
  it('recognises common spellings', () => {
    expect(canonicalUnit('mg/dl')).toBe('mg/dL');
    expect(canonicalUnit('gm%')).toBe('g/dL');
    expect(canonicalUnit('IU/L')).toBe('U/L');
    expect(canonicalUnit('uIU/ml')).toBe('µIU/mL');
    expect(canonicalUnit('mIU/L')).toBe('µIU/mL');
    expect(canonicalUnit('mcg/dL')).toBe('µg/dL');
    expect(canonicalUnit('umol/L')).toBe('µmol/L');
    expect(canonicalUnit('mm/1st')).toBe('mm/hr');
    expect(canonicalUnit('mL/min/1.73m2')).toBe('mL/min/1.73m²');
  });

  it('keeps U/L and µ-units apart', () => {
    expect(canonicalUnit('U/L')).toBe('U/L');
    expect(canonicalUnit('u/l')).toBe('U/L');
  });

  it('does not confuse mIU/mL with µIU/mL', () => {
    expect(canonicalUnit('mIU/mL')).toBeNull();
  });

  it('recognises cell count units', () => {
    expect(canonicalUnit('10^3/uL')).toBe('10^3/µL');
    expect(canonicalUnit('x10^9/L')).toBe('10^3/µL');
    expect(canonicalUnit('/cumm')).toBe('/µL');
    expect(canonicalUnit('cells/cu.mm')).toBe('/µL');
    expect(canonicalUnit('Lakhs/cumm')).toBe('lakh/µL');
    expect(canonicalUnit('million/cumm')).toBe('10^6/µL');
    expect(canonicalUnit('10^12/L')).toBe('10^6/µL');
    expect(canonicalUnit('1000/uL')).toBe('10^3/µL');
    expect(canonicalUnit('x1000/cumm')).toBe('10^3/µL');
  });

  it('returns null for unknown units', () => {
    expect(canonicalUnit('furlongs')).toBeNull();
  });
});

describe('convert', () => {
  it('returns the value unchanged in the standard unit', () => {
    expect(convert(13.5, 'g/dL', 'g/dL')).toBe(13.5);
  });

  it('converts cell counts generically', () => {
    expect(convert(250000, '/µL', '10^3/µL')).toBe(250);
    expect(convert(2.5, 'lakh/µL', '10^3/µL')).toBe(250);
    expect(convert(4.8, '10^6/µL', '10^6/µL')).toBe(4.8);
    expect(convert(4800000, '/µL', '10^6/µL')).toBeCloseTo(4.8);
  });

  it('uses marker conversions, including offsets', () => {
    expect(convert(5.5, 'mmol/L', 'mg/dL', { 'mmol/L': 18.016 })).toBeCloseTo(99.09);
    expect(convert(48, 'mmol/mol', '%', { 'mmol/mol': { factor: 0.09148, offset: 2.152 } })).toBeCloseTo(6.54, 1);
  });

  it('converts mass and molar units generically within their kind', () => {
    expect(convert(1.2, 'ng/mL', 'ng/dL')).toBeCloseTo(120);
    expect(convert(135, 'g/L', 'g/dL')).toBeCloseTo(13.5);
    expect(convert(0.5, 'mg/dL', 'mg/L')).toBeCloseTo(5);
    expect(convert(5, 'mmol/L', 'µmol/L')).toBeCloseTo(5000);
    expect(convert(5, 'mmol/L', 'mg/dL')).toBeNull(); // crossing kinds needs the molar mass
  });

  it('reaches a marker conversion through a generic step', () => {
    // µmol/L → mmol/L (generic) → mg/dL (glucose factor)
    expect(convert(5500, 'µmol/L', 'mg/dL', { 'mmol/L': 18.016 })).toBeCloseTo(99.09);
  });

  it('returns null without a known conversion', () => {
    expect(convert(5, 'mmol/L', 'mg/dL')).toBeNull();
    expect(convert(5, '10^3/µL', '%')).toBeNull();
  });
});
