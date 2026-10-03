import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDexieStorage, hasPersistentData } from './dexie';
import { createMemoryStorage } from './memory';
import { createBackup, parseBackup } from './backup';
import type { NewResult, Storage } from './types';

// Synthetic data only.
const result = (overrides: Partial<NewResult> = {}): NewResult => ({
  markerId: '718-7',
  name: 'Haemoglobin',
  value: 13.5,
  unit: 'g/dL',
  comparator: null,
  refLow: 13,
  refHigh: 17,
  labFlag: null,
  confidence: 1,
  userEdited: false,
  original: { valueText: '13.5', unit: 'g/dL', refText: '13.0 - 17.0' },
  ...overrides,
});
const report = (collectedAt: string) => ({ collectedAt, labName: 'Test Lab', sourceFileName: 'synthetic.pdf' });

// The same contract runs against both backends.
describe.each([
  ['memory', createMemoryStorage],
  ['dexie', createDexieStorage],
])('%s storage', (_, create) => {
  let storage: Storage;
  afterEach(async () => storage.deleteAll());
  const person = (name: string) => storage.createProfile({ name, aliases: [name], sex: null });

  it('creates, lists, updates and deletes profiles', async () => {
    storage = create();
    const a = await person('Arjun Mehta');
    const b = await person('Priya Nair');
    expect((await storage.listProfiles()).map((p) => p.name)).toEqual(['Arjun Mehta', 'Priya Nair']);
    const renamed = await storage.updateProfile(a.id, { name: 'Me', aliases: ['Arjun Mehta', 'A Mehta'] });
    expect(renamed).toMatchObject({ id: a.id, name: 'Me', aliases: ['Arjun Mehta', 'A Mehta'] });
    await storage.deleteProfile(b.id);
    expect((await storage.listProfiles()).map((p) => p.name)).toEqual(['Me']);
  });

  it('saves a report with its results and reads them back', async () => {
    storage = create();
    const me = await person('Arjun Mehta');
    const saved = await storage.saveReport(me.id, report('2024-03-11'), [result(), result({ markerId: null, name: 'Homocysteine', unit: 'µmol/L' })]);
    expect(saved).toMatchObject({ collectedAt: '2024-03-11', labName: 'Test Lab', profileId: me.id });

    const loaded = await storage.getReport(saved.id);
    expect(loaded?.report).toEqual(saved);
    expect(loaded?.results).toHaveLength(2);
    expect(loaded?.results.every((r) => r.reportId === saved.id && r.id)).toBe(true);
  });

  it('refuses to save a report for a missing profile', async () => {
    storage = create();
    await expect(storage.saveReport('nobody', report('2024-03-11'), [result()])).rejects.toThrow();
    expect(await storage.listReports()).toEqual([]);
  });

  it('lists reports newest collection date first', async () => {
    storage = create();
    const me = await person('Arjun Mehta');
    await storage.saveReport(me.id, report('2023-01-05'), []);
    await storage.saveReport(me.id, report('2024-06-01'), []);
    await storage.saveReport(me.id, report('2023-09-20'), []);
    expect((await storage.listReports()).map((r) => r.collectedAt)).toEqual(['2024-06-01', '2023-09-20', '2023-01-05']);
  });

  it('keeps each profile’s reports and results apart', async () => {
    storage = create();
    const a = await person('Arjun Mehta');
    const b = await person('Priya Nair');
    await storage.saveReport(a.id, report('2023-01-05'), [result({ value: 12.9 })]);
    await storage.saveReport(b.id, report('2024-01-05'), [result({ value: 13.8 }), result({ markerId: '3016-3', name: 'TSH' })]);
    expect((await storage.listReports({ profileId: a.id })).map((r) => r.collectedAt)).toEqual(['2023-01-05']);
    expect((await storage.listResults({ profileId: b.id })).map((r) => r.value).sort()).toEqual([13.5, 13.8]);
    expect((await storage.listResults({ profileId: b.id, markerId: '718-7' })).map((r) => r.value)).toEqual([13.8]);
    expect(await storage.listResults({ markerId: '718-7' })).toHaveLength(2);
  });

  it('deletes a report together with its results', async () => {
    storage = create();
    const me = await person('Arjun Mehta');
    const keep = await storage.saveReport(me.id, report('2023-01-05'), [result()]);
    const gone = await storage.saveReport(me.id, report('2024-01-05'), [result(), result()]);
    await storage.deleteReport(gone.id);
    expect(await storage.getReport(gone.id)).toBeNull();
    expect((await storage.listResults()).every((r) => r.reportId === keep.id)).toBe(true);
  });

  it('deletes a profile with its reports and results, leaving others', async () => {
    storage = create();
    const a = await person('Arjun Mehta');
    const b = await person('Priya Nair');
    await storage.saveReport(a.id, report('2023-01-05'), [result()]);
    const kept = await storage.saveReport(b.id, report('2024-01-05'), [result()]);
    await storage.deleteProfile(a.id);
    expect((await storage.listReports()).map((r) => r.id)).toEqual([kept.id]);
    expect((await storage.listResults()).every((r) => r.reportId === kept.id)).toBe(true);
  });

  it('round-trips a backup into an empty backend, keeping ids', async () => {
    storage = create();
    const a = await person('Arjun Mehta');
    const b = await person('Priya Nair');
    await storage.saveReport(a.id, report('2023-01-05'), [result(), result({ markerId: null, name: 'Homocysteine', unit: 'µmol/L' })]);
    await storage.saveReport(b.id, report('2024-01-05'), [result({ value: 12.1 })]);
    const backup = parseBackup(JSON.stringify(await createBackup(storage)));
    await storage.deleteAll();

    storage = create();
    expect(await storage.importBackup(backup)).toEqual({ profiles: 2, reports: 2, results: 3 });
    expect(await createBackup(storage, new Date(backup.exportedAt))).toEqual(backup);
  });

  it('restoring adds only what is missing, and twice changes nothing', async () => {
    storage = create();
    const me = await person('Arjun Mehta');
    const kept = await storage.saveReport(me.id, report('2023-01-05'), [result()]);
    const backup = await createBackup(storage);
    const extra = await storage.saveReport(me.id, report('2024-01-05'), [result({ value: 12 })]);
    await storage.deleteReport(kept.id);
    await storage.updateProfile(me.id, { name: 'Me' });

    expect(await storage.importBackup(backup)).toEqual({ profiles: 0, reports: 1, results: 1 });
    expect(await storage.importBackup(backup)).toEqual({ profiles: 0, reports: 0, results: 0 });
    expect((await storage.listReports()).map((r) => r.id).sort()).toEqual([kept.id, extra.id].sort());
    expect((await storage.listProfiles()).map((p) => p.name)).toEqual(['Me']);
    expect(await storage.listResults()).toHaveLength(2);
  });

  it('deletes everything', async () => {
    storage = create();
    const me = await person('Arjun Mehta');
    await storage.saveReport(me.id, report('2023-01-05'), [result()]);
    await storage.deleteAll();
    storage = create();
    expect(await storage.listProfiles()).toEqual([]);
    expect(await storage.listReports()).toEqual([]);
    expect(await storage.listResults()).toEqual([]);
  });
});

describe('persistent mode detection', () => {
  it('reports saved data only after the persistent backend is used', async () => {
    expect(await hasPersistentData()).toBe(false);
    const storage = createDexieStorage();
    await storage.listProfiles();
    expect(await hasPersistentData()).toBe(true);
    await storage.deleteAll();
    expect(await hasPersistentData()).toBe(false);
  });

  it('the session backend never creates the database', async () => {
    const storage = createMemoryStorage();
    const me = await storage.createProfile({ name: 'Arjun Mehta', aliases: [], sex: null });
    await storage.saveReport(me.id, report('2024-01-05'), [result()]);
    expect(await hasPersistentData()).toBe(false);
  });
});
