import type { NewProfile, NewReport, NewResult, Profile, Report, Result, Storage } from './types';

const byCollectedDesc = (a: Report, b: Report) => b.collectedAt.localeCompare(a.collectedAt) || b.createdAt.localeCompare(a.createdAt);

/** Session-only backend: nothing is written to disk; closing the tab erases everything. */
export function createMemoryStorage(): Storage {
  let profiles: Profile[] = [];
  let reports: Report[] = [];
  let results: Result[] = [];

  const reportIdsOf = (profileId: string) => new Set(reports.filter((r) => r.profileId === profileId).map((r) => r.id));

  return {
    mode: 'session',

    async listProfiles() {
      return [...profiles];
    },

    async createProfile(input: NewProfile) {
      const profile: Profile = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      profiles = [...profiles, profile];
      return profile;
    },

    async updateProfile(id, changes) {
      const existing = profiles.find((p) => p.id === id);
      if (!existing) throw new Error(`No profile ${id}`);
      const updated = { ...existing, ...changes };
      profiles = profiles.map((p) => (p.id === id ? updated : p));
      return updated;
    },

    async deleteProfile(id) {
      const ids = reportIdsOf(id);
      results = results.filter((r) => !ids.has(r.reportId));
      reports = reports.filter((r) => r.profileId !== id);
      profiles = profiles.filter((p) => p.id !== id);
    },

    async listReports(filter = {}) {
      return reports.filter((r) => filter.profileId === undefined || r.profileId === filter.profileId).sort(byCollectedDesc);
    },

    async getReport(id) {
      const report = reports.find((r) => r.id === id);
      return report ? { report, results: results.filter((r) => r.reportId === id) } : null;
    },

    async saveReport(profileId, input: NewReport, newResults: NewResult[]) {
      if (!profiles.some((p) => p.id === profileId)) throw new Error(`No profile ${profileId}`);
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
      const ids = filter.profileId === undefined ? null : reportIdsOf(filter.profileId);
      return results.filter(
        (r) => (filter.markerId === undefined || r.markerId === filter.markerId) && (!ids || ids.has(r.reportId)),
      );
    },

    async deleteAll() {
      profiles = [];
      reports = [];
      results = [];
    },
  };
}
