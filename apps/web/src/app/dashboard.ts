import { panelFor, panelOrder, panels } from '@vitaldelta/extraction';
import type { Result } from '../storage/types';
import { formatDate } from './format';
import { resolveMarkerId, type ChangeKind, type SinceLastReport, type TestSeries, type WordSeries } from './series';
import { groupByStatus, tone } from './status';

export type ResultsView = 'panel' | 'attention';

export type TestRow = { kind: 'test'; key: string; series: TestSeries; change: ChangeKind | null };
export type WordRow = { kind: 'word'; key: string; series: WordSeries };
export type RowGroup = { id: string; label: string; rows: (TestRow | WordRow)[] };

const byPanel = (a: TestSeries, b: TestSeries) => panelOrder(a.markerId) - panelOrder(b.markerId) || a.name.localeCompare(b.name);

/**
 * The dashboard's result rows in groups: by panel ("Liver enzymes", then tests not in the
 * dictionary as "Other tests"), or by status with outside the range first. Results in words
 * are always their own last group: they're compared with an expected word, not a range.
 */
export function resultGroups(tests: TestSeries[], words: WordSeries[], summary: SinceLastReport | null, view: ResultsView): RowGroup[] {
  const changes = new Map(summary?.changes.map((c) => [c.series.key, c.kind]));
  const row = (s: TestSeries): TestRow => ({ kind: 'test', key: s.key, series: s, change: changes.get(s.key) ?? null });
  const sorted = [...tests].sort(byPanel);

  const groups: RowGroup[] =
    view === 'attention'
      ? groupByStatus(sorted, (s) => s.latest.status, 'attention-first').map((g) => ({ id: g.tone, label: g.label, rows: g.items.map(row) }))
      : [
          ...panels.map((p) => ({ id: p.id, label: p.label, rows: sorted.filter((s) => panelFor(s.markerId) === p).map(row) })),
          { id: 'other', label: 'Other tests', rows: sorted.filter((s) => !panelFor(s.markerId)).map(row) },
        ];
  if (words.length) {
    groups.push({ id: 'words', label: 'Results in words', rows: words.map((w): WordRow => ({ kind: 'word', key: w.key, series: w })) });
  }
  return groups.filter((g) => g.rows.length > 0);
}

/** Counts for the tiles. Near a limit is still in range; a word result counts as in range when it's the expected one. */
export function tileCounts(tests: TestSeries[], words: WordSeries[]) {
  const counts = { inRange: 0, outside: 0, noRange: 0 };
  for (const t of tests) {
    const tn = tone(t.latest.status);
    if (tn === 'out') counts.outside++;
    else if (tn === 'none') counts.noRange++;
    else counts.inRange++;
  }
  for (const w of words) {
    if (w.latest.status === 'as-expected') counts.inRange++;
    else if (w.latest.status === 'differs') counts.outside++;
    else counts.noRange++;
  }
  return counts;
}

/** Report types in a report's results ("Liver function test", "Lipid profile"), in panel order. */
export function reportTypes(results: Pick<Result, 'markerId' | 'name' | 'unit'>[]): string[] {
  const found = new Set(results.map((r) => panelFor(resolveMarkerId(r))?.family).filter(Boolean));
  return [...new Set(panels.map((p) => p.family))].filter((f) => found.has(f));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One or two sentences on what changed in the latest report, for the tile beside the counts. */
export function sinceText(name: string, summary: SinceLastReport | null, tests: TestSeries[], words: WordSeries[]): string {
  if (!summary || summary.previousDate === null) {
    return `This is ${name}’s first report, so there’s nothing to compare yet. Add a later report and each test will show how it changed.`;
  }
  const count = (kind: ChangeKind) => summary.changes.filter((c) => c.kind === kind).length;
  const wordChanges = words.filter((w) => w.changedFrom && w.latest.date === summary.latestDate).length;
  const parts = [
    count('now-outside') && `${count('now-outside')} moved outside the range`,
    count('now-near') && `${count('now-near')} moved near a limit`,
    count('back-in-range') && `${count('back-in-range')} came back in range`,
    count('large-change') && `${count('large-change')} changed by 10% or more`,
    wordChanges && `${plural(wordChanges, 'result')} in words changed`,
  ].filter((p): p is string => Boolean(p));
  const since = `Compared with ${formatDate(summary.previousDate)}: `;
  const first =
    parts.length === 0
      ? `${since}no test moved in or out of its range, and none changed by 10% or more.`
      : `${since}${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.`;
  const drifting = tests.filter((t) => t.drift).length;
  return drifting ? `${first} ${plural(drifting, 'test')} moved the same way 3 or more times in a row.` : first;
}
