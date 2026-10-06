import { useEffect, useState } from 'react';
import { openPageImages, type PageImages } from '../pdf/pageImages';

/** Opens the PDF for display while the review is on screen; closed (and its images freed) on leaving. */
export function usePageImages(pdf: { bytes: Uint8Array; password?: string }): PageImages | null {
  const [pages, setPages] = useState<PageImages | null>(null);
  useEffect(() => {
    let opened: PageImages | null = null;
    let cancelled = false;
    openPageImages(pdf.bytes, pdf.password).then(
      (p) => (cancelled ? p.close() : ((opened = p), setPages(p))),
      // Showing the page is a help, not a must: without it the review still works.
      () => {},
    );
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [pdf]);
  return pages;
}
