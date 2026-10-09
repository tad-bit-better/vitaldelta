import { markers, type GuidelineBounds } from './dictionary';
import type { RangeSource } from './flags';
import type { Sex } from './patient';

/** The range a result is judged against, and where it came from. */
export type EffectiveRange = {
  refLow: number | null;
  refHigh: number | null;
  refLowStrict: boolean;
  refHighStrict: boolean;
  rangeSource: RangeSource;
  /** Citation when the range is a guideline's, e.g. "ADA". */
  guidelineSource: string | null;
};

const byId = new Map(markers.map((m) => [m.id, m]));

type ResultRange = { markerId: string | null; unit: string | null; refLow: number | null; refHigh: number | null };

/**
 * The report's own range when it printed one (always preferred); otherwise the marker's
 * guideline range, if it has one and the value is in the marker's standard unit. Sex-specific
 * limits apply when the patient's sex is known, otherwise the guideline's general limit.
 */
export function effectiveRange(result: ResultRange, sex: Sex | null): EffectiveRange {
  const fromReport: EffectiveRange = {
    refLow: result.refLow,
    refHigh: result.refHigh,
    refLowStrict: false,
    refHighStrict: false,
    rangeSource: 'report',
    guidelineSource: null,
  };
  if (result.refLow !== null || result.refHigh !== null || !result.markerId) return fromReport;
  const marker = byId.get(result.markerId);
  const guideline = marker?.guideline;
  if (!marker || !guideline || result.unit !== marker.unit) return fromReport;

  let bounds: GuidelineBounds = guideline;
  if (guideline.bySex && sex) bounds = guideline.bySex[sex];
  if (bounds.low === undefined && bounds.high === undefined) return fromReport;
  return {
    refLow: bounds.low ?? null,
    refHigh: bounds.high ?? null,
    refLowStrict: Boolean(bounds.lowStrict),
    refHighStrict: Boolean(bounds.highStrict),
    rangeSource: 'guideline',
    guidelineSource: bounds.source ?? guideline.source,
  };
}
