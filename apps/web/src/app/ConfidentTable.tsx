import { useState } from 'react';
import { Icon } from './icons';
import ResultFields from './ResultFields';
import { draftRange, problems, rowId, type Draft } from './reviewDrafts';

type Props = {
  drafts: Draft[];
  selectedKey: number | null;
  onSelect: (key: number) => void;
  onUpdate: (key: number, change: Partial<Draft>) => void;
  onEdit: (key: number, change: Partial<Draft>) => void;
};

/**
 * Results read with high confidence, one line each to skim. Selecting a row shows it on the
 * page; the pencil opens its fields under the row. Added rows and rows with a problem stay open.
 */
export default function ConfidentTable({ drafts, selectedKey, onSelect, onUpdate, onEdit }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (key: number, on: boolean) =>
    setOpen((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <div className="rv-table-wrap">
      <table className="rv-table">
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">Result</th>
            <th scope="col">Range</th>
            <th scope="col"><span className="app-visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((d) => {
            const errors = d.status === 'confirmed' ? problems(d) : [];
            const editing = d.status !== 'rejected' && (open.has(d.key) || !d.source || errors.length > 0);
            if (editing) {
              return (
                <tr key={d.key} id={rowId(d.key)} className="rv-edit-row">
                  <td colSpan={4}>
                    <ResultFields draft={d} onEdit={(c) => onEdit(d.key, c)} showTest={!d.source || !d.markerId} />
                    {errors.length > 0 && <p className="app-error">{errors.join(' ')}</p>}
                    <div className="rv-actions">
                      <button type="button" className="app-btn app-btn-sm" disabled={errors.length > 0} onClick={() => toggle(d.key, false)}>
                        Done
                      </button>
                      <button type="button" className="app-btn app-btn-sm app-btn-quiet" onClick={() => { toggle(d.key, false); onUpdate(d.key, { status: 'rejected' }); }}>
                        Don’t save
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }
            const rejected = d.status === 'rejected';
            return (
              <tr
                key={d.key}
                id={rowId(d.key)}
                className={`rv-row${rejected ? ' rv-row-rejected' : ''}${selectedKey === d.key ? ' rv-row-selected' : ''}`}
                onClick={() => onSelect(d.key)}
              >
                <th scope="row">
                  {d.name}
                  {d.edited && !rejected && <span className="rv-tag">edited</span>}
                  {d.source?.method && <span className="rv-method">{d.source.method}</span>}
                </th>
                <td className="app-mono">
                  <strong>{d.value}</strong> <span className="rv-unit">{d.unit}</span>
                </td>
                <td className="app-mono">{draftRange(d)}</td>
                <td className="rv-row-action">
                  {rejected ? (
                    <button type="button" className="app-link-btn" onClick={(e) => { e.stopPropagation(); onUpdate(d.key, { status: 'confirmed' }); }}>
                      Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rv-icon-btn"
                      aria-label={`Edit ${d.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(d.key);
                        toggle(d.key, true);
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
  );
}
