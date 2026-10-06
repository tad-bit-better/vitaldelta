import { createContext, useContext } from 'react';
import type { Profile, Report, Result } from '../storage/types';

/** Everything saved, loaded once and shared by the top bar and pages. */
export type AppData = {
  profiles: Profile[];
  reports: Report[];
  results: Result[];
  /** When a backup file was last downloaded (ISO), or null. */
  lastBackupAt: string | null;
  /** Re-reads storage after a change (save, delete, rename). */
  reload: () => Promise<void>;
};

export const DataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const data = useContext(DataContext);
  if (!data) throw new Error('useAppData must be used inside DataContext');
  return data;
}

/** One profile's reports and results. */
export function forProfile(data: AppData, profileId: string) {
  const reports = data.reports.filter((r) => r.profileId === profileId);
  const ids = new Set(reports.map((r) => r.id));
  return { reports, results: data.results.filter((r) => ids.has(r.reportId)) };
}
