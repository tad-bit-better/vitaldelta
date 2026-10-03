import { rangeName, type RangeSource, type RangeStatus } from '@vitaldelta/extraction';
import { formatNumber, formatPercent } from './format';
import type { Point } from './series';

/** Icon + short label + colour, so status never relies on colour alone. */
export const STATUS: Record<RangeStatus, { icon: string; label: string }> = {
  above: { icon: '▲', label: 'Above range' },
  below: { icon: '▼', label: 'Below range' },
  'near-high': { icon: '◆', label: 'Near upper limit' },
  'near-low': { icon: '◆', label: 'Near lower limit' },
  'in-range': { icon: '●', label: 'In range' },
  'no-range': { icon: '○', label: 'No range' },
};

/** CSS tone for a status: outside, near, ok or none. */
export function tone(status: RangeStatus): 'out' | 'near' | 'ok' | 'none' {
  if (status === 'above' || status === 'below') return 'out';
  if (status === 'near-high' || status === 'near-low') return 'near';
  return status === 'in-range' ? 'ok' : 'none';
}

type RangeFields = Pick<Point, 'refLow' | 'refHigh'> & Partial<Pick<Point, 'refLowStrict' | 'refHighStrict' | 'rangeSource' | 'guidelineSource'>>;

/** "13–17", "≤ 200", "< 5.7", "≥ 70 and < 100", or null when there's no range. */
export function rangeValue({ refLow, refHigh, refLowStrict, refHighStrict }: RangeFields): string | null {
  const low = refLow === null ? null : `${refLowStrict ? '>' : '≥'} ${formatNumber(refLow)}`;
  const high = refHigh === null ? null : `${refHighStrict ? '<' : '≤'} ${formatNumber(refHigh)}`;
  if (refLow !== null && refHigh !== null) {
    return refLowStrict || refHighStrict ? `${low} and ${high}` : `${formatNumber(refLow)}–${formatNumber(refHigh)}`;
  }
  return high ?? low;
}

/** "Range 13–17", "Guideline range < 5.7 (ADA)" or "No range on report". */
export function rangeText(point: RangeFields): string {
  const range = rangeValue(point);
  if (!range) return 'No range on report';
  return point.rangeSource === 'guideline' ? `Guideline range ${range} (${point.guidelineSource})` : `Range ${range}`;
}

/** For tables with a range column: "13–17", "< 5.7 · ADA guideline" or "None printed". */
export function rangeCell(point: RangeFields): string {
  const range = rangeValue(point);
  if (!range) return 'None printed';
  return point.rangeSource === 'guideline' ? `${range} · ${point.guidelineSource} guideline` : range;
}

export type Tone = ReturnType<typeof tone>;
export type StatusOrder = 'attention-first' | 'in-range-first';

const GROUP_LABEL: Record<Tone, string> = {
  out: 'Outside the range',
  near: 'Near a limit',
  ok: 'In range',
  none: 'No range on the report',
};

/**
 * Groups items by the status of their latest value. "No range" always comes last,
 * since it can't be judged either way; within a group, the input order is kept.
 */
export function groupByStatus<T>(items: T[], statusOf: (item: T) => RangeStatus, order: StatusOrder) {
  const tones: Tone[] = order === 'attention-first' ? ['out', 'near', 'ok', 'none'] : ['ok', 'near', 'out', 'none'];
  return tones
    .map((t) => ({ tone: t, label: GROUP_LABEL[t], items: items.filter((item) => tone(statusOf(item)) === t) }))
    .filter((g) => g.items.length > 0);
}

const direction = (status: RangeStatus) => (status === 'above' || status === 'near-high' ? 'upper' : 'lower');

/** Headline for a notable change; says what moved, never what it means. */
export function changeHeadline(
  name: string,
  kind: 'now-outside' | 'now-near' | 'back-in-range' | 'large-change',
  latest: RangeStatus,
  percent: number,
  source: RangeSource = 'report',
): string {
  switch (kind) {
    case 'now-outside':
      return `${name} moved ${latest === 'above' ? 'above' : 'below'} ${rangeName(source)}`;
    case 'now-near':
      return `${name} moved near the ${direction(latest)} limit`;
    case 'back-in-range':
      return `${name} is back within ${rangeName(source)}`;
    case 'large-change':
      return `${name} changed by ${formatPercent(percent)}`;
  }
}

/** "Rising across your last 4 results (+18% overall)"; the doctor summary says "the last". */
export function driftText(drift: { direction: 'rising' | 'falling'; count: number; percent: number }, whose = 'your'): string {
  return `${drift.direction === 'rising' ? 'Rising' : 'Falling'} across ${whose} last ${drift.count} results (${formatPercent(drift.percent)} overall)`;
}
