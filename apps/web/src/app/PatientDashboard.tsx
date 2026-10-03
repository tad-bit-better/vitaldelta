import { useState } from 'react';
import { forProfile, useAppData } from './DataContext';
import { formatDate } from './format';
import Highlights from './Highlights';
import Link from './Link';
import { navigate, summaryPath } from './router';
import { buildSeries, sinceLastReport } from './series';
import { useStorage } from './StorageContext';
import TestList from './TestList';

/** One patient: what changed, steady trends, tests grouped by status, and their reports. */
export default function PatientDashboard({ profileId, notice }: { profileId: string; notice: string | null }) {
  const storage = useStorage();
  const data = useAppData();
  const profile = data.profiles.find((p) => p.id === profileId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDeletePatient, setConfirmDeletePatient] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.reportId, (counts.get(r.reportId) ?? 0) + 1);
  const otherNames = profile.aliases.filter((a) => a.toLowerCase() !== profile.name.toLowerCase());

  return (
    <section className="app-card">
      <div className="app-head">
        {renaming === null ? (
          <div>
            <h1>{profile.name}</h1>
            {otherNames.length > 0 && <p className="app-muted">Name on reports: {otherNames.join(', ')}</p>}
          </div>
        ) : (
          <form
            className="app-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renaming.trim()) return;
              await storage.updateProfile(profile.id, { name: renaming.trim() });
              await data.reload();
              setRenaming(null);
            }}
          >
            <label className="app-field">
              <span>Patient name</span>
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} autoFocus />
            </label>
            <button type="submit" className="app-btn app-btn-primary" disabled={!renaming.trim()}>Save</button>
            <button type="button" className="app-btn" onClick={() => setRenaming(null)}>Cancel</button>
          </form>
        )}
        {renaming === null && (
          <div className="app-row">
            {tests.length > 0 && (
              <Link to={summaryPath(profile.id)} className="app-btn app-btn-sm app-btn-primary">
                Doctor summary
              </Link>
            )}
            <button type="button" className="app-btn app-btn-sm" onClick={() => setRenaming(profile.name)}>Rename</button>
            <button type="button" className="app-btn app-btn-sm" onClick={() => setConfirmDeletePatient(true)}>
              Delete patient
            </button>
          </div>
        )}
      </div>

      {confirmDeletePatient && (
        <div className="app-confirm" role="alert">
          <p>
            Delete <strong>{profile.name}</strong> and their {reports.length} report{reports.length === 1 ? '' : 's'}? This
            can’t be undone.
          </p>
          <div className="app-row">
            <button
              type="button"
              className="app-btn app-btn-danger app-btn-sm"
              onClick={async () => {
                await storage.deleteProfile(profile.id);
                await data.reload();
                navigate('/app', { replace: true });
              }}
            >
              Delete patient
            </button>
            <button type="button" className="app-btn app-btn-sm" onClick={() => setConfirmDeletePatient(false)}>Keep</button>
          </div>
        </div>
      )}

      {notice && <p className="app-notice" role="status">{notice}</p>}
      {reports.length === 0 && <p className="app-muted">No reports for {profile.name} yet.</p>}

      {tests.length > 0 && (
        <Highlights profileId={profile.id} summary={sinceLastReport(reports, tests)} tests={tests} />
      )}
      {tests.length > 0 && <TestList profileId={profile.id} tests={tests} />}

      {reports.length > 0 && (
        <div className="app-group">
          <h2>Reports</h2>
          <ul className="app-reports">
            {reports.map((r) => (
              <li key={r.id} className="app-report">
                <div>
                  <strong>{formatDate(r.collectedAt)}</strong>
                  <span className="app-muted">
                    {[r.labName, r.sourceFileName, `${counts.get(r.id) ?? 0} results`].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {confirmDelete === r.id ? (
                  <div className="app-row">
                    <span>Delete this report?</span>
                    <button
                      type="button"
                      className="app-btn app-btn-danger app-btn-sm"
                      onClick={async () => {
                        await storage.deleteReport(r.id);
                        setConfirmDelete(null);
                        await data.reload();
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" className="app-btn app-btn-sm" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </div>
                ) : (
                  <button type="button" className="app-btn app-btn-sm" onClick={() => setConfirmDelete(r.id)}>Delete</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
