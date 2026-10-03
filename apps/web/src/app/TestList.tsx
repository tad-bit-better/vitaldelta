import { useState } from 'react';
import { formatDate, formatNumber, formatPercent } from './format';
import Link from './Link';
import { testPath } from './router';
import type { TestSeries } from './series';
import Sparkline from './Sparkline';
import { driftText, groupByStatus, type StatusOrder } from './status';
import StatusBadge from './StatusBadge';

type Layout = 'grid' | 'list';

const ORDERS: { value: StatusOrder; label: string }[] = [
  { value: 'attention-first', label: 'Needs attention first' },
  { value: 'in-range-first', label: 'In range first' },
];

const LAYOUTS: { value: Layout; label: string; icon: string }[] = [
  { value: 'grid', label: 'Grid', icon: '▦' },
  { value: 'list', label: 'List', icon: '☰' },
];

// View choices live in memory only (session mode must not write anything to disk). Module
// scope keeps them while moving between pages; a reload resets them.
const remembered: { order: StatusOrder; layout: Layout } = { order: 'attention-first', layout: 'grid' };

function Toggle<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="app-toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="app-toggle-btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <span aria-hidden="true">{o.icon} </span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Tests grouped by the status of their latest value, as cards or rows, with a toggle for which end comes first. */
export default function TestList({ profileId, tests }: { profileId: string; tests: TestSeries[] }) {
  const [order, setOrder] = useState(remembered.order);
  const [layout, setLayout] = useState(remembered.layout);
  const groups = groupByStatus(tests, (t) => t.latest.status, order);

  return (
    <div className="app-group">
      <div className="app-group-head">
        <h2>Your tests</h2>
        <div className="app-group-controls">
          <Toggle label="Layout" options={LAYOUTS} value={layout} onChange={(v) => setLayout((remembered.layout = v))} />
          <Toggle label="Sort tests" options={ORDERS} value={order} onChange={(v) => setOrder((remembered.order = v))} />
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.tone} className="app-test-group" aria-label={g.label}>
          <h3 className={`app-test-group-head app-status-${g.tone}`}>
            {g.label} <span className="app-muted">({g.items.length})</span>
          </h3>
          <ul className={`app-tests app-tests-${layout}`}>
            {g.items.map((t) => {
              const count = t.points.length + t.otherUnits.length;
              // Cards say this where the trend would be; the meta line then skips the count.
              const onlyOne = layout === 'grid' && count === 1;
              return (
                <li key={t.key}>
                  <Link to={testPath(profileId, t.key)} className="app-test">
                    <span className="app-test-name">{t.name}</span>
                    {onlyOne ? (
                      <span className="app-spark app-spark-empty">1 result so far</span>
                    ) : (
                      <Sparkline points={t.points} width={layout === 'grid' ? 160 : 88} />
                    )}
                    <span className="app-test-value">
                      {t.latest.comparator ?? ''}
                      {formatNumber(t.latest.value)} <span className="app-muted">{t.latest.unit}</span>
                    </span>
                    <StatusBadge status={t.latest.status} />
                    <span className="app-test-meta app-muted">
                      {formatDate(t.latest.date)}
                      {!onlyOne && ` · ${count} result${count === 1 ? '' : 's'}`}
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
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
