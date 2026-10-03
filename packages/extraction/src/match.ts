import { markers as allMarkers, type Marker } from './dictionary';
import { nameKey } from './names';

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
  return function matchMarker(printedName: string): MarkerMatch | null {
    const candidates = [printedName, printedName.replace(/\([^)]*\)/g, ' ')];
    for (const m of printedName.matchAll(/\(([^)]*)\)/g)) candidates.push(m[1]);
    const unique = [...new Map(candidates.map((c) => [nameKey(c), c])).entries()].filter(([key]) => key);

    for (const [key] of unique) {
      const marker = byKey.get(key);
      if (marker) return { marker, method: 'exact', similarity: 1 };
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
