import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDexieStorage, hasPersistentData } from './dexie';
import { createMemoryStorage } from './memory';
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

  it('creates one profile and reuses it', async () => {
    storage = create();
    const a = await storage.getProfile();
    expect(await storage.getProfile()).toEqual(a);
  });

  it('saves a report with its results and reads them back', async () => {
    storage = create();
    const saved = await storage.saveReport(report('2024-03-11'), [result(), result({ markerId: null, name: 'Homocysteine', unit: 'µmol/L' })]);
    expect(saved).toMatchObject({ collectedAt: '2024-03-11', labName: 'Test Lab', profileId: (await storage.getProfile()).id });

    const loaded = await storage.getReport(saved.id);
    expect(loaded?.report).toEqual(saved);
    expect(loaded?.results).toHaveLength(2);
    expect(loaded?.results.every((r) => r.reportId === saved.id && r.id)).toBe(true);
  });

  it('lists reports newest collection date first', async () => {
    storage = create();
    await storage.saveReport(report('2023-01-05'), []);
    await storage.saveReport(report('2024-06-01'), []);
    await storage.saveReport(report('2023-09-20'), []);
    expect((await storage.listReports()).map((r) => r.collectedAt)).toEqual(['2024-06-01', '2023-09-20', '2023-01-05']);
  });

  it('filters results by marker across reports', async () => {
    storage = create();
    await storage.saveReport(report('2023-01-05'), [result({ value: 12.9 }), result({ markerId: '3016-3', name: 'TSH' })]);
    await storage.saveReport(report('2024-01-05'), [result({ value: 13.8 })]);
    expect((await storage.listResults({ markerId: '718-7' })).map((r) => r.value).sort()).toEqual([12.9, 13.8]);
    expect(await storage.listResults()).toHaveLength(3);
  });

  it('deletes a report together with its results', async () => {
    storage = create();
    const keep = await storage.saveReport(report('2023-01-05'), [result()]);
    const gone = await storage.saveReport(report('2024-01-05'), [result(), result()]);
    await storage.deleteReport(gone.id);
    expect(await storage.getReport(gone.id)).toBeNull();
    expect((await storage.listResults()).every((r) => r.reportId === keep.id)).toBe(true);
  });

  it('deletes everything', async () => {
    storage = create();
    await storage.saveReport(report('2023-01-05'), [result()]);
    await storage.deleteAll();
    storage = create();
    expect(await storage.listReports()).toEqual([]);
    expect(await storage.listResults()).toEqual([]);
  });
});

describe('persistent mode detection', () => {
  it('reports saved data only after the persistent backend is used', async () => {
    expect(await hasPersistentData()).toBe(false);
    const storage = createDexieStorage();
    await storage.getProfile();
    expect(await hasPersistentData()).toBe(true);
    await storage.deleteAll();
    expect(await hasPersistentData()).toBe(false);
  });

  it('the session backend never creates the database', async () => {
    const storage = createMemoryStorage();
    await storage.saveReport(report('2024-01-05'), [result()]);
    expect(await hasPersistentData()).toBe(false);
  });
});
