import { markers, REVIEW_THRESHOLD, type ExtractedResult, type Issue } from '@vitaldelta/extraction';
import { useEffect, useRef, useState } from 'react';
import type { NewResult } from '../storage/types';
import { forProfile, useAppData } from './DataContext';
import { formatDate } from './format';
import { findDuplicate, mismatchReasons, suggestProfile } from './patients';
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
  'banded-range':
    'The report gives the range as categories (like deficient / sufficient / toxic). The normal category was used as the range where one was found. Check it against the PDF.',
  duplicate: 'This test appears more than once with different values.',
  'bound-only': 'The value is a limit (like “<60”) with no range. It may be a note rather than a result.',
};

const SOURCE_TEXT = { collected: 'collection date', received: 'received date', reported: 'report date', other: 'first date' };

/** Names on a patient's reports that differ from their display name. */
const otherNames = (p: { name: string; aliases: string[] }) => p.aliases.filter((a) => a.toLowerCase() !== p.name.toLowerCase());

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

type Props = { extracted: Extracted; onSaved: (profileId: string) => void; onCancel: () => void };

/** Who the report is for: an existing patient, or a new one. Never pre-selected; the user must choose. */
type PatientChoice = { kind: 'existing'; id: string } | { kind: 'new' } | null;

/** Check, correct, add or reject extracted results, then save them with the report date and lab. */
export default function Review({ extracted, onSaved, onCancel }: Props) {
  const storage = useStorage();
  const data = useAppData();
  const detected = extracted.patient;
  const suggested = suggestProfile(data.profiles, detected);
  const [patient, setPatient] = useState<PatientChoice>(null);
  const [newName, setNewName] = useState(detected.name ?? '');
  const [differentReport, setDifferentReport] = useState(false);
  const [samePerson, setSamePerson] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => extracted.results.map(fromExtracted));
  const [collectedAt, setCollectedAt] = useState(extracted.detectedDate?.date ?? '');
  const [labName, setLabName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, change: Partial<Draft>) =>
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const edit = (key: number, change: Partial<Draft>) => update(key, { ...change, edited: true });
  // After a row needing a check is resolved, move on to the next thing to do (see effect below).
  const advanceFrom = useRef<number | null>(null);
  const resolve = (d: Draft, change: Partial<Draft>) => {
    if (d.status === 'pending' && change.status && change.status !== 'pending') advanceFrom.current = d.key;
    update(d.key, change);
  };

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

  const chosen = patient?.kind === 'existing' ? data.profiles.find((p) => p.id === patient.id) ?? null : null;
  const warnings = chosen ? mismatchReasons(chosen, detected) : [];
  const duplicate = chosen
    ? findDuplicate(forProfile(data, chosen.id).reports, forProfile(data, chosen.id).results, {
        collectedAt,
        sourceFileName: extracted.fileName,
        results: confirmed.filter((d) => isNumber(d.value)).map((d) => ({ markerId: d.markerId, value: Number(d.value) })),
      })
    : null;

  // Everything still blocking Save, each linked to where it can be fixed.
  const blockers: { text: string; target: string | null }[] = [];
  if (!patient) blockers.push({ text: 'choose who this report is for', target: 'review-patient' });
  if (patient?.kind === 'new' && !newName.trim()) blockers.push({ text: 'patient name missing', target: 'review-new-name' });
  if (warnings.length && !samePerson) blockers.push({ text: 'confirm it’s the same person', target: 'review-mismatch' });
  if (duplicate && !differentReport) blockers.push({ text: 'possible duplicate report', target: 'review-duplicate' });
  if (!collectedAt) blockers.push({ text: 'date missing', target: 'review-date' });
  if (pending.length) blockers.push({ text: `${plural(pending.length, 'result')} to check`, target: rowId(pending[0].key) });
  if (invalid.length) blockers.push({ text: `${plural(invalid.length, 'value')} to fix`, target: rowId(invalid[0].key) });
  if (!confirmed.length) blockers.push({ text: 'keep at least one result', target: null });

  const done = blockers.length === 0 && ready === total && total > 0;

  // Next after "Looks right"/"Reject": the next row still to check (after this one, then from
  // the top), else whatever still blocks Save, else the Save button itself.
  useEffect(() => {
    const from = advanceFrom.current;
    if (from === null) return;
    advanceFrom.current = null;
    const order = flagged.map((d) => d.key);
    const at = order.indexOf(from);
    const next = [...flagged.slice(at + 1), ...flagged.slice(0, at)].find((d) => d.status === 'pending');
    if (next) jumpTo(rowId(next.key), '[data-primary]');
    else {
      const target = blockers.find((b) => b.target)?.target;
      jumpTo(target ?? 'review-save');
    }
  });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let profileId: string;
      if (patient?.kind === 'existing' && chosen) {
        profileId = chosen.id;
        // Remember the printed name (and sex) so future reports can be suggested for this patient.
        const knownName = detected.name && chosen.aliases.some((a) => a.toLowerCase() === detected.name!.toLowerCase());
        if ((detected.name && !knownName) || (!chosen.sex && detected.sex)) {
          await storage.updateProfile(chosen.id, {
            aliases: detected.name && !knownName ? [...chosen.aliases, detected.name] : chosen.aliases,
            sex: chosen.sex ?? detected.sex,
          });
        }
      } else {
        const created = await storage.createProfile({
          name: newName.trim(),
          aliases: detected.name ? [detected.name] : [],
          sex: detected.sex,
        });
        profileId = created.id;
      }
      await storage.saveReport(
        profileId,
        { collectedAt, labName: labName.trim() || null, sourceFileName: extracted.fileName },
        confirmed.map(toNewResult),
      );
      await data.reload();
      onSaved(profileId);
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

      <fieldset className="app-patient-pick" id="review-patient">
        <legend>Who is this report for?</legend>
        <p className="app-muted">
          {detected.name ? (
            <>
              Name on the report: <strong>{detected.name}</strong>
              {[detected.sex, detected.age !== null ? `${detected.age} years` : null].filter(Boolean).map((t) => ` · ${t}`)}
            </>
          ) : (
            'No patient name was found on the report.'
          )}
        </p>
        <div className="app-patient-options">
          {[...data.profiles]
            .sort((a, b) => (a.id === suggested?.id ? -1 : b.id === suggested?.id ? 1 : 0))
            .map((p) => (
              <label key={p.id} className="app-option-row">
                <input
                  type="radio"
                  name="patient"
                  checked={patient?.kind === 'existing' && patient.id === p.id}
                  onChange={() => {
                    setPatient({ kind: 'existing', id: p.id });
                    setDifferentReport(false);
                    setSamePerson(false);
                  }}
                />
                <span>
                  <strong>{p.name}</strong>
                  {otherNames(p).length > 0 && <span className="app-muted"> · on reports: {otherNames(p).join(', ')}</span>}
                </span>
                {p.id === suggested?.id && <span className="app-chip app-chip-confirmed">Suggested</span>}
              </label>
            ))}
          <label className="app-option-row">
            <input type="radio" name="patient" checked={patient?.kind === 'new'} onChange={() => setPatient({ kind: 'new' })} />
            <span>
              <strong>New patient</strong>
            </span>
          </label>
          {patient?.kind === 'new' && (
            <label className="app-field app-new-patient">
              <span>Patient name (you can use “Me”, “Dad”…)</span>
              <input id="review-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </label>
          )}
        </div>
        {warnings.length > 0 && (
          <div className="app-warning" id="review-mismatch" role="alert">
            {warnings.map((w) => <p key={w}>{w}</p>)}
            <label className="app-option-row">
              <input type="checkbox" checked={samePerson} onChange={(e) => setSamePerson(e.target.checked)} />
              <span>Yes, this is the same person</span>
            </label>
          </div>
        )}
        {duplicate && (
          <div className="app-warning" id="review-duplicate" role="alert">
            <p>
              This looks like a report you’ve already added for {chosen?.name}: {formatDate(duplicate.collectedAt)}
              {duplicate.sourceFileName ? `, ${duplicate.sourceFileName}` : ''}.
            </p>
            <label className="app-option-row">
              <input type="checkbox" checked={differentReport} onChange={(e) => setDifferentReport(e.target.checked)} />
              <span>It’s a different report, save it anyway</span>
            </label>
          </div>
        )}
      </fieldset>

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
              <ResultEditor key={d.key} draft={d} onUpdate={(c) => resolve(d, c)} onEdit={(c) => edit(d.key, c)} />
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

      <div className={`app-savebar${done ? ' app-savebar-done' : ''}`}>
        <progress className="app-savebar-progress" value={ready} max={Math.max(total, 1)} aria-labelledby="review-progress-label" />
        <div className="app-savebar-status" aria-live="polite">
          <p id="review-progress-label" className="app-savebar-headline">
            {done
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
          <button id="review-save" type="button" className="app-btn app-btn-primary" onClick={save} disabled={saving || blockers.length > 0}>
            {saving ? 'Saving…' : `Save ${plural(confirmed.length, 'result')}`}
          </button>
        </div>
      </div>
    </section>
  );
}

