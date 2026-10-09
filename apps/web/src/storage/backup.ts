import { currentMarkerId } from '@vitaldelta/extraction';
import type { Profile, Report, Result, Storage } from './types';

/**
 * A full copy of the app's data as JSON: the way to move data to another browser or
 * keep it safe, since saved data lives in one browser on one device. Unencrypted.
 */
export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** ISO timestamp. */
  exportedAt: string;
  profiles: Profile[];
  reports: Report[];
  results: Result[];
};

export const BACKUP_FORMAT = 'vitaldelta-backup';
export const BACKUP_VERSION = 1;

/** What a restore added; records whose id is already here are kept as they are. */
export type ImportCounts = { profiles: number; reports: number; results: number };

export async function createBackup(storage: Storage, now = new Date()): Promise<Backup> {
  const [profiles, reports, results] = await Promise.all([storage.listProfiles(), storage.listReports(), storage.listResults()]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), profiles, reports, results };
}

/** Named by the local date, which is the day the user sees. */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `vitaldelta-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** A file that isn't a usable backup; the message is shown to the user. */
export class BackupError extends Error {}

type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
const nullable = (check: Check): Check => (v) => v === null || check(v);
const oneOf = (...values: unknown[]): Check => (v) => values.includes(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const day: Check = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const PROFILE: Record<string, Check> = { id: str, name: str, createdAt: str, sex: nullable(oneOf('male', 'female')) };
const REPORT: Record<string, Check> = {
  id: str,
  profileId: str,
  collectedAt: day,
  labName: nullable(str),
  sourceFileName: nullable(str),
  createdAt: str,
};
const RESULT: Record<string, Check> = {
  id: str,
  reportId: str,
  markerId: nullable(str),
  name: str,
  value: nullable(num),
  unit: nullable(str),
  comparator: nullable(oneOf('<', '<=', '>', '>=')),
  refLow: nullable(num),
  refHigh: nullable(num),
  labFlag: nullable(oneOf('high', 'low')),
  confidence: num,
  userEdited: bool,
  original: nullable((v) => isObject(v) && str(v.valueText) && nullable(str)(v.unit) && nullable(str)(v.refText)),
};

function records<T>(value: unknown, fields: Record<string, Check>, what: string): T[] {
  if (!Array.isArray(value)) throw new BackupError(`The backup has no list of ${what}.`);
  value.forEach((item, i) => {
    const bad = isObject(item) ? Object.keys(fields).find((key) => !fields[key](item[key])) : 'the whole entry';
    if (bad) throw new BackupError(`Entry ${i + 1} in ${what} is damaged (${bad}).`);
  });
  return value as T[];
}

/** Reads a backup file's text, checking every record and that reports and results point at something. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('This file isn’t a VitalDelta backup (it isn’t valid JSON).');
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT) throw new BackupError('This file isn’t a VitalDelta backup.');
  if (data.version !== BACKUP_VERSION) {
    throw new BackupError(`This backup is format version ${String(data.version)}; this version of VitalDelta reads version ${BACKUP_VERSION}.`);
  }

  // Profiles saved before multi-patient support have no aliases; fill them in like storage does.
  const profiles = records<Profile>(data.profiles, PROFILE, 'patients').map((p) => ({
    ...p,
    aliases: Array.isArray(p.aliases) ? p.aliases.filter((a) => typeof a === 'string') : [],
  }));
  const reports = records<Report>(data.reports, REPORT, 'reports');
  const results = records<Result>(data.results, RESULT, 'results').map((r) => {
    const textValue = typeof r.textValue === 'string' ? r.textValue : null;
    if (r.value === null && textValue === null) throw new BackupError('The backup has a result with neither a value nor a text result.');
    return {
      ...r,
      // Older backups may use a LOINC code that has since been corrected.
      markerId: currentMarkerId(r.markerId),
      textValue,
      expectedText: typeof r.expectedText === 'string' ? r.expectedText : null,
      method: typeof r.method === 'string' ? r.method : null,
    };
  });

  const profileIds = new Set(profiles.map((p) => p.id));
  const reportIds = new Set(reports.map((r) => r.id));
  if (profileIds.size !== profiles.length || reportIds.size !== reports.length || new Set(results.map((r) => r.id)).size !== results.length) {
    throw new BackupError('The backup lists the same entry twice.');
  }
  if (reports.some((r) => !profileIds.has(r.profileId))) throw new BackupError('The backup has a report without its patient.');
  if (results.some((r) => !reportIds.has(r.reportId))) throw new BackupError('The backup has a result without its report.');

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: str(data.exportedAt) ? (data.exportedAt as string) : '', profiles, reports, results };
}
