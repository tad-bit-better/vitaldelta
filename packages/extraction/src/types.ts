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
