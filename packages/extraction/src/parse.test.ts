import { describe, expect, it } from 'vitest';
import { parseNumber, parseRow } from './parse';
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

describe('parseRow', () => {
  it('parses name, value, unit and range in separate columns', () => {
    expect(parseRow(row('Haemoglobin', '13.5', 'g/dL', '13.0 - 17.0'))).toMatchObject({
      name: 'Haemoglobin', value: 13.5, unit: 'g/dL', refLow: 13, refHigh: 17, refText: '13.0 - 17.0', flag: null,
    });
  });

  it('handles the range before the unit', () => {
    expect(parseRow(row('Glucose Fasting', '92', '70-100', 'mg/dL'))).toMatchObject({
      value: 92, unit: 'mg/dL', refLow: 70, refHigh: 100,
    });
  });

  it('handles "to" ranges and a range glued in brackets', () => {
    expect(parseRow(row('TSH', '2.1', 'µIU/mL', '0.4 to 4.2'))).toMatchObject({ refLow: 0.4, refHigh: 4.2 });
    expect(parseRow(row('Creatinine', '0.9', 'mg/dL', '(0.7-1.3)'))).toMatchObject({ refLow: 0.7, refHigh: 1.3 });
  });

  it('parses one-sided ranges', () => {
    expect(parseRow(row('Total Cholesterol', '182', 'mg/dL', '<200'))).toMatchObject({ refLow: null, refHigh: 200 });
    expect(parseRow(row('HDL Cholesterol', '52', 'mg/dL', '> 40'))).toMatchObject({ refLow: 40, refHigh: null });
    expect(parseRow(row('Triglycerides', '120', 'mg/dL', 'Up to 150'))).toMatchObject({ refHigh: 150 });
    expect(parseRow(row('eGFR', '95', 'mL/min/1.73m2', '>= 90'))).toMatchObject({ unit: 'mL/min/1.73m2', refLow: 90 });
  });

  it('reads high/low flags in a column or glued to the value', () => {
    expect(parseRow(row('LDL Cholesterol', '162', 'H', 'mg/dL', '<100'))).toMatchObject({ value: 162, flag: 'high' });
    expect(parseRow(row('Vitamin B12', '150L', 'pg/mL', '200-900'))).toMatchObject({ value: 150, valueText: '150', flag: 'low' });
    expect(parseRow(row('Ferritin', '8', 'ng/mL', '15-150', 'Low'))).toMatchObject({ flag: 'low', refLow: 15 });
  });

  it('moves a comparator split from its number back onto the value', () => {
    expect(parseRow(row('Triglycerides <', '150'))).toMatchObject({ name: 'Triglycerides', value: 150, comparator: '<' });
  });

  it('keeps a comparator on the value itself', () => {
    expect(parseRow(row('CRP', '<0.5', 'mg/L', '< 5'))).toMatchObject({
      value: 0.5, valueText: '<0.5', comparator: '<', refHigh: 5,
    });
  });

  it('joins superscript units split across items', () => {
    expect(parseRow(row('Platelet Count', '250', '10', '3', '/µL', '150 - 410'))).toMatchObject({
      value: 250, unit: '10^3/µL', refLow: 150, refHigh: 410,
    });
    expect(parseRow(row('WBC', '7.2', 'x 10³/uL', '4.0-11.0'))).toMatchObject({ unit: '10^3/uL', refLow: 4 });
  });

  it('reads "1000/µL" as thousands per µL, not 10^00', () => {
    expect(parseRow(row('Platelet Count', '250', '1000/uL', '150 - 450'))).toMatchObject({ unit: '1000/uL' });
    expect(parseRow(row('WBC', '7.2', '10 3 /µL', '4-11'))).toMatchObject({ unit: '10^3/µL' });
  });

  it('ignores ages and durations when finding the range', () => {
    expect(parseRow(row('HbA1c', '5.4', '%', 'For age > 18 years', '4.0 - 5.6'))).toMatchObject({ refLow: 4, refHigh: 5.6 });
    expect(parseRow(row('eGFR', '95', 'mL/min/1.73m2', 'for ≥3 months'))).toMatchObject({ refLow: null, refHigh: null, refText: null });
  });

  it('parses Indian and western thousands separators', () => {
    expect(parseRow(row('Platelet Count', '2,50,000', '/cumm', '1,50,000 - 4,10,000'))).toMatchObject({
      value: 250000, unit: '/cumm', refLow: 150000, refHigh: 410000,
    });
    expect(parseRow(row('Total WBC Count', '7,200', 'cells/cumm', '4,000-11,000'))).toMatchObject({ value: 7200 });
  });

  it('keeps digits that belong to the name', () => {
    expect(parseRow(row('Vitamin B12', '410', 'pg/mL', '200-900'))).toMatchObject({ name: 'Vitamin B12', value: 410 });
    expect(parseRow(row('Vitamin D 25 Hydroxy', '28', 'ng/mL', '30-100'))).toMatchObject({
      name: 'Vitamin D 25 Hydroxy', value: 28,
    });
    expect(parseRow(row('HbA1c', '5.6', '%', '4.0-5.6'))).toMatchObject({ name: 'HbA1c', unit: '%' });
  });

  it('strips a leading serial number and trailing colon from the name', () => {
    expect(parseRow(row('3.', 'Sodium:', '140', 'mmol/L', '135-145'))).toMatchObject({ name: 'Sodium', value: 140 });
  });

  it('ignores a method column instead of treating it as the unit', () => {
    expect(parseRow(row('Albumin', '4.2', 'g/dL', 'Bromocresol Green', '3.5-5.2'))).toMatchObject({
      unit: 'g/dL', refLow: 3.5, refHigh: 5.2,
    });
  });

  it('allows a missing unit or range', () => {
    expect(parseRow(row('A/G Ratio', '1.4'))).toMatchObject({ value: 1.4, unit: null, refLow: null, refHigh: null, refText: null });
  });

  it('returns null for rows that are not results', () => {
    expect(parseRow(row('Test Name', 'Result', 'Unit', 'Reference Range'))).toBeNull();
    expect(parseRow(row('Collected on', '12/03/2024'))).toBeNull();
    expect(parseRow(row('1500'))).toBeNull();
  });
});

describe('parseNumber', () => {
  it('handles separators and decimal commas', () => {
    expect(parseNumber('1,50,000')).toBe(150000);
    expect(parseNumber('150,000')).toBe(150000);
    expect(parseNumber('13,5')).toBe(13.5);
    expect(parseNumber('.5')).toBe(0.5);
  });
});
