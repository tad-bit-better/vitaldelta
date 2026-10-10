import { ocrTextItems, type TextItem } from '@vitaldelta/extraction';
import { openDocument } from './readPdf';

/**
 * OCR in the browser, for scanned PDFs and photos of reports. Tesseract.js runs in a Web
 * Worker with the engine, wasm and English model served from our own origin (public/ocr,
 * copied by scripts/copy-vendor-assets.mjs), so the strict CSP holds and the image never
 * leaves the browser. Everything is lazy: nothing is downloaded until the first scan.
 */

/** Pixel width pages and photos are read at: enough for small print without being slow. */
const OCR_WIDTH = 2000;

type Tesseract = typeof import('tesseract.js');
let shared: Promise<import('tesseract.js').Worker> | undefined;

function worker() {
  return (shared ??= (async () => {
    const { createWorker, OEM }: Tesseract = await import('tesseract.js');
    const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
    return createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: `${base}core/`,
      langPath: base,
      gzip: true,
      // The service worker caches the model and wasm; no IndexedDB cache of our own.
      cacheMethod: 'none',
      workerBlobURL: false,
    });
  })());
}

async function recognise(canvas: HTMLCanvasElement, page: number, scale: number): Promise<TextItem[]> {
  const { data } = await (await worker()).recognize(canvas, {}, { blocks: true });
  return ocrTextItems(data.blocks, page, scale);
}

/**
 * Reads a PDF with no text layer by drawing each page and running OCR over it.
 * Item coordinates come back in PDF points, like a text layer's. `bytes` is detached.
 */
export async function readScannedPdf(bytes: Uint8Array, password?: string, onPage?: (done: number, total: number) => void): Promise<TextItem[]> {
  const task = openDocument(bytes, password);
  try {
    const doc = await task.promise;
    const items: TextItem[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const scale = Math.min(4, Math.max(2, OCR_WIDTH / page.getViewport({ scale: 1 }).width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      items.push(...(await recognise(canvas, n, scale)));
      // Release the canvas memory now rather than at garbage collection (matters on phones).
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
    return items;
  } finally {
    await task.destroy();
  }
}

export type ImageRead = {
  items: TextItem[];
  /** The decoded picture re-encoded as a JPEG, for the review screen's page view. */
  blob: Blob;
  /** The size item coordinates are in (pixels of the decoded, downscaled picture). */
  width: number;
  height: number;
};

/**
 * Reads a photo or scan saved as an image (JPEG/PNG/WebP; HEIC where the browser decodes it).
 * Decoding through an <img> applies EXIF rotation, so photos come out upright; re-encoding
 * to JPEG bakes that in and drops the metadata.
 */
export async function readImageFile(file: Blob): Promise<ImageRead> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    const scale = Math.min(1, OCR_WIDTH / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const items = await recognise(canvas, 1, 1);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const { width, height } = canvas;
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('Could not draw the picture');
    return { items, blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
