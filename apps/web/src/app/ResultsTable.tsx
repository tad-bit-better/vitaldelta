import type { MouseEvent } from 'react';
import type { RowGroup, TestRow, WordRow } from './dashboard';
import { formatDate, formatNumber, formatPercent } from './format';
import Link from './Link';
import { barPositions } from './rangeBar';
import { navigate, testPath } from './router';
import { rangeValue, STATUS, tone, WORD_STATUS } from './status';
import StatusBadge from './StatusBadge';

const CHANGE_LABEL = {
  'now-outside': 'Now outside range',
  'now-near': 'Now near a limit',
  'back-in-range': 'Back in range',
  'large-change': null,
} as const;

/**
 * Every test in groups: latest value, where it sits in the range, the range and the change.
 * A table on wide screens; on phones each group becomes a card of stacked rows (CSS).
 */
export default function ResultsTable({ profileId, groups }: { profileId: string; groups: RowGroup[] }) {
  return (
    <div className="app-results-table-wrap">
      <table className="app-results-table">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Latest</th>
            <th scope="col">Where it sits in the range</th>
            <th scope="col">Range</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.id}>
            <tr className="app-results-group">
              <th scope="colgroup" colSpan={5}>{g.label}</th>
            </tr>
            {g.rows.map((r) => (r.kind === 'test' ? <TestLine key={r.key} profileId={profileId} row={r} /> : <WordLine key={r.key} row={r} />))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function TestLine({ profileId, row: { series: s, change } }: { profileId: string; row: TestRow }) {
  const to = testPath(profileId, s.key);
  const { latest } = s;
  const range = rangeValue(latest);
  const count = s.points.length + s.otherUnits.length;
  // The whole row opens the test; the name is the real link for keyboards and screen readers.
  const open = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('a, button')) navigate(to);
  };

  return (
    <tr className="app-results-row" onClick={open}>
      <th scope="row" className="app-results-name">
        <Link to={to}>{s.name}</Link>
      </th>
      <td className="app-results-value">
        <span className="app-mono">
          {latest.comparator ?? ''}
          {formatNumber(latest.value)}
        </span>
        {latest.unit && <span className="app-results-unit app-mono"> {latest.unit}</span>}
      </td>
      <td className="app-results-where">
        {range ? (
          <span className="app-results-where-inner">
            <RangeBar value={latest.value} low={latest.refLow} high={latest.refHigh} status={latest.status} />
            {tone(latest.status) === 'ok' ? <span className="app-visually-hidden">{STATUS[latest.status].label}</span> : <StatusBadge status={latest.status} />}
          </span>
        ) : (
          <span className="app-muted">
            No range on the report ·{' '}
            <Link to={`${to}#add-range`} className="app-inline-link">Add one</Link>
          </span>
        )}
      </td>
      <td className="app-results-range">
        {range && (
          <>
            <span className="app-narrow-only">Range </span>
            <span className="app-mono">{range}</span>
            {latest.rangeSource === 'guideline' && <span className="app-results-sub">{latest.guidelineSource} guideline</span>}
          </>
        )}
        {!range && <span className="app-wide-only app-muted">—</span>}
      </td>
      <td className="app-results-change">
        {s.change ? (
          <>
            <span className="app-mono">{formatPercent(s.change.percent)}</span>
            {/* One note: a move in or out of the range, else a steady trend, else since when. */}
            <span className="app-results-sub">
              {(change && CHANGE_LABEL[change]) ??
                (s.drift ? `${s.drift.direction === 'rising' ? '↗ Rising' : '↘ Falling'} ${s.drift.count} in a row` : `since ${formatDate(s.change.from.date)}`)}
            </span>
          </>
        ) : (
          <span className="app-muted">{count === 1 ? 'First result' : 'No earlier result in this unit'}</span>
        )}
      </td>
    </tr>
  );
}

function WordLine({ row: { series: w } }: { row: WordRow }) {
  const status = WORD_STATUS[w.latest.status];
  return (
    <tr className="app-results-row app-results-row-word">
      <th scope="row" className="app-results-name">{w.name}</th>
      <td className="app-results-value">{w.latest.text}</td>
      <td className="app-results-where">
        <span className={`app-status app-status-${status.tone}`}>
          <span aria-hidden="true">{status.icon}</span> {status.label}
        </span>
      </td>
      <td className="app-results-range">
        {w.latest.expected && (
          <>
            <span className="app-narrow-only">Expected </span>
            {w.latest.expected}
          </>
        )}
        {!w.latest.expected && <span className="app-wide-only app-muted">—</span>}
      </td>
      <td className="app-results-change">
        {w.changedFrom ? (
          <>
            <span>Was {w.changedFrom.text}</span>
            <span className="app-results-sub">on {formatDate(w.changedFrom.date)}</span>
          </>
        ) : (
          <span className="app-muted">{w.points.length === 1 ? 'First result' : 'Same as before'}</span>
        )}
      </td>
    </tr>
  );
}

/** The range as a band on a track, with a dot for the value. Decorative: the status is also written out. */
function RangeBar({ value, low, high, status }: { value: number; low: number | null; high: number | null; status: Parameters<typeof tone>[0] }) {
  const at = barPositions(value, low, high);
  if (!at) return null;
  return (
    <span className="app-bar-track" aria-hidden="true">
      <span className="app-bar-band" style={{ left: `${at.bandStart}%`, width: `${at.bandEnd - at.bandStart}%` }} />
      <span className={`app-bar-dot app-bar-dot-${tone(status)}`} style={{ left: `${at.dot}%` }} />
    </span>
  );
}
