import { useEffect, useState } from 'react';
import type { Report } from '../storage/types';
import { formatDate } from './format';
import { useStorage } from './StorageContext';

type Props = { onAdd: () => void; notice: string | null };

/** Saved reports, newest first. The dashboard (Day 7) will build on this. */
export default function Home({ onAdd, notice }: Props) {
  const storage = useStorage();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Bumped after a delete to reload the list.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([storage.listReports(), storage.listResults()]).then(([list, results]) => {
      if (cancelled) return;
      const byReport = new Map<string, number>();
      for (const r of results) byReport.set(r.reportId, (byReport.get(r.reportId) ?? 0) + 1);
      setReports(list);
      setCounts(byReport);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, version]);

  if (!reports) return null;

  return (
    <section className="app-card">
      <div className="app-head">
        <h1>Your reports</h1>
        <button type="button" className="app-btn app-btn-primary" onClick={onAdd}>Add a report</button>
      </div>
      {notice && <p className="app-notice" role="status">{notice}</p>}

      {reports.length === 0 ? (
        <p className="app-muted">No reports yet. Add a lab report PDF to get started.</p>
      ) : (
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
                      setVersion((v) => v + 1);
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
      )}
    </section>
  );
}
