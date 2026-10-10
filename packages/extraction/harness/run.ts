/**
 * Extraction harness: runs every report in fixtures/ (PDFs and scanned images; pages
 * with no text layer go through OCR) and reports match rate (and accuracy, where
 * expected values exist), with text PDFs and OCR scored separately. Prints counts and
 * test names only, never values, so output is safe to share.
 *
 *   pnpm harness                 compare with the saved baseline, fail on regression
 *   pnpm harness --update        save the current numbers as the new baseline
 *   pnpm harness --verbose       also list unrecognised test names per file
 *   pnpm harness --names         show file names (by default files are #1, #2… with a
 *                                fingerprint: file names often contain the patient's name)
 *
 * Optional, all inside fixtures/ (gitignored):
 *   passwords.json               { "report.pdf": "password" }
 *   <file>.expected.json         hand-confirmed results (make a draft with
 *                                `pnpm --filter @vitaldelta/extraction expected <n>`); once
 *                                "confirmed": true, accuracy is scored per field and
 *                                regressions fail. Drafts are shown but don't gate.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { PasswordException } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractResults, extractWordResults, groupRows, REVIEW_THRESHOLD } from '../src/index';
import { stopOcr } from './ocr';
import { listFixtures, readItems } from './pdf';
import { fileLabel } from './privacy';
import { parseExpected, scoreFile, type Mismatch } from './score';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const fixturesDir = resolve(args.find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, '../../../fixtures'));
const baselinePath = join(fixturesDir, '.harness-baseline.json');

type FileStats = {
  file: string;
  /** Read by OCR (an image file, or a PDF with no text layer); tracked apart from text PDFs. */
  ocr?: boolean;
  error?: string;
  results: number;
  recognised: number;
  unrecognised: number;
  needsReview: number;
  /** Results printed as words ("Non Reactive"); not part of the match rate. */
  words?: number;
  expected?: number;
  correct?: number;
  /** The expected file hasn't been confirmed (or was made from a different PDF). */
  draft?: boolean;
  mismatches?: Mismatch[];
  extras?: number;
};

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
  const files = listFixtures(fixturesDir);
  if (!files.length) {
    console.log(`No reports in ${fixturesDir}.`);
    return;
  }

  const stats: FileStats[] = [];
  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(readFileSync(join(fixturesDir, file)));
    const label = fileLabel(index, bytes, file, flags.has('--names'));
    const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
    const s: FileStats = { file: label, results: 0, recognised: 0, unrecognised: 0, needsReview: 0 };
    stats.push(s);
    try {
      const { items, ocr } = await readItems(join(fixturesDir, file), passwords[file]);
      s.ocr = ocr;
      if (!items.some((i) => i.text.trim())) {
        s.error = 'no text found';
        continue;
      }
      const rows = groupRows(items);
      const results = extractResults(rows);
      const words = extractWordResults(rows);
      s.words = words.length;
      s.results = results.length;
      s.recognised = results.filter((r) => r.markerId).length;
      s.unrecognised = s.results - s.recognised;
      s.needsReview = results.filter((r) => r.confidence < REVIEW_THRESHOLD).length;
      const expectedPath = join(fixturesDir, `${basename(file, '.pdf')}.expected.json`);
      if (existsSync(expectedPath)) {
        const expected = parseExpected(readFileSync(expectedPath, 'utf8'));
        const stale = expected.fingerprint !== undefined && expected.fingerprint !== fingerprint;
        if (stale) console.warn(`  ${label}: the expected file was made from a different PDF; treating it as a draft`);
        const score = scoreFile(expected, results, words);
        Object.assign(s, score, { draft: !expected.confirmed || stale });
      }
      if (flags.has('--verbose') && s.unrecognised) {
        const names = results.filter((r) => !r.markerId).map((r) => r.printedName);
        console.log(`  ${label} unrecognised: ${names.join(' | ')}`);
      }
      // Test names and which field differed only, never values.
      if (flags.has('--verbose') && s.mismatches?.length) {
        console.log(`  ${label} wrong: ${s.mismatches.map((m) => `${m.name} (${m.problem})`).join(' · ')}`);
      }
      if (flags.has('--verbose') && !s.draft && s.extras) {
        console.log(`  ${label}: ${s.extras} extracted result(s) not in the expected file`);
      }
    } catch (err) {
      s.error = err instanceof PasswordException ? 'password needed (add to passwords.json)' : String(err);
    }
  }

  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
  console.table(
    stats.map((s) => ({
      file: s.ocr ? `${s.file} OCR` : s.file,
      results: s.error ?? s.results,
      recognised: s.error ? '' : s.recognised,
      unrecognised: s.error ? '' : s.unrecognised,
      'needs review': s.error ? '' : s.needsReview,
      'match rate': s.error ? '' : pct(s.recognised, s.results),
      'in words': s.error ? '' : s.words,
      accuracy: s.expected ? `${s.correct}/${s.expected}${s.draft ? ' (draft)' : ''}` : '',
    })),
  );

  // Text PDFs and OCR'd scans are scored apart: OCR starts less accurate, and averaging
  // them would let a regression on one side hide behind the other.
  const sum = (list: FileStats[], key: 'results' | 'recognised' | 'expected' | 'correct') => list.reduce((n, s) => n + (s[key] ?? 0), 0);
  type Totals = { matchRate: number; accuracy: number | null; files: number };
  const drafts = stats.filter((s) => !s.error && s.expected && s.draft).length;
  const summarise = (list: FileStats[], label: string): Totals => {
    const ok = list.filter((s) => !s.error);
    // Accuracy counts only confirmed expected files; drafts are shown but don't gate anything.
    const confirmed = ok.filter((s) => s.expected && !s.draft);
    if (list.length) {
      console.log(
        `${label}: match rate ${pct(sum(ok, 'recognised'), sum(ok, 'results'))} across ${ok.length} file(s)` +
          (confirmed.length ? `, accuracy ${pct(sum(confirmed, 'correct'), sum(confirmed, 'expected'))} on ${confirmed.length} confirmed` : '') +
          (list.length > ok.length ? `, ${list.length - ok.length} skipped` : ''),
      );
    }
    return {
      matchRate: sum(ok, 'results') ? sum(ok, 'recognised') / sum(ok, 'results') : 0,
      accuracy: sum(confirmed, 'expected') ? sum(confirmed, 'correct') / sum(confirmed, 'expected') : null,
      files: ok.length,
    };
  };
  const totals = { ...summarise(stats.filter((s) => !s.ocr), 'Text'), ocr: summarise(stats.filter((s) => s.ocr), 'OCR') };
  if (drafts) console.log(`${drafts} draft expected file(s) to confirm.`);

  if (flags.has('--update')) {
    writeFileSync(baselinePath, JSON.stringify(totals, null, 2) + '\n');
    console.log('Baseline updated.');
    return;
  }
  if (!existsSync(baselinePath)) {
    console.log('No baseline yet. Run `pnpm harness --update` to save one.');
    return;
  }
  // Baselines written before OCR support have no `ocr` entry; then only text files gate.
  const baseline: Partial<typeof totals> = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const regressions: string[] = [];
  const compare = (now: Totals, base: Totals | undefined, label: string) => {
    if (!base) {
      if (now.files) console.log(`No ${label} baseline yet. Run \`pnpm harness --update\` to save one.`);
      return;
    }
    if (now.matchRate < base.matchRate - 1e-9) regressions.push(`${label} match rate ${pct(now.matchRate, 1)} < baseline ${pct(base.matchRate, 1)}`);
    if (base.accuracy !== null && (now.accuracy ?? 0) < base.accuracy - 1e-9) {
      regressions.push(`${label} accuracy ${pct(now.accuracy ?? 0, 1)} < baseline ${pct(base.accuracy ?? 0, 1)}`);
    }
  };
  compare(totals, baseline.matchRate === undefined ? undefined : (baseline as Totals), 'text');
  compare(totals.ocr, baseline.ocr, 'OCR');
  if (regressions.length) {
    console.error(`Regression: ${regressions.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log('No regression against baseline.');
  }
}

await main().finally(stopOcr);
