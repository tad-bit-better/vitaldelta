import {
  detectPatient,
  detectReportDate,
  extractResults,
  extractWordResults,
  groupRows,
  markOcr,
  type DetectedDate,
  type DetectedPatient,
  type ExtractedResult,
  type ExtractedWordResult,
  type TextItem,
} from '@vitaldelta/extraction';
import { useState } from 'react';
import { PdfNoTextError, PdfPasswordError, readPdf } from '../pdf/readPdf';

/** The report itself, kept in memory only while reviewing, to show where each value came from. */
export type ReviewSource =
  | { kind: 'pdf'; bytes: Uint8Array; password?: string }
  | { kind: 'image'; blob: Blob; width: number; height: number };

export type Extracted = {
  fileName: string;
  results: ExtractedResult[];
  /** Results printed as words ("Non Reactive"). */
  words: ExtractedWordResult[];
  detectedDate: DetectedDate | null;
  patient: DetectedPatient;
  source: ReviewSource;
};

/**
 * Browser and version for error reports. On iPhone and iPad every browser runs Apple's WebKit,
 * so what matters there is the iOS version ("iOS 17.4 · Chrome (WebKit)").
 */
function browserName(): string {
  const ua = navigator.userAgent;
  const ios = ua.match(/(?:iPhone|iPad|CPU) OS (\d+)_(\d+)/);
  if (ios) {
    const app = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : 'Safari';
    return `iOS ${ios[1]}.${ios[2]} · ${app} (WebKit)`;
  }
  return ua.match(/(Firefox|Edg|Chrome|Version)\/[\d.]+/)?.[0]?.replace('Version', 'Safari') ?? 'unknown browser';
}

type Props = {
  onExtracted: (extracted: Extracted) => void;
  onCancel: () => void;
  /** Demo mode: offers a made-up report instead of the user's own PDF. */
  sample?: () => File;
};

/** Pick a PDF, unlock it if needed, and extract results. The file never leaves the browser. */
export default function Upload({ onExtracted, onCancel, sample }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'reading' | 'ocr' | 'finding' | null>(null);
  // "page 2 of 3" while OCR works through a scanned PDF.
  const [ocrPage, setOcrPage] = useState<string | null>(null);
  const busy = stage !== null;
  const [error, setError] = useState<string | null>(null);
  // What actually failed (pdf.js's error name and message; never the report's content), shown
  // under the friendly message so a failing PDF can be diagnosed.
  const [detail, setDetail] = useState<string | null>(null);

  async function read(selected: File, pw?: string) {
    setStage('reading');
    setError(null);
    setDetail(null);
    setOcrPage(null);
    const isPdf = selected.type === 'application/pdf' || selected.name.toLowerCase().endsWith('.pdf');
    try {
      let items: TextItem[];
      let source: ReviewSource;
      // True when the text came from OCR (a photo, or a PDF with no text layer):
      // every OCR'd result is then held for the user to check against the picture.
      let ocr = false;
      if (isPdf) {
        const bytes = new Uint8Array(await selected.arrayBuffer());
        source = { kind: 'pdf', bytes, password: pw };
        try {
          // pdf.js detaches what it's given; keep the original for the review screen.
          items = await readPdf(bytes.slice().buffer, pw);
        } catch (err) {
          if (!(err instanceof PdfNoTextError)) throw err;
          setStage('ocr');
          const { readScannedPdf } = await import('../pdf/ocr');
          items = await readScannedPdf(bytes.slice(), pw, (n, total) => setOcrPage(total > 1 ? `page ${n} of ${total}` : null));
          ocr = true;
        }
      } else {
        setStage('ocr');
        const { readImageFile } = await import('../pdf/ocr');
        const picture = await readImageFile(selected);
        items = picture.items;
        source = { kind: 'image', blob: picture.blob, width: picture.width, height: picture.height };
        ocr = true;
      }
      // Extraction runs on this thread; let the browser show the new step first.
      setStage('finding');
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
      const rows = groupRows(items);
      const results = ocr ? markOcr(extractResults(rows)) : extractResults(rows);
      const words = extractWordResults(rows);
      if (!results.length && !words.length) {
        setError(
          ocr
            ? 'We couldn’t find any lab results in this picture. A sharp, straight-on photo in good light works best.'
            : 'We couldn’t find any lab results in this PDF. Is it a lab report?',
        );
        return;
      }
      onExtracted({ fileName: selected.name, results, words, detectedDate: detectReportDate(rows), patient: detectPatient(rows), source });
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setNeedsPassword(true);
        setError(err.incorrect ? 'That password didn’t work. Try again.' : null);
      } else {
        setError(isPdf ? 'We couldn’t read this PDF. It may be damaged or not a PDF.' : 'We couldn’t read this picture. Try a JPEG or PNG photo of the report.');
        setDetail(err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err).slice(0, 300));
      }
    } finally {
      setStage(null);
      setOcrPage(null);
    }
  }

  function choose(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setNeedsPassword(false);
    setPassword('');
    void read(selected);
  }

  return (
    <section className="app-card">
      <h1>Add a report</h1>
      <p className="app-muted">Choose a lab report — a PDF, or a photo or scan of one. It’s read here in your browser and never uploaded.</p>
      <label
        className={`app-drop${busy ? ' app-drop-busy' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        <input type="file" accept="application/pdf,image/*" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} />
        <span aria-live="polite">
          {stage === 'reading'
            ? `Reading ${file?.name ?? 'the report'}…`
            : stage === 'ocr'
              ? `Reading the scan${ocrPage ? `, ${ocrPage}` : ''}… The first scan sets up the reader, which can take a minute.`
              : stage === 'finding'
                ? 'Finding results…'
                : file
                  ? file.name
                  : 'Drop a report here — PDF or photo — or click to choose'}
        </span>
        {busy && <span className="app-drop-progress" aria-hidden="true" />}
      </label>

      {sample && (
        <p className="app-muted">
          No report handy?{' '}
          <button type="button" className="app-link-btn" disabled={busy} onClick={() => choose(sample())}>
            Use a made-up sample report
          </button>{' '}
          to see how reading and checking works.
        </p>
      )}

      {needsPassword && file && (
        <form
          className="app-row"
          onSubmit={(e) => {
            e.preventDefault();
            void read(file, password);
          }}
        >
          <label className="app-field">
            <span>This PDF is password-protected. Labs often use your date of birth or phone number.</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </label>
          <button type="submit" className="app-btn app-btn-primary" disabled={busy || !password}>
            Unlock
          </button>
        </form>
      )}

      {error && <p className="app-error" role="alert">{error}</p>}
      {error && detail && (
        <details className="app-note">
          <summary>Technical details</summary>
          <code>{detail}</code> · {browserName()}
        </details>
      )}

      <div className="app-actions">
        <button type="button" className="app-btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
