/**
 * Writes a draft expected-values file for a fixture, for the owner to confirm against the
 * PDF. Once confirmed, `pnpm harness` scores accuracy per field against it and fails on
 * regression. The file sits next to the PDF (gitignored: it holds real values).
 *
 *   pnpm --filter @vitaldelta/extraction expected 3            the 3rd PDF in fixtures/ (same numbers as the harness)
 *   pnpm --filter @vitaldelta/extraction expected path/to.pdf  any file
 *   options: --force (overwrite an existing file), --password x, --names
 *
 * To confirm a draft: open the PDF and the .expected.json side by side; fix any value, unit
 * or range that was read wrong (values as the app stores them, in the row's `unit`); add rows
 * the reader missed; delete rows that aren't results, or just the fields you can't verify;
 * then set "confirmed": true.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { extractResults, extractWordResults, groupRows } from '../src/index';
import { readPdf } from './pdf';
import { fileLabel } from './privacy';
import type { ExpectedFile, ExpectedResult } from './score';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--password');
if (!target) {
  console.error('Usage: expected <number in fixtures/ | path to PDF> [--force] [--password x] [--names]');
  process.exit(2);
}
const fixturesDir = join(import.meta.dirname, '../../../fixtures');
const fixtures = existsSync(fixturesDir) ? readdirSync(fixturesDir).filter((f) => f.toLowerCase().endsWith('.pdf')).sort() : [];
const index = /^\d+$/.test(target) ? Number(target) - 1 : null;
if (index !== null && !fixtures[index]) {
  console.error(`There are ${fixtures.length} PDFs in fixtures/.`);
  process.exit(2);
}
const file = index !== null ? join(fixturesDir, fixtures[index]) : resolve(process.env.INIT_CWD ?? process.cwd(), target);
const outPath = join(dirname(file), `${basename(file, '.pdf')}.expected.json`);
// File names often hold the patient's name; print the fixture number instead (--names to override).
const shownOut = args.includes('--names') ? outPath : `fixtures/${index !== null ? `#${index + 1}` : basename(file, '.pdf').replace(/./g, '*')}.expected.json`;

if (existsSync(outPath) && !args.includes('--force')) {
  console.error(`${shownOut} already exists. Use --force to overwrite it (your confirmed values would be lost).`);
  process.exit(2);
}

const bytes = new Uint8Array(readFileSync(file));
console.log(fileLabel(index ?? -1, bytes, file, args.includes('--names')));

let password = option('password');
const passwordsPath = join(fixturesDir, 'passwords.json');
if (!password && existsSync(passwordsPath)) {
  try {
    password = (JSON.parse(readFileSync(passwordsPath, 'utf8')) as Record<string, string>)[basename(file)];
  } catch {
    // Bad passwords.json is the harness's problem to report.
  }
}

const rows = groupRows(await readPdf(file, password));
const results: ExpectedResult[] = [
  ...extractResults(rows).map((r) => ({
    ...(r.markerId ? { markerId: r.markerId } : {}),
    name: r.name,
    value: r.value,
    unit: r.unit,
    refLow: r.refLow,
    refHigh: r.refHigh,
  })),
  ...extractWordResults(rows).map((w) => ({ name: w.name, textValue: w.text, expectedText: w.expected })),
];
const draft: ExpectedFile = {
  confirmed: false,
  fingerprint: createHash('sha256').update(bytes).digest('hex').slice(0, 8),
  results,
};
writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');

console.log(`Wrote a draft with ${results.length} result(s) to ${shownOut} (next to the PDF).`);
console.log('Now confirm it against the PDF:');
console.log('  1. Open the PDF and the .expected.json side by side.');
console.log('  2. Fix any value, unit or range that was read wrong; add rows the reader missed;');
console.log('     delete rows that aren’t results, or just the fields you can’t verify.');
console.log('  3. Set "confirmed": true. Then `pnpm harness` scores accuracy against it.');
