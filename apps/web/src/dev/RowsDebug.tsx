import {
  extractResults,
  groupRows,
  REVIEW_THRESHOLD,
  type ExtractedResult,
  type Row,
} from '@vitaldelta/extraction';
import { useState } from 'react';
import { PdfNoTextError, PdfPasswordError, readPdf } from '../pdf/readPdf';
import './RowsDebug.css';

type Loaded = { file: File; rows: Row[]; results: ExtractedResult[] };

/**
 * Development-only page: drop one or more PDFs from fixtures/ and inspect rows,
 * extracted results and a side-by-side comparison. Not included in production builds.
 */
export default function RowsDebug() {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [pending, setPending] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('Choose one or more PDFs.');

  async function load(file: File, pw?: string): Promise<boolean> {
    try {
      const rows = groupRows(await readPdf(await file.arrayBuffer(), pw));
      const results = extractResults(rows);
      setLoaded((prev) => [...prev.filter((l) => l.file.name !== file.name), { file, rows, results }]);
      return true;
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setPending(file);
        setStatus(`${file.name}: ${err.incorrect ? 'incorrect password, try again.' : 'needs a password.'}`);
      } else if (err instanceof PdfNoTextError) {
        setStatus(`${file.name}: no text found. Looks scanned, which isn’t supported yet.`);
      } else {
        setStatus(`${file.name}: couldn’t read (${err instanceof Error ? err.message : String(err)})`);
      }
      return false;
    }
  }

  async function loadAll(files: File[]) {
    setStatus('Reading…');
    let ok = 0;
    for (const file of files) {
      if (!(await load(file))) break; // stop to ask for a password
      ok++;
    }
    if (ok === files.length) setStatus(`Loaded ${ok} file(s).`);
  }

  return (
    <main className="rows-debug">
      <h1>Extraction debug</h1>
      <div className="rows-debug-bar">
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => void loadAll([...(e.target.files ?? [])])}
        />
        {loaded.length > 0 && (
          <button type="button" onClick={() => setLoaded([])}>Clear</button>
        )}
      </div>
      {pending && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await load(pending, password)) {
              setPending(null);
              setPassword('');
              setStatus(`Loaded ${pending.name}.`);
            }
          }}
        >
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="PDF password" />
          <button type="submit">Open</button>
        </form>
      )}
      <p>{status}</p>

      {loaded.length > 1 && <Compare loaded={loaded} />}
      {loaded.map((l) => (
        <FileResults key={l.file.name} {...l} />
      ))}
    </main>
  );
}

function FileResults({ file, rows, results }: Loaded) {
  const recognised = results.filter((r) => r.markerId).length;
  const review = results.filter((r) => r.confidence < REVIEW_THRESHOLD).length;
  return (
    <section>
      <h2>{file.name}</h2>
      <p>
        {rows.length} rows → {results.length} results ({recognised} recognised, {results.length - recognised} unrecognised,{' '}
        {review} need review)
      </p>
      <table>
        <thead>
          <tr>
            <th>Marker</th><th>Printed name</th><th>Value</th><th>As printed</th><th>Range</th><th>Lab flag</th>
            <th>Confidence</th><th>Issues</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className={r.confidence < REVIEW_THRESHOLD ? 'rows-debug-review' : undefined}>
              <td>{r.markerId ? `${r.name} (${r.markerId})` : '—'}</td>
              <td>{r.printedName}</td>
              <td>{formatValue(r)}</td>
              <td>{r.original.valueText} {r.original.unit ?? ''}</td>
              <td>{formatRange(r)}</td>
              <td>{r.labFlag ?? ''}</td>
              <td>{r.confidence.toFixed(2)}</td>
              <td>{r.issues.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Raw rows ({rows.length})</summary>
        <table>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{row.page}</td>
                <td>{row.y.toFixed(1)}</td>
                <td>
                  {row.items.map((item, j) => (
                    <span key={j} className="rows-debug-item" title={`x ${item.x.toFixed(1)}, h ${item.height.toFixed(1)}`}>
                      {item.text}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** One row per marker (or printed name when unrecognised), one column per file. */
function Compare({ loaded }: { loaded: Loaded[] }) {
  const keyOf = (r: ExtractedResult) => r.markerId ?? `name:${r.printedName.toLowerCase()}`;
  const keys = [...new Set(loaded.flatMap((l) => l.results.map(keyOf)))];
  return (
    <section>
      <h2>Comparison (file order as loaded)</h2>
      <table>
        <thead>
          <tr>
            <th>Marker</th>
            {loaded.map((l) => <th key={l.file.name}>{l.file.name}</th>)}
            <th>Change (first → last)</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const cells = loaded.map((l) => l.results.find((r) => keyOf(r) === key) ?? null);
            const present = cells.filter((c): c is ExtractedResult => c !== null);
            const first = present[0];
            const last = present[present.length - 1];
            const comparable = present.length > 1 && first.unit === last.unit && first.value !== 0;
            return (
              <tr key={key}>
                <td>{first.markerId ? first.name : `${first.printedName} (unrecognised)`}</td>
                {cells.map((c, i) => <td key={i}>{c ? formatValue(c) : '—'}</td>)}
                <td>{comparable ? `${(((last.value - first.value) / first.value) * 100).toFixed(1)}%` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function formatValue(r: ExtractedResult): string {
  return `${r.comparator ?? ''}${Number(r.value.toPrecision(4))} ${r.unit ?? ''}`.trim();
}

function formatRange({ refLow, refHigh }: ExtractedResult): string {
  const f = (n: number) => Number(n.toPrecision(4));
  if (refLow !== null && refHigh !== null) return `${f(refLow)} – ${f(refHigh)}`;
  if (refHigh !== null) return `≤ ${f(refHigh)}`;
  if (refLow !== null) return `≥ ${f(refLow)}`;
  return '—';
}
