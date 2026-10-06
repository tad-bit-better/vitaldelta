import { describe, expect, it } from 'vitest';
import { extractResults, REVIEW_THRESHOLD } from './extract';
import type { Row, TextItem } from './types';

// Synthetic rows only. Each string is one PDF item (roughly one column).
function row(...cells: string[]): Row {
  let x = 40;
  const items: TextItem[] = cells.map((text) => {
    const item = { text, x, y: 100, width: text.length * 5, height: 10, page: 1 };
    x += text.length * 5 + 20;
    return item;
  });
  return { page: 1, y: 105, items, text: cells.join(' ') };
}

const one = (...cells: string[]) => extractResults([row(...cells)])[0];

describe('lab layouts', () => {
  // Synthetic.
  it('reads a flag printed in its own column before the value', () => {
    expect(one('TSH - Thyroid Stimulating Hormone', 'H', '5.2', 'μIU/mL', 'Non-pregnant: 0.4 - 4.2;')).toMatchObject({
      markerId: '3016-3', value: 5.2, labFlag: 'high', refLow: 0.4, refHigh: 4.2, issues: [],
    });
  });

  // Synthetic. Methods printed with the name, in their own column, or on the line below.
  it('splits the method off the test name and keeps it', () => {
    expect(one('HbA1c', 'HPLC', '5.8', '%', '4.0 - 5.6')).toMatchObject({ markerId: '4548-4', printedName: 'HbA1c', method: 'HPLC', refLow: 4, refHigh: 5.6, issues: [] });
    expect(one('Glucose Fasting - Hexokinase', '96', 'mg/dL', '70 - 100')).toMatchObject({ markerId: '1558-6', method: 'Hexokinase', issues: [] });
    expect(one('Serum Creatinine, Jaffe', '0.9', 'mg/dL', '0.6 - 1.2')).toMatchObject({ markerId: '2160-0', method: 'Jaffe' });
    expect(one('Bilirubin (Direct)', '0.2', 'mg/dL', '0 - 0.3')).toMatchObject({ markerId: '1968-7', method: null });
  });

  // Synthetic, like a report whose method column is in small print between name and result.
  it('reads small print between the name and the value as the method, whatever it says', () => {
    const smallMethod = (name: string, method: string, ...rest: string[]): Row => {
      const r = row(name, method, ...rest);
      r.items[1] = { ...r.items[1], height: 6 };
      return r;
    };
    const [wbc, neut, hb] = extractResults([
      smallMethod('WBC Count', 'SF Cube cell analysis', 'H', '10570', '/cmm', '4000 - 10000'),
      { ...smallMethod('Neutrophils', 'Microscopic', '73', '%', '40 - 80'), y: 125 },
      { ...smallMethod('Hemoglobin', 'Colorimetric', '14.5', 'g/dL', '13.0 - 16.5'), y: 145 },
    ]);
    expect(wbc).toMatchObject({ markerId: '6690-2', printedName: 'WBC Count', method: 'SF Cube cell analysis', labFlag: 'high', value: 10.57 });
    expect(neut).toMatchObject({ markerId: '770-8', printedName: 'Neutrophils', method: 'Microscopic', value: 73 });
    expect(hb).toMatchObject({ markerId: '718-7', method: 'Colorimetric' });
    // The same words at full size are part of the name (no layout signal, and not in the vocabulary).
    expect(one('WBC Count', 'SF Cube cell analysis', '10570', '/cmm', '4000 - 10000')).toMatchObject({ markerId: null });
  });

  // Synthetic, like a differential count printed as % and absolute count on one row.
  it('reads a second result further along the row as its own result', () => {
    const rows = [
      row('Neutrophils', '73', '%', '40 - 80', '7716', '/cmm', '2000 - 6700'),
      { ...row('Lymphocytes', '19', '%', '20 - 40', '2008', '/cmm', '1100 - 3300'), y: 125 },
    ];
    expect(extractResults(rows).map((r) => [r.name, r.value, r.unit, r.refLow, r.refHigh])).toEqual([
      ['Neutrophils', 73, '%', 40, 80],
      ['Absolute neutrophil count', 7.716, '10^3/µL', 2, 6.7],
      ['Lymphocytes', 19, '%', 20, 40],
      ['Absolute lymphocyte count', 2.008, '10^3/µL', 1.1, 3.3],
    ]);
    // Both point at the same printed row.
    const [pct, abs] = extractResults(rows);
    expect(abs.box).toEqual(pct.box);
    // A number after the range without a unit isn't a second result.
    expect(extractResults([row('Haemoglobin', '13.5', 'g/dL', '13 - 17', '2')])).toHaveLength(1);
  });

  it('reads a method column after the range without spoiling the range', () => {
    expect(one('SGPT (ALT)', '36', 'U/L', '13 - 40', 'IFCC without P5P')).toMatchObject({ markerId: '1742-6', refLow: 13, refHigh: 40, method: 'IFCC without P5P', issues: [] });
  });

  it('reads a method printed on the line under the test', () => {
    const below = { ...row('Method : Photometry'), y: 118 };
    const [hb] = extractResults([row('Haemoglobin', '13.2', 'g/dL', '13 - 17'), below]);
    expect(hb).toMatchObject({ markerId: '718-7', method: 'Photometry' });
  });

  it('groups an unknown test by its name without the method', () => {
    expect(one('Homocysteine (CLIA)', '12.8', 'µmol/L', '5 - 15')).toMatchObject({ markerId: null, name: 'Homocysteine', method: 'CLIA' });
  });
});

