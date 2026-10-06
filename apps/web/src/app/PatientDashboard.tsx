import { useState } from 'react';
import { backupState, downloadBackup } from './backupFile';
import { reportTypes, resultGroups, sinceText, tileCounts, type ResultsView } from './dashboard';
import { forProfile, useAppData } from './DataContext';
import { formatDate } from './format';
import { Icon } from './icons';
import Link from './Link';
import Menu from './Menu';
import ResultsTable from './ResultsTable';
import { DATA_PATH, navigate, summaryPath } from './router';
import { buildSeries, buildWordSeries, sinceLastReport } from './series';
import { useStorage } from './StorageContext';

const VIEWS: { value: ResultsView; label: string }[] = [
  { value: 'panel', label: 'By panel' },
  { value: 'attention', label: 'Needs attention first' },
];

// In memory only (session mode must not write anything to disk); a reload resets it.
const remembered: { view: ResultsView } = { view: 'panel' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One patient: counts, what changed, every result by panel, their reports and a backup nudge. */
export default function PatientDashboard({ profileId, notice }: { profileId: string; notice: string | null }) {
  const storage = useStorage();
  const data = useAppData();
  const profile = data.profiles.find((p) => p.id === profileId);
  const [view, setView] = useState(remembered.view);
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
  const tests = buildSeries(reports, results, profile.sex);
  const words = buildWordSeries(reports, results);
  const summary = sinceLastReport(reports, tests);
  const hasResults = tests.length > 0 || words.length > 0;
  const counts = tileCounts(tests, words);
  const resultCount = new Map<string, number>();
  for (const r of results) resultCount.set(r.reportId, (resultCount.get(r.reportId) ?? 0) + 1);
  const latest = reports[0];
  const types = latest ? reportTypes(results.filter((r) => r.reportId === latest.id)) : [];
  const nudge = storage.mode === 'persistent' && reports.length > 0 && backupState(data) !== 'current';

  return (
    <div className="app-dash">
      <div className="app-dash-head">
        {renaming === null ? (
          <div className="app-dash-title">
            <h1>{profile.name}</h1>
            {latest && (
              <p className="app-muted">
                Latest report {formatDate(latest.collectedAt)}
                {types.length > 0 && <span className="app-wide-only"> · {types.slice(0, 2).join(', ')}{types.length > 2 ? ` and ${types.length - 2} more` : ''}</span>}
                {' · '}
                {plural(reports.length, 'report')}
              </p>
            )}
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
          <div className="app-dash-actions">
            {hasResults && (
              <Link to={summaryPath(profile.id)} className="app-btn app-wide-only">
                <Icon name="doc" /> Summary for the doctor
              </Link>
            )}
            <Menu label={`More actions for ${profile.name}`} className="app-menu-boxed" button={<Icon name="dots" size={18} />}>
              <button type="button" className="app-menu-item" onClick={() => setRenaming(profile.name)}>Rename</button>
              <button type="button" className="app-menu-item app-menu-danger" onClick={() => setConfirmDeletePatient(true)}>
                Delete patient…
              </button>
            </Menu>
          </div>
        )}
      </div>

      {confirmDeletePatient && (
        <div className="app-confirm" role="alert">
          <p>
            Delete <strong>{profile.name}</strong> and their {plural(reports.length, 'report')}? This can’t be undone.
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

      <div className="app-dash-grid">
        <div className="app-dash-main">
          {reports.length === 0 && <p className="app-muted">No reports for {profile.name} yet.</p>}
          {hasResults && (
            <>
              <div className="app-tiles">
                <Tile label="In range" short="In range" value={counts.inRange} tone="ok" />
                <Tile label="Outside range" short="Outside" value={counts.outside} tone={counts.outside > 0 ? 'out' : 'plain'} />
                <Tile label="No range printed" short="No range" value={counts.noRange} tone="plain" />
                <p className="app-tile app-tile-since">
                  <Icon name="trend" size={18} />
                  <span>{sinceText(profile.name, summary, tests, words)}</span>
                </p>
              </div>

              <Link to={summaryPath(profile.id)} className="app-btn app-dash-summary app-narrow-only">
                Summary for the doctor
              </Link>

              <section className="app-group" aria-labelledby="results-title">
                <div className="app-group-head">
                  <h2 id="results-title">Results</h2>
                  <div className="app-toggle" role="group" aria-label="Group results">
                    {VIEWS.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        className="app-toggle-btn"
                        aria-pressed={view === v.value}
                        onClick={() => setView((remembered.view = v.value))}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ResultsTable profileId={profile.id} groups={resultGroups(tests, words, summary, view)} />
              </section>
            </>
          )}
        </div>

        <aside className="app-dash-side" aria-label="Reports and backup">
          {reports.length > 0 && (
            <section className="app-side-card" aria-labelledby="reports-title">
              <h2 id="reports-title">Reports</h2>
              <ul className="app-side-reports">
                {reports.map((r) => (
                  <li key={r.id}>
                    {confirmDelete === r.id ? (
                      <div className="app-side-confirm" role="alert">
                        <span>Delete the {formatDate(r.collectedAt)} report and its results?</span>
                        <div className="app-row">
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
                      </div>
                    ) : (
                      <>
                        <span className="app-side-report">
                          <strong>{formatDate(r.collectedAt)}</strong>
                          <span className="app-muted">
                            {[r.labName, r.sourceFileName, plural(resultCount.get(r.id) ?? 0, 'result')].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <Menu label={`Actions for the ${formatDate(r.collectedAt)} report`} button={<Icon name="dots" size={18} />}>
                          <button type="button" className="app-menu-item app-menu-danger" onClick={() => setConfirmDelete(r.id)}>
                            Delete report…
                          </button>
                        </Menu>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nudge && (
            <section className="app-side-card app-side-warn" aria-labelledby="backup-title">
              <h2 id="backup-title">Your data lives in this browser</h2>
              <p>
                {backupState(data) === 'none'
                  ? 'Clearing browser data would erase it. You haven’t made a backup yet.'
                  : `Reports added since your last backup (${formatDate(data.lastBackupAt!.slice(0, 10))}) aren’t in it.`}
              </p>
              <div>
                <button type="button" className="app-btn app-btn-sm" onClick={() => void downloadBackup(storage, data)}>
                  <Icon name="download" /> Download a backup
                </button>
              </div>
              <Link to={DATA_PATH} className="app-inline-link">Restore or delete data</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Tile({ label, short, value, tone }: { label: string; short: string; value: number; tone: 'ok' | 'out' | 'plain' }) {
  return (
    <p className={`app-tile app-tile-${tone}`}>
      <span className="app-tile-label">
        <span className="app-wide-only">{label}</span>
        <span className="app-narrow-only">{short}</span>
      </span>
      <span className="app-tile-value app-mono">{value}</span>
    </p>
  );
}
