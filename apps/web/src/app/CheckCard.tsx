import { useState } from 'react';
import type { PageImages } from '../pdf/pageImages';
import { SourceSnippet } from './PdfSource';
import ResultFields from './ResultFields';
import { asMarker, draftRange, ISSUE_CHIP, issueMessages, mainIssue, markerById, problems, rowId, suggestionFor, type Draft } from './reviewDrafts';

type Props = {
  draft: Draft;
  pages: PageImages | null;
  selected: boolean;
  onSelect: () => void;
  /** Status changes (moves on to the next thing to check). */
  onUpdate: (change: Partial<Draft>) => void;
  /** Field changes; marks the result as edited by the user. */
  onEdit: (change: Partial<Draft>) => void;
  onShowPage: () => void;
};

/**
 * A result held for review: where it was printed, what looks off, and the fix. Name questions
 * ("Is this Total protein?") get yes/no buttons; everything else gets the fields to correct.
 * Once answered it shrinks to one line that can be reopened.
 */
export default function CheckCard({ draft: d, pages, selected, onSelect, onUpdate, onEdit, onShowPage }: Props) {
  const [form, setForm] = useState(false);
  const issue = mainIssue(d);
  const suggestion = suggestionFor(d);
  const suggested = suggestion ? asMarker(d, suggestion) : null;
  const fuzzy = d.source?.issues.includes('fuzzy-name') && d.markerId === d.source.markerId;
  const errors = d.status === 'confirmed' ? problems(d) : [];

  if (d.status !== 'pending' && errors.length === 0) {
    return (
      <li id={rowId(d.key)} className={`rv-check rv-check-done${d.status === 'rejected' ? ' rv-check-rejected' : ''}`} onClick={onSelect}>
        <span className="rv-check-done-text">
          <span aria-hidden="true">{d.status === 'rejected' ? '✕' : '✓'}</span> <strong>{d.name}</strong>{' '}
          {d.status === 'rejected' ? 'won’t be saved' : <span className="app-mono">{d.value} {d.unit}</span>}
        </span>
        <button type="button" className="app-link-btn" onClick={() => onUpdate({ status: 'pending' })}>
          {d.status === 'rejected' ? 'Undo' : 'Change'}
        </button>
      </li>
    );
  }

  const nameQuestion = !form && (suggested || fuzzy);
  const marker = d.markerId ? markerById.get(d.markerId) : undefined;
  return (
    <li id={rowId(d.key)} className={`rv-check${selected ? ' rv-check-selected' : ''}`} onClick={onSelect}>
      <div className="rv-check-head">
        <h3>
          {d.name || 'Unnamed result'}
          {nameQuestion && (
            <span className="rv-check-inline app-mono">
              {' '}
              {d.value} {d.unit}
              {draftRange(d) !== '—' && ` · ${draftRange(d)}`}
            </span>
          )}
        </h3>
        {issue && <span className="rv-chip">{ISSUE_CHIP[issue]}</span>}
      </div>
      <SourceSnippet pages={pages} box={d.source?.box} onShowPage={onShowPage} />

      {nameQuestion && suggested && suggestion ? (
        <>
          <p>
            Is this the same test as <strong>{suggestion.name}</strong>? Matching it keeps all its reports on one trend.
          </p>
          <div className="rv-actions">
            <button type="button" className="app-btn app-btn-primary" data-primary onClick={() => onUpdate({ ...suggested, edited: true, status: 'confirmed' })}>
              Yes, it’s {suggestion.name}
            </button>
            <button type="button" className="app-btn" onClick={() => onUpdate({ status: 'confirmed' })}>Keep the printed name</button>
            <button type="button" className="app-btn app-btn-quiet" onClick={() => onUpdate({ status: 'rejected' })}>Don’t save</button>
          </div>
        </>
      ) : nameQuestion && fuzzy ? (
        <>
          <p>
            Printed as “{d.source!.printedName}”, read as <strong>{marker?.name}</strong>. Is that the right test?
          </p>
          <div className="rv-actions">
            <button type="button" className="app-btn app-btn-primary" data-primary onClick={() => onUpdate({ status: 'confirmed' })}>
              Yes, it’s {marker?.name}
            </button>
            <button type="button" className="app-btn" onClick={() => setForm(true)}>No, choose the test</button>
            <button type="button" className="app-btn app-btn-quiet" onClick={() => onUpdate({ status: 'rejected' })}>Don’t save</button>
          </div>
        </>
      ) : (
        <>
          {issueMessages(d).map((m) => <p key={m}>{m}</p>)}
          {!d.markerId && !suggested && <p>Not in our list of tests. It will be kept under the printed name.</p>}
          <ResultFields draft={d} onEdit={onEdit} showTest={form || !d.markerId || Boolean(d.source?.issues.includes('fuzzy-name'))} />
          {errors.length > 0 && <p className="app-error">{errors.join(' ')}</p>}
          <div className="rv-actions">
            <button type="button" className="app-btn app-btn-primary" data-primary disabled={problems(d).length > 0} onClick={() => onUpdate({ status: 'confirmed' })}>
              {d.edited ? 'Save this value' : 'The value is right'}
            </button>
            <button type="button" className="app-btn app-btn-quiet" onClick={() => onUpdate({ status: 'rejected' })}>Don’t save this result</button>
          </div>
        </>
      )}
    </li>
  );
}

