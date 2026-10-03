import { markers, REVIEW_THRESHOLD, type ExtractedResult, type Issue } from '@vitaldelta/extraction';
import { useState } from 'react';
import type { NewResult } from '../storage/types';
import { useStorage } from './StorageContext';
import type { Extracted } from './Upload';

type Status = 'pending' | 'confirmed' | 'rejected';

/** A result being reviewed. Numbers are kept as text while the user edits them. */
type Draft = {
  key: number;
  status: Status;
  /** Low confidence at extraction: shown under "Needs your check" for the whole review. */
  flagged: boolean;
  markerId: string | null;
  name: string;
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
  edited: boolean;
  source: ExtractedResult | null;
};

const ISSUE_TEXT: Record<Issue, string> = {
  'fuzzy-name': 'The name was matched approximately. Check it’s the right test.',
  unrecognised: 'Not in our list of tests. It will be kept under the printed name.',
  'missing-unit': 'No unit was printed, so the standard unit is assumed.',
  'unknown-unit': 'The unit wasn’t recognised, so the value is kept as printed.',
  implausible: 'This value looks impossible for this test. It was probably misread.',
  'missing-range': 'No reference range was found.',
  'odd-range': 'The reference range looks wrong.',
  duplicate: 'This test appears more than once with different values.',
  'bound-only': 'The value is a limit (like “<60”) with no range. It may be a note rather than a result.',
};

const SOURCE_TEXT = { collected: 'collection date', received: 'received date', reported: 'report date', other: 'first date' };

const sortedMarkers = [...markers].sort((a, b) => a.name.localeCompare(b.name));
const markerById = new Map(markers.map((m) => [m.id, m]));

const toText = (n: number | null) => (n === null ? '' : String(Number(n.toPrecision(6))));
const toNumber = (s: string) => (s.trim() === '' ? null : Number(s));
const isNumber = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));

function fromExtracted(r: ExtractedResult, key: number): Draft {
  return {
    key,
    status: r.confidence < REVIEW_THRESHOLD ? 'pending' : 'confirmed',
    flagged: r.confidence < REVIEW_THRESHOLD,
    markerId: r.markerId,
    name: r.name,
    value: toText(r.value),
    unit: r.unit ?? '',
    refLow: toText(r.refLow),
    refHigh: toText(r.refHigh),
    edited: false,
    source: r,
  };
}

function problems(d: Draft): string[] {
  const list: string[] = [];
  if (!d.name.trim()) list.push('Enter a name.');
  if (!isNumber(d.value)) list.push('Enter a number for the value.');
  if (d.refLow && !isNumber(d.refLow)) list.push('Range low must be a number.');
  if (d.refHigh && !isNumber(d.refHigh)) list.push('Range high must be a number.');
  return list;
}

function toNewResult(d: Draft): NewResult {
  return {
    markerId: d.markerId,
    name: d.name.trim(),
    value: Number(d.value),
    unit: d.unit.trim() || null,
    comparator: d.source?.comparator ?? null,
    refLow: toNumber(d.refLow),
    refHigh: toNumber(d.refHigh),
    labFlag: d.source?.labFlag ?? null,
    confidence: d.source?.confidence ?? 1,
    userEdited: d.edited || !d.source,
    original: d.source?.original ?? null,
  };
}

type Props = { extracted: Extracted; onSaved: () => void; onCancel: () => void };

