import type { Sex } from './patient';
import data from './dictionary.json';
import type { Conversion } from './units';

/** A canonical lab marker. Lab-specific naming lives only in `synonyms`. */
export type Marker = {
  /** LOINC code. */
  id: string;
  name: string;
  synonyms: string[];
  /** Standard (canonical) unit that values are converted to. */
  unit: string;
  /** Other canonical units labs use, with how to convert into `unit`. */
  conversions?: Record<string, Conversion>;
  /** Bounds in `unit`; values outside are almost certainly extraction errors. */
  plausibleMin: number;
  plausibleMax: number;
  /**
   * Only for tests whose limits come from a clinical guideline rather than the lab, so they
   * match what labs print. Used when a report prints no range; see docs/dictionary.md.
   */
  guideline?: Guideline;
};

/**
 * Limits in the marker's `unit`. Strict bounds exclude the limit itself ("< 5.7"). `source`
 * overrides the guideline's citation for sex-specific limits from a different part of it.
 */
export type GuidelineBounds = { low?: number; high?: number; lowStrict?: boolean; highStrict?: boolean; source?: string };

export type Guideline = GuidelineBounds & {
  /** Short citation shown next to the range, e.g. "ADA 2024". */
  source: string;
  /** Sex-specific limits; without a known sex, the top-level limits apply (if there are any). */
  bySex?: Record<Sex, GuidelineBounds>;
};

// JSON type inference widens optional keys, so assert the shape; dictionary.test.ts checks it.
export const markers = data.markers as Marker[];

/**
 * Codes changed after results were saved under the old ones (old → new), so stored data and
 * old backups are read under the current code. 1989-3 is 25-OH vitamin D3 only; labs report
 * total D2+D3 (62292-8). 62238-1 is the CKD-EPI 2009 eGFR; labs now use CKD-EPI 2021 (98979-8).
 */
/**
 * The same printed name meaning a different test depending on the printed unit:
 * marker id → canonical unit → the marker that unit belongs to. "PDW" in fL is the
 * distribution width (32207-3); "PDW" in % is its coefficient of variation (51631-0).
 */
export const UNIT_VARIANTS: Readonly<Record<string, Record<string, string>>> = { '32207-3': { '%': '51631-0' } };

export const RENAMED_MARKERS: Readonly<Record<string, string>> = { '1989-3': '62292-8', '62238-1': '98979-8' };

export function currentMarkerId<T extends string | null>(id: T): T {
  return (id && RENAMED_MARKERS[id] ? RENAMED_MARKERS[id] : id) as T;
}
