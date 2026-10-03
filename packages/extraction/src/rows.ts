import type { Row, TextItem } from './types';

export type GroupRowsOptions = {
  /**
   * How far (as a fraction of line height) an item's vertical centre may sit
   * from the row's centre and still belong to it. 0.5 keeps superscripts
   * like the "3" in "10³/µL" on their row while separating adjacent lines.
   */
  tolerance?: number;
};

const centre = (item: TextItem) => item.y + item.height / 2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Groups text items into visual rows, page by page, top to bottom. */
export function groupRows(items: TextItem[], options: GroupRowsOptions = {}): Row[] {
  const tolerance = options.tolerance ?? 0.5;
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!item.text.trim()) continue;
    const pageItems = byPage.get(item.page);
    if (pageItems) pageItems.push(item);
    else byPage.set(item.page, [item]);
  }

  const rows: Row[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = byPage.get(page)!;
    // Some PDFs report zero-height items; fall back to the page's typical height.
    const positive = pageItems.map((i) => i.height).filter((h) => h > 0);
    const typicalHeight = positive.length ? median(positive) : 10;
    const heightOf = (item: TextItem) => (item.height > 0 ? item.height : typicalHeight);

    pageItems.sort((a, b) => centre(a) - centre(b));

    // Each row is anchored on its tallest item so small superscripts don't drag it.
    let current: { anchor: TextItem; items: TextItem[] } | null = null;
    const flush = () => {
      if (current) rows.push(toRow(page, current.anchor, current.items));
    };
    for (const item of pageItems) {
      if (current) {
        const lineHeight = Math.max(heightOf(current.anchor), heightOf(item));
        if (Math.abs(centre(item) - centre(current.anchor)) <= tolerance * lineHeight) {
          current.items.push(item);
          if (heightOf(item) > heightOf(current.anchor)) current.anchor = item;
          continue;
        }
      }
      flush();
      current = { anchor: item, items: [item] };
    }
    flush();
  }
  return rows;
}

function toRow(page: number, anchor: TextItem, items: TextItem[]): Row {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  return {
    page,
    y: centre(anchor),
    items: sorted,
    text: sorted.map((i) => i.text.trim()).join(' '),
  };
}
