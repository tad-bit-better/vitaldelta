import Link from './Link';
import { DATA_PATH, navigate } from './router';

const STEPS = [
  { title: 'Add a lab report PDF', text: 'It’s read here in your browser and never uploaded.' },
  { title: 'Check what was read', text: 'Confirm the values and who the report is for before anything is saved.' },
  { title: 'See what changed', text: 'Each new report is compared with the last, test by test.' },
];

/** First screen before any report is saved: one clear action, the steps ahead, and two quieter ways in. */
export default function Welcome({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="app-card app-welcome">
      <h1>Add your first report</h1>
      <ol className="app-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="app-step-number" aria-hidden="true">{i + 1}</span>
            <span>
              <strong>{s.title}</strong>
              <span className="app-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div>
        <button type="button" className="app-btn app-btn-primary app-welcome-cta" onClick={() => navigate('/app/add')}>
          Add a report
        </button>
      </div>
      <p className="app-note">
        No report handy?{' '}
        <button type="button" className="app-link-btn" onClick={onDemo}>
          Try it with made-up sample reports
        </button>
        . Moving from another browser or device? <Link to={DATA_PATH}>Restore a backup</Link>.
      </p>
    </section>
  );
}
