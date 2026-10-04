import { formatDate } from './format';
import type { WordSeries } from './series';
import { WORD_STATUS } from './status';

const ORDER = { differs: 0, 'no-expected': 1, 'as-expected': 2 };

/** Tests reported as words ("Non Reactive"): latest result, how it compares with the expected word, and any change. */
export default function WordList({ words }: { words: WordSeries[] }) {
  const sorted = [...words].sort((a, b) => ORDER[a.latest.status] - ORDER[b.latest.status] || a.name.localeCompare(b.name));
  return (
    <div className="app-group">
      <h2>Other results</h2>
      <p className="app-muted">Results printed as words, compared only with the expected result on the same report.</p>
      <ul className="app-tests app-tests-list">
        {sorted.map((w) => {
          const status = WORD_STATUS[w.latest.status];
          return (
            <li key={w.key}>
              <div className="app-test">
                <span className="app-test-name">{w.name}</span>
                <span className="app-test-value">{w.latest.text}</span>
                <span className={`app-status app-status-${status.tone}`}>
                  <span aria-hidden="true">{status.icon}</span> {status.label}
                </span>
                <span className="app-test-meta app-muted">
                  {formatDate(w.latest.date)}
                  {w.latest.expected && ` · expected ${w.latest.expected}`}
                  {w.points.length > 1 && ` · ${w.points.length} results`}
                  {w.changedFrom && ` · was ${w.changedFrom.text} on ${formatDate(w.changedFrom.date)}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
