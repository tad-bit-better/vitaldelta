/**
 * OCR for scanned reports. Tesseract runs in this process with the pinned language model
 * from node_modules (@tesseract.js-data/eng), so nothing is downloaded and no image leaves
 * the machine. Word boxes come back in image pixels; dividing by the render scale puts them
 * in the same top-left page space a text layer would give, so the rest of the pipeline (row
 * grouping, parsing, source boxes) works unchanged.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker, OEM, type Worker } from 'tesseract.js';
import { ocrTextItems, type TextItem } from '../src/index';

const langPath = join(dirname(createRequire(import.meta.url).resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

let shared: Promise<Worker> | undefined;
const worker = () => (shared ??= createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' }));

/** Reads one page image (PNG/JPEG bytes) into text items, at `scale` image pixels per point. */
export async function ocrImage(image: Buffer, page: number, scale = 1): Promise<TextItem[]> {
  const { data } = await (await worker()).recognize(image, {}, { blocks: true });
  return ocrTextItems(data.blocks, page, scale);
}

/** Terminates the shared worker; without this the process never exits. */
export async function stopOcr(): Promise<void> {
  if (shared) await (await shared).terminate();
  shared = undefined;
}
