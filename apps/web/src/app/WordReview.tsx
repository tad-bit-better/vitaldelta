import { wordStatus } from '@vitaldelta/extraction';
import { useState } from 'react';
import { Icon } from './icons';
import { WORD_STATUS } from './status';
import { wordProblems, wordRowId, type WordDraft } from './wordDrafts';

type Props = {
  words: WordDraft[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onChange: (key: string, change: Partial<WordDraft>) => void;
};

/** Results printed as words on the review screen: skim, select to see on the page, edit or don't save. */
export default function WordReview({ words, selectedKey, onSelect, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const kept = words.filter((w) => w.status === 'confirmed').length;
  return (
    <section className="rv-section" aria-labelledby="rv-words">
      <div className="rv-section-head">
        <h2 id="rv-words">Results in words</h2>
        <span className="rv-count">{kept} result{kept === 1 ? '' : 's'}</span>
      </div>
      <p className="app-muted">Like “Negative” or “Non Reactive”. Each is compared only with the expected result printed beside it.</p>
      <div className="rv-table-wrap">
        <table className="rv-table">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Result</th>
              <th scope="col">Expected</th>
              <th scope="col"><span className="app-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {words.map((w) => {
              const errors = w.status === 'confirmed' ? wordProblems(w) : [];
              const edit = (change: Partial<WordDraft>) => onChange(w.key, { ...change, edited: true });
              if (w.status !== 'rejected' && (open === w.key || errors.length > 0)) {
                return (
                  <tr key={w.key} id={wordRowId(w.key)} className="rv-edit-row">
                    <td colSpan={4}>
                      <div className="rv-fields">
                        <label className="app-field rv-field-test">
                          <span>Test</span>
                          <input value={w.name} onChange={(e) => edit({ name: e.target.value })} />
                        </label>
                        <label className="app-field">
                          <span>Result</span>
                          <input value={w.text} onChange={(e) => edit({ text: e.target.value })} />
                        </label>
                        <label className="app-field">
                          <span>Expected (optional)</span>
                          <input value={w.expected} onChange={(e) => edit({ expected: e.target.value })} />
                        </label>
                      </div>
                      {errors.length > 0 && <p className="app-error">{errors.join(' ')}</p>}
                      <div className="rv-actions">
                        <button type="button" className="app-btn app-btn-sm" disabled={errors.length > 0} onClick={() => setOpen(null)}>Done</button>
                        <button type="button" className="app-btn app-btn-sm app-btn-quiet" onClick={() => { setOpen(null); onChange(w.key, { status: 'rejected' }); }}>
                          Don’t save
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              const rejected = w.status === 'rejected';
              const status = WORD_STATUS[wordStatus(w.text, w.expected || null)];
              return (
                <tr
                  key={w.key}
                  id={wordRowId(w.key)}
                  className={`rv-row${rejected ? ' rv-row-rejected' : ''}${selectedKey === w.key ? ' rv-row-selected' : ''}`}
                  onClick={() => onSelect(w.key)}
                >
                  <th scope="row">
                    {w.name}
                    {w.edited && !rejected && <span className="rv-tag">edited</span>}
                  </th>
                  <td>
                    <strong>{w.text}</strong>
                    {!rejected && w.expected && (
                      <span className={`app-status app-status-${status.tone} rv-word-status`}>
                        <span aria-hidden="true">{status.icon}</span> {status.label}
                      </span>
                    )}
                  </td>
                  <td>{w.expected || '—'}</td>
                  <td className="rv-row-action">
                    {rejected ? (
                      <button type="button" className="app-link-btn" onClick={(e) => { e.stopPropagation(); onChange(w.key, { status: 'confirmed' }); }}>
                        Undo
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rv-icon-btn"
                        aria-label={`Edit ${w.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(w.key);
                          setOpen(w.key);
                        }}
                      >
                        <Icon name="edit" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
