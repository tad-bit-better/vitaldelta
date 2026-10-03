import { useEffect } from 'react';
import { forProfile, useAppData } from './DataContext';
import { formatDate, formatNumber, formatPercent } from './format';
import Link from './Link';
import { patientPath } from './router';
import { buildSeries, sinceLastReport, type Point, type TestSeries } from './series';
import { changeHeadline, driftText, groupByStatus, rangeValue, STATUS, tone } from './status';

const value = (p: Point) => `${p.comparator ?? ''}${formatNumber(p.value)}${p.unit ? ` ${p.unit}` : ''}`;

/** Every test's latest value against its own report's range, with the previous result. */
function SummaryTable({ caption, tests }: { caption: string; tests: TestSeries[] }) {
  return (
    <div className="app-table-wrap">
      <table className="app-table summary-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Latest</th>
            <th scope="col">Date</th>
            <th scope="col">Report’s range</th>
            <th scope="col">Status</th>
            <th scope="col">Previous</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.key}>
              <th scope="row">{t.name}</th>
              <td className="summary-num">{value(t.latest)}</td>
              <td>{formatDate(t.latest.date)}</td>
              <td className="summary-num">{rangeValue(t.latest) ?? '—'}</td>
              <td>
                <span className={`app-status app-status-${tone(t.latest.status)}`}>
                  <span aria-hidden="true">{STATUS[t.latest.status].icon}</span> {STATUS[t.latest.status].label}
                </span>
              </td>
              <td className="summary-num">
                {t.change ? (
                  <>
                    {value(t.change.from)} <span className="app-muted">({formatDate(t.change.from.date)})</span>
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="summary-num">{t.change ? formatPercent(t.change.percent) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One page to take to a doctor's visit: what's outside or near the report's range, what
 * changed since the last report, slow steady moves, then everything else. Prints (or
 * saves as PDF) through the browser; the print stylesheet hides the app around it.
 */
export default function Summary({ profileId }: { profileId: string }) {
  const data = useAppData();
  const profile = data.profiles.find((p) => p.id === profileId);
  const name = profile?.name;

  // Browsers name the saved PDF after the page title.
  useEffect(() => {
    if (!name) return;
    const before = document.title;
    document.title = `${name} - lab results summary`;
    return () => {
      document.title = before;
    };
  }, [name]);

  if (!profile) {
    return (
      <section className="app-card">
        <h1>Patient not found</h1>
        <p className="app-muted">They may have been deleted.</p>
      </section>
    );
  }

  const { reports, results } = forProfile(data, profileId);
  const tests = buildSeries(reports, results);
  const groups = groupByStatus(tests, (t) => t.latest.status, 'attention-first');
  const attention = groups.filter((g) => g.tone === 'out' || g.tone === 'near').flatMap((g) => g.items);
  const others = groups.filter((g) => g.tone === 'ok' || g.tone === 'none').flatMap((g) => g.items);
  const since = sinceLastReport(reports, tests);
  const drifting = tests.filter((t) => t.drift);
  const dates = reports.map((r) => r.collectedAt).sort();
  const labs = [...new Set(reports.map((r) => r.labName).filter(Boolean))];
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <section className="app-card summary">
      <div className="app-row summary-actions">
        <Link to={patientPath(profileId)} className="app-back">← {profile.name}’s tests</Link>
        <button type="button" className="app-btn app-btn-primary" onClick={() => window.print()} disabled={tests.length === 0}>
          Print or save as PDF
        </button>
      </div>

      <header className="summary-head">
        <p className="summary-kicker">Lab results summary · prepared {formatDate(todayIso)}</p>
        <h1>{profile.name}</h1>
        <p className="app-muted">
          {[
            profile.sex && (profile.sex === 'male' ? 'Male' : 'Female'),
            reports.length === 0
              ? 'No reports yet'
              : `${reports.length} report${reports.length === 1 ? '' : 's'}${
                  dates.length > 1 && dates[0] !== dates.at(-1) ? `, ${formatDate(dates[0])} to ${formatDate(dates.at(-1)!)}` : `, ${formatDate(dates[0])}`
                }`,
            labs.length > 0 && labs.join(', '),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {tests.length === 0 ? (
        <p className="app-muted">Add a report to build a summary.</p>
      ) : (
        <>
          {attention.length > 0 ? (
            <SummaryTable caption={`Outside or near the report’s range (${attention.length})`} tests={attention} />
          ) : (
            <p>Every latest value is within its report’s range.</p>
          )}

          {(since?.previousDate || drifting.length > 0) && (
            <div className="summary-notes">
              {since?.previousDate && (
                <section>
                  <h2>
                    Since the previous report ({formatDate(since.previousDate)} → {formatDate(since.latestDate)})
                  </h2>
                  {since.changes.length === 0 ? (
                    <p className="app-muted">No status changes and no moves of 10% or more.</p>
                  ) : (
                    <ul>
                      {since.changes.map(({ series: s, kind }) => (
                        <li key={s.key}>
                          {changeHeadline(s.name, kind, s.latest.status, s.change!.percent)}:{' '}
                          {formatNumber(s.change!.from.value)} → {formatNumber(s.latest.value)} {s.unit}
                          {kind === 'large-change' ? '' : ` (${formatPercent(s.change!.percent)})`}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {drifting.length > 0 && (
                <section>
                  <h2>Steady trends</h2>
                  <ul>
                    {drifting.map((t) => (
                      <li key={t.key}>
                        {t.name}: {driftText(t.drift!, 'the').replace(/^./, (c) => c.toLowerCase())}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {others.length > 0 && <SummaryTable caption={`Other tests (${others.length})`} tests={others} />}
        </>
      )}

      <footer className="summary-foot">
        Each value is compared only with the reference range printed on its own report; change is from the previous
        result in the same unit. Values were read from the report PDFs and checked by the patient; the original reports
        are the reference. Made with VitalDelta on the patient’s device. Not medical advice.
      </footer>
    </section>
  );
}
