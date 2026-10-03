import type { Storage } from './types';

/**
 * Delete all data: the backend's records (the whole IndexedDB database when saved on this
 * device), plus Cache Storage and service workers, so nothing of the site is left behind.
 * Files the user downloaded (PDFs, backups) are outside the browser's reach.
 */
export async function deleteEverything(storage: Storage): Promise<void> {
  await storage.deleteAll();
  if ('caches' in window) {
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
  }
}
