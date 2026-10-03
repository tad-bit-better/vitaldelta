import { percentChange } from './flags';

/** A steady move in one direction across consecutive results. */
export type Drift = {
  direction: 'rising' | 'falling';
  /** Results in the run, including the latest. */
  count: number;
  /** Change from the first to the last result of the run, in %. */
  percent: number;
};

export type DriftOptions = {
  /** Fewest results that count as a drift. */
  minPoints?: number;
  /** Steps smaller than this (in %) count as flat and end the run. */
  minStepPercent?: number;
  /** Total change over the run must reach this (in %). */
  minTotalPercent?: number;
};

/**
 * Looks back from the latest value for a run of steps all in the same direction,
 * e.g. three rising results in a row. Values are oldest first, in one unit.
 */
export function detectDrift(values: number[], options: DriftOptions = {}): Drift | null {
  const { minPoints = 3, minStepPercent = 1, minTotalPercent = 5 } = options;
  let direction: 1 | -1 | 0 = 0;
  let start = values.length - 1;

  for (let i = values.length - 1; i > 0; i--) {
    const step = percentChange(values[i - 1], values[i]);
    if (step === null || Math.abs(step) < minStepPercent) break;
    const sign = step > 0 ? 1 : -1;
    if (direction && sign !== direction) break;
    direction = sign;
    start = i - 1;
  }

  const count = values.length - start;
  if (!direction || count < minPoints) return null;
  const percent = percentChange(values[start], values[values.length - 1]);
  if (percent === null || Math.abs(percent) < minTotalPercent) return null;
  return { direction: direction > 0 ? 'rising' : 'falling', count, percent };
}
