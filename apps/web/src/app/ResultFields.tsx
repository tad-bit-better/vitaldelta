import { markerById, sortedMarkers, type Draft } from './reviewDrafts';

/**
 * The editable parts of a result: value, unit and range, and optionally which test it is.
 * A recognised test's standard unit is fixed (values are stored in it).
 */
export default function ResultFields({ draft: d, onEdit, showTest }: { draft: Draft; onEdit: (change: Partial<Draft>) => void; showTest: boolean }) {
  const marker = d.markerId ? markerById.get(d.markerId) : undefined;
  return (
    <div className="rv-fields" onClick={(e) => e.stopPropagation()}>
      {showTest && (
        <label className="app-field rv-field-test">
          <span>Test</span>
          <select
            value={d.markerId ?? ''}
            onChange={(e) => {
              const next = e.target.value ? markerById.get(e.target.value)! : null;
              onEdit(
                next
                  ? { markerId: next.id, name: next.name, unit: next.unit }
                  : { markerId: null, name: d.source?.printedName ?? d.name, unit: d.source?.original.unit ?? d.unit },
              );
            }}
          >
            <option value="">Not in the list (use the printed name)</option>
            {sortedMarkers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {!marker && (
            <input aria-label="Test name" placeholder="Test name as printed" value={d.name} onChange={(e) => onEdit({ name: e.target.value })} />
          )}
        </label>
      )}
      <label className="app-field">
        <span>Value</span>
        <input className="app-mono" inputMode="decimal" value={d.value} onChange={(e) => onEdit({ value: e.target.value })} />
      </label>
      <label className="app-field">
        <span>Unit</span>
        {marker && d.unit === marker.unit ? (
          <input className="app-mono" value={d.unit} readOnly title="Values are stored in this test’s standard unit" />
        ) : (
          <input className="app-mono" value={d.unit} onChange={(e) => onEdit({ unit: e.target.value })} />
        )}
      </label>
      <label className="app-field">
        <span>Range low</span>
        <input className="app-mono" inputMode="decimal" placeholder="Not printed" value={d.refLow} onChange={(e) => onEdit({ refLow: e.target.value })} />
      </label>
      <label className="app-field">
        <span>Range high</span>
        <input className="app-mono" inputMode="decimal" placeholder="Not printed" value={d.refHigh} onChange={(e) => onEdit({ refHigh: e.target.value })} />
      </label>
    </div>
  );
}
