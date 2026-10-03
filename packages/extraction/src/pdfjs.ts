import type { TextItem } from './types';

/** The fields we use from a pdf.js text item (structural, so no pdf.js import). */
export type PdfJsTextItem = { str: string; transform: number[]; width: number; height: number };

/** pdf.js's `viewport.convertToViewportPoint`: PDF space → top-left-origin page space. */
export type ToViewportPoint = (x: number, y: number) => number[];

/**
 * Converts a pdf.js text item to our TextItem. Shared by the web app and the harness
 * so both read PDFs identically. `transform` = [a, b, c, d, e, f]; (e, f) is the
 * baseline origin in PDF space, and the viewport conversion flips y and accounts for
 * page rotation and offsets.
 */
export function fromPdfJsItem(item: PdfJsTextItem, page: number, toViewport: ToViewportPoint): TextItem {
  const [x, baseline] = toViewport(item.transform[4], item.transform[5]);
  const height = item.height || Math.hypot(item.transform[2], item.transform[3]);
  return { text: item.str, x, y: baseline - height, width: item.width, height, page };
}
