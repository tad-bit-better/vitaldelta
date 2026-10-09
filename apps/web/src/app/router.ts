import { useEffect, useState } from 'react';

const NAVIGATE = 'vitaldelta:navigate';

/** Moves to an in-app path without reloading; the browser's back button still works. */
export function navigate(path: string, { replace = false } = {}) {
  if (path === window.location.pathname) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new Event(NAVIGATE));
  window.scrollTo(0, 0);
}

/** The current path, kept in sync with navigate() and back/forward. */
export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(NAVIGATE, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAVIGATE, update);
    };
  }, []);
  return path;
}

export const patientPath = (profileId: string) => `/app/p/${encodeURIComponent(profileId)}`;
export const testPath = (profileId: string, key: string) => `${patientPath(profileId)}/tests/${encodeURIComponent(key)}`;

export const summaryPath = (profileId: string) => `${patientPath(profileId)}/summary`;
export const DATA_PATH = '/app/data';
export const ABOUT_PATH = '/app/about';

export type Route =
  | { name: 'home' }
  | { name: 'add' }
  | { name: 'data' }
  | { name: 'about' }
  | { name: 'patient'; profileId: string }
  | { name: 'summary'; profileId: string }
  | { name: 'test'; profileId: string; testKey: string };

/** /app, /app/add, /app/data, /app/about, /app/p/<id>, /app/p/<id>/summary, /app/p/<id>/tests/<key>; anything else is home. */
export function parseRoute(path: string): Route {
  const parts = path.replace(/\/+$/, '').split('/').slice(2).map(decodeURIComponent);
  if (parts[0] === 'add' && parts.length === 1) return { name: 'add' };
  if (parts[0] === 'data' && parts.length === 1) return { name: 'data' };
  if (parts[0] === 'about' && parts.length === 1) return { name: 'about' };
  if (parts[0] === 'p' && parts[1]) {
    if (parts.length === 2) return { name: 'patient', profileId: parts[1] };
    if (parts[2] === 'summary' && parts.length === 3) return { name: 'summary', profileId: parts[1] };
    if (parts[2] === 'tests' && parts[3] && parts.length === 4) return { name: 'test', profileId: parts[1], testKey: parts[3] };
  }
  return { name: 'home' };
}