const rowId = (key: number) => `result-${key}`;

/**
 * Scrolls to a row, field or button and focuses it (or, inside it, the element matching
 * `focus`, by default its first input), so the next action is one click away.
 */
function jumpTo(id: string, focus = 'input:not([readonly]), select') {
  const el = document.getElementById(id);
  if (!el) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  const target = el.matches('input, select, button') ? el : el.querySelector<HTMLElement>(focus);
  target?.focus({ preventScroll: true });
}

type EditorProps = {
  draft: Draft;
  /** Status changes. */
  onUpdate: (change: Partial<Draft>) => void;
  /** Field changes; marks the result as edited by the user. */
  onEdit: (change: Partial<Draft>) => void;
};

/** "12–15.5", "< 200", "> 40" or "no range", from the draft's range fields. */
function draftRange(d: Draft): string {
  if (d.refLow && d.refHigh) return `${d.refLow}–${d.refHigh}`;
  if (d.refHigh) return `≤ ${d.refHigh}`;
  if (d.refLow) return `≥ ${d.refLow}`;
  return 'no range';
}

function ResultEditor({ draft: d, onUpdate, onEdit }: EditorProps) {
  const marker = d.markerId ? markerById.get(d.markerId) : undefined;
  const issues = d.source?.issues ?? [];
  const errors = d.status === 'confirmed' ? problems(d) : [];
  const disabled = d.status === 'rejected';
  const original = d.source?.original;
  // Confident, untouched rows are one line to skim; the form opens on Edit. Rows needing a
  // check, edited or added rows, and rows with a problem always show the form.
  const [open, setOpen] = useState(false);
  const compact = !open && !d.flagged && !d.edited && d.source !== null && errors.length === 0;

  if (compact) {
    return (
      <li id={rowId(d.key)} className={`app-result app-result-compact app-result-${d.status}`}>
        <div className="app-result-line">
          <span className="app-result-name">{d.name}</span>
          <span className="app-result-detail">
            <span className="app-result-value">
              {d.value} <span className="app-muted">{d.unit}</span>
            </span>
            <span className="app-result-range app-muted">{draftRange(d)}</span>
          </span>
        </div>
        <div className="app-result-actions">
          {d.status === 'rejected' ? (
            <button type="button" className="app-btn app-btn-sm" onClick={() => onUpdate({ status: 'confirmed' })}>
              Undo reject
            </button>
          ) : (
            <>
              <button type="button" className="app-btn app-btn-sm" onClick={() => setOpen(true)} aria-label={`Edit ${d.name}`}>
                Edit
              </button>
              <button type="button" className="app-btn app-btn-sm" onClick={() => onUpdate({ status: 'rejected' })} aria-label={`Reject ${d.name}`}>
                Reject
              </button>
            </>
          )}
        </div>
      </li>
    );
  }

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
          <button type="button" className="app-btn app-btn-primary app-btn-sm" data-primary onClick={() => onUpdate({ status: 'confirmed' })}>
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
