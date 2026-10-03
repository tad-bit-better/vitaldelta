import type { NewReport, NewResult, Profile, Report, Result, Storage } from './types';

const byCollectedDesc = (a: Report, b: Report) => b.collectedAt.localeCompare(a.collectedAt) || b.createdAt.localeCompare(a.createdAt);

/** Session-only backend: nothing is written to disk; closing the tab erases everything. */
export function createMemoryStorage(): Storage {
  let profile: Profile | null = null;
  let reports: Report[] = [];
  let results: Result[] = [];

  const storage: Storage = {
    mode: 'session',

    async getProfile() {
      profile ??= { id: crypto.randomUUID(), name: 'Me', createdAt: new Date().toISOString() };
      return profile;
    },

    async listReports() {
      return [...reports].sort(byCollectedDesc);
    },

    async getReport(id) {
      const report = reports.find((r) => r.id === id);
      return report ? { report, results: results.filter((r) => r.reportId === id) } : null;
    },

    async saveReport(input: NewReport, newResults: NewResult[]) {
      const { id: profileId } = await storage.getProfile();
      const report: Report = { ...input, id: crypto.randomUUID(), profileId, createdAt: new Date().toISOString() };
      reports = [...reports, report];
      results = [...results, ...newResults.map((r) => ({ ...r, id: crypto.randomUUID(), reportId: report.id }))];
      return report;
    },

    async deleteReport(id) {
      reports = reports.filter((r) => r.id !== id);
      results = results.filter((r) => r.reportId !== id);
    },

    async listResults(filter = {}) {
      return results.filter((r) => filter.markerId === undefined || r.markerId === filter.markerId);
    },

    async deleteAll() {
      profile = null;
      reports = [];
      results = [];
    },
  };
  return storage;
}
