import { useEffect, useRef, useState } from 'react';
import CheckCard from './CheckCard';
import ConfidentTable from './ConfidentTable';
import { forProfile, useAppData } from './DataContext';
import { formatDate } from './format';
import { Icon } from './icons';
import { findDuplicate, mismatchReasons, suggestProfile } from './patients';
import { PageDialog, PageViewer, type Highlight } from './PdfSource';
import { blankDraft, fromExtracted, isNumber, problems, rowId, toNewResult, type Draft } from './reviewDrafts';
import { useStorage } from './StorageContext';
import type { Extracted } from './Upload';
import { usePageImages } from './usePageImages';
import WordReview from './WordReview';
import { fromExtractedWord, wordProblems, wordRowId, wordToNewResult, type WordDraft } from './wordDrafts';

const SOURCE_TEXT = { collected: 'collection date', received: 'received date', reported: 'report date', other: 'date' };

type Props = {
  extracted: Extracted;
  onSaved: (profileId: string) => void;
  /** Leave without saving. */
  onCancel: () => void;
  /** Back to choosing a file. */
  onBack: () => void;
  /** Leave without saving, to that patient's dashboard. */
  onOpenPatient: (profileId: string) => void;
};

/** Who the report is for: an existing patient, or a new one. Never pre-selected; the user must choose. */
type PatientChoice = { kind: 'existing'; id: string } | { kind: 'new' } | null;
type Selection = { kind: 'result'; key: number } | { kind: 'word'; key: string } | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Below this width the page viewer doesn't fit beside the list; it opens full screen instead. */
const NARROW = '(max-width: 1023px)';

/**
 * Check what was read against the PDF, then save. The page sits beside the list with the
 * selected value highlighted; results held for review come first as cards, the confident
 * rest as a table to skim.
 */
