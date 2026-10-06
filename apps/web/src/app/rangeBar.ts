/** Where the range and the value sit on a bar, in % of its width. */
export type BarPositions = { bandStart: number; bandEnd: number; dot: number };

/**
 * Lays out the "where it sits in the range" bar: the range takes the middle of the bar with
 * room either side, or runs to the edge on a one-sided range ("≤ 200" from the left, "≥ 60"
 * to the right). A value outside that view stretches it so the dot stays on the bar.
 * Null when there's no range.
 */
export function barPositions(value: number, low: number | null, high: number | null): BarPositions | null {
  if (low === null && high === null) return null;
  // A one-sided range is drawn from 0 ("≤ 200") or to twice its limit ("≥ 60").
  const lo = low ?? Math.min(0, high!);
  const hi = high ?? (low! > 0 ? low! * 2 : low! + 1);
  const span = hi - lo || Math.abs(lo) * 0.2 || 1;
  let min = low === null ? lo : lo - span / 3;
  let max = high === null ? hi : hi + span / 3;
  // Keep the dot off the very edge when the value is past the view.
  if (value < min) min = value - (max - value) * 0.04;
  if (value > max) max = value + (value - min) * 0.04;
  const at = (n: number) => ((n - min) / (max - min)) * 100;
  return { bandStart: at(lo), bandEnd: at(hi), dot: at(value) };
}
