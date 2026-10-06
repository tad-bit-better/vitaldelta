import { describe, expect, it } from 'vitest';
import { isMethod, splitMethod } from './methods';

describe('isMethod', () => {
  it('knows assay methods, alone or with generic words', () => {
    for (const m of ['HPLC', 'CLIA', 'GOD-POD', 'Hexokinase', 'Direct ISE', 'Method: Jaffe’s', 'Enzymatic Colorimetric', 'Calculated', 'IFCC without P5P'])
      expect(isMethod(m), m).toBe(true);
  });

  it('never treats test words or generic words alone as a method', () => {
    for (const m of ['Direct', 'Indirect', 'Total', 'Fasting', 'Rapid', 'Microscopy', 'Electrophoresis', 'Leucocyte esterase', 'Anti TPO peroxidase', ''])
      expect(isMethod(m), m).toBe(false);
  });
});

describe('splitMethod', () => {
  const cases: [string, string, string | null][] = [
    ['HbA1c (HPLC)', 'HbA1c', 'HPLC'],
    ['HbA1c HPLC', 'HbA1c', 'HPLC'],
    ['Glucose Fasting - Hexokinase', 'Glucose Fasting', 'Hexokinase'],
    ['Serum Creatinine, Jaffe', 'Serum Creatinine', 'Jaffe'],
    ['TSH : CLIA', 'TSH', 'CLIA'],
    ['Uric Acid Method: Uricase', 'Uric Acid', 'Uricase'],
    ['Cholesterol, Total by CHOD-PAP', 'Cholesterol, Total', 'CHOD-PAP'],
    ['Sodium Direct ISE', 'Sodium', 'Direct ISE'],
    ['Sodium (Indirect ISE)', 'Sodium', 'Indirect ISE'],
    ['ALT (SGPT), IFCC without P5P', 'ALT (SGPT)', 'IFCC without P5P'],
    ['LDL Cholesterol (Calculated)', 'LDL Cholesterol', 'Calculated'],
    ['Haemoglobin (Photometric) [SLS]', 'Haemoglobin', 'Photometric, SLS'],
    // Test words stay with the test.
    ['Bilirubin (Direct)', 'Bilirubin (Direct)', null],
    ['Bilirubin Direct Diazo', 'Bilirubin Direct', 'Diazo'],
    ['Bilirubin - Direct', 'Bilirubin - Direct', null],
    ['Glucose (Fasting)', 'Glucose (Fasting)', null],
    ['HIV Antibody, Rapid Card', 'HIV Antibody', 'Rapid Card'],
    ['Urine Microscopy', 'Urine Microscopy', null],
    ['Leucocyte Esterase', 'Leucocyte Esterase', null],
    ['Vitamin D 25 Hydroxy', 'Vitamin D 25 Hydroxy', null],
    // A method is never the whole name.
    ['Calculated', 'Calculated', null],
    ['HPLC', 'HPLC', null],
  ];
  it.each(cases)('%s → %s | %s', (printed, name, method) => {
    expect(splitMethod(printed)).toEqual({ name, method });
  });
});
