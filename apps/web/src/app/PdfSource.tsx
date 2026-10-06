import type { Box } from '@vitaldelta/extraction';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PageImages } from '../pdf/pageImages';
import { Icon } from './icons';

function usePageUrl(pages: PageImages | null, page: number | null): string | null {
  const [url, setUrl] = useState<{ page: number; url: string } | null>(null);
  useEffect(() => {
    if (!pages || page === null) return;
    let live = true;
    pages.image(page).then((u) => live && setUrl({ page, url: u }), () => {});
    return () => {
      live = false;
    };
  }, [pages, page]);
  return url && url.page === page ? url.url : null;
}

/** A box as percentages of its page, for positioning over the page image. */
function percentBox(box: Box, size: { width: number; height: number }, pad = 0) {
  return {
    left: ((box.x - pad) / size.width) * 100,
    top: ((box.y - pad) / size.height) * 100,
    width: ((box.width + pad * 2) / size.width) * 100,
    height: ((box.height + pad * 2) / size.height) * 100,
  };
}

const PAD = 3;

/**
 * The strip of the page a value was read from, cut from the page image with CSS (no extra
 * image). At least 1.5 px per point so the text is readable; wider than the card on phones,
 * where it scrolls sideways.
 */
export function SourceSnippet({ pages, box, onShowPage }: { pages: PageImages | null; box: Box | undefined; onShowPage?: () => void }) {
  const url = usePageUrl(pages, box?.page ?? null);
  if (!pages || !box) return null;
  const size = pages.size(box.page);
  const crop = { x: Math.max(0, box.x - PAD * 2), y: Math.max(0, box.y - PAD), w: box.width + PAD * 4, h: box.height + PAD * 2 };
  return (
    <figure className="rv-snippet">
      <div className="rv-snippet-scroll">
        <div className="rv-snippet-crop" style={{ aspectRatio: `${crop.w} / ${crop.h}`, width: `max(100%, ${Math.round(crop.w * 1.5)}px)` }}>
          {url ? (
            <img
              src={url}
              alt=""
              // Margins in % are of the container's width, like the image's scale, so the crop
              // stays exact even when min-height makes the strip taller than its aspect ratio.
              style={{
                width: `${(size.width / crop.w) * 100}%`,
                marginLeft: `${(-crop.x / crop.w) * 100}%`,
                marginTop: `${(-crop.y / crop.w) * 100}%`,
              }}
            />
          ) : (
            <span className="rv-snippet-loading" />
          )}
        </div>
      </div>
      <figcaption>
        Page {box.page} of the PDF
        {onShowPage && (
          <button type="button" className="app-link-btn rv-show-page" onClick={onShowPage}>
            See the whole page
          </button>
        )}
      </figcaption>
    </figure>
  );
}

export type Highlight = { box: Box; tone: 'selected' | 'pending' };

/**
 * One page at a time with the selected value highlighted and other values still to check
 * outlined; zoom and page buttons. Scrolls the highlight into view when the selection changes.
 */
export function PageViewer({ pages, page, onPage, highlights }: {
  pages: PageImages | null;
  page: number;
  onPage: (page: number) => void;
  highlights: Highlight[];
}) {
  const [zoom, setZoom] = useState(1);
  const url = usePageUrl(pages, page);
  const scroller = useRef<HTMLDivElement>(null);
  const selected = highlights.find((h) => h.tone === 'selected' && h.box.page === page);
  const selectedKey = selected ? `${selected.box.page}:${selected.box.y}:${zoom}` : null;

  // Keep the highlighted row in the middle of the panel (without scrolling the whole page).
  useLayoutEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>('.rv-mark-selected');
    if (!el || !scroller.current) return;
    const s = scroller.current;
    s.scrollTo({ top: el.offsetTop - s.clientHeight / 2 + el.offsetHeight / 2, left: el.offsetLeft - s.clientWidth / 2 + el.offsetWidth / 2 });
  }, [selectedKey, url]);

  if (!pages) {
    return (
      <div className="rv-viewer">
        <div className="rv-viewer-bar">Opening the PDF…</div>
      </div>
    );
  }
  const size = pages.size(page);
  return (
    <div className="rv-viewer">
      <div className="rv-viewer-bar">
        {pages.count > 1 && (
          <button type="button" className="rv-icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ‹
          </button>
        )}
        <span aria-live="polite">Page {page} of {pages.count}</span>
        {pages.count > 1 && (
          <button type="button" className="rv-icon-btn" aria-label="Next page" disabled={page >= pages.count} onClick={() => onPage(page + 1)}>
            ›
          </button>
        )}
        <span className="rv-viewer-zoom">
          <button type="button" className="rv-icon-btn" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            −
          </button>
          <button type="button" className="rv-icon-btn" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <Icon name="plus" />
          </button>
        </span>
      </div>
      <div className="rv-viewer-scroll" ref={scroller}>
        <div className="rv-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${size.width} / ${size.height}` }}>
          {url ? <img src={url} alt={`Page ${page} of the report`} /> : <span className="rv-page-loading">Drawing the page…</span>}
          {highlights
            .filter((h) => h.box.page === page)
            .map((h) => {
              const p = percentBox(h.box, size, PAD);
              return (
                <span
                  key={`${h.box.y}:${h.box.x}:${h.tone}`}
                  className={`rv-mark rv-mark-${h.tone}`}
                  style={{ left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%` }}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

/** The page viewer full screen, for phones where there's no room beside the list. */
export function PageDialog({ open, onClose, ...viewer }: Parameters<typeof PageViewer>[0] & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="rv-dialog" onClose={onClose} aria-label="The report page">
      <div className="rv-dialog-head">
        <strong>Where it was printed</strong>
        <button type="button" className="app-btn app-btn-sm" onClick={onClose}>Close</button>
      </div>
      {open && <PageViewer {...viewer} />}
    </dialog>
  );
}
