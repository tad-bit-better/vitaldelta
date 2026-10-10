/**
 * Turning OCR output into text items. The OCR engine (Tesseract) runs outside this package —
 * in the browser for the app, in Node for the harness — and hands over recognised blocks;
 * these helpers are the shared, pure part: mapping word boxes into TextItems and marking
 * OCR'd results so the user confirms every one.
 */
import type { ExtractedResult } from './extract';
import type { TextItem } from './types';

type OcrBox = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; bbox: OcrBox };
/** The fields we use from Tesseract's recognised blocks (structural, so no tesseract import). */
export type OcrBlock = { paragraphs: { lines: { bbox: OcrBox; words: OcrWord[] }[] }[] };

const centre = (w: OcrWord) => (w.bbox.y0 + w.bbox.y1) / 2;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * The words of one Tesseract "line" split into physical rows. Tesseract's line boxes can't
 * be trusted on messy scans: a table border sweeps a line box across the whole page, and a
 * pen stroke makes it bundle two printed rows into one line. Words whose own vertical
 * centres sit clearly apart (more than ~0.7 of the typical word height) are different rows.
 */
function splitRows(words: OcrWord[]): OcrWord[][] {
  if (!words.length) return [];
  const sorted = [...words].sort((a, b) => centre(a) - centre(b));
  const typical = median(sorted.map((w) => w.bbox.y1 - w.bbox.y0));
  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    const row = rows.at(-1);
    if (row && centre(word) - centre(row.at(-1)!) <= 0.7 * typical) row.push(word);
    else rows.push([word]);
  }
  return rows;
}

/**
 * Maps OCR word boxes (in image pixels) to text items, divided by `scale` (image pixels per
 * page unit) so they land in the same top-left space as a PDF text layer. Every word on a
 * physical row gets the same y and height — the row's **median** word centre and height.
 * Medians, not the row's bounding box: scans are often slightly tilted, which stretches a
 * row's box until it overlaps its neighbours and row grouping would merge them (values then
 * pick up the next test's range), and a single stretched glyph (a pen stroke, a table
 * border) must not do the same. One shared height per row also keeps lowercase words from
 * wrongly looking like small print (the method rule in parse.ts).
 */
export function ocrTextItems(blocks: OcrBlock[] | null | undefined, page: number, scale = 1): TextItem[] {
  const items: TextItem[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const row of splitRows(line.words.filter((w) => w.text.trim()))) {
          const height = median(row.map((w) => w.bbox.y1 - w.bbox.y0));
          const top = median(row.map(centre)) - height / 2;
          for (const word of row) {
            items.push({
              text: word.text,
              x: word.bbox.x0 / scale,
              y: top / scale,
              width: (word.bbox.x1 - word.bbox.x0) / scale,
              height: height / scale,
              page,
            });
          }
        }
      }
    }
  }
  return items;
}

/** Below REVIEW_THRESHOLD: an OCR'd value is never saved without the user confirming it. */
export const OCR_CONFIDENCE = 0.7;

/**
 * Marks results read by OCR: misread digits are more likely than with a text layer, so every
 * result gets the 'ocr' issue and is held for the user to check against the page image.
 */
export function markOcr(results: ExtractedResult[]): ExtractedResult[] {
  return results.map((r) => ({ ...r, issues: [...r.issues, 'ocr' as const], confidence: Math.min(r.confidence, OCR_CONFIDENCE) }));
}
