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

/** Limits in the marker's `unit`. Strict bounds exclude the limit itself ("< 5.7"). */
export type GuidelineBounds = { low?: number; high?: number; lowStrict?: boolean; highStrict?: boolean };

export type Guideline = GuidelineBounds & {
  /** Short citation shown next to the range, e.g. "ADA 2024". */
  source: string;
  /** Sex-specific limits; without a known sex, no guideline range is used. */
  bySex?: Record<Sex, GuidelineBounds>;
};

// JSON type inference widens optional keys, so assert the shape; dictionary.test.ts checks it.
export const markers = data.markers as Marker[];
