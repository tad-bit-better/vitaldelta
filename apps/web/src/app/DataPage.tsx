import { useEffect, useState } from 'react';
import { BackupError, deleteEverything, parseBackup, type Backup } from '../storage';
import { backupState, downloadBackup } from './backupFile';
import { formatDate } from './format';
import { useAppData } from './DataContext';
import IosNote from './IosNote';
import { useStorage } from './StorageContext';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Picked = { fileName: string; backup: Backup; adds: { profiles: number; reports: number; results: number } };

/** Backup, restore and delete everything. */
export default function DataPage({ onDeletedAll }: { onDeletedAll: () => void }) {
  const storage = useStorage();
  const data = useAppData();
  const session = storage.mode === 'session';
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const empty = data.profiles.length === 0;
  // Whether the browser agreed to navigator.storage.persist() (asked when saving was chosen).
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    if (session) return;
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, [session]);

  async function pick(file: File | undefined) {
    setPicked(null);
    setError(null);
    setMessage(null);
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      // Same rule as importBackup: anything already here is kept; results come with new reports.
      const has = (list: { id: string }[]) => new Set(list.map((i) => i.id));
      const [profileIds, reportIds] = [has(data.profiles), has(data.reports)];
      const newReports = new Set(backup.reports.filter((r) => !reportIds.has(r.id)).map((r) => r.id));
      setPicked({
        fileName: file.name,
        backup,
        adds: {
          profiles: backup.profiles.filter((p) => !profileIds.has(p.id)).length,
          reports: newReports.size,
          results: backup.results.filter((r) => newReports.has(r.reportId)).length,
        },
      });
    } catch (e) {
      setError(e instanceof BackupError ? e.message : 'This file couldn’t be read.');
    }
  }

  async function restore() {
    if (!picked) return;
    setBusy(true);
    try {
      const added = await storage.importBackup(picked.backup);
      await data.reload();
      setMessage(
        added.reports === 0 && added.profiles === 0
          ? 'Nothing new: everything in this backup is already here.'
          : `Restored ${plural(added.profiles, 'patient')} and ${plural(added.reports, 'report')} (${plural(added.results, 'result')}).`,
      );
      setPicked(null);
    } catch {
      setError('The backup couldn’t be restored. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app-card">
      <div>
        <h1>Your data</h1>
        <p className="app-muted">
          {session
            ? 'This session only: everything is erased when you close the tab.'
            : 'Saved in this browser on this device. It isn’t synced or uploaded anywhere.'}{' '}
          {plural(data.profiles.length, 'patient')}, {plural(data.reports.length, 'report')},{' '}
          {plural(data.results.length, 'result')}.
        </p>
      </div>
      {persisted !== null && (
        <p className="app-note">
          {persisted
            ? 'Your browser has agreed to keep this data until you delete it.'
            : 'Your browser may clear this data if the device runs low on space. Installing the app makes that less likely; keep a backup to be safe.'}
        </p>
      )}
      {!session && <IosNote />}
      {message && <p className="app-notice" role="status">{message}</p>}

      <div className="app-group app-data-section">
        <h2>Back up</h2>
        <p className="app-muted">
          Download everything as one file, to keep it safe or to move it to another browser or device. The file isn’t
          encrypted: it holds names and results, so keep it somewhere private.
        </p>
        <div>
          <button
            type="button"
            className="app-btn"
            disabled={empty}
            onClick={() => void downloadBackup(storage, data)}
          >
            Download backup
          </button>
        </div>
        {!empty && !session && (
          <p className="app-note">
            {data.lastBackupAt
              ? `Last backup made ${formatDate(data.lastBackupAt.slice(0, 10))}${backupState(data) === 'behind' ? '; reports added since aren’t in it' : ''}.`
              : 'No backup made from this browser yet.'}
          </p>
        )}
      </div>

      <div className="app-group app-data-section">
        <h2>Restore</h2>
        <p className="app-muted">
          Add the patients and reports from a backup file. Anything already here is kept as it is, so restoring the same
          backup twice is safe.
        </p>
        <label className="app-field">
          <span>Backup file</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {error && <p className="app-error" role="alert">{error}</p>}
        {picked && (
          <div className="app-data-preview" role="status">
            <p>
              <strong>{picked.fileName}</strong>
              {picked.backup.exportedAt && ` · made ${new Date(picked.backup.exportedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </p>
            <p className="app-muted">
              Contains {plural(picked.backup.profiles.length, 'patient')} and {plural(picked.backup.reports.length, 'report')}.{' '}
              {picked.adds.reports === 0 && picked.adds.profiles === 0
                ? 'All of it is already here.'
                : `Will add ${plural(picked.adds.profiles, 'patient')} and ${plural(picked.adds.reports, 'report')} (${plural(picked.adds.results, 'result')}).`}
            </p>
            <div className="app-row">
              <button
                type="button"
                className="app-btn app-btn-primary"
                disabled={busy || (picked.adds.reports === 0 && picked.adds.profiles === 0)}
                onClick={restore}
              >
                Restore
              </button>
              <button type="button" className="app-btn" onClick={() => setPicked(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="app-group app-data-section">
        <h2>Delete all data</h2>
        <p className="app-muted">
          Removes every patient, report and result{session ? ' from this session' : ' from this browser'}, plus the app’s
          offline files, and returns to the first screen. PDFs or backups you downloaded stay in your downloads; delete
          those yourself.
        </p>
        {confirmDelete ? (
          <div className="app-confirm" role="alert">
            <p>
              Delete {plural(data.profiles.length, 'patient')} and {plural(data.reports.length, 'report')}? This can’t be
              undone{session ? '' : '; download a backup first if you want to keep them'}.
            </p>
            <div className="app-row">
              <button
                type="button"
                className="app-btn app-btn-danger app-btn-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await deleteEverything(storage);
                  onDeletedAll();
                }}
              >
                Delete everything
              </button>
              <button type="button" className="app-btn app-btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" className="app-btn app-btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete all data…
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
