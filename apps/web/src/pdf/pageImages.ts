import { openDocument } from './readPdf';

/** A PDF's pages as images, drawn on demand for checking values against the report. */
export type PageImages = {
  count: number;
  /** Page size in PDF points (the coordinates of extracted boxes). */
  size(page: number): { width: number; height: number };
  /** An object URL for a JPEG of the page. Drawn once, then cached. */
  image(page: number): Promise<string>;
  /** Frees the document and every image. */
  close(): void;
};

/** Pixel width pages are drawn at: sharp on a laptop at 2× zoom, ~100–250 KB as JPEG. */
const TARGET_WIDTH = 1400;

/**
 * Opens a PDF for display. Everything stays in this tab: pages are drawn to a canvas and kept
 * as in-memory JPEG blobs, never stored. `bytes` is copied, so the caller's copy stays usable.
 */
export async function openPageImages(bytes: Uint8Array, password?: string): Promise<PageImages> {
  const task = openDocument(bytes.slice(), password);
  const doc = await task.promise;
  const sizes: { width: number; height: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { width, height } = (await doc.getPage(n)).getViewport({ scale: 1 });
    sizes.push({ width, height });
  }
  const images = new Map<number, Promise<string>>();
  let closed = false;

  async function draw(n: number): Promise<string> {
    const page = await doc.getPage(n);
    const scale = Math.min(2.5, TARGET_WIDTH / sizes[n - 1].width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    // Release the canvas memory now rather than at garbage collection (matters on phones).
    canvas.width = canvas.height = 0;
    page.cleanup();
    if (!blob) throw new Error('Could not draw the page');
    const url = URL.createObjectURL(blob);
    if (closed) URL.revokeObjectURL(url);
    return url;
  }

  return {
    count: doc.numPages,
    size: (n) => sizes[n - 1],
    image(n) {
      if (!images.has(n)) images.set(n, draw(n));
      return images.get(n)!;
    },
    close() {
      closed = true;
      for (const url of images.values()) void url.then(URL.revokeObjectURL, () => {});
      void task.destroy();
    },
  };
}
