/**
 * Extraction harness: runs every PDF in fixtures/ through the pipeline and reports
 * match rate (and accuracy, where expected values exist). Prints counts and test
 * names only, never values, so output is safe to share.
 *
 *   pnpm harness                 compare with the saved baseline, fail on regression
 *   pnpm harness --update        save the current numbers as the new baseline
 *   pnpm harness --verbose       also list unrecognised test names per file
 *   pnpm harness --names         show file names (by default files are #1, #2… with a
 *                                fingerprint: file names often contain the patient's name)
 *
 * Optional, all inside fixtures/ (gitignored):
 *   passwords.json               { "report.pdf": "password" }
 *   <file>.expected.json         [{ "markerId": "718-7", "value": 13.5 }]  hand-confirmed,
 *                                values in the marker's standard unit
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { getDocument, PasswordException } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractResults, fromPdfJsItem, groupRows, REVIEW_THRESHOLD, type ExtractedResult, type TextItem } from '../src/index';
import { fileLabel } from './privacy';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const fixturesDir = resolve(args.find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, '../../../fixtures'));
const baselinePath = join(fixturesDir, '.harness-baseline.json');

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/** Reads a PDF with pdf.js's Node build; positions are converted by the shared fromPdfJsItem. */
async function readPdf(path: string, password?: string): Promise<TextItem[]> {
  const task = getDocument({
    data: new Uint8Array(readFileSync(path)),
    password,
    cMapUrl: join(pdfjsRoot, 'cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: join(pdfjsRoot, 'standard_fonts/'),
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const items: TextItem[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const toViewport = viewport.convertToViewportPoint.bind(viewport);
      for (const raw of (await page.getTextContent()).items) {
        if ('str' in raw) items.push(fromPdfJsItem(raw, n, toViewport));
      }
    }
    return items;
  } finally {
    await task.destroy();
  }
}

type FileStats = {
  file: string;
  error?: string;
  results: number;
  recognised: number;
  unrecognised: number;
  needsReview: number;
  expected?: number;
  correct?: number;
};

function accuracy(results: ExtractedResult[], expectedPath: string) {
  const expected: { markerId: string; value: number }[] = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const correct = expected.filter((e) =>
    results.some((r) => r.markerId === e.markerId && Math.abs(r.value - e.value) <= Math.abs(e.value) * 0.005),
  ).length;
  return { expected: expected.length, correct };
}

async function main() {
  if (!existsSync(fixturesDir)) {
    console.log(`No fixtures folder at ${fixturesDir}. Add lab report PDFs there (it's gitignored).`);
    return;
  }
  const passwordsPath = join(fixturesDir, 'passwords.json');
  let passwords: Record<string, string> = {};
  if (existsSync(passwordsPath)) {
    const text = readFileSync(passwordsPath, 'utf8').trim();
    try {
      passwords = text ? JSON.parse(text) : {};
    } catch {
      console.error(`fixtures/passwords.json isn't valid JSON. Expected: { "report.pdf": "password" }`);
      process.exitCode = 1;
      return;
    }
  }
  const files = readdirSync(fixturesDir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  if (!files.length) {
    console.log(`No PDFs in ${fixturesDir}.`);
    return;
  }

  const stats: FileStats[] = [];
  for (const [index, file] of files.entries()) {
    const label = fileLabel(index, new Uint8Array(readFileSync(join(fixturesDir, file))), file, flags.has('--names'));
    const s: FileStats = { file: label, results: 0, recognised: 0, unrecognised: 0, needsReview: 0 };
    stats.push(s);
    try {
      const items = await readPdf(join(fixturesDir, file), passwords[file]);
      if (!items.some((i) => i.text.trim())) {
        s.error = 'no text (scanned?)';
        continue;
      }
      const results = extractResults(groupRows(items));
      s.results = results.length;
      s.recognised = results.filter((r) => r.markerId).length;
      s.unrecognised = s.results - s.recognised;
      s.needsReview = results.filter((r) => r.confidence < REVIEW_THRESHOLD).length;
      const expectedPath = join(fixturesDir, `${basename(file, '.pdf')}.expected.json`);
      if (existsSync(expectedPath)) Object.assign(s, accuracy(results, expectedPath));
      if (flags.has('--verbose') && s.unrecognised) {
        const names = results.filter((r) => !r.markerId).map((r) => r.printedName);
        console.log(`  ${label} unrecognised: ${names.join(' | ')}`);
      }
    } catch (err) {
      s.error = err instanceof PasswordException ? 'password needed (add to passwords.json)' : String(err);
    }
  }

  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
  console.table(
    stats.map((s) => ({
      file: s.file,
      results: s.error ?? s.results,
      recognised: s.error ? '' : s.recognised,
      unrecognised: s.error ? '' : s.unrecognised,
      'needs review': s.error ? '' : s.needsReview,
      'match rate': s.error ? '' : pct(s.recognised, s.results),
      accuracy: s.expected ? `${s.correct}/${s.expected}` : '',
    })),
  );

  const ok = stats.filter((s) => !s.error);
  const sum = (key: 'results' | 'recognised' | 'expected' | 'correct') => ok.reduce((n, s) => n + (s[key] ?? 0), 0);
  const totals = {
    matchRate: sum('results') ? sum('recognised') / sum('results') : 0,
    accuracy: sum('expected') ? sum('correct') / sum('expected') : null,
    files: ok.length,
  };
  console.log(
    `Match rate ${pct(sum('recognised'), sum('results'))} across ${ok.length} file(s)` +
      (totals.accuracy === null ? '' : `, accuracy ${pct(sum('correct'), sum('expected'))}`) +
      (stats.length > ok.length ? `, ${stats.length - ok.length} skipped` : ''),
  );

  if (flags.has('--update')) {
    writeFileSync(baselinePath, JSON.stringify(totals, null, 2) + '\n');
    console.log('Baseline updated.');
    return;
  }
  if (!existsSync(baselinePath)) {
    console.log('No baseline yet. Run `pnpm harness --update` to save one.');
    return;
  }
  const baseline: typeof totals = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const regressions: string[] = [];
  if (totals.matchRate < baseline.matchRate - 1e-9) regressions.push(`match rate ${pct(totals.matchRate, 1)} < baseline ${pct(baseline.matchRate, 1)}`);
  if (baseline.accuracy !== null && (totals.accuracy ?? 0) < baseline.accuracy - 1e-9) {
    regressions.push(`accuracy ${pct(totals.accuracy ?? 0, 1)} < baseline ${pct(baseline.accuracy, 1)}`);
  }
  if (regressions.length) {
    console.error(`Regression: ${regressions.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log('No regression against baseline.');
  }
}

await main();
