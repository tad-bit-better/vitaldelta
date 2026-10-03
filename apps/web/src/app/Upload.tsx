import {
  detectPatient,
  detectReportDate,
  extractResults,
  groupRows,
  type DetectedDate,
  type DetectedPatient,
  type ExtractedResult,
} from '@vitaldelta/extraction';
import { useState } from 'react';
import { PdfNoTextError, PdfPasswordError, readPdf } from '../pdf/readPdf';

export type Extracted = {
  fileName: string;
  results: ExtractedResult[];
  detectedDate: DetectedDate | null;
  patient: DetectedPatient;
};

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(selected: File, pw?: string) {
    setBusy(true);
    setError(null);
    try {
      const rows = groupRows(await readPdf(await selected.arrayBuffer(), pw));
      const results = extractResults(rows);
      if (!results.length) {
        setError('We couldn’t find any lab results in this PDF. Is it a lab report?');
        return;
      }
      onExtracted({ fileName: selected.name, results, detectedDate: detectReportDate(rows), patient: detectPatient(rows) });
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setNeedsPassword(true);
        setError(err.incorrect ? 'That password didn’t work. Try again.' : null);
      } else if (err instanceof PdfNoTextError) {
        setError('This PDF has no text. It looks like a scan or photo, which isn’t supported yet.');
      } else {
        setError('We couldn’t read this PDF. It may be damaged or not a PDF.');
      }
    } finally {
      setBusy(false);
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
        className="app-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        <input type="file" accept="application/pdf" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} />
        <span>{busy ? 'Reading…' : file ? file.name : 'Drop a PDF here or click to choose'}</span>
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

      <div className="app-actions">
        <button type="button" className="app-btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
