import { describe, expect, it } from 'vitest';
import { REVIEW_THRESHOLD, type ExtractedResult } from './extract';
import { markOcr, OCR_CONFIDENCE, ocrTextItems, type OcrBlock } from './ocr';

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe('ocrTextItems', () => {
  it('maps word boxes to items in page units, dividing by the render scale', () => {
    const blocks: OcrBlock[] = [
      {
        paragraphs: [
          {
            lines: [
              { bbox: box(100, 200, 500, 230), words: [{ text: 'Haemoglobin', bbox: box(100, 202, 300, 228) }, { text: '13.5', bbox: box(400, 204, 460, 226) }] },
            ],
          },
        ],
      },
    ];
    // The row's y and height are the median word centre and height (both words centre on 215).
    expect(ocrTextItems(blocks, 2, 2)).toEqual([
      { text: 'Haemoglobin', x: 50, y: 101.5, width: 100, height: 12, page: 2 },
      { text: '13.5', x: 200, y: 101.5, width: 30, height: 12, page: 2 },
    ]);
  });

  it('gives every word its line’s y and height, so lowercase words don’t read as small print', () => {
    const blocks: OcrBlock[] = [
      {
        paragraphs: [
          {
            lines: [
              // "scan" has no ascenders: its own box is much shorter than the line's.
              { bbox: box(0, 100, 300, 130), words: [{ text: 'Mean', bbox: box(0, 100, 60, 130) }, { text: 'scan', bbox: box(70, 110, 120, 128) }] },
            ],
          },
        ],
      },
    ];
    const [mean, scan] = ocrTextItems(blocks, 1);
    expect(scan.y).toBe(mean.y);
    expect(scan.height).toBe(mean.height);
  });

  it('ignores a bogusly tall line box (a swept-in table border): the words set the row box', () => {
    const blocks: OcrBlock[] = [
      {
        paragraphs: [
          {
            lines: [
              // The line claims the whole page's height; its words are normal-sized.
              { bbox: box(0, 0, 500, 842), words: [{ text: 'MCHC', bbox: box(10, 710, 60, 725) }, { text: '32.3', bbox: box(200, 711, 240, 724) }] },
            ],
          },
        ],
      },
    ];
    const [name, value] = ocrTextItems(blocks, 1);
    expect(name).toMatchObject({ y: 710.5, height: 14 });
    expect(value).toMatchObject({ y: 710.5, height: 14 });
  });

  it('splits a line that bundles two printed rows into one, so each keeps its own row', () => {
    const blocks: OcrBlock[] = [
      {
        paragraphs: [
          {
            lines: [
              {
                // One Tesseract "line" holding MCHC's row and RDW's row (a pen stroke confused it).
                bbox: box(10, 700, 500, 732),
                words: [
                  { text: 'MCHC', bbox: box(10, 700, 60, 714) },
                  { text: '32.3', bbox: box(200, 701, 240, 713) },
                  { text: 'RDW-CV(%)', bbox: box(10, 718, 90, 732) },
                  { text: '13.8', bbox: box(200, 719, 240, 731) },
                ],
              },
            ],
          },
        ],
      },
    ];
    const items = ocrTextItems(blocks, 1);
    const ys = new Set(items.map((i) => i.y));
    expect(ys.size).toBe(2);
    expect(items.find((i) => i.text === 'MCHC')!.y).toBe(items.find((i) => i.text === '32.3')!.y);
    expect(items.find((i) => i.text === 'RDW-CV(%)')!.y).toBe(items.find((i) => i.text === '13.8')!.y);
    expect(items.find((i) => i.text === 'RDW-CV(%)')!.y).toBeGreaterThan(items.find((i) => i.text === 'MCHC')!.y);
  });

  it('skips empty words and handles missing blocks', () => {
    const blocks: OcrBlock[] = [{ paragraphs: [{ lines: [{ bbox: box(0, 0, 10, 10), words: [{ text: '  ', bbox: box(0, 0, 5, 10) }] }] }] }];
    expect(ocrTextItems(blocks, 1)).toEqual([]);
    expect(ocrTextItems(null, 1)).toEqual([]);
  });
});

describe('markOcr', () => {
  it('adds the ocr issue and caps confidence below the review threshold', () => {
    const results = [{ issues: [], confidence: 1 }, { issues: ['implausible'], confidence: 0.3 }] as unknown as ExtractedResult[];
    const marked = markOcr(results);
    expect(marked[0].issues).toEqual(['ocr']);
    expect(marked[0].confidence).toBe(OCR_CONFIDENCE);
    expect(OCR_CONFIDENCE).toBeLessThan(REVIEW_THRESHOLD);
    // An already-low confidence isn't raised.
    expect(marked[1].issues).toEqual(['implausible', 'ocr']);
    expect(marked[1].confidence).toBe(0.3);
  });
});