/** Check, correct, add or reject extracted results, then save them with the report date and lab. */
export default function Review({ extracted, onSaved, onCancel }: Props) {
  const storage = useStorage();
  const [drafts, setDrafts] = useState<Draft[]>(() => extracted.results.map(fromExtracted));
  const [collectedAt, setCollectedAt] = useState(extracted.detectedDate?.date ?? '');
  const [labName, setLabName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, change: Partial<Draft>) =>
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const edit = (key: number, change: Partial<Draft>) => update(key, { ...change, edited: true });

  const pending = drafts.filter((d) => d.status === 'pending');
  const confirmed = drafts.filter((d) => d.status === 'confirmed');
  const invalid = confirmed.filter((d) => problems(d).length);
  const flagged = drafts.filter((d) => d.flagged);
  const others = drafts.filter((d) => !d.flagged);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // Progress: kept-and-valid results out of everything not rejected.
  const ready = confirmed.length - invalid.length;
  const total = drafts.length - drafts.filter((d) => d.status === 'rejected').length;
  const percent = total ? Math.round((ready / total) * 100) : 0;

  // Everything still blocking Save, each linked to where it can be fixed.
  const blockers: { text: string; target: string | null }[] = [];
  if (!collectedAt) blockers.push({ text: 'date missing', target: 'review-date' });
  if (pending.length) blockers.push({ text: `${plural(pending.length, 'result')} to check`, target: rowId(pending[0].key) });
  if (invalid.length) blockers.push({ text: `${plural(invalid.length, 'value')} to fix`, target: rowId(invalid[0].key) });
  if (!confirmed.length) blockers.push({ text: 'keep at least one result', target: null });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await storage.saveReport(
        { collectedAt, labName: labName.trim() || null, sourceFileName: extracted.fileName },
        confirmed.map(toNewResult),
      );
      onSaved();
    } catch {
      setError('Saving failed. Your browser may be out of storage space.');
      setSaving(false);
    }
  }

  return (
    <section className="app-card app-review">
      <h1>Check the results</h1>
      <p className="app-muted">
        From <strong>{extracted.fileName}</strong>. Compare with the PDF and fix anything that was read wrong.
        Highlighted rows need your check before saving.
      </p>

      <div className="app-row app-row-top">
        <label className="app-field">
          <span>Sample collection date</span>
          <input id="review-date" type="date" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} required />
          {extracted.detectedDate && collectedAt === extracted.detectedDate.date && (
            <small>Found the {SOURCE_TEXT[extracted.detectedDate.source]} on the report.</small>
          )}
        </label>
        <label className="app-field">
          <span>Lab name (optional)</span>
          <input type="text" value={labName} onChange={(e) => setLabName(e.target.value)} />
        </label>
      </div>

      {flagged.length > 0 && (
        <div className="app-group app-group-check">
          <div className="app-group-head">
            <h2>Needs your check</h2>
            <span className="app-progress">
              {flagged.length - flagged.filter((d) => d.status === 'pending').length} of {flagged.length} checked
            </span>
          </div>
          <p className="app-muted">
            These may have been read wrong. Compare each with the PDF, then choose <strong>Looks right</strong> or{' '}
            <strong>Reject</strong>.
          </p>
          <ul className="app-results">
            {flagged.map((d) => (
              <ResultEditor key={d.key} draft={d} onUpdate={(c) => update(d.key, c)} onEdit={(c) => edit(d.key, c)} />
            ))}
          </ul>
        </div>
      )}

      <div className="app-group">
        <div className="app-group-head">
          <h2>Ready to save</h2>
          <span className="app-progress">{plural(others.filter((d) => d.status === 'confirmed').length, 'result')}</span>
        </div>
        <p className="app-muted">Read with high confidence. Skim them; you can still edit or reject any.</p>
        <ul className="app-results">
          {others.map((d) => (
            <ResultEditor key={d.key} draft={d} onUpdate={(c) => update(d.key, c)} onEdit={(c) => edit(d.key, c)} />
          ))}
        </ul>
        <button
          type="button"
          className="app-btn"
          onClick={() =>
            setDrafts((all) => [
              ...all,
              { key: Date.now(), status: 'confirmed', flagged: false, markerId: null, name: '', value: '', unit: '', refLow: '', refHigh: '', edited: true, source: null },
            ])
          }
        >
          + Add a result that was missed
        </button>
      </div>

      <div className={`app-savebar${ready === total && total > 0 ? ' app-savebar-done' : ''}`}>
        <progress className="app-savebar-progress" value={ready} max={Math.max(total, 1)} aria-labelledby="review-progress-label" />
        <div className="app-savebar-status" aria-live="polite">
          <p id="review-progress-label" className="app-savebar-headline">
            {ready === total && total > 0
              ? `✓ Ready to save ${plural(ready, 'result')}`
              : `Ready to save ${ready} of ${plural(total, 'result')}`}
            <span className="app-savebar-percent">{percent}%</span>
          </p>
          {blockers.length > 0 && (
            <p className="app-savebar-todo">
              <span>Still to do:</span>
              {blockers.map((b) =>
                b.target ? (
                  <button key={b.text} type="button" className="app-link" onClick={() => jumpTo(b.target!)}>
                    {b.text}
                  </button>
                ) : (
                  <span key={b.text}>{b.text}</span>
                ),
              )}
            </p>
          )}
        </div>
        {error && <p className="app-error" role="alert">{error}</p>}
        <div className="app-actions">
          <button type="button" className="app-btn" onClick={onCancel} disabled={saving}>Discard</button>
          <button type="button" className="app-btn app-btn-primary" onClick={save} disabled={saving || blockers.length > 0}>
            {saving ? 'Saving…' : `Save ${plural(confirmed.length, 'result')}`}
          </button>
        </div>
      </div>
    </section>
  );
}

