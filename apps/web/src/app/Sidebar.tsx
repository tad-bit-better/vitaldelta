import { forProfile, useAppData } from './DataContext';
import Link from './Link';
import { DATA_PATH, navigate, patientPath } from './router';
import { buildSeries } from './series';
import { tone } from './status';

/** Patients list: pick whose dashboard to show. On narrow screens it becomes a row of chips. */
export default function Sidebar({ activeId, dataActive }: { activeId: string | null; dataActive: boolean }) {
  const data = useAppData();

  return (
    <nav className="app-sidebar" aria-label="Patients">
      <button type="button" className="app-btn app-btn-primary app-sidebar-add" onClick={() => navigate('/app/add')}>
        + Add a report
      </button>
      <h2 className="app-sidebar-title">Patients</h2>
      {data.profiles.length === 0 ? (
        <p className="app-note">Patients appear here after you save their first report.</p>
      ) : (
        <ul className="app-patients">
          {data.profiles.map((p) => {
            const { reports, results } = forProfile(data, p.id);
            const outside = buildSeries(reports, results, p.sex).filter((s) => tone(s.latest.status) === 'out').length;
            return (
              <li key={p.id}>
                <Link
                  to={patientPath(p.id)}
                  className="app-patient"
                  aria-current={p.id === activeId ? 'page' : undefined}
                >
                  <span className="app-patient-name">{p.name}</span>
                  <span className="app-patient-meta">
                    <span className="app-wide-only">
                      {reports.length} report{reports.length === 1 ? '' : 's'}
                      {outside > 0 && ' · '}
                    </span>
                    {outside > 0 && (
                      <span className="app-status-out">
                        {outside} outside<span className="app-wide-only"> range</span>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={DATA_PATH} className="app-sidebar-data" aria-current={dataActive ? 'page' : undefined}>
        Your data<span className="app-wide-only">: backup, restore, delete</span>
      </Link>
    </nav>
  );
}
