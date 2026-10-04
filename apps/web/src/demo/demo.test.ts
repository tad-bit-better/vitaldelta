import { describe, expect, it } from 'vitest';
import { extractResults, extractWordResults, groupRows, markers, type TextItem } from '@vitaldelta/extraction';
import { parseBackup } from '../storage/backup';
import { buildSeries } from '../app/series';
import { NEXT_SAMPLE_REPORT, sampleBackup } from './sampleData';
import { samplePdfBytes } from './samplePdf';

describe('demo data', () => {
  it('is a valid backup', () => {
    const backup = sampleBackup();
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    expect(backup.profiles.map((p) => p.name)).toEqual(['Asha Rao (sample)', 'Vikram Rao (sample)']);
  });

  it('shows each dashboard feature for the first sample patient', () => {
    const { reports, results } = sampleBackup();
    const asha = reports.filter((r) => r.profileId === 'sample-asha');
    const ids = new Set(asha.map((r) => r.id));
    const series = buildSeries(asha, results.filter((r) => ids.has(r.reportId)), 'female');
    const byName = new Map(series.map((s) => [s.name, s]));
    expect(byName.get('Haemoglobin')?.drift?.direction).toBe('falling');
    expect(byName.get('HbA1c')?.latest).toMatchObject({ rangeSource: 'guideline', status: 'above' });
    expect(byName.get('Vitamin D (25-OH)')?.latest.status).toBe('in-range');
    expect(byName.get('Homocysteine')?.markerId).toBeNull();
  });

  it('every sample row reads back through the real extraction pipeline', () => {
    // Rebuild the text items the way pdf.js would report them for the sample PDF's layout.
    const xs = [40, 220, 300, 400];
    const items: TextItem[] = [];
    const lines = [[NEXT_SAMPLE_REPORT.patient], ['Test Name', 'Result', 'Unit', 'Reference Range'], ...NEXT_SAMPLE_REPORT.rows];
    lines.forEach((line, row) =>
      line.forEach((text, i) => text && items.push({ text, x: xs[i], y: 50 + row * 18, width: text.length * 5, height: 10, page: 1 })),
    );
    const extracted = extractResults(groupRows(items));
    const known = new Set(markers.map((m) => m.id));
    const recognised = extracted.filter((r) => r.markerId && known.has(r.markerId));
    // All numeric rows but Homocysteine (kept under its printed name); the last two are word results.
    expect(recognised).toHaveLength(NEXT_SAMPLE_REPORT.rows.length - 3);
    expect(extractWordResults(groupRows(items)).map((w) => w.text)).toEqual(['Non Reactive', 'Nil']);
  });

  it('builds a PDF whose cross-reference offsets point at its objects', () => {
    const text = new TextDecoder().decode(samplePdfBytes());
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
    expect(text).toContain('Vitamin D \\(25-OH\\)');
  });
});
