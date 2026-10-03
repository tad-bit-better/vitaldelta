import { detectDrift, effectiveRange, markers, percentChange, rangeStatus, type Drift, type RangeSource, type RangeStatus, type Sex } from '@vitaldelta/extraction';
import type { Report, Result } from '../storage/types';

export type Point = {
  resultId: string;
  reportId: string;
  /** Collection date, YYYY-MM-DD. */
  date: string;
  labName: string | null;
  value: number;
  unit: string | null;
  comparator: Result['comparator'];
  /** The report's range, or the guideline's when the report printed none (see rangeSource). */
  refLow: number | null;
  refHigh: number | null;
  refLowStrict: boolean;
  refHighStrict: boolean;
  rangeSource: RangeSource;
  guidelineSource: string | null;
  status: RangeStatus;
};

export type TestSeries = {
  /** Marker id, or "name:<printed name>" for tests not in the dictionary. */
  key: string;
  markerId: string | null;
  name: string;
  /** The unit plotted and compared. */
  unit: string | null;
  /** Oldest first; only results in `unit`, so they can be compared. */
  points: Point[];
  /** Results in a different unit (e.g. an unrecognised printed unit): listed, never plotted. */
  otherUnits: Point[];
  latest: Point;
  /** Change from the previous comparable result to the latest, in %. */
  change: { from: Point; percent: number } | null;
  /** A steady move in one direction across the latest results, if any. */
  drift: Drift | null;
};

const markerUnit = new Map(markers.map((m) => [m.id, m.unit]));

export function seriesKey(r: Pick<Result, 'markerId' | 'name'>): string {
  return r.markerId ?? `name:${r.name.trim().toLowerCase()}`;
}

const byDate = (a: Point, b: Point) => a.date.localeCompare(b.date);

/**
 * Groups saved results into one series per test across reports. Only results in the
 * same unit are compared: the marker's standard unit when recognised, otherwise the
 * unit used most often for that printed name. Results whose report printed no range get
 * the guideline range, if the test has one (worked out here, so it's never stored).
 */
export function buildSeries(reports: Report[], results: Result[], sex: Sex | null = null): TestSeries[] {
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const groups = new Map<string, { markerId: string | null; name: string; points: Point[] }>();

  for (const r of results) {
    const report = reportById.get(r.reportId);
    if (!report) continue;
    const key = seriesKey(r);
    const range = effectiveRange(r, sex);
    const group = groups.get(key) ?? { markerId: r.markerId, name: r.name, points: [] };
    group.points.push({
      resultId: r.id,
      reportId: r.reportId,
      date: report.collectedAt,
      labName: report.labName,
      value: r.value,
      unit: r.unit,
      comparator: r.comparator,
      ...range,
      status: rangeStatus({ value: r.value, comparator: r.comparator, ...range }),
    });
    groups.set(key, group);
  }

  const series: TestSeries[] = [];
  for (const [key, { markerId, name, points }] of groups) {
    const unit = (markerId && markerUnit.get(markerId)) || mostCommonUnit(points);
    const comparable = points.filter((p) => p.unit === unit).sort(byDate);
    const otherUnits = points.filter((p) => p.unit !== unit).sort(byDate);
    const latest = comparable.at(-1) ?? otherUnits.at(-1)!;
    const previous = comparable.at(-2);
    const percent = previous && latest.unit === unit ? percentChange(previous.value, latest.value) : null;
    series.push({
      key,
      markerId,
      name,
      unit,
      points: comparable,
      otherUnits,
      latest,
      change: previous && percent !== null ? { from: previous, percent } : null,
      drift: latest.unit === unit ? detectDrift(comparable.map((p) => p.value)) : null,
    });
  }
  return series.sort((a, b) => a.name.localeCompare(b.name));
}

function mostCommonUnit(points: Point[]): string | null {
  const counts = new Map<string | null, number>();
  for (const p of points) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** A change of at least this much (in %) is worth calling out even without a status change. */
export const NOTABLE_CHANGE = 10;

export type ChangeKind = 'now-outside' | 'now-near' | 'back-in-range' | 'large-change';

export type NotableChange = { series: TestSeries; kind: ChangeKind };

export type SinceLastReport = {
  latestDate: string;
  previousDate: string | null;
  changes: NotableChange[];
  /** Tests in the latest report that have no earlier result. */
  newTests: TestSeries[];
};

const toneOf = (status: RangeStatus) =>
  status === 'above' || status === 'below' ? 'out' : status === 'near-high' || status === 'near-low' ? 'near' : 'ok';

const KIND_ORDER: ChangeKind[] = ['now-outside', 'now-near', 'back-in-range', 'large-change'];

/**
 * What changed in the latest report compared with each test's previous result:
 * status moves first (now outside, now near a limit, back in range), then large moves.
 */
export function sinceLastReport(reports: Report[], series: TestSeries[]): SinceLastReport | null {
  const dates = [...new Set(reports.map((r) => r.collectedAt))].sort();
  const latestDate = dates.at(-1);
  if (!latestDate) return null;

  const inLatest = series.filter((s) => s.latest.date === latestDate);
  const changes: NotableChange[] = [];
  const newTests: TestSeries[] = [];

  for (const s of inLatest) {
    if (!s.change) {
      if (s.points.length + s.otherUnits.length === 1) newTests.push(s);
      continue;
    }
    const before = s.change.from.status;
    const now = s.latest.status;
    let kind: ChangeKind | null = null;
    if (before !== 'no-range' && now !== 'no-range' && toneOf(before) !== toneOf(now)) {
      kind = toneOf(now) === 'out' ? 'now-outside' : toneOf(now) === 'near' ? 'now-near' : 'back-in-range';
      if (kind === 'now-near' && toneOf(before) === 'out') kind = 'back-in-range';
    } else if (Math.abs(s.change.percent) >= NOTABLE_CHANGE) {
      kind = 'large-change';
    }
    if (kind) changes.push({ series: s, kind });
  }

  changes.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.series.name.localeCompare(b.series.name));
  return { latestDate, previousDate: dates.at(-2) ?? null, changes, newTests };
}
