import type { Point } from './series';
import { tone } from './status';

const H = 28;
const PAD = 4;

/**
 * A tiny trend for list rows: neutral line, with only the latest point in its status
 * colour. Decorative: the row's text carries the same information.
 */
export default function Sparkline({ points, width: W = 88 }: { points: Point[]; width?: number }) {
  const recent = points.slice(-12);
  if (recent.length < 2) return <span className="app-spark" aria-hidden="true" />;
  const values = recent.map((p) => p.value);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const x = (i: number) => PAD + (i / (recent.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => (hi === lo ? H / 2 : PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD));
  const last = recent.length - 1;
  return (
    <svg className="app-spark" width={W} height={H} aria-hidden="true">
      <path className="spark-line" d={recent.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.value)}`).join(' ')} />
      <circle className={`chart-mark chart-mark-${tone(recent[last].status)}`} cx={x(last)} cy={y(recent[last].value)} r={3.5} />
    </svg>
  );
}
