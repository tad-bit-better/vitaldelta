import { describe, expect, it } from 'vitest';
import { currentMarkerId, markers, RENAMED_MARKERS } from './dictionary';
import { nameKey } from './names';
import { canonicalUnit, convert } from './units';

/** LOINC check digit (mod 10), see loinc.org/kb/users-guide/calculating-mod-10-check-digits. */
function loincCheckDigit(body: string): number {
  const digits = body.split('').reverse();
  const odd = digits.filter((_, i) => i % 2 === 0).reverse().join('');
  const even = digits.filter((_, i) => i % 2 === 1).reverse().join('');
  const sum = `${even}${Number(odd) * 2}`.split('').reduce((s, d) => s + Number(d), 0);
  return (10 - (sum % 10)) % 10;
}

describe('marker dictionary', () => {
  it('reads codes saved before a code changed under the current one', () => {
    expect(currentMarkerId('1989-3')).toBe('62292-8');
    expect(currentMarkerId('62238-1')).toBe('98979-8');
    expect(currentMarkerId('718-7')).toBe('718-7');
    expect(currentMarkerId(null)).toBeNull();
    // New codes exist; old ones are gone from the dictionary.
    for (const [old, now] of Object.entries(RENAMED_MARKERS)) {
      expect(markers.some((m) => m.id === now), now).toBe(true);
      expect(markers.some((m) => m.id === old), old).toBe(false);
    }
  });

  it('has well-formed guideline ranges, only where listed in docs/dictionary.md', () => {
    const withGuideline = markers.filter((m) => m.guideline).map((m) => m.name);
    expect(withGuideline.sort()).toEqual(
      [
        'eGFR', 'Fasting glucose', 'HbA1c', 'HDL cholesterol', 'hs-CRP', 'LDL cholesterol', 'Non-HDL cholesterol',
        'Total cholesterol', 'Triglycerides', 'Vitamin D (25-OH)',
      ].sort(),
    );
    for (const m of markers.filter((m) => m.guideline)) {
      const g = m.guideline!;
      expect(g.source.trim(), m.name).not.toBe('');
      const sets = g.bySex ? [g.bySex.male, g.bySex.female] : [g];
      for (const b of sets) {
        expect(b, m.name).toBeDefined();
        expect(b.low !== undefined || b.high !== undefined, m.name).toBe(true);
        for (const v of [b.low, b.high].filter((v) => v !== undefined)) {
          expect(v! > m.plausibleMin && v! < m.plausibleMax, `${m.name} ${v}`).toBe(true);
        }
        if (b.low !== undefined && b.high !== undefined) expect(b.low < b.high, m.name).toBe(true);
      }
      // Every source names its guideline and year, e.g. "ADA 2026" (NCEP ATP III is 2001 by name).
      for (const source of [g.source, g.bySex?.male.source, g.bySex?.female.source].filter(Boolean)) {
        expect(/\b(19|20)\d\d\b|ATP III/.test(source!), `${m.name}: ${source}`).toBe(true);
      }
    }
  });

  it('has around 40+ markers', () => {
    expect(markers.length).toBeGreaterThanOrEqual(40);
  });

  it('uses valid, unique LOINC codes as ids', () => {
    for (const m of markers) {
      const match = m.id.match(/^(\d+)-(\d)$/);
      expect(match, m.id).not.toBeNull();
      expect(loincCheckDigit(match![1]), `${m.name} ${m.id}`).toBe(Number(match![2]));
    }
    expect(new Set(markers.map((m) => m.id)).size).toBe(markers.length);
  });

  it('never maps one name or synonym to two markers', () => {
    const seen = new Map<string, string>();
    for (const m of markers) {
      for (const name of [m.name, ...m.synonyms]) {
        const key = nameKey(name);
        expect(seen.get(key) ?? m.id, `"${name}" is used by ${seen.get(key)} and ${m.id}`).toBe(m.id);
        seen.set(key, m.id);
      }
    }
  });

  it('has no redundant synonyms (ones the name normaliser already covers)', () => {
    for (const m of markers) {
      const keys = [m.name, ...m.synonyms].map(nameKey);
      expect(new Set(keys).size, m.name).toBe(keys.length);
      expect(keys.every(Boolean), m.name).toBe(true);
    }
  });

  it('leaves out names that mean different tests at different labs', () => {
    // "TC" is total count (WBC) at some labs and total cholesterol at others.
    const all = markers.flatMap((m) => [m.name, ...m.synonyms]).map(nameKey);
    for (const ambiguous of ['TC', 'Protein', 'Bilirubin']) expect(all).not.toContain(nameKey(ambiguous));
  });

  it('uses canonical units for the standard unit and every conversion', () => {
    for (const m of markers) {
      expect(canonicalUnit(m.unit), m.name).toBe(m.unit);
      for (const [unit, conversion] of Object.entries(m.conversions ?? {})) {
        expect(canonicalUnit(unit), `${m.name} ${unit}`).toBe(unit);
        expect(unit, m.name).not.toBe(m.unit);
        expect(convert(1, unit, m.unit, m.conversions), `${m.name} ${unit}`).toBeGreaterThan(0);
        expect(typeof conversion === 'number' ? conversion : conversion.factor).toBeGreaterThan(0);
        // Same-kind conversions (g/L → g/dL, pmol/L → nmol/L) are generic; listing them is redundant.
        expect(convert(1, unit, m.unit), `${m.name} ${unit} is converted generically`).toBeNull();
      }
    }
  });

  it('has sensible plausibility bounds and a unit', () => {
    for (const m of markers) {
      expect(m.plausibleMin, m.name).toBeLessThan(m.plausibleMax);
      expect(m.unit, m.name).toBeTruthy();
    }
  });
});
