import { useCallback, useEffect, useRef, useState } from 'react';
import { sampleBackup } from '../demo/sampleData';
import { samplePdfFile } from '../demo/samplePdf';
import { createDexieStorage, createMemoryStorage, hasPersistentData, type Profile, type Report, type Result, type Storage, type StorageMode } from '../storage';
import './app.css';
import { DataContext, type AppData } from './DataContext';
import DataPage from './DataPage';
import Link from './Link';
import PatientDashboard from './PatientDashboard';
import Review from './Review';
import { useInstallPrompt } from './install';
import { navigate, parseRoute, patientPath, usePath, type Route } from './router';
import { seriesKey } from './series';
import Sidebar from './Sidebar';
import StorageChoice from './StorageChoice';
import Summary from './Summary';
import { StorageContext } from './StorageContext';
import TestDetail from './TestDetail';
import Upload, { type Extracted } from './Upload';

function open(mode: StorageMode): Storage {
  if (mode === 'session') return createMemoryStorage();
  // Ask the browser not to evict saved data under storage pressure (best effort).
  void navigator.storage?.persist?.();
  return createDexieStorage();
}

/** Demo mode: made-up sample patients in memory. Nothing is read from or written to disk. */
async function openDemo(): Promise<Storage> {
  const storage = createMemoryStorage();
  await storage.importBackup(sampleBackup());
  return storage;
}

type Loaded = { profiles: Profile[]; reports: Report[]; results: Result[] };

function pageTitle(route: Route, loaded: Loaded | null, adding: boolean): string {
  const name = 'profileId' in route ? loaded?.profiles.find((p) => p.id === route.profileId)?.name : undefined;
  switch (route.name) {
    case 'add':
      return adding ? 'Check results' : 'Add a report';
    case 'data':
      return 'Your data';
    case 'patient':
      return name ?? 'Patient';
    case 'test':
      return `${loaded?.results.find((r) => seriesKey(r) === route.testKey)?.name ?? 'Test'} · ${name ?? 'Patient'}`;
    case 'summary':
      // Browsers name a saved PDF after the page title.
      return `${name ?? 'Patient'} - lab results summary`;
    default:
      return 'Your results';
  }
}

export default function AppShell() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [demo, setDemo] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const path = usePath();
  const route = parseRoute(path);
  // The add flow's in-progress extraction lives in memory, never in the URL or on disk.
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const install = useInstallPrompt();

  // /app?demo=1 (the landing page's "Try with sample reports") starts the demo. Otherwise a
  // returning user who chose "Save on this device" goes straight in.
  useEffect(() => {
    const wantsDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    if (wantsDemo) {
      window.history.replaceState(null, '', window.location.pathname);
      openDemo()
        .then((s) => {
          setDemo(true);
          setStorage(s);
        })
        .finally(() => setChecking(false));
      return;
    }
    hasPersistentData()
      .then((exists) => exists && setStorage(open('persistent')))
      .finally(() => setChecking(false));
  }, []);

  // Page title, and focus moved to the new page's heading so screen readers announce it.
  const firstRender = useRef(true);
  const title = storage ? pageTitle(route, loaded, extracted !== null) : 'Get started';
  useEffect(() => {
    document.title = `${title} · VitalDelta`;
  }, [title]);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [path, storage, extracted]);

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
  // (Not in the demo: its data is made up.)
  useEffect(() => {
    if (storage?.mode !== 'session' || demo) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storage, demo]);

  // /app opens the first patient's dashboard when there is one.
  const firstProfile = loaded?.profiles[0]?.id;
  useEffect(() => {
    if (route.name === 'home' && firstProfile) navigate(patientPath(firstProfile), { replace: true });
  }, [route.name, firstProfile]);

  const data: AppData | null = loaded && { ...loaded, reload };
  const activeId = route.name === 'patient' || route.name === 'test' || route.name === 'summary' ? route.profileId : null;
  // Back to the first-use choice (after Delete all data, or leaving the demo), with nothing
  // left in memory either.
  const reset = (message: string | null) => {
    setStorage(null);
    setDemo(false);
    setLoaded(null);
    setExtracted(null);
    setNotice(message);
    navigate('/app', { replace: true });
  };
  const exitDemo = () => {
    reset(null);
    setChecking(true);
    hasPersistentData()
      .then((exists) => exists && setStorage(open('persistent')))
      .finally(() => setChecking(false));
  };
  const startDemo = () => {
    setNotice(null);
    void openDemo().then((s) => {
      setDemo(true);
      setStorage(s);
    });
  };
  const leaveAdd = (to: string, message: string | null = null) => {
    setExtracted(null);
    setNotice(message);
    navigate(to);
  };

  return (
    <div className="app">
      <a href="#main" className="app-skip">Skip to content</a>
      <header className="app-bar">
        <Link to="/app" className="app-logo">VitalDelta</Link>
        <div className="app-bar-end">
          {demo ? (
            <span className="app-session app-demo">
              Demo with made-up sample data · nothing is saved{' '}
              <button type="button" className="app-link-btn" onClick={exitDemo}>Exit demo</button>
            </span>
          ) : (
            storage?.mode === 'session' && (
              <span className="app-session">Just this session · closing this tab erases everything</span>
            )
          )}
          {install && (
            <button type="button" className="app-btn app-btn-sm" onClick={() => void install()}>Install app</button>
          )}
        </div>
      </header>

      <main className="app-main" id="main">
        {checking ? null : !storage ? (
          <>
            {notice && <p className="app-notice app-choice-notice" role="status">{notice}</p>}
            <StorageChoice
              onChoose={(mode) => {
                setNotice(null);
                setStorage(open(mode));
              }}
              onDemo={startDemo}
            />
          </>
        ) : !data ? null : (
          <StorageContext.Provider value={storage}>
            <DataContext.Provider value={data}>
              <div className="app-layout">
                <Sidebar activeId={activeId} dataActive={route.name === 'data'} />
                <div className="app-content">
                  {route.name === 'add' ? (
                    extracted ? (
                      <Review
                        extracted={extracted}
                        onSaved={(profileId) => leaveAdd(patientPath(profileId), 'Report saved.')}
                        onCancel={() => leaveAdd('/app')}
                      />
                    ) : (
                      <Upload
                        onExtracted={setExtracted}
                        onCancel={() => leaveAdd('/app')}
                        sample={demo ? samplePdfFile : undefined}
                      />
                    )
                  ) : route.name === 'data' ? (
                    <DataPage onDeletedAll={() => reset(demo ? null : 'All data deleted.')} />
                  ) : route.name === 'summary' ? (
                    <Summary profileId={route.profileId} />
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
