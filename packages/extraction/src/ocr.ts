/**
 * Turning OCR output into text items. The OCR engine (Tesseract) runs outside this package —
 * in the browser for the app, in Node for the harness — and hands over recognised blocks;
 * these helpers are the shared, pure part: mapping word boxes into TextItems and marking
 * OCR'd results so the user confirms every one.
 */
import type { ExtractedResult } from './extract';
import type { TextItem } from './types';

type OcrBox = { x0: number; y0: number; x1: number; y1: number };
/** The fields we use from Tesseract's recognised blocks (structural, so no tesseract import). */
export type OcrBlock = { paragraphs: { lines: { bbox: OcrBox; words: { text: string; bbox: OcrBox }[] }[] }[] };

/**
 * Maps OCR word boxes (in image pixels) to text items, divided by `scale` (image pixels per
 * page unit) so they land in the same top-left space as a PDF text layer. Each word takes its
 * line's y and height, not its own: a lowercase word's box is shorter and would wrongly look
 * like small print (the method rule in parse.ts), and one y per printed line makes row
 * grouping exact.
 */
export function ocrTextItems(blocks: OcrBlock[] | null | undefined, page: number, scale = 1): TextItem[] {
  const items: TextItem[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          if (!word.text.trim()) continue;
          items.push({
            text: word.text,
            x: word.bbox.x0 / scale,
            y: line.bbox.y0 / scale,
            width: (word.bbox.x1 - word.bbox.x0) / scale,
            height: (line.bbox.y1 - line.bbox.y0) / scale,
            page,
          });
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
