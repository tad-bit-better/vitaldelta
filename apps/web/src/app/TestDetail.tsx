import { describeStatus, markers } from '@vitaldelta/extraction';
import { formatDate, formatNumber, formatPercent } from './format';
import { forProfile, useAppData } from './DataContext';
import Link from './Link';
import { patientPath } from './router';
import { buildSeries, type Point } from './series';
import StatusBadge from './StatusBadge';
import { rangeCell, rangeText } from './status';
import TrendChart from './TrendChart';

const markerById = new Map(markers.map((m) => [m.id, m]));

/** One test across all saved reports: latest value, change, trend chart and every result. */
export default function TestDetail({ profileId, testKey }: { profileId: string; testKey: string }) {
  const data = useAppData();
  const profile = data.profiles.find((p) => p.id === profileId);
  const { reports, results } = forProfile(data, profileId);
  const series = buildSeries(reports, results, profile?.sex ?? null).find((s) => s.key === testKey);

  if (!profile || !series) {
    return (
      <section className="app-card">
        <h1>Test not found</h1>
        <p className="app-muted">It may have been deleted with its report.</p>
        <BackLink profileId={profileId} name={profile?.name ?? 'patient'} />
      </section>
    );
  }

  const { name, unit, points, otherUnits, latest, change } = series;
  const marker = series.markerId ? markerById.get(series.markerId) : undefined;
  const ranges = new Set(points.filter((p) => p.rangeSource === 'report').map((p) => rangeText(p)));
  const guidelines = [...new Set(points.map((p) => p.guidelineSource).filter((s): s is string => s !== null))];
  const all = [...points, ...otherUnits].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="app-card">
      <BackLink profileId={profileId} name={profile.name} />
      <div className="app-head">
        <div>
          <h1>{name}</h1>
          <p className="app-muted">
            {marker ? `LOINC ${marker.id}` : 'Not in our list of tests; grouped by its printed name'}
            {unit ? ` · values in ${unit}` : ''}
          </p>
        </div>
      </div>

      <div className="app-latest">
        <p className="app-latest-label">Latest · {formatDate(latest.date)}</p>
        <p className="app-latest-value">
          {latest.comparator ?? ''}
          {formatNumber(latest.value)} <span>{latest.unit}</span>
        </p>
        <StatusBadge status={latest.status} />
        <p className="app-muted">{describeStatus(latest)}.</p>
        {change && (
          <p className="app-muted">
            Changed by {formatPercent(change.percent)} since {formatDate(change.from.date)} (
            {formatNumber(change.from.value)} {unit}).
          </p>
        )}
      </div>

      {points.length > 0 && (
        <div className="app-group">
          <h2>Over time</h2>
          {points.length === 1 && <p className="app-muted">Add another report with this test to see a trend.</p>}
          <TrendChart name={name} unit={unit} points={points} />
          <p className="app-note">
            Shaded: the reference range printed on each report
            {guidelines.length > 0 && `, or where a report printed none, the ${guidelines.join(', ')} guideline range`}.
            {ranges.size > 1 && ' Ranges differ between reports, often because labs use different methods.'}
          </p>
        </div>
      )}

      <div className="app-group">
        <h2>All results</h2>
        <div className="app-table-wrap">
          <table className="app-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Value</th>
                <th scope="col">Range</th>
                <th scope="col">Status</th>
                <th scope="col">Lab</th>
              </tr>
            </thead>
            <tbody>
              {all.map((p) => (
                <ResultRow key={p.resultId} point={p} comparable={p.unit === unit} />
              ))}
            </tbody>
          </table>
        </div>
        {otherUnits.length > 0 && (
          <p className="app-note">
            Results marked “different unit” weren’t converted to {unit}, so they’re listed but not charted or compared.
          </p>
        )}
      </div>
    </section>
  );
}

function ResultRow({ point: p, comparable }: { point: Point; comparable: boolean }) {
  return (
    <tr>
      <td>{formatDate(p.date)}</td>
      <td className="app-num">
        {p.comparator ?? ''}
        {formatNumber(p.value)} {p.unit}
        {!comparable && <span className="app-muted"> (different unit)</span>}
      </td>
      <td>{rangeCell(p)}</td>
      <td>
        <StatusBadge status={p.status} />
      </td>
      <td>{p.labName ?? '—'}</td>
    </tr>
  );
}

function BackLink({ profileId, name }: { profileId: string; name: string }) {
  return (
    <Link to={patientPath(profileId)} className="app-back">
      ← {name}’s tests
    </Link>
  );
}
