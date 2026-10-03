import { describe, expect, it } from 'vitest';
import { detectPatient, nameSimilarity, SAME_PERSON } from './patient';
import type { Row } from './types';

// Synthetic names only.
const rows = (...texts: string[]): Row[] => texts.map((text, i) => ({ page: 1, y: i * 12, items: [], text }));

/** A row from positioned pieces of text: [text, x]; widths ~6pt per character. */
const laidOut = (...cells: [string, number][]): Row => {
  const items = cells.map(([text, x]) => ({ text, x, y: 100, width: text.length * 6, height: 10, page: 1 }));
  return { page: 1, y: 105, items, text: cells.map(([t]) => t).join(' ') };
};

describe('detectPatient', () => {
  it('stops the name at the next column, whatever its label says', () => {
    const header = laidOut(['Name', 40], [':', 110], ['Mr. ARJUN', 120], ['MEHTA', 180], ['Specimen Drawn ON', 330], [':', 440], ['02/05/2026', 450]);
    expect(detectPatient([header]).name).toBe('Arjun Mehta');
  });

  it('handles the label, colon and name in one piece followed by another column', () => {
    const header = laidOut(['Patient Name : Priya Nair', 40], ['Barcode No', 330], ['12345', 420]);
    expect(detectPatient([header]).name).toBe('Priya Nair');
  });

  it('falls back to known labels when the whole line is one piece of text', () => {
    expect(detectPatient(rows('Name : Arjun Mehta Specimen Drawn ON : 02/05/2026')).name).toBe('Arjun Mehta');
  });

  it('reads a name with a title and the next label on the same line', () => {
    expect(detectPatient(rows('Patient Name : Mr. ARJUN MEHTA Age/Sex : 34 Y / M', 'Test Name Result Unit'))).toEqual({
      name: 'Arjun Mehta', sex: 'male', age: 34,
    });
  });

  it('reads separate sex and age labels', () => {
    expect(detectPatient(rows('Name: Mrs. Priya Nair', 'Age : 52 Years', 'Gender : Female'))).toEqual({
      name: 'Priya Nair', sex: 'female', age: 52,
    });
  });

  it('ignores test, doctor and lab names', () => {
    expect(detectPatient(rows('Test Name : Haemoglobin', 'Doctor Name : Dr. S Rao', 'Lab Name : City Labs')).name).toBeNull();
  });

  it('stops at an ID or date label', () => {
    expect(detectPatient(rows('Patient: Kavya Iyer UHID: 99812 Date: 12/03/2024')).name).toBe('Kavya Iyer');
  });

  it('returns nulls when nothing is printed', () => {
    expect(detectPatient(rows('Haemoglobin 13.5 g/dL'))).toEqual({ name: null, sex: null, age: null });
  });
});

describe('nameSimilarity', () => {
  it('treats titles, initials, case and order as the same person', () => {
    expect(nameSimilarity('Mr. A Mehta', 'Arjun Mehta')).toBe(1);
    expect(nameSimilarity('MEHTA ARJUN', 'Arjun Mehta')).toBe(1);
    expect(nameSimilarity('Arjun Mehtaa', 'Arjun Mehta')).toBe(1);
  });

  it('allows an extra middle name', () => {
    expect(nameSimilarity('Arjun Kumar Mehta', 'Arjun Mehta')).toBeGreaterThanOrEqual(SAME_PERSON);
  });

  it('keeps different people apart', () => {
    expect(nameSimilarity('Priya Nair', 'Arjun Mehta')).toBeLessThan(SAME_PERSON);
    expect(nameSimilarity('Rohan Mehta', 'Arjun Mehta')).toBeLessThan(SAME_PERSON); // same surname, different person
    expect(nameSimilarity('', 'Arjun Mehta')).toBe(0);
  });
});
