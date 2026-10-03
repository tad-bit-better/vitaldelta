import Dexie, { type EntityTable } from 'dexie';
import type { NewReport, NewResult, Profile, Report, Result, Storage } from './types';

export const DB_NAME = 'vitaldelta';

class VitalDeltaDb extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  reports!: EntityTable<Report, 'id'>;
  results!: EntityTable<Result, 'id'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      profiles: 'id',
      reports: 'id, profileId, collectedAt',
      results: 'id, reportId, markerId',
    });
  }
}

/** True if this browser already has saved data, i.e. the user chose "Save on this device". */
export function hasPersistentData(): Promise<boolean> {
  return Dexie.exists(DB_NAME);
}

/** Persistent backend: IndexedDB in this browser on this device. */
export function createDexieStorage(): Storage {
  const db = new VitalDeltaDb();

  const storage: Storage = {
    mode: 'persistent',

    async getProfile() {
      return db.transaction('rw', db.profiles, async () => {
        const existing = await db.profiles.toCollection().first();
        if (existing) return existing;
        const profile: Profile = { id: crypto.randomUUID(), name: 'Me', createdAt: new Date().toISOString() };
        await db.profiles.add(profile);
        return profile;
      });
    },

    async listReports() {
      const reports = await db.reports.orderBy('collectedAt').reverse().toArray();
      // Same date: newest saved first, matching the memory backend.
      return reports.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || b.createdAt.localeCompare(a.createdAt));
    },

    async getReport(id) {
      const report = await db.reports.get(id);
      if (!report) return null;
      return { report, results: await db.results.where('reportId').equals(id).toArray() };
    },

    async saveReport(input: NewReport, newResults: NewResult[]) {
      const { id: profileId } = await storage.getProfile();
      const report: Report = { ...input, id: crypto.randomUUID(), profileId, createdAt: new Date().toISOString() };
      await db.transaction('rw', db.reports, db.results, async () => {
        await db.reports.add(report);
        await db.results.bulkAdd(newResults.map((r) => ({ ...r, id: crypto.randomUUID(), reportId: report.id })));
      });
      return report;
    },

    async deleteReport(id) {
      await db.transaction('rw', db.reports, db.results, async () => {
        await db.results.where('reportId').equals(id).delete();
        await db.reports.delete(id);
      });
    },

    async listResults(filter = {}) {
      if (filter.markerId !== undefined) return db.results.where('markerId').equals(filter.markerId).toArray();
      return db.results.toArray();
    },

    async deleteAll() {
      await db.delete();
    },
  };
  return storage;
}
