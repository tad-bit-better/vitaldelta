import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fromPdfJsItem, type TextItem } from '../src/index';
import { ocrImage } from './ocr';

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/** Report files the tools accept: text or scanned PDFs, and photos/scans saved as images. */
const FIXTURE_FILE = /\.(pdf|jpe?g|png|webp)$/i;

/** One sorted list of the fixtures, so #n means the same file in every tool. */
export function listFixtures(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => FIXTURE_FILE.test(f)).sort() : [];
}

export type ReadItems = {
  items: TextItem[];
  /** True when the text came from OCR (an image file, or a PDF with no text layer). */
  ocr: boolean;
};

/** Reads a report (PDF or image file) into positioned text items; scanned pages go through OCR. */
export async function readItems(path: string, password?: string): Promise<ReadItems> {
  if (!path.toLowerCase().endsWith('.pdf')) {
    return { items: await ocrImage(readFileSync(path), 1), ocr: true };
  }
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
    if (items.some((i) => i.text.trim())) return { items, ocr: false };

    // No text layer: a scan. Render each page and OCR it.
    const scanned: TextItem[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // ~2000px wide reads reliably without being slow; dividing by scale returns points.
      const scale = Math.min(4, Math.max(2, 2000 / page.getViewport({ scale: 1 }).width));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as never, canvasContext: canvas.getContext('2d') as never, viewport }).promise;
      scanned.push(...(await ocrImage(canvas.toBuffer('image/png'), n, scale)));
    }
    return { items: scanned, ocr: true };
  } finally {
    await task.destroy();
  }
}
