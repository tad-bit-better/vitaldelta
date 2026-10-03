import type { Comparator } from './parse';

/** Where a value sits against its reference range (the report's, or a guideline's when the report printed none). */
export type RangeStatus = 'below' | 'near-low' | 'in-range' | 'near-high' | 'above' | 'no-range';

/** "Near a limit" = inside the range but within this fraction of it from a bound. */
export const NEAR_FRACTION = 0.1;

export type RangedValue = {
  value: number;
  comparator?: Comparator | null;
  refLow: number | null;
  refHigh: number | null;
  /** Strict bounds exclude the limit itself: guideline cut-offs like "HbA1c < 5.7%". */
  refLowStrict?: boolean;
  refHighStrict?: boolean;
  /** Where the range came from; changes only the wording. Defaults to the report. */
  rangeSource?: RangeSource;
};

export type RangeSource = 'report' | 'guideline';

/**
 * Compares a value with its range. Bounds are inclusive unless marked strict. A value that
 * is itself a bound ("<0.5") is compared as its number but never reported as near a limit,
 * since its exact position isn't known.
 */
export function rangeStatus({ value, comparator, refLow, refHigh, refLowStrict, refHighStrict }: RangedValue): RangeStatus {
  if (refLow === null && refHigh === null) return 'no-range';
  if (refLow !== null && (value < refLow || (refLowStrict && value === refLow))) return 'below';
  if (refHigh !== null && (value > refHigh || (refHighStrict && value === refHigh))) return 'above';
  if (comparator) return 'in-range';

  if (refLow !== null && refHigh !== null) {
    const margin = (refHigh - refLow) * NEAR_FRACTION;
    if (value > refHigh - margin) return 'near-high';
    if (value < refLow + margin) return 'near-low';
    return 'in-range';
  }
  if (refHigh !== null && value > refHigh * (1 - NEAR_FRACTION)) return 'near-high';
  if (refLow !== null && value < refLow * (1 + NEAR_FRACTION)) return 'near-low';
  return 'in-range';
}

/** How far outside the range, as a percentage of the bound crossed; null when inside or unknowable. */
export function percentOutside(r: RangedValue): number | null {
  const status = rangeStatus(r);
  if (status === 'above' && r.refHigh) return ((r.value - r.refHigh) / Math.abs(r.refHigh)) * 100;
  if (status === 'below' && r.refLow) return ((r.refLow - r.value) / Math.abs(r.refLow)) * 100;
  return null;
}

/** "the report’s range" or "the guideline range". */
export function rangeName(source: RangeSource = 'report'): string {
  return source === 'guideline' ? 'the guideline range' : 'the report’s range';
}

/**
 * Plain, non-diagnostic wording: it says where the value sits against its range and
 * where that range came from, never what that might mean medically.
 */
export function describeStatus(r: RangedValue): string {
  const pct = percentOutside(r);
  const by = pct !== null && pct >= 1 ? ` by ${Math.round(pct)}%` : '';
  const range = rangeName(r.rangeSource);
  switch (rangeStatus(r)) {
    case 'above':
      return `Above ${range}${by}`;
    case 'below':
      return `Below ${range}${by}`;
    case 'near-high':
      return `Within ${range}, near the upper limit`;
    case 'near-low':
      return `Within ${range}, near the lower limit`;
    case 'in-range':
      return `Within ${range}`;
    case 'no-range':
      return 'No reference range on the report';
  }
}

/** Percentage change from one value to the next; null when the earlier value is 0. */
export function percentChange(from: number, to: number): number | null {
  return from === 0 ? null : ((to - from) / Math.abs(from)) * 100;
}
