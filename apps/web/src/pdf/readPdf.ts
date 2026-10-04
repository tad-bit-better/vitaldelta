import { fromPdfJsItem, type TextItem } from '@vitaldelta/extraction';
// The "legacy" build, which fills in newer JavaScript features: the modern build uses some
// (e.g. Uint8Array.prototype.toHex) that older iOS Safari lacks. It doesn't cover everything: see textItems.
import { getDocument, GlobalWorkerOptions, PasswordException, PasswordResponses } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

// pdf.js parses in its own Web Worker, bundled and served from our origin.
GlobalWorkerOptions.workerSrc = workerUrl;

const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;

export class PdfPasswordError extends Error {
  /** True when a password was given but it was wrong. */
  readonly incorrect: boolean;
  constructor(incorrect: boolean) {
    super(incorrect ? 'Incorrect PDF password' : 'PDF is password-protected');
    this.name = 'PdfPasswordError';
    this.incorrect = incorrect;
  }
}

/** The PDF has no text layer, e.g. a scanned report. OCR isn't supported yet. */
export class PdfNoTextError extends Error {
  constructor() {
    super('PDF has no text (it may be scanned)');
    this.name = 'PdfNoTextError';
  }
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>;

/**
 * A page's text items. Same as page.getTextContent(), but that loops over a ReadableStream
 * with `for await`, which Safari (every iOS browser) doesn't support: it threw
 * "undefined is not a function" for every PDF. Reading the stream by hand works everywhere.
 */
async function textItems(page: PdfPage) {
  const reader = page.streamTextContent().getReader();
  const items: Awaited<ReturnType<PdfPage['getTextContent']>>['items'] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return items;
    items.push(...value.items);
  }
}

/**
 * Reads every text item from a PDF with its position on the page,
 * in top-left-origin coordinates as expected by `groupRows`.
 * Everything runs locally; the file never leaves the browser.
 */
export async function readPdf(data: ArrayBuffer, password?: string): Promise<TextItem[]> {
  const task = getDocument({
    data: new Uint8Array(data),
    password,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    // We only read text, never render, so don't load the PDF's fonts into the page.
    disableFontFace: true,
  });

  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err instanceof PasswordException) {
      throw new PdfPasswordError(err.code === PasswordResponses.INCORRECT_PASSWORD);
    }
    throw err;
  }

  try {
    const items: TextItem[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const toViewport = viewport.convertToViewportPoint.bind(viewport);
      for (const raw of await textItems(page)) {
        if ('str' in raw) items.push(fromPdfJsItem(raw, pageNumber, toViewport));
      }
      page.cleanup();
    }
    if (!items.some((i) => i.text.trim())) throw new PdfNoTextError();
    return items;
  } finally {
    await task.destroy();
  }
}
