import { describe, expect, it } from 'vitest';
import { fileLabel, mask } from './privacy';

// Synthetic text only.
describe('mask', () => {
  it('never shows names, addresses, IDs or the patient’s sex', () => {
    const out = mask('Mr. ARJUN MEHTA Age/Sex : 34 Y / Male 12, Lake View Road, Pune 411001 UHID 99812');
    for (const secret of ['ARJUN', 'MEHTA', 'Male', 'Mr', 'Lake', 'View', 'Road', 'Pune', '411001', '34', '99812']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('Age/Sex');
  });

  it('keeps test names, units, results and layout', () => {
    expect(mask('HbA1c 5.9 % Non-Reactive')).toBe('HbA1c 9.9 % Non-Reactive');
    expect(mask('Haemoglobin 13.5 g/dL 13.0 - 17.0')).toBe('Haemoglobin 9.9 g/dL 9.9 - 9.9');
  });

  it('hides word and number lengths unless asked', () => {
    expect(mask('PUSHPENDRA 9812345678')).toBe('A 9');
    expect(mask('PUSHPENDRA 98', { lengths: true })).toBe('AAAAAAAAAA 99');
  });
});

describe('fileLabel', () => {
  it('numbers files instead of naming them', () => {
    const label = fileLabel(2, new Uint8Array([1, 2, 3]), 'Mr ARJUN MEHTA.pdf', false);
    expect(label).toMatch(/^#3 [0-9a-f]{8}$/);
    expect(fileLabel(2, new Uint8Array([1]), 'x.pdf', true)).toBe('x.pdf');
  });
});
