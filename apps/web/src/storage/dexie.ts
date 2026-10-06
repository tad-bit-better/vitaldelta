import Dexie, { type EntityTable } from 'dexie';
import type { NewProfile, NewReport, NewResult, Profile, Report, Result, Storage } from './types';

export const DB_NAME = 'vitaldelta';

class VitalDeltaDb extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  reports!: EntityTable<Report, 'id'>;
  results!: EntityTable<Result, 'id'>;
  meta!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      profiles: 'id',
      reports: 'id, profileId, collectedAt',
      results: 'id, reportId, markerId',
    });
    // Small app facts, e.g. when the last backup was made.
    this.version(2).stores({ meta: 'key' });
  }
}

/** True if this browser already has saved data, i.e. the user chose "Save on this device". */
export function hasPersistentData(): Promise<boolean> {
  return Dexie.exists(DB_NAME);
}

/** Profiles saved before multi-patient support lack these fields. */
const normalise = (p: Profile): Profile => ({ ...p, aliases: p.aliases ?? [], sex: p.sex ?? null });
/** Results saved before word results existed lack these fields. */
const normaliseResult = (r: Result): Result => ({ ...r, textValue: r.textValue ?? null, expectedText: r.expectedText ?? null });

const byCollectedDesc = (a: Report, b: Report) => b.collectedAt.localeCompare(a.collectedAt) || b.createdAt.localeCompare(a.createdAt);

/** Persistent backend: IndexedDB in this browser on this device. */
export function createDexieStorage(): Storage {
  const db = new VitalDeltaDb();

  const reportIdsOf = async (profileId: string) => (await db.reports.where('profileId').equals(profileId).primaryKeys()) as string[];

  return {
    mode: 'persistent',

    async listProfiles() {
      const profiles = await db.profiles.toArray();
      return profiles.map(normalise).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async createProfile(input: NewProfile) {
      const profile: Profile = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      await db.profiles.add(profile);
      return profile;
    },

    async updateProfile(id, changes) {
      return db.transaction('rw', db.profiles, async () => {
        const existing = await db.profiles.get(id);
        if (!existing) throw new Error(`No profile ${id}`);
        const updated = { ...normalise(existing), ...changes };
        await db.profiles.put(updated);
        return updated;
      });
    },

    async deleteProfile(id) {
      await db.transaction('rw', db.profiles, db.reports, db.results, async () => {
        const ids = await reportIdsOf(id);
        await db.results.where('reportId').anyOf(ids).delete();
        await db.reports.bulkDelete(ids);
        await db.profiles.delete(id);
      });
    },

    async listReports(filter = {}) {
      const reports =
        filter.profileId === undefined
          ? await db.reports.toArray()
          : await db.reports.where('profileId').equals(filter.profileId).toArray();
      return reports.sort(byCollectedDesc);
    },

    async getReport(id) {
      const report = await db.reports.get(id);
      if (!report) return null;
      return { report, results: (await db.results.where('reportId').equals(id).toArray()).map(normaliseResult) };
    },

    async saveReport(profileId, input: NewReport, newResults: NewResult[]) {
      const report: Report = { ...input, id: crypto.randomUUID(), profileId, createdAt: new Date().toISOString() };
      await db.transaction('rw', db.profiles, db.reports, db.results, async () => {
        if (!(await db.profiles.get(profileId))) throw new Error(`No profile ${profileId}`);
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
      let results =
        filter.profileId !== undefined
          ? await db.results.where('reportId').anyOf(await reportIdsOf(filter.profileId)).toArray()
          : filter.markerId !== undefined
            ? await db.results.where('markerId').equals(filter.markerId).toArray()
            : await db.results.toArray();
      if (filter.markerId !== undefined) results = results.filter((r) => r.markerId === filter.markerId);
      return results.map(normaliseResult);
    },

    async updateResultRange(id, range) {
      return db.transaction('rw', db.results, async () => {
        const existing = await db.results.get(id);
        if (!existing) throw new Error(`No result ${id}`);
        const updated = { ...normaliseResult(existing), ...range, userEdited: true };
        await db.results.put(updated);
        return updated;
      });
    },

    async lastBackupAt() {
      return (await db.meta.get('lastBackupAt'))?.value ?? null;
    },

    async setLastBackupAt(at) {
      await db.meta.put({ key: 'lastBackupAt', value: at });
    },

    async importBackup(backup) {
      return db.transaction('rw', db.profiles, db.reports, db.results, async () => {
        // Keeps the items bulkGet didn't find (results come back in the same order as the ids).
        const missing = <T>(items: T[], existing: unknown[]) => items.filter((_, i) => existing[i] === undefined);
        const profiles = missing(backup.profiles, await db.profiles.bulkGet(backup.profiles.map((p) => p.id)));
        const reports = missing(backup.reports, await db.reports.bulkGet(backup.reports.map((r) => r.id)));
        // Results only come with a report that's new here; an existing report keeps its own results.
        const newReportIds = new Set(reports.map((r) => r.id));
        const candidates = backup.results.filter((r) => newReportIds.has(r.reportId));
        const results = missing(candidates, await db.results.bulkGet(candidates.map((r) => r.id)));
        await db.profiles.bulkAdd(profiles);
        await db.reports.bulkAdd(reports);
        await db.results.bulkAdd(results);
        return { profiles: profiles.length, reports: reports.length, results: results.length };
      });
    },

    async deleteAll() {
      await db.delete();
    },
  };
}
