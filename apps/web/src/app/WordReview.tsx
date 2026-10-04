import { wordStatus } from '@vitaldelta/extraction';
import { useState } from 'react';
import { WORD_STATUS } from './status';
import { wordProblems, wordRowId, type WordDraft } from './wordDrafts';

function WordRow({ draft: d, onChange }: { draft: WordDraft; onChange: (change: Partial<WordDraft>) => void }) {
  const errors = d.status === 'confirmed' ? wordProblems(d) : [];
  const [open, setOpen] = useState(false);
  const status = WORD_STATUS[wordStatus(d.text, d.expected || null)];
  const edit = (change: Partial<WordDraft>) => onChange({ ...change, edited: true });

  if (!open && errors.length === 0) {
    return (
      <li id={wordRowId(d.key)} className={`app-result app-result-compact app-result-${d.status}`}>
        <div className="app-result-line">
          <span className="app-result-name">{d.name}</span>
          <span className="app-result-detail">
            <span className="app-result-value">{d.text}</span>
            <span className="app-result-range app-muted">{d.expected ? `expected ${d.expected}` : 'no expected result'}</span>
            {d.status !== 'rejected' && d.expected && (
              <span className={`app-status app-status-${status.tone}`}>
                <span aria-hidden="true">{status.icon}</span> {status.label}
              </span>
            )}
          </span>
        </div>
        <div className="app-result-actions">
          {d.status === 'rejected' ? (
            <button type="button" className="app-btn app-btn-sm" onClick={() => onChange({ status: 'confirmed' })}>
              Undo reject
            </button>
          ) : (
            <>
              <button type="button" className="app-btn app-btn-sm" onClick={() => setOpen(true)} aria-label={`Edit ${d.name}`}>
                Edit
              </button>
              <button type="button" className="app-btn app-btn-sm" onClick={() => onChange({ status: 'rejected' })} aria-label={`Reject ${d.name}`}>
                Reject
              </button>
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <li id={wordRowId(d.key)} className={`app-result app-result-${d.status}`}>
      <div className="app-result-fields">
        <label className="app-field app-field-wide">
          <span>Test</span>
          <input value={d.name} onChange={(e) => edit({ name: e.target.value })} />
        </label>
        <label className="app-field">
          <span>Result</span>
          <input value={d.text} onChange={(e) => edit({ text: e.target.value })} />
        </label>
        <label className="app-field">
          <span>Expected (optional)</span>
          <input value={d.expected} onChange={(e) => edit({ expected: e.target.value })} />
        </label>
      </div>
      {d.source && (
        <p className="app-printed">
          Printed: {d.source.name} · {d.source.text}
          {d.source.expected ? ` · expected ${d.source.expected}` : ''}
        </p>
      )}
      {errors.length > 0 && <p className="app-error">{errors.join(' ')}</p>}
      <div className="app-result-actions">
        <button type="button" className="app-btn app-btn-sm" onClick={() => setOpen(false)} disabled={errors.length > 0}>
          Done
        </button>
        <button type="button" className="app-btn app-btn-sm" onClick={() => onChange({ status: 'rejected' })}>
          Reject
        </button>
      </div>
    </li>
  );
}

/** Results printed as words on the review screen: skim, edit or reject. */
export default function WordReview({ words, onChange }: { words: WordDraft[]; onChange: (key: string, change: Partial<WordDraft>) => void }) {
  const kept = words.filter((w) => w.status === 'confirmed').length;
  return (
    <div className="app-group">
      <div className="app-group-head">
        <h2>Results in words</h2>
        <span className="app-progress">
          {kept} result{kept === 1 ? '' : 's'}
        </span>
      </div>
      <p className="app-muted">
        Results printed as words, like “Negative” or “Non Reactive”. Each is compared only with the expected result
        printed beside it.
      </p>
      <ul className="app-results">
        {words.map((w) => (
          <WordRow key={w.key} draft={w} onChange={(c) => onChange(w.key, c)} />
        ))}
      </ul>
    </div>
  );
}
