import { lazy, Suspense } from 'react';
import Landing from './pages/Landing';

// The app (and pdf.js) loads only on /app, keeping the landing page small.
const AppShell = lazy(() => import('./app/AppShell'));

// Dev-only tools; the DEV check lets Vite drop them from production builds.
const RowsDebug = import.meta.env.DEV ? lazy(() => import('./dev/RowsDebug')) : null;

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (RowsDebug && path === '/dev/rows') {
    return (
      <Suspense fallback={null}>
        <RowsDebug />
      </Suspense>
    );
  }
  if (path === '/app') {
    return (
      <Suspense fallback={null}>
        <AppShell />
      </Suspense>
    );
  }
  return <Landing />;
}
