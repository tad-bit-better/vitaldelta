import { useCallback, useEffect, useState } from 'react';
import { createDexieStorage, createMemoryStorage, hasPersistentData, type Profile, type Report, type Result, type Storage, type StorageMode } from '../storage';
import './app.css';
import { DataContext, type AppData } from './DataContext';
import Link from './Link';
import PatientDashboard from './PatientDashboard';
import Review from './Review';
import { navigate, parseRoute, patientPath, usePath } from './router';
import Sidebar from './Sidebar';
import StorageChoice from './StorageChoice';
import { StorageContext } from './StorageContext';
import TestDetail from './TestDetail';
import Upload, { type Extracted } from './Upload';

function open(mode: StorageMode): Storage {
  if (mode === 'session') return createMemoryStorage();
  // Ask the browser not to evict saved data under storage pressure (best effort).
  void navigator.storage?.persist?.();
  return createDexieStorage();
}

export default function AppShell() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [checking, setChecking] = useState(true);
  const [loaded, setLoaded] = useState<{ profiles: Profile[]; reports: Report[]; results: Result[] } | null>(null);
  const route = parseRoute(usePath());
  // The add flow's in-progress extraction lives in memory, never in the URL or on disk.
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A returning user who chose "Save on this device" goes straight in.
  useEffect(() => {
    hasPersistentData()
      .then((exists) => exists && setStorage(open('persistent')))
      .finally(() => setChecking(false));
  }, []);

  const reload = useCallback(async () => {
    if (!storage) return;
    const [profiles, reports, results] = await Promise.all([storage.listProfiles(), storage.listReports(), storage.listResults()]);
    setLoaded({ profiles, reports, results });
  }, [storage]);

  useEffect(() => {
    let cancelled = false;
    if (storage) {
      Promise.all([storage.listProfiles(), storage.listReports(), storage.listResults()]).then(([profiles, reports, results]) => {
        if (!cancelled) setLoaded({ profiles, reports, results });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // In session mode, closing the tab loses everything: warn once there's something to lose.
  useEffect(() => {
    if (storage?.mode !== 'session') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storage]);

  // /app opens the first patient's dashboard when there is one.
  const firstProfile = loaded?.profiles[0]?.id;
  useEffect(() => {
    if (route.name === 'home' && firstProfile) navigate(patientPath(firstProfile), { replace: true });
  }, [route.name, firstProfile]);

  const data: AppData | null = loaded && { ...loaded, reload };
  const activeId = route.name === 'patient' || route.name === 'test' ? route.profileId : null;
  const leaveAdd = (to: string, message: string | null = null) => {
    setExtracted(null);
    setNotice(message);
    navigate(to);
  };

  return (
    <div className="app">
      <header className="app-bar">
        <Link to="/app" className="app-logo">VitalDelta</Link>
        {storage?.mode === 'session' && (
          <span className="app-session">Just this session · closing this tab erases everything</span>
        )}
      </header>

      <main className="app-main">
        {checking ? null : !storage ? (
          <StorageChoice onChoose={(mode) => setStorage(open(mode))} />
        ) : !data ? null : (
          <StorageContext.Provider value={storage}>
            <DataContext.Provider value={data}>
              <div className="app-layout">
                <Sidebar activeId={activeId} />
                <div className="app-content">
                  {route.name === 'add' ? (
                    extracted ? (
                      <Review
                        extracted={extracted}
                        onSaved={(profileId) => leaveAdd(patientPath(profileId), 'Report saved.')}
                        onCancel={() => leaveAdd('/app')}
                      />
                    ) : (
                      <Upload onExtracted={setExtracted} onCancel={() => leaveAdd('/app')} />
                    )
                  ) : route.name === 'test' ? (
                    <TestDetail profileId={route.profileId} testKey={route.testKey} />
                  ) : route.name === 'patient' ? (
                    <PatientDashboard key={route.profileId} profileId={route.profileId} notice={notice} />
                  ) : (
                    <section className="app-card">
                      <h1>Your results</h1>
                      <p className="app-muted">
                        No reports yet. Add a lab report PDF; you’ll choose who it’s for before saving.
                      </p>
                      <div>
                        <button type="button" className="app-btn app-btn-primary" onClick={() => navigate('/app/add')}>
                          Add a report
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </DataContext.Provider>
          </StorageContext.Provider>
        )}
      </main>

      <footer className="app-footer">
        Not medical advice. VitalDelta shows what your reports say and how values changed; talk to your doctor about what
        they mean.
      </footer>
    </div>
  );
}
