// Copies the pdf.js data files that text extraction needs into public/pdfjs,
// so they're served from our own origin (CSP: connect-src 'self').
// Output is gitignored and regenerated before every dev/build run.
import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const target = new URL('../public/pdfjs/', import.meta.url).pathname;

rmSync(target, { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(join(pdfjsRoot, dir), join(target, dir), { recursive: true });
}
