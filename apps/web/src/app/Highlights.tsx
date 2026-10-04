import { useState } from 'react';
import { formatDate, formatNumber, formatPercent } from './format';
import Link from './Link';
import { testPath } from './router';
import type { SinceLastReport, TestSeries, WordSeries } from './series';
import { changeHeadline, driftText, STATUS, tone, WORD_STATUS } from './status';

type Props = { profileId: string; summary: SinceLastReport | null; tests: TestSeries[]; words?: WordSeries[] };

/** The two things a skim of the latest report misses: what changed, and slow steady moves. */
/** Items shown before "Show all" on narrow screens (CSS hides the rest; wide screens show all). */
const FIRST = 4;

function ShowAll({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count <= FIRST) return null;
  return (
    <button type="button" className="app-link-btn app-narrow-only" aria-expanded={open} onClick={onToggle}>
      {open ? 'Show fewer' : `Show all ${count}`}
    </button>
  );
}

export default function Highlights({ profileId, summary, tests, words = [] }: Props) {
  const [allChanges, setAllChanges] = useState(false);
  const [allTrends, setAllTrends] = useState(false);
  if (!summary) return null;
  // Word results that changed in the latest report ("Non Reactive" → "Reactive") come first.
  const wordChanges = words.filter((w) => w.changedFrom && w.latest.date === summary.latestDate);
  const changeCount = summary.changes.length + wordChanges.length;
  const drifting = tests.filter((t) => t.drift).sort((a, b) => b.drift!.count - a.drift!.count || a.name.localeCompare(b.name));

  return (
    <div className="app-highlights">
      <section className="app-highlight" aria-labelledby="since-last">
        <h2 id="since-last">Since your last report</h2>
        {summary.previousDate === null ? (
          <p className="app-muted">Add another report to see what changed.</p>
        ) : (
          <>
            <p className="app-muted">
              {formatDate(summary.latestDate)} compared with each test’s previous result.
            </p>
            {changeCount === 0 ? (
              <p>No status changes and no moves of 10% or more.</p>
            ) : (
              <>
                <ul className={`app-changes${allChanges ? '' : ' app-changes-collapsed'}`}>
                  {wordChanges.map((w) => (
                    <li key={w.key}>
                      <div className="app-change">
                        <span className={`app-change-icon app-status-${WORD_STATUS[w.latest.status].tone}`} aria-hidden="true">
                          {WORD_STATUS[w.latest.status].icon}
                        </span>
                        <span>
                          <strong>
                            {w.name} changed from {w.changedFrom!.text} to {w.latest.text}
                          </strong>
                          <span className="app-muted">
                            {w.latest.expected ? `Expected ${w.latest.expected} · ` : ''}previous result {formatDate(w.changedFrom!.date)}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                  {summary.changes.map(({ series: s, kind }) => (
                    <li key={s.key}>
                      <Link to={testPath(profileId, s.key)} className="app-change">
                        <span className={`app-change-icon app-status-${tone(s.latest.status)}`} aria-hidden="true">
                          {STATUS[s.latest.status].icon}
                        </span>
                        <span>
                          <strong>{changeHeadline(s.name, kind, s.latest.status, s.change!.percent, s.latest.rangeSource)}</strong>
                          <span className="app-muted">
                            {formatNumber(s.change!.from.value)} → {formatNumber(s.latest.value)} {s.unit}
                            {kind === 'large-change' ? '' : ` (${formatPercent(s.change!.percent)})`} · previous result{' '}
                            {formatDate(s.change!.from.date)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <ShowAll count={changeCount} open={allChanges} onToggle={() => setAllChanges((v) => !v)} />
              </>
            )}
            {summary.newTests.length > 0 && (
              <p className="app-note">First result for: {summary.newTests.map((t) => t.name).join(', ')}.</p>
            )}
          </>
        )}
      </section>

      {drifting.length > 0 && (
        <section className="app-highlight" aria-labelledby="steady">
          <h2 id="steady">Steady trends</h2>
          <p className="app-muted">Tests moving the same way across 3 or more results, even if still in range.</p>
          <ul className={`app-changes${allTrends ? '' : ' app-changes-collapsed'}`}>
            {drifting.map((t) => (
              <li key={t.key}>
                <Link to={testPath(profileId, t.key)} className="app-change">
                  <span className="app-change-icon app-muted" aria-hidden="true">
                    {t.drift!.direction === 'rising' ? '↗' : '↘'}
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <span className="app-muted">{driftText(t.drift!)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <ShowAll count={drifting.length} open={allTrends} onToggle={() => setAllTrends((v) => !v)} />
        </section>
      )}
    </div>
  );
}
