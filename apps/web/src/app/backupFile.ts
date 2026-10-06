import { backupFileName, createBackup, type Storage } from '../storage';
import type { AppData } from './DataContext';

/** Hands the user a file. Nothing is uploaded: the file is made in the browser. */
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a backup of everything and remembers when, so the app stops asking for one. */
export async function downloadBackup(storage: Storage, data: AppData) {
  download(backupFileName(), JSON.stringify(await createBackup(storage), null, 2));
  await storage.setLastBackupAt(new Date().toISOString());
  await data.reload();
}

/**
 * Whether the saved data is in a backup: "none" (never backed up), "behind" (a report was
 * added since) or "current". Only reports count; renames and deletes don't lose results.
 */
export function backupState(data: Pick<AppData, 'reports' | 'lastBackupAt'>): 'none' | 'behind' | 'current' {
  if (!data.lastBackupAt) return 'none';
  return data.reports.some((r) => r.createdAt > data.lastBackupAt!) ? 'behind' : 'current';
}
