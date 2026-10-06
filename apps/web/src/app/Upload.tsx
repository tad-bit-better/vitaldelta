import {
  detectPatient,
  detectReportDate,
  extractResults,
  extractWordResults,
  groupRows,
  type DetectedDate,
  type DetectedPatient,
  type ExtractedResult,
  type ExtractedWordResult,
} from '@vitaldelta/extraction';
import { useState } from 'react';
import { PdfNoTextError, PdfPasswordError, readPdf } from '../pdf/readPdf';

export type Extracted = {
  fileName: string;
  results: ExtractedResult[];
  /** Results printed as words ("Non Reactive"). */
  words: ExtractedWordResult[];
  detectedDate: DetectedDate | null;
  patient: DetectedPatient;
  /** The PDF itself, kept in memory only while reviewing, to show where each value came from. */
  pdf: { bytes: Uint8Array; password?: string };
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
  const [stage, setStage] = useState<'reading' | 'finding' | null>(null);
  const busy = stage !== null;
  const [error, setError] = useState<string | null>(null);
  // What actually failed (pdf.js's error name and message; never the report's content), shown
  // under the friendly message so a failing PDF can be diagnosed.
  const [detail, setDetail] = useState<string | null>(null);

  async function read(selected: File, pw?: string) {
    setStage('reading');
    setError(null);
    setDetail(null);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      // pdf.js detaches what it's given; keep the original for the review screen.
      const items = await readPdf(bytes.slice().buffer, pw);
      // Extraction runs on this thread; let the browser show the new step first.
      setStage('finding');
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
      const rows = groupRows(items);
      const results = extractResults(rows);
      const words = extractWordResults(rows);
      if (!results.length && !words.length) {
        setError('We couldn’t find any lab results in this PDF. Is it a lab report?');
        return;
      }
      onExtracted({ fileName: selected.name, results, words, detectedDate: detectReportDate(rows), patient: detectPatient(rows), pdf: { bytes, password: pw } });
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setNeedsPassword(true);
        setError(err.incorrect ? 'That password didn’t work. Try again.' : null);
      } else if (err instanceof PdfNoTextError) {
        setError('This PDF has no text. It looks like a scan or photo, which isn’t supported yet.');
      } else {
        setError('We couldn’t read this PDF. It may be damaged or not a PDF.');
        setDetail(err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err).slice(0, 300));
      }
    } finally {
      setStage(null);
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
      <p className="app-muted">Choose a lab report PDF. It’s read here in your browser and never uploaded.</p>
      <label
        className={`app-drop${busy ? ' app-drop-busy' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        <input type="file" accept="application/pdf" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} />
        <span aria-live="polite">
          {stage === 'reading'
            ? `Reading ${file?.name ?? 'the PDF'}…`
            : stage === 'finding'
              ? 'Finding results…'
              : file
                ? file.name
                : 'Drop a PDF here or click to choose'}
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
