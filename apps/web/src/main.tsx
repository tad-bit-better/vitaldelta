import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/manrope';
import App from './App';
import './index.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// Production builds prerender the landing page into index.html (see vite.config.ts); React takes
// over that markup instead of rebuilding it. App pages (app.html) arrive empty.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);

// Offline support (production builds only; see sw/sw.js). Caches the app's own files only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without it the app still works online.
    });
  });
}
