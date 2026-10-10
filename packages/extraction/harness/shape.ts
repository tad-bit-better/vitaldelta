/**
 * Shows the layout of a real report's text without its content, to debug extraction without
 * exposing it. Every word is masked (a/A, digits 9) except a fixed public vocabulary: test
 * names from the dictionary, units and common report terms (see privacy.ts). "|" marks where
 * one pdf.js text item ends and the next begins.
 *
 *   pnpm --filter @vitaldelta/extraction shape 3            the 3rd PDF in fixtures/ (numbered as in the harness)
 *   pnpm --filter @vitaldelta/extraction shape path/to.pdf  any file
 *   options: --rows 80, --password x, --lengths (keep masked word lengths), --names
 *
 * Prefer a number to a path: file names often contain the patient's name, and pnpm prints
 * the command it runs.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fromPdfJsItem, groupRows, type TextItem } from '../src/index';
import { stopOcr } from './ocr';
import { listFixtures, readItems } from './pdf';
import { fileLabel, mask } from './privacy';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--rows' && args[i - 1] !== '--password');
if (!target) {
  console.error('Usage: shape <number in fixtures/ | path to PDF> [--rows 80] [--password x] [--lengths] [--names]');
  process.exit(2);
}
const fixturesDir = join(import.meta.dirname, '../../../fixtures');
const fixtures = listFixtures(fixturesDir);
const index = /^\d+$/.test(target) ? Number(target) - 1 : null;
if (index !== null && !fixtures[index]) {
  console.error(`There are ${fixtures.length} reports in fixtures/.`);
  process.exit(2);
}
const file = index !== null ? join(fixturesDir, fixtures[index]) : resolve(process.env.INIT_CWD ?? process.cwd(), target);
const maxRows = Number(option('rows') ?? 80);
const lengths = args.includes('--lengths');
const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

const bytes = new Uint8Array(readFileSync(file));
console.log(fileLabel(index ?? -1, bytes, file, args.includes('--names')));

let items: TextItem[] = [];
let pages = 1;
let rotated = 0;
let empty = 0;
let ocr = false;
if (file.toLowerCase().endsWith('.pdf')) {
  const task = getDocument({
    data: bytes.slice(),
    password: option('password'),
    cMapUrl: join(pdfjsRoot, 'cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: join(pdfjsRoot, 'standard_fonts/'),
    verbosity: 0,
  });
  const doc = await task.promise;
  pages = doc.numPages;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const toViewport = viewport.convertToViewportPoint.bind(viewport);
    for (const raw of (await page.getTextContent()).items) {
      if (!('str' in raw)) continue;
      if (!raw.str.trim()) empty++;
      if (Math.abs(raw.transform[1]) > 0.01 || Math.abs(raw.transform[2]) > 0.01) rotated++;
      items.push(fromPdfJsItem(raw, n, toViewport));
    }
  }
  await task.destroy();
}
// No text layer (or an image file): the same OCR path the harness uses.
if (!items.some((i) => i.text.trim())) {
  ({ items } = await readItems(file, option('password')));
  ocr = true;
  pages = Math.max(pages, ...items.map((i) => i.page));
}

const text = items.map((i) => i.text).join('');
const count = (re: RegExp) => (text.match(re) ?? []).length;
const heights = items.map((i) => i.height).sort((a, b) => a - b);
const rows = groupRows(items);
console.log({
  pages,
  ocr,
  items: items.length,
  emptyItems: empty,
  rotatedItems: rotated,
  singleCharItems: items.filter((i) => i.text.trim().length === 1).length,
  nonAscii: count(/[^\x00-\x7f]/g),
  privateUse: count(/[-]/g),
  height: { min: heights[0], median: heights[Math.floor(heights.length / 2)], max: heights.at(-1) },
  rows: rows.length,
  rowsWithDigits: rows.filter((r) => /\d/.test(r.text)).length,
});
for (const row of rows.slice(0, maxRows)) {
  const line = row.items.map((i) => mask(i.text, { lengths })).join('|');
  console.log(`p${row.page} y${Math.round(row.y).toString().padStart(4)} ${line}`);
}
await stopOcr();
