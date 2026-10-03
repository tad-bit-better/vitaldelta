import { describe, expect, it } from 'vitest';
import { groupRows } from './rows';
import type { TextItem } from './types';

// Synthetic items only; never derived from real reports.
function item(text: string, x: number, y: number, page = 1, height = 10): TextItem {
  return { text, x, y, width: text.length * 5, height, page };
}

describe('groupRows', () => {
  it('puts items on one line into a single row despite small y jitter', () => {
    const rows = groupRows([
      item('Haemoglobin', 40, 100),
      item('13.5', 200, 101.5),
      item('g/dL', 260, 99),
      item('13.0 - 17.0', 320, 100.8),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Haemoglobin 13.5 g/dL 13.0 - 17.0');
  });

  it('keeps closely spaced lines separate', () => {
    const rows = groupRows([
      item('Glucose', 40, 100),
      item('92', 200, 100),
      item('Creatinine', 40, 112),
      item('0.9', 200, 112),
    ]);
    expect(rows.map((r) => r.text)).toEqual(['Glucose 92', 'Creatinine 0.9']);
  });

  it('keeps superscripts on their row', () => {
    const rows = groupRows([
      item('Platelets', 40, 100),
      item('250', 200, 100),
      item('10', 260, 100),
      item('3', 271, 97, 1, 6),
      item('/µL', 276, 100),
      item('Next line', 40, 114),
    ]);
    expect(rows.map((r) => r.text)).toEqual(['Platelets 250 10 3 /µL', 'Next line']);
  });

  it('never merges rows across pages', () => {
    const rows = groupRows([item('Page two', 40, 100, 2), item('Page one', 40, 100, 1)]);
    expect(rows.map((r) => [r.page, r.text])).toEqual([
      [1, 'Page one'],
      [2, 'Page two'],
    ]);
  });

  it('drops empty and whitespace-only items', () => {
    const rows = groupRows([item('TSH', 40, 100), item('  ', 120, 100), item('', 150, 100), item('2.1', 200, 100)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].items).toHaveLength(2);
    expect(rows[0].text).toBe('TSH 2.1');
  });

  it('sorts items left to right regardless of input order', () => {
    const rows = groupRows([item('mg/dL', 260, 100), item('LDL', 40, 100), item('110', 200, 100)]);
    expect(rows[0].text).toBe('LDL 110 mg/dL');
  });

  it('orders rows top to bottom', () => {
    const rows = groupRows([item('Third', 40, 300), item('First', 40, 100), item('Second', 40, 200)]);
    expect(rows.map((r) => r.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('handles zero-height items using the page’s typical height', () => {
    const rows = groupRows([item('Sodium', 40, 100), item('140', 200, 100, 1, 0), item('Potassium', 40, 114)]);
    expect(rows.map((r) => r.text)).toEqual(['Sodium 140', 'Potassium']);
  });

  it('returns no rows for no items', () => {
    expect(groupRows([])).toEqual([]);
  });
});
