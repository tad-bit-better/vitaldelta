import { describe, expect, it } from 'vitest';
import { BackupError, backupFileName, parseBackup, type Backup } from './backup';

// Synthetic data only.
const valid = (): Backup => ({
  format: 'vitaldelta-backup',
  version: 1,
  exportedAt: '2026-10-03T10:00:00.000Z',
  profiles: [{ id: 'p1', name: 'Arjun Mehta', aliases: ['ARJUN MEHTA'], sex: 'male', createdAt: '2026-01-01T00:00:00.000Z' }],
  reports: [{ id: 'r1', profileId: 'p1', collectedAt: '2024-03-11', labName: null, sourceFileName: 'a.pdf', createdAt: '2026-01-01T00:00:00.000Z' }],
  results: [
    {
      id: 'x1', reportId: 'r1', markerId: '718-7', name: 'Haemoglobin', value: 13.5, unit: 'g/dL', comparator: null,
      refLow: 13, refHigh: 17, labFlag: null, confidence: 1, userEdited: false,
      original: { valueText: '13.5', unit: 'g/dL', refText: '13.0 - 17.0' },
    },
  ],
});
const parse = (data: unknown) => parseBackup(JSON.stringify(data));

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    expect(parse(valid())).toEqual(valid());
  });

  it('fills in aliases missing from older profiles', () => {
    const b = valid() as unknown as { profiles: Record<string, unknown>[] };
    delete b.profiles[0].aliases;
    expect(parse(b).profiles[0].aliases).toEqual([]);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parse({ hello: 1 })).toThrow('isn’t a VitalDelta backup');
    expect(() => parse({ ...valid(), version: 2 })).toThrow('version 2');
  });

  it('names the damaged entry', () => {
    const b = valid();
    (b.results[0] as unknown as Record<string, unknown>).value = '13.5';
    expect(() => parse(b)).toThrow('Entry 1 in results is damaged (value)');
    expect(() => parse({ ...valid(), reports: [{ ...valid().reports[0], collectedAt: '11/03/2024' }] })).toThrow('collectedAt');
  });

  it('rejects broken links and duplicates', () => {
    expect(() => parse({ ...valid(), profiles: [] })).toThrow('report without its patient');
    expect(() => parse({ ...valid(), reports: [] })).toThrow('result without its report');
    expect(() => parse({ ...valid(), results: [valid().results[0], valid().results[0]] })).toThrow('same entry twice');
  });

  it('names files by date', () => {
    expect(backupFileName(new Date(2026, 9, 3, 23, 30))).toBe('vitaldelta-backup-2026-10-03.json');
  });
});
