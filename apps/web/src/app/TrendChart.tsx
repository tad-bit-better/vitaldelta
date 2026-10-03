import { describeStatus } from '@vitaldelta/extraction';
import { useEffect, useRef, useState } from 'react';
import { formatDate, formatNumber } from './format';
import type { Point } from './series';
import { rangeText, STATUS, tone } from './status';

const HEIGHT = 260;
const M = { top: 24, right: 56, bottom: 32, left: 52 };
const DAY = 86_400_000;

const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Clean axis ticks: steps of 1, 2 or 5 × 10^n. */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((s) => s * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Marker shape per status, so status never relies on colour alone. */
function Mark({ point, x, y, active }: { point: Point; x: number; y: number; active: boolean }) {
  const s = active ? 1.4 : 1;
  const className = `chart-mark chart-mark-${tone(point.status)}`;
  switch (point.status) {
    case 'above':
      return <path className={className} d={`M${x} ${y - 7 * s} L${x + 6.5 * s} ${y + 5 * s} L${x - 6.5 * s} ${y + 5 * s}Z`} />;
    case 'below':
      return <path className={className} d={`M${x} ${y + 7 * s} L${x + 6.5 * s} ${y - 5 * s} L${x - 6.5 * s} ${y - 5 * s}Z`} />;
    case 'near-high':
    case 'near-low':
      return <path className={className} d={`M${x} ${y - 6.5 * s} L${x + 6.5 * s} ${y} L${x} ${y + 6.5 * s} L${x - 6.5 * s} ${y}Z`} />;
    default:
      return <circle className={className} cx={x} cy={y} r={5 * s} />;
  }
}

type Props = { name: string; unit: string | null; points: Point[] };

/**
 * One test over time: values as a line with status-shaped markers, and each report's
 * own reference range as a shaded band (ranges can differ between labs, so the band
 * steps with them). Hover or focus a point for details; the page's table is the
 * accessible equivalent.
 */
export default function TrendChart({ name, unit, points }: Props) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;

  // X: time, padded so end points aren't on the edge.
  const ts = points.map((p) => time(p.date));
  let [x0, x1] = [Math.min(...ts), Math.max(...ts)];
  if (x0 === x1) [x0, x1] = [x0 - 60 * DAY, x1 + 60 * DAY];
  const xPad = (x1 - x0) * 0.06;
  const x = (t: number) => M.left + ((t - (x0 - xPad)) / (x1 - x0 + 2 * xPad)) * plotW;

  // Y: values and range bounds, padded and rounded to clean ticks.
  const ys = points.flatMap((p) => [p.value, p.refLow, p.refHigh]).filter((v): v is number => v !== null);
  let [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  const yPad = lo === hi ? Math.abs(lo) * 0.2 || 1 : (hi - lo) * 0.12;
  [lo, hi] = [lo - yPad, hi + yPad];
  if (lo < 0 && ys.every((v) => v >= 0)) lo = 0;
  const yTicks = niceTicks(lo, hi);
  const [y0, y1] = [yTicks[0], yTicks.at(-1)!];
  const y = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * plotH;

  const xs = points.map((p) => x(time(p.date)));
  const candidateTicks =
    points.length <= 6
      ? points.map((p, i) => ({ x: xs[i], label: formatDate(p.date) }))
      : Array.from({ length: 5 }, (_, i) => {
          const t = x0 + ((x1 - x0) * i) / 4;
          return { x: x(t), label: monthYear.format(t) };
        });
  // Drop date labels that would collide on narrow screens, always keeping the latest.
  // Labels are centred, so two fit when their gap covers half of each (~6.5px per char at 12px) plus padding.
  const fits = (a: { x: number; label: string }, b: { x: number; label: string }) =>
    b.x - a.x >= ((a.label.length + b.label.length) / 2) * 6.5 + 8;
  const xTicks = candidateTicks.reduceRight<typeof candidateTicks>(
    (kept, t) => (kept.length && !fits(t, kept[0]) ? kept : [t, ...kept]),
    [],
  );

  // Each report's range covers the stretch around its own point.
  const band = points.map((p, i) => {
    const left = i === 0 ? M.left : (xs[i - 1] + xs[i]) / 2;
    const right = i === points.length - 1 ? M.left + plotW : (xs[i] + xs[i + 1]) / 2;
    if (p.refLow === null && p.refHigh === null) return null;
    const top = p.refHigh === null ? M.top : Math.max(M.top, y(p.refHigh));
    const bottom = p.refLow === null ? M.top + plotH : Math.min(M.top + plotH, y(p.refLow));
    return { left, right, top, bottom, hasTop: p.refHigh !== null, hasBottom: p.refLow !== null };
  });

  function nearest(clientX: number, svg: SVGSVGElement) {
    const px = clientX - svg.getBoundingClientRect().left;
    let best = 0;
    xs.forEach((cx, i) => {
      if (Math.abs(cx - px) < Math.abs(xs[best] - px)) best = i;
    });
    setActive(best);
  }

  const last = points.length - 1;
  const tip = active === null ? null : points[active];

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={HEIGHT} role="group" aria-label={`${name} over time`} onPointerLeave={() => setActive(null)}>
        {/* Grid and axes: hairline, recessive. */}
        {yTicks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {formatNumber(t)}
            </text>
          </g>
        ))}
        {unit && (
          <text className="chart-axis" x={M.left - 8} y={M.top - 12} textAnchor="end">
            {unit}
          </text>
        )}
        {xTicks.map((t, i) => (
          <text key={i} className="chart-axis" x={t.x} y={HEIGHT - 10} textAnchor="middle">
            {t.label}
          </text>
        ))}

        {/* Reference range band, stepping with each report's own range. */}
        {band.map(
          (b, i) =>
            b && (
              <g key={i}>
                <rect className="chart-band" x={b.left} y={b.top} width={b.right - b.left} height={Math.max(0, b.bottom - b.top)} />
                {b.hasTop && <line className="chart-band-edge" x1={b.left} x2={b.right} y1={b.top} y2={b.top} />}
                {b.hasBottom && <line className="chart-band-edge" x1={b.left} x2={b.right} y1={b.bottom} y2={b.bottom} />}
              </g>
            ),
        )}

        {tip && <line className="chart-crosshair" x1={xs[active!]} x2={xs[active!]} y1={M.top} y2={M.top + plotH} />}

        {points.length > 1 && (
          <path className="chart-line" d={points.map((p, i) => `${i ? 'L' : 'M'}${xs[i]} ${y(p.value)}`).join(' ')} />
        )}

        {/* Hover layer: the pointer only has to be nearest in time, not on the dot. */}
        <rect
          className="chart-hit"
          x={M.left}
          y={M.top}
          width={plotW}
          height={plotH}
          onPointerMove={(e) => nearest(e.clientX, e.currentTarget.ownerSVGElement!)}
        />

        {points.map((p, i) => (
          <g
            key={p.resultId}
            className="chart-point"
            role="img"
            tabIndex={0}
            aria-label={`${formatDate(p.date)}: ${p.comparator ?? ''}${formatNumber(p.value)} ${unit ?? ''}. ${describeStatus(p)}.`}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onPointerEnter={() => setActive(i)}
          >
            <circle className="chart-point-hit" cx={xs[i]} cy={y(p.value)} r={14} />
            <Mark point={p} x={xs[i]} y={y(p.value)} active={active === i} />
          </g>
        ))}

        {/* Direct label on the latest value only. */}
        <text className="chart-label" x={xs[last] + 12} y={y(points[last].value)} dy="0.32em">
          {formatNumber(points[last].value)}
        </text>
      </svg>

      {tip && (
        <div
          className={`chart-tooltip${xs[active!] > width / 2 ? ' chart-tooltip-left' : ''}`}
          style={{ left: xs[active!], top: M.top }}
          role="status"
        >
          <strong>
            {tip.comparator ?? ''}
            {formatNumber(tip.value)} {unit}
          </strong>
          <span>{formatDate(tip.date)}{tip.labName ? ` · ${tip.labName}` : ''}</span>
          <span>{rangeText(tip)}</span>
          <span className={`app-status app-status-${tone(tip.status)}`}>
            <span aria-hidden="true">{STATUS[tip.status].icon}</span> {describeStatus(tip)}
          </span>
        </div>
      )}
    </div>
  );
}
