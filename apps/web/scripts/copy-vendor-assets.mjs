// Copies the vendor data files the app serves from its own origin (strict CSP, nothing from
// third parties): pdf.js character maps and fonts for text extraction, and the Tesseract OCR
// engine (worker, wasm cores, English model) for scanned reports and photos.
// Output is gitignored and regenerated before every dev/build run.
import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjsTarget = new URL('../public/pdfjs/', import.meta.url).pathname;
rmSync(pdfjsTarget, { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(join(pdfjsRoot, dir), join(pdfjsTarget, dir), { recursive: true });
}

// Tesseract: the worker, the LSTM wasm builds (the browser picks one by its SIMD support,
// so only one is ever downloaded) and the pinned English model.
const tesseractRoot = dirname(require.resolve('tesseract.js/package.json'));
const coreRoot = dirname(createRequire(join(tesseractRoot, 'package.json')).resolve('tesseract.js-core/package.json'));
const engRoot = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
const ocrTarget = new URL('../public/ocr/', import.meta.url).pathname;
rmSync(ocrTarget, { recursive: true, force: true });
mkdirSync(join(ocrTarget, 'core'), { recursive: true });
copyFileSync(join(tesseractRoot, 'dist/worker.min.js'), join(ocrTarget, 'worker.min.js'));
for (const file of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(join(coreRoot, file), join(ocrTarget, 'core', file));
}
copyFileSync(join(engRoot, '4.0.0_best_int/eng.traineddata.gz'), join(ocrTarget, 'eng.traineddata.gz'));