export default function Review({ extracted, onSaved, onCancel, onBack, onOpenPatient }: Props) {
  const storage = useStorage();
  const data = useAppData();
  const pages = usePageImages(extracted.source);
  const detected = extracted.patient;
  const suggested = suggestProfile(data.profiles, detected);
  const [patient, setPatient] = useState<PatientChoice>(null);
  const [newName, setNewName] = useState(detected.name ?? '');
  const [differentReport, setDifferentReport] = useState(false);
  const [samePerson, setSamePerson] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => extracted.results.map(fromExtracted));
  const [words, setWords] = useState<WordDraft[]>(() => extracted.words.map(fromExtractedWord));
  const [collectedAt, setCollectedAt] = useState(extracted.detectedDate?.date ?? '');
  const [labName, setLabName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(() => {
    const first = drafts.find((d) => d.flagged) ?? drafts[0];
    return first ? { kind: 'result', key: first.key } : words[0] ? { kind: 'word', key: words[0].key } : null;
  });
  const [dialog, setDialog] = useState(false);

  const selectedBox =
    selection?.kind === 'result'
      ? drafts.find((d) => d.key === selection.key)?.source?.box
      : selection?.kind === 'word'
        ? words.find((w) => w.key === selection.key)?.source?.box
        : undefined;
  const [page, setPage] = useState(selectedBox?.page ?? 1);
  const select = (next: Selection, openDialog = false) => {
    setSelection(next);
    const box = next?.kind === 'result' ? drafts.find((d) => d.key === next.key)?.source?.box : next?.kind === 'word' ? words.find((w) => w.key === next.key)?.source?.box : undefined;
    if (box) setPage(box.page);
    if (openDialog && box && window.matchMedia(NARROW).matches) setDialog(true);
  };

  const update = (key: number, change: Partial<Draft>) => setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const edit = (key: number, change: Partial<Draft>) => update(key, { ...change, edited: true });
  const updateWord = (key: string, change: Partial<WordDraft>) => setWords((all) => all.map((w) => (w.key === key ? { ...w, ...change } : w)));
  // After a result to check is answered, move on to the next thing to do (effect below).
  const advanceFrom = useRef<number | null>(null);
  const resolve = (d: Draft, change: Partial<Draft>) => {
    if (d.status === 'pending' && change.status && change.status !== 'pending') advanceFrom.current = d.key;
    update(d.key, change);
  };

  const flagged = drafts.filter((d) => d.flagged);
  const others = drafts.filter((d) => !d.flagged);
  const pending = drafts.filter((d) => d.status === 'pending');
  const confirmed = drafts.filter((d) => d.status === 'confirmed');
  const invalid = confirmed.filter((d) => problems(d).length);
  const keptWords = words.filter((w) => w.status === 'confirmed');
  const invalidWords = keptWords.filter((w) => wordProblems(w).length);
  const kept = confirmed.length + keptWords.length;
  const ready = kept - invalid.length - invalidWords.length;
  const total = drafts.filter((d) => d.status !== 'rejected').length + keptWords.length;

  const chosen = patient?.kind === 'existing' ? (data.profiles.find((p) => p.id === patient.id) ?? null) : null;
  const warnings = chosen ? mismatchReasons(chosen, detected) : [];
  const values = confirmed.filter((d) => isNumber(d.value)).map((d) => ({ markerId: d.markerId, value: Number(d.value) }));
  const chosenData = chosen ? forProfile(data, chosen.id) : null;
  const duplicate = chosen && chosenData ? findDuplicate(chosenData.reports, chosenData.results, { collectedAt, sourceFileName: extracted.fileName, results: values }) : null;
  const sameValues = duplicate && chosenData
    ? values.filter((v) => chosenData.results.some((r) => r.reportId === duplicate.id && r.markerId === v.markerId && r.value === v.value)).length
    : 0;

  // Everything else that blocks Save, each linked to where it's fixed. Results still to check
  // are counted separately: "Skip those and save" can resolve them in one go.
  const blockers: { text: string; target: string | null }[] = [];
  if (!patient) blockers.push({ text: 'choose who this report is for', target: 'review-patient' });
  if (patient?.kind === 'new' && !newName.trim()) blockers.push({ text: 'patient name missing', target: 'review-new-name' });
  if (warnings.length && !samePerson) blockers.push({ text: 'confirm it’s the same person', target: 'review-mismatch' });
  if (duplicate && !differentReport) blockers.push({ text: 'possible duplicate report', target: 'review-duplicate' });
  if (!collectedAt) blockers.push({ text: 'date missing', target: 'review-date' });
  if (invalid.length) blockers.push({ text: `${plural(invalid.length, 'value')} to fix`, target: rowId(invalid[0].key) });
  if (invalidWords.length) blockers.push({ text: `${plural(invalidWords.length, 'result')} to fix`, target: wordRowId(invalidWords[0].key) });
  const canSkip = pending.length > 0 && blockers.length === 0 && ready > 0;
  if (pending.length) blockers.push({ text: `${plural(pending.length, 'result')} to check`, target: rowId(pending[0].key) });
  if (!kept && !pending.length) blockers.push({ text: 'keep at least one result', target: null });

  // Next after answering a check: the next one still to check, else whatever still blocks Save, else Save.
  useEffect(() => {
    const from = advanceFrom.current;
    if (from === null) return;
    advanceFrom.current = null;
    const at = flagged.findIndex((d) => d.key === from);
    const next = [...flagged.slice(at + 1), ...flagged.slice(0, at)].find((d) => d.status === 'pending');
    if (next) {
      select({ kind: 'result', key: next.key });
      jumpTo(rowId(next.key), '[data-primary]');
    } else jumpTo(blockers.find((b) => b.target)?.target ?? 'review-save');
  });

  async function save(list: Draft[] = drafts) {
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
        profileId = (await storage.createProfile({ name: newName.trim(), aliases: detected.name ? [detected.name] : [], sex: detected.sex })).id;
      }
      await storage.saveReport(
        profileId,
        { collectedAt, labName: labName.trim() || null, sourceFileName: extracted.fileName },
        [...list.filter((d) => d.status === 'confirmed').map(toNewResult), ...keptWords.map(wordToNewResult)],
      );
      await data.reload();
      onSaved(profileId);
    } catch {
      setError('Saving failed. Your browser may be out of storage space.');
      setSaving(false);
    }
  }

  const highlights: Highlight[] = [
    ...pending.filter((d) => d.source && !(selection?.kind === 'result' && selection.key === d.key)).map((d) => ({ box: d.source!.box, tone: 'pending' as const })),
    ...(selectedBox ? [{ box: selectedBox, tone: 'selected' as const }] : []),
  ];
  const viewer = { pages, page, onPage: setPage, highlights };
  const patientValue = patient?.kind === 'existing' ? patient.id : patient?.kind === 'new' ? '__new' : '';
  const ordered = [...data.profiles].sort((a, b) => (a.id === suggested?.id ? -1 : b.id === suggested?.id ? 1 : 0));

  return (
    <section className="app-review rv">
      <header className="rv-head">
        <button type="button" className="rv-icon-btn rv-back" aria-label="Back to choosing a file" onClick={onBack}>
          <Icon name="back" size={20} />
        </button>
        <div className="rv-title">
          <h1>Check the results</h1>
          <p className="app-muted">
            From <span className="app-mono">{extracted.fileName}</span> · Nothing is saved until you choose Save.
          </p>
        </div>
        <button type="button" className="app-btn" onClick={onCancel} disabled={saving}>Discard</button>
      </header>

      {duplicate && !differentReport && (
        <div className="rv-banner" id="review-duplicate" role="alert">
          <Icon name="copy" size={20} />
          <div className="rv-banner-text">
            <strong>This looks like a report you already added</strong>
            <p>
              {chosen?.name} already has a report from {formatDate(duplicate.collectedAt)}
              {sameValues > 0 ? ` with the same ${plural(sameValues, 'value')}` : duplicate.sourceFileName ? ` from the same file` : ''}. Saving again would show the
              same results twice.
            </p>
          </div>
          <div className="rv-actions">
            <button type="button" className="app-btn" onClick={() => onOpenPatient(chosen!.id)}>Open existing report</button>
            <button type="button" className="app-btn app-btn-quiet" onClick={() => setDifferentReport(true)}>Add it anyway</button>
          </div>
        </div>
      )}

      <div className="rv-details">
        <label className="app-field">
          <span>Report is for</span>
          <select
            id="review-patient"
            value={patientValue}
            onChange={(e) => {
              const v = e.target.value;
              setPatient(v === '' ? null : v === '__new' ? { kind: 'new' } : { kind: 'existing', id: v });
              setDifferentReport(false);
              setSamePerson(false);
            }}
          >
            <option value="" disabled>Choose…</option>
            {ordered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === suggested?.id ? ' (suggested)' : ''}
              </option>
            ))}
            <option value="__new">New patient…</option>
          </select>
          <small id="review-detected">
            {detected.name
              ? `Name on the report: ${detected.name}${[detected.sex, detected.age !== null ? `${detected.age} years` : null].filter(Boolean).map((t) => ` · ${t}`).join('')}`
              : 'No name on the report, so you choose.'}
          </small>
        </label>
        <label className="app-field">
          <span>Sample collected</span>
          <input id="review-date" type="date" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} required />
          {extracted.detectedDate && collectedAt === extracted.detectedDate.date && (
            <small className="rv-found">
              <Icon name="check" size={14} /> Found the {SOURCE_TEXT[extracted.detectedDate.source]} on the report
            </small>
          )}
        </label>
        <label className="app-field">
          <span>Lab name (optional)</span>
          <input type="text" placeholder="e.g. the lab’s name" value={labName} onChange={(e) => setLabName(e.target.value)} />
        </label>
        {patient?.kind === 'new' && (
          <label className="app-field rv-new-name">
            <span>New patient’s name (you can use “Me”, “Dad”…)</span>
            <input id="review-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </label>
        )}
        {warnings.length > 0 && (
          <div className="app-warning rv-mismatch" id="review-mismatch" role="alert">
            {warnings.map((w) => <p key={w}>{w}</p>)}
            <label className="app-option-row">
              <input type="checkbox" checked={samePerson} onChange={(e) => setSamePerson(e.target.checked)} />
              <span>Yes, this is the same person</span>
            </label>
          </div>
        )}
      </div>

      <div className="rv-grid">
        <aside className="rv-side" aria-label="The report">
          <PageViewer {...viewer} />
        </aside>

        <div className="rv-main">
          {flagged.length > 0 && (
            <section className="rv-section" aria-labelledby="rv-check">
              <div className="rv-section-head">
                <h2 id="rv-check">Needs your check</h2>
                <span className={`rv-count${pending.length ? ' rv-count-warn' : ' rv-count-ok'}`}>
                  {pending.length ? `${pending.length} left` : 'All checked'}
                </span>
              </div>
              <ul className="rv-checks">
                {flagged.map((d) => (
                  <CheckCard
                    key={d.key}
                    draft={d}
                    pages={pages}
                    selected={selection?.kind === 'result' && selection.key === d.key}
                    onSelect={() => select({ kind: 'result', key: d.key })}
                    onUpdate={(c) => resolve(d, c)}
                    onEdit={(c) => edit(d.key, c)}
                    onShowPage={() => {
                      select({ kind: 'result', key: d.key });
                      setDialog(true);
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          <section className="rv-section" aria-labelledby="rv-confident">
            <div className="rv-section-head">
              <h2 id="rv-confident">{flagged.length ? 'Read with high confidence' : 'Results'}</h2>
              <span className="rv-count">{plural(others.filter((d) => d.status === 'confirmed').length, 'result')}</span>
            </div>
            <p className="app-muted">These match the PDF. Select a row to see it on the page.</p>
            <ConfidentTable
              drafts={others}
              selectedKey={selection?.kind === 'result' ? selection.key : null}
              onSelect={(key) => select({ kind: 'result', key }, true)}
              onUpdate={update}
              onEdit={edit}
            />
            <div>
              <button type="button" className="app-btn app-btn-sm" onClick={() => setDrafts((all) => [...all, blankDraft(Date.now())])}>
                <Icon name="plus" /> Add a result that was missed
              </button>
            </div>
          </section>

          {words.length > 0 && (
            <WordReview
              words={words}
              selectedKey={selection?.kind === 'word' ? selection.key : null}
              onSelect={(key) => select({ kind: 'word', key }, true)}
              onChange={updateWord}
            />
          )}
        </div>
      </div>

      <div className={`rv-savebar${blockers.length === 0 ? ' rv-savebar-done' : ''}`}>
        <div className="rv-savebar-status" aria-live="polite">
          <p id="review-progress-label" className="rv-savebar-headline">
            <strong>{ready} of {total} ready.</strong>
            {pending.length > 0 && <span className="rv-warn-text"> {pending.length} need{pending.length === 1 ? 's' : ''} your check.</span>}
          </p>
          <Segments ready={ready} pending={pending.length} invalid={invalid.length + invalidWords.length} />
          {blockers.some((b) => !b.text.endsWith('to check')) && (
            <p className="rv-savebar-todo">
              <span>Still to do:</span>
              {blockers.map((b) =>
                b.target ? (
                  <button key={b.text} type="button" className="app-link" onClick={() => jumpTo(b.target!)}>{b.text}</button>
                ) : (
                  <span key={b.text}>{b.text}</span>
                ),
              )}
            </p>
          )}
        </div>
        {error && <p className="app-error" role="alert">{error}</p>}
        <div className="rv-savebar-actions">
          {canSkip && (
            <button
              type="button"
              className="app-btn app-btn-quiet"
              disabled={saving}
              onClick={() => {
                const next = drafts.map((d) => (d.status === 'pending' ? { ...d, status: 'rejected' as const } : d));
                setDrafts(next);
                void save(next);
              }}
            >
              Skip {pending.length === 1 ? 'that one' : `those ${pending.length}`} and save {ready}
            </button>
          )}
          <button id="review-save" type="button" className="app-btn app-btn-primary" onClick={() => void save()} disabled={saving || blockers.length > 0}>
            {saving ? 'Saving…' : `Save ${plural(kept, 'result')}`}
          </button>
        </div>
      </div>

      <PageDialog open={dialog} onClose={() => setDialog(false)} {...viewer} />
    </section>
  );
}

/** One segment per result to save: ready, still to check, or with a problem. */
function Segments({ ready, pending, invalid }: { ready: number; pending: number; invalid: number }) {
  const parts = [...Array(ready).fill('ok'), ...Array(pending).fill('pending'), ...Array(invalid).fill('bad')] as string[];
  return (
    <div className={`rv-segments${parts.length > 40 ? ' rv-segments-dense' : ''}`} aria-hidden="true">
      {parts.map((p, i) => <span key={i} className={`rv-seg rv-seg-${p}`} />)}
    </div>
  );
}

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
