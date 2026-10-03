import type { Comparator, Sex } from '@vitaldelta/extraction';
import type { Backup, ImportCounts } from './backup';

export type StorageMode = 'persistent' | 'session';

/** A person whose reports are tracked together. */
export type Profile = {
  id: string;
  /** Display name the user chose ("Me", "Dad", or a full name). */
  name: string;
  /** Names printed on this person's reports, used to suggest them for new reports. */
  aliases: string[];
  sex: Sex | null;
  createdAt: string;
};

export type NewProfile = Pick<Profile, 'name' | 'aliases' | 'sex'>;

export type Report = {
  id: string;
  profileId: string;
  /** Sample collection date, YYYY-MM-DD. */
  collectedAt: string;
  labName: string | null;
  sourceFileName: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

export type Result = {
  id: string;
  reportId: string;
  /** LOINC id, or null for a test kept under its printed name. */
  markerId: string | null;
  name: string;
  /** In the marker's standard unit when recognised. */
  value: number;
  unit: string | null;
  comparator: Comparator | null;
  /** Nullable: one-sided ranges like "<200" have only refHigh. */
  refLow: number | null;
  refHigh: number | null;
  labFlag: 'high' | 'low' | null;
  confidence: number;
  /** True if the user changed or added this result on the review screen. */
  userEdited: boolean;
  /** What the report printed; null for results the user added by hand. */
  original: { valueText: string; unit: string | null; refText: string | null } | null;
};

export type NewReport = Pick<Report, 'collectedAt' | 'labName' | 'sourceFileName'>;
export type NewResult = Omit<Result, 'id' | 'reportId'>;

/**
 * All app data goes through this interface; components never touch IndexedDB.
 * Backends: Dexie (saved on this device) and in-memory (this session only).
 */
export interface Storage {
  readonly mode: StorageMode;
  /** Oldest first. */
  listProfiles(): Promise<Profile[]>;
  createProfile(profile: NewProfile): Promise<Profile>;
  updateProfile(id: string, changes: Partial<NewProfile>): Promise<Profile>;
  /** Deletes the profile with all its reports and results. */
  deleteProfile(id: string): Promise<void>;
  /** Newest collection date first. */
  listReports(filter?: { profileId?: string }): Promise<Report[]>;
  getReport(id: string): Promise<{ report: Report; results: Result[] } | null>;
  /** Saves a report and its results together (all or nothing). */
  saveReport(profileId: string, report: NewReport, results: NewResult[]): Promise<Report>;
  deleteReport(id: string): Promise<void>;
  listResults(filter?: { markerId?: string; profileId?: string }): Promise<Result[]>;
  /**
   * Adds a backup's patients, reports and results, all or nothing. Anything whose id is
   * already here is left as it is (so restoring the same backup twice changes nothing).
   */
  importBackup(backup: Backup): Promise<ImportCounts>;
  /** Removes every report, result and profile from this backend. */
  deleteAll(): Promise<void>;
}
