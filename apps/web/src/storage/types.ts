import type { Comparator } from '@vitaldelta/extraction';

export type StorageMode = 'persistent' | 'session';

export type Profile = { id: string; name: string; createdAt: string };

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
  /** The single v1 profile, created on first use. */
  getProfile(): Promise<Profile>;
  /** Newest collection date first. */
  listReports(): Promise<Report[]>;
  getReport(id: string): Promise<{ report: Report; results: Result[] } | null>;
  /** Saves a report and its results together (all or nothing). */
  saveReport(report: NewReport, results: NewResult[]): Promise<Report>;
  deleteReport(id: string): Promise<void>;
  listResults(filter?: { markerId?: string }): Promise<Result[]>;
  /** Removes every report, result and profile from this backend. */
  deleteAll(): Promise<void>;
}
