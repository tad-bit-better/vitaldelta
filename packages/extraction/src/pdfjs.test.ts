import { describe, expect, it } from 'vitest';
import { fromPdfJsItem } from './pdfjs';

// A 792pt-tall page: viewport conversion flips y (PDF space is bottom-up).
const flip = (x: number, y: number) => [x, 792 - y];

describe('fromPdfJsItem', () => {
  it('converts the baseline origin to a top-left box', () => {
    const item = fromPdfJsItem({ str: 'TSH', transform: [10, 0, 0, 10, 40, 700], width: 20, height: 10 }, 2, flip);
    expect(item).toEqual({ text: 'TSH', x: 40, y: 82, width: 20, height: 10, page: 2 });
  });

  it('falls back to the font size from the transform when height is 0', () => {
    const item = fromPdfJsItem({ str: '2.1', transform: [12, 0, 0, 12, 40, 700], width: 15, height: 0 }, 1, flip);
    expect(item.height).toBe(12);
    expect(item.y).toBe(80);
  });
});
