/**
 * A piece of text from a PDF page with its position.
 * Coordinates are in PDF points, measured from the top-left of the page
 * (y grows downwards), so callers must flip pdf.js's bottom-up y.
 */
export type TextItem = {
  text: string;
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  width: number;
  height: number;
  /** 1-based page number. */
  page: number;
};

/** Text items that sit on the same visual line, sorted left to right. */
export type Row = {
  page: number;
  /** Vertical centre of the row. */
  y: number;
  items: TextItem[];
  /** Item texts joined with single spaces. */
  text: string;
};

/** Where something sits on a page, in the same coordinates as TextItem. */
export type Box = { page: number; x: number; y: number; width: number; height: number };

/** The smallest box around a row's text, so the app can show where a value came from. */
export function rowBox(row: Row): Box {
  const left = Math.min(...row.items.map((i) => i.x));
  const right = Math.max(...row.items.map((i) => i.x + i.width));
  const top = Math.min(...row.items.map((i) => i.y));
  const bottom = Math.max(...row.items.map((i) => i.y + i.height));
  return { page: row.page, x: left, y: top, width: right - left, height: bottom - top };
}