const rowId = (key: number) => `result-${key}`;

/** Scrolls to a row (or field) and focuses its first input, so the next action is one click away. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const field = el.matches('input, select') ? el : el.querySelector<HTMLElement>('input:not([readonly]), select');
  field?.focus({ preventScroll: true });
}

type EditorProps = {
  draft: Draft;
  /** Status changes. */
  onUpdate: (change: Partial<Draft>) => void;
  /** Field changes; marks the result as edited by the user. */
  onEdit: (change: Partial<Draft>) => void;
};

function ResultEditor({ draft: d, onUpdate, onEdit }: EditorProps) {
  const marker = d.markerId ? markerById.get(d.markerId) : undefined;
  const issues = d.source?.issues ?? [];
  const errors = d.status === 'confirmed' ? problems(d) : [];
  const disabled = d.status === 'rejected';
  const original = d.source?.original;

  return (
    <li id={rowId(d.key)} className={`app-result app-result-${d.status}`}>
      {d.flagged && (
        <span className={`app-chip app-chip-${d.status}`}>
          {d.status === 'pending' ? 'To check' : d.status === 'confirmed' ? '✓ Checked' : 'Rejected'}
        </span>
      )}
      <div className="app-result-fields">
        <label className="app-field app-field-wide">
          <span>Test</span>
          <select
            value={d.markerId ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value ? markerById.get(e.target.value)! : null;
              onEdit(
                next
                  ? { markerId: next.id, name: next.name, unit: next.unit }
                  : { markerId: null, name: d.source?.printedName ?? '', unit: d.source?.original.unit ?? '' },
              );
            }}
          >
            <option value="">Not in the list (use printed name)</option>
            {sortedMarkers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {!marker && (
            <input
              aria-label="Test name"
              placeholder="Test name as printed"
              value={d.name}
              disabled={disabled}
              onChange={(e) => onEdit({ name: e.target.value })}
            />
          )}
        </label>
        <label className="app-field">
          <span>Value</span>
          <input inputMode="decimal" value={d.value} disabled={disabled} onChange={(e) => onEdit({ value: e.target.value })} />
        </label>
        <label className="app-field">
          <span>Unit</span>
          {marker && d.unit === marker.unit ? (
            <input value={d.unit} readOnly disabled={disabled} title="Values are stored in this test’s standard unit" />
          ) : (
            <input value={d.unit} disabled={disabled} onChange={(e) => onEdit({ unit: e.target.value })} />
          )}
        </label>
        <label className="app-field">
          <span>Range low</span>
          <input inputMode="decimal" value={d.refLow} disabled={disabled} onChange={(e) => onEdit({ refLow: e.target.value })} />
        </label>
        <label className="app-field">
          <span>Range high</span>
          <input inputMode="decimal" value={d.refHigh} disabled={disabled} onChange={(e) => onEdit({ refHigh: e.target.value })} />
        </label>
      </div>

      {original && (
        <p className="app-printed">
          Printed: {d.source!.printedName} · {original.valueText} {original.unit ?? ''}
          {original.refText ? ` · range ${original.refText}` : ''}
          {marker && original.unit && original.unit !== d.unit ? ` · converted to ${d.unit}` : ''}
        </p>
      )}
      {d.status !== 'rejected' && issues.length > 0 && (
        <ul className="app-issues">
          {issues.map((i) => <li key={i}>{ISSUE_TEXT[i]}</li>)}
        </ul>
      )}
      {errors.length > 0 && <p className="app-error">{errors.join(' ')}</p>}

      <div className="app-result-actions">
        {d.status === 'pending' && (
          <button type="button" className="app-btn app-btn-primary app-btn-sm" onClick={() => onUpdate({ status: 'confirmed' })}>
            Looks right
          </button>
        )}
        {d.status !== 'rejected' ? (
          <button type="button" className="app-btn app-btn-sm" onClick={() => onUpdate({ status: 'rejected' })}>
            Reject
          </button>
        ) : (
          <button
            type="button"
            className="app-btn app-btn-sm"
            onClick={() => onUpdate({ status: d.source && d.source.confidence < REVIEW_THRESHOLD ? 'pending' : 'confirmed' })}
          >
            Undo reject
          </button>
        )}
      </div>
    </li>
  );
}
