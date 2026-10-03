import { useEffect, useState } from 'react';
import { createDexieStorage, createMemoryStorage, hasPersistentData, type Storage, type StorageMode } from '../storage';
import './app.css';
import Home from './Home';
import Review from './Review';
import StorageChoice from './StorageChoice';
import { StorageContext } from './StorageContext';
import Upload, { type Extracted } from './Upload';

type View = { name: 'home'; notice: string | null } | { name: 'upload' } | { name: 'review'; extracted: Extracted };

function open(mode: StorageMode): Storage {
  if (mode === 'session') return createMemoryStorage();
  // Ask the browser not to evict saved data under storage pressure (best effort).
  void navigator.storage?.persist?.();
  return createDexieStorage();
}

export default function AppShell() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>({ name: 'home', notice: null });

  // A returning user who chose "Save on this device" goes straight in.
  useEffect(() => {
    hasPersistentData()
      .then((exists) => exists && setStorage(open('persistent')))
      .finally(() => setChecking(false));
  }, []);

  // In session mode, closing the tab loses everything: warn once there's something to lose.
  useEffect(() => {
    if (storage?.mode !== 'session') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storage]);

  return (
    <div className="app">
      <header className="app-bar">
        <a href="/" className="app-logo">VitalDelta</a>
        {storage?.mode === 'session' && (
          <span className="app-session">Just this session · closing this tab erases everything</span>
        )}
      </header>

      <main className="app-main">
        {checking ? null : !storage ? (
          <StorageChoice onChoose={(mode) => setStorage(open(mode))} />
        ) : (
          <StorageContext.Provider value={storage}>
            {view.name === 'home' && <Home notice={view.notice} onAdd={() => setView({ name: 'upload' })} />}
            {view.name === 'upload' && (
              <Upload
                onExtracted={(extracted) => setView({ name: 'review', extracted })}
                onCancel={() => setView({ name: 'home', notice: null })}
              />
            )}
            {view.name === 'review' && (
              <Review
                extracted={view.extracted}
                onSaved={() => setView({ name: 'home', notice: 'Report saved.' })}
                onCancel={() => setView({ name: 'home', notice: null })}
              />
            )}
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
