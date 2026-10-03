import { useState } from 'react';
import { formatDate, formatNumber, formatPercent } from './format';
import Link from './Link';
import { testPath } from './router';
import type { TestSeries } from './series';
import Sparkline from './Sparkline';
import { driftText, groupByStatus, type StatusOrder } from './status';
import StatusBadge from './StatusBadge';

const ORDERS: { value: StatusOrder; label: string }[] = [
  { value: 'attention-first', label: 'Needs attention first' },
  { value: 'in-range-first', label: 'In range first' },
];

/** Tests grouped by the status of their latest value, with a toggle for which end comes first. */
export default function TestList({ profileId, tests }: { profileId: string; tests: TestSeries[] }) {
  // Kept in memory only: session mode must not write anything to disk.
  const [order, setOrder] = useState<StatusOrder>('attention-first');
  const groups = groupByStatus(tests, (t) => t.latest.status, order);

  return (
    <div className="app-group">
      <div className="app-group-head">
        <h2>Your tests</h2>
        <div className="app-toggle" role="group" aria-label="Sort tests">
          {ORDERS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="app-toggle-btn"
              aria-pressed={order === o.value}
              onClick={() => setOrder(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.tone} className="app-test-group" aria-label={g.label}>
          <h3 className={`app-test-group-head app-status-${g.tone}`}>
            {g.label} <span className="app-muted">({g.items.length})</span>
          </h3>
          <ul className="app-tests">
            {g.items.map((t) => (
              <li key={t.key}>
                <Link to={testPath(profileId, t.key)} className="app-test">
                  <span className="app-test-name">{t.name}</span>
                  <Sparkline points={t.points} />
                  <span className="app-test-value">
                    {t.latest.comparator ?? ''}
                    {formatNumber(t.latest.value)} <span className="app-muted">{t.latest.unit}</span>
                  </span>
                  <StatusBadge status={t.latest.status} />
                  <span className="app-test-meta app-muted">
                    {formatDate(t.latest.date)} · {t.points.length + t.otherUnits.length} result
                    {t.points.length + t.otherUnits.length === 1 ? '' : 's'}
                    {t.change && ` · ${formatPercent(t.change.percent)} since ${formatDate(t.change.from.date)}`}
                    {t.drift && (
                      <span className="app-drift" title={driftText(t.drift)}>
                        {' · '}
                        {t.drift.direction === 'rising' ? '↗ rising' : '↘ falling'}, {t.drift.count} in a row
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
