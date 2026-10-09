import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fromPdfJsItem, type TextItem } from '../src/index';

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/** Reads a PDF with pdf.js's Node build; positions are converted by the shared fromPdfJsItem. */
export async function readPdf(path: string, password?: string): Promise<TextItem[]> {
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
