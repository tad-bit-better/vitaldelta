import type { RangeStatus } from '@vitaldelta/extraction';
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

export function rangeText({ refLow, refHigh }: Pick<Point, 'refLow' | 'refHigh'>): string {
  if (refLow !== null && refHigh !== null) return `Range ${formatNumber(refLow)}–${formatNumber(refHigh)}`;
  if (refHigh !== null) return `Range ≤ ${formatNumber(refHigh)}`;
  if (refLow !== null) return `Range ≥ ${formatNumber(refLow)}`;
  return 'No range on report';
}

export type Tone = ReturnType<typeof tone>;
export type StatusOrder = 'attention-first' | 'in-range-first';

const GROUP_LABEL: Record<Tone, string> = {
  out: 'Outside the report’s range',
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
export function changeHeadline(name: string, kind: 'now-outside' | 'now-near' | 'back-in-range' | 'large-change', latest: RangeStatus, percent: number): string {
  switch (kind) {
    case 'now-outside':
      return `${name} moved ${latest === 'above' ? 'above' : 'below'} the report’s range`;
    case 'now-near':
      return `${name} moved near the ${direction(latest)} limit`;
    case 'back-in-range':
      return `${name} is back within the report’s range`;
    case 'large-change':
      return `${name} changed by ${formatPercent(percent)}`;
  }
}

/** "Rising across your last 4 results (+18% overall)". */
export function driftText(drift: { direction: 'rising' | 'falling'; count: number; percent: number }): string {
  return `${drift.direction === 'rising' ? 'Rising' : 'Falling'} across your last ${drift.count} results (${formatPercent(drift.percent)} overall)`;
}
