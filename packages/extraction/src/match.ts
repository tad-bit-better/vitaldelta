import { markers as allMarkers, type Marker } from './dictionary';
import { nameKey, nameWords } from './names';
import { canonicalUnit, convert } from './units';

export type MarkerMatch = {
  marker: Marker;
  method: 'exact' | 'fuzzy';
  /** 1 for exact matches, otherwise 0–1 name similarity. */
  similarity: number;
};

/** Fuzzy matching only for names this long; short abbreviations must match exactly. */
const MIN_FUZZY_LENGTH = 6;
const MIN_SIMILARITY = 0.85;

/**
 * Short words that tell similar tests apart: the "B" in "Vitamin B", "T3" vs "T4",
 * "LDL/HDL" vs "HDL/LDL" (order matters). A fuzzy match must agree on these exactly.
 */
function shortWords(name: string): string {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w.length <= 3)
    .join(' ');
}

export function createMatcher(markers: Marker[] = allMarkers) {
  const byKey = new Map<string, Marker>();
  const shortByKey = new Map<string, string>();
  for (const marker of markers) {
    for (const name of [marker.name, ...marker.synonyms]) {
      byKey.set(nameKey(name), marker);
      shortByKey.set(nameKey(name), shortWords(name));
    }
  }
  const fuzzyKeys = [...byKey.keys()].filter((k) => k.length >= MIN_FUZZY_LENGTH);

  /**
   * Finds the marker for a printed test name: exact (after normalising) first,
   * then fuzzy for longer names. Also tries the name without its brackets and the
   * bracketed part alone, so "Packed Cell Volume (PCV)" and "ALT (SGPT)" match.
   */
  /** The name, the name without brackets, and the bracketed parts, as unique normalised keys. */
  const variants = (name: string) => {
    const candidates = [name, name.replace(/\([^)]*\)/g, ' ')];
    for (const m of name.matchAll(/\(([^)]*)\)/g)) candidates.push(m[1]);
    return [...new Map(candidates.map((c) => [nameKey(c), c])).entries()].filter(([key]) => key);
  };
  const exact = (name: string) => variants(name).map(([key]) => byKey.get(key)).find(Boolean) ?? null;

  return function matchMarker(printedName: string): MarkerMatch | null {
    const unique = variants(printedName);
    const whole = exact(printedName);
    if (whole) return { marker: whole, method: 'exact', similarity: 1 };

    // "TSH - Thyroid Stimulating Hormone": labs print an abbreviation and the full name. Trust
    // it when the parts agree; when only an abbreviation matches, accept it but have it
    // reviewed (so "Bilirubin - Conjugated" never silently becomes total bilirubin).
    // A dash with a space on at least one side separates; "Non-HDL" and "Thyroid-Stimulating" don't split.
    const parts = printedName.split(/\s+[-–—]\s*|\s*[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const hits = parts.map(exact);
      const found = hits.filter((m): m is Marker => m !== null);
      if (found.length && found.every((m) => m.id === found[0].id)) {
        if (found.length >= 2) return { marker: found[0], method: 'exact', similarity: 1 };
        const part = parts[hits.findIndex(Boolean)];
        if (!/[a-z]/.test(part) && part.replace(/[^A-Za-z0-9]/g, '').length <= 8) {
          return { marker: found[0], method: 'fuzzy', similarity: 0.85 };
        }
      }
    }

    // "PCV/HAEMATOCRIT": two names for the same test joined by a slash. Only when every part
    // names the same marker: "HDL/LDL Cholesterol Ratio" and "Urea/Creatinine Ratio" are
    // ratios of two different tests and must never match either side.
    const slashParts = printedName.split('/').map((p) => p.trim()).filter(Boolean);
    if (slashParts.length > 1) {
      const found = slashParts.map(exact);
      if (found.every((m): m is Marker => m !== null) && found.every((m) => m.id === found[0].id)) {
        return { marker: found[0], method: 'exact', similarity: 1 };
      }
    }

    let best: MarkerMatch | null = null;
    for (const [key, text] of unique) {
      if (key.length < MIN_FUZZY_LENGTH) continue;
      const short = shortWords(text);
      for (const candidate of fuzzyKeys) {
        if (shortByKey.get(candidate) !== short) continue;
        const s = similarity(key, candidate);
        if (s >= MIN_SIMILARITY && (!best || s > best.similarity)) {
          best = { marker: byKey.get(candidate)!, method: 'fuzzy', similarity: s };
        }
      }
    }
    return best;
  };
}

export const matchMarker = createMatcher();

const words = (name: string) => new Set(nameWords(name));

/**
 * For a test the matcher didn't recognise, a known test it's probably the same as, for the
 * review screen to ask about ("Serum protein": is it Total protein?). The printed name's words
 * must all appear in a marker's name or synonym, and its unit must convert to the marker's.
 * The closest fit (fewest extra words) wins; a tie suggests nothing ("Bilirubin": total, direct
 * or indirect?). Never applied without the user saying yes.
 */
export function suggestMarker(printedName: string, unit: string | null): Marker | null {
  const printed = words(printedName);
  if (printed.size === 0) return null;
  const extra = new Map<Marker, number>();
  for (const marker of allMarkers) {
    if (unit && convert(1, canonicalUnit(unit) ?? unit, marker.unit, marker.conversions) === null) continue;
    for (const name of [marker.name, ...marker.synonyms].map(words)) {
      if (![...printed].every((w) => name.has(w))) continue;
      extra.set(marker, Math.min(extra.get(marker) ?? Infinity, name.size - printed.size));
    }
  }
  const best = Math.min(...extra.values());
  const closest = [...extra].filter(([, n]) => n === best);
  return closest.length === 1 ? closest[0][0] : null;
}

/** 1 − (edit distance / longer length). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) / longer > 1 - MIN_SIMILARITY) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return 1 - prev[b.length] / longer;
}
