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
};

// JSON type inference widens optional keys, so assert the shape; dictionary.test.ts checks it.
export const markers = data.markers as Marker[];