describe('banded ranges', () => {
  // Synthetic. Labs print interpretive bands instead of one range; the first bound is never the range.
  it('uses the normal band, even when it wraps onto the next lines', () => {
    const first = row('Vitamin D, 25 Hydroxy', '23.4', 'ng/mL', 'Deficiency:<20 ~Insufficiency :20-', 'CLIA');
    const second = { ...row('30~Sufficiency :30 - 100~Toxicity', 'CLIA'), y: 117 };
    const third = { ...row(': >100'), y: 129 };
    const [vitD] = extractResults([first, second, third]);
    expect(vitD).toMatchObject({ markerId: '1989-3', value: 23.4, refLow: 30, refHigh: 100, issues: ['banded-range'] });
    expect(vitD.confidence).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('reads common band wordings on one line', () => {
    expect(one('Total Cholesterol', '182', 'mg/dL', 'Desirable: <200 Borderline High: 200-239 High: >=240')).toMatchObject({
      refLow: null, refHigh: 200, issues: ['banded-range'],
    });
    expect(one('HbA1c', '5.9', '%', 'Non-diabetic: <5.7 Pre-diabetic: 5.7-6.4 Diabetic: >=6.5')).toMatchObject({
      refLow: null, refHigh: 5.7, issues: ['banded-range'],
    });
  });

  it('leaves the range empty when no band means normal (risk categories)', () => {
    expect(one('hs-CRP', '2.1', 'mg/L', 'Low risk: <1.0 Average risk: 1.0-3.0 High risk: >3.0')).toMatchObject({
      refLow: null, refHigh: null, issues: ['banded-range'],
    });
  });

  it('does not treat ordinary ranges or method names as bands', () => {
    expect(one('Haemoglobin', '13.5', 'g/dL', '13.0 - 17.0', 'High Performance Liquid Chromatography')).toMatchObject({
      refLow: 13, refHigh: 17, issues: [],
    });
  });
});

describe('extractResults', () => {
  it('gives a clean, recognised row full confidence', () => {
    expect(one('Haemoglobin', '13.5', 'g/dL', '13.0 - 17.0')).toMatchObject({
      markerId: '718-7', name: 'Haemoglobin', value: 13.5, unit: 'g/dL', refLow: 13, refHigh: 17,
      confidence: 1, issues: [],
    });
  });

  it('converts value and range to the standard unit and keeps the original', () => {
    expect(one('Glucose Fasting', '5.5', 'mmol/L', '3.9 - 5.6')).toMatchObject({
      markerId: '1558-6', value: 99.088, unit: 'mg/dL', refLow: 70.2624, refHigh: 100.89,
      original: { valueText: '5.5', unit: 'mmol/L', refText: '3.9 - 5.6' }, confidence: 1,
    });
    expect(one('Platelet Count', '2.5', 'Lakhs/cumm', '1.5 - 4.1')).toMatchObject({
      value: 250, unit: '10^3/µL', refLow: 150, refHigh: 410,
    });
  });

  it('lowers confidence for a missing unit or range', () => {
    const r = one('TSH', '2.1');
    expect(r.issues).toEqual(['missing-unit', 'missing-range']);
    expect(r.confidence).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('does not penalise a missing unit on ratio markers', () => {
    expect(one('A/G Ratio', '1.4', '1.0 - 2.1')).toMatchObject({ markerId: '1759-0', confidence: 1 });
  });

  it('keeps an unknown unit as printed and flags it', () => {
    expect(one('Ferritin', '80', 'mg/furlong', '15-150')).toMatchObject({
      value: 80, unit: 'mg/furlong', issues: ['unknown-unit'], confidence: 0.7,
    });
  });

  it('flags implausible values (likely misreads)', () => {
    expect(one('Haemoglobin', '135', 'g/dL', '13.0 - 17.0')).toMatchObject({ issues: ['implausible'], confidence: 0.1 });
  });

  it('flags a fuzzy name match', () => {
    const r = one('Haemoglobn', '13.5', 'g/dL', '13.0 - 17.0');
    expect(r.markerId).toBe('718-7');
    expect(r.issues).toContain('fuzzy-name');
    expect(r.confidence).toBeLessThan(1);
  });

  it('keeps unknown tests that clearly look like results', () => {
    expect(one('Homocysteine', '12', 'µmol/L', '5 - 15')).toMatchObject({
      markerId: null, name: 'Homocysteine', value: 12, unit: 'µmol/L', confidence: 0.5, issues: ['unrecognised'],
    });
  });

  it('drops rows that are not results', () => {
    expect(extractResults([row('Scan QR code to verify', '845123'), row('Age', '45', 'Years')])).toEqual([]);
  });

  it('does not mix up an absolute count with a percentage marker', () => {
    // "Neutrophils" in 10^3/µL is the absolute count, not the % marker.
    expect(one('Neutrophils', '4.2', '10^3/µL', '2.0 - 7.0')).toMatchObject({ markerId: '751-8', value: 4.2, issues: [] });
    // A count unit with no absolute test to fall back to stays unrecognised.
    expect(one('Haemoglobin', '4.2', '10^3/µL', '2.0 - 7.0')).toMatchObject({ markerId: null, issues: ['unrecognised'] });
    expect(one('Neutrophils', '60', '%', '40 - 80')).toMatchObject({ markerId: '770-8' });
  });

  it('matches absolute counts printed per 1000/µL', () => {
    expect(one('Absolute Neutrophils', '4.1', '1000/uL', '2 - 7')).toMatchObject({
      markerId: '751-8', value: 4.1, unit: '10^3/µL', confidence: 1,
    });
    expect(one('Platelet Count', '250', '1000/uL', '150 - 450')).toMatchObject({ markerId: '777-3', value: 250, confidence: 1 });
  });

  it('collapses one result printed in two units, keeping the standard-unit copy', () => {
    const results = extractResults([row('HbA1c (NGSP)', '5.8', '%', '4.0 - 5.6'), row('HbA1c (IFCC)', '39.9', 'mmol/mol')]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ value: 5.8, original: { unit: '%' }, issues: [] });
  });

  it('converts total T3 printed in ng/mL', () => {
    expect(one('Triiodothyronine Total (T3)', '1.1', 'ng/mL', '0.8 - 2.0')).toMatchObject({
      markerId: '3053-6', value: 110, unit: 'ng/dL', refLow: 80, refHigh: 200, confidence: 1,
    });
  });

  it('drops guidance rows like "HDL <40" when the marker has a real result', () => {
    const results = extractResults([
      row('HDL Cholesterol', '52', 'mg/dL', '40 - 60'),
      row('Triglyceride', '120', 'mg/dL', '0 - 150'),
      row('HDL', '<40', 'Low'),
      row('TRIGLYCERIDE LEVELS <', '150'),
    ]);
    expect(results.map((r) => [r.markerId, r.value, r.issues])).toEqual([
      ['2085-9', 52, []],
      ['2571-8', 120, []],
    ]);
  });

  it('flags a lone bound-only value for review instead of dropping it', () => {
    const r = one('eGFR', '<60', 'mL/min/1.73m2');
    expect(r.issues).toEqual(['bound-only']);
    expect(r.confidence).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('collapses identical repeats and flags conflicting ones', () => {
    const repeated = extractResults([row('TSH', '2.1', 'µIU/mL', '0.4-4.2'), row('TSH', '2.1', 'mIU/L', '0.4-4.2')]);
    expect(repeated).toHaveLength(1);
    const conflicting = extractResults([row('TSH', '2.1', 'µIU/mL', '0.4-4.2'), row('TSH', '3.4', 'µIU/mL', '0.4-4.2')]);
    expect(conflicting).toHaveLength(2);
    expect(conflicting.every((r) => r.issues.includes('duplicate'))).toBe(true);
  });
});

