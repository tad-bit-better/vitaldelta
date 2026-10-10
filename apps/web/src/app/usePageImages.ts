import { useEffect, useState } from 'react';
import { imagePages, openPageImages, type PageImages } from '../pdf/pageImages';
import type { ReviewSource } from './Upload';

/** Opens the report for display while the review is on screen; closed (and its images freed) on leaving. */
export function usePageImages(source: ReviewSource): PageImages | null {
  const [pages, setPages] = useState<PageImages | null>(null);
  useEffect(() => {
    let opened: PageImages | null = null;
    let cancelled = false;
    const open =
      source.kind === 'image'
        ? Promise.resolve(imagePages(source.blob, source.width, source.height))
        : openPageImages(source.bytes, source.password);
    open.then(
      (p) => (cancelled ? p.close() : ((opened = p), setPages(p))),
      // Showing the page is a help, not a must: without it the review still works.
      () => {},
    );
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [source]);
  return pages;
}
