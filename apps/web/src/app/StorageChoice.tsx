import type { StorageMode } from '../storage/types';

type Props = { onChoose: (mode: StorageMode) => void };

/** First-use choice between saving on this device and a session that leaves nothing behind. */
export default function StorageChoice({ onChoose }: Props) {
  return (
    <section className="app-card app-choice">
      <h1>Where should your results live?</h1>
      <p className="app-muted">
        Everything stays in this browser. Nothing is uploaded, and there's no account.
      </p>
      <div className="app-choice-options">
        <button type="button" className="app-option" onClick={() => onChoose('persistent')}>
          <strong>Save on this device</strong>
          <span>Keep reports in this browser to track changes over time. Use on your own device.</span>
        </button>
        <button type="button" className="app-option" onClick={() => onChoose('session')}>
          <strong>Just this session</strong>
          <span>Nothing is written to disk. Closing this tab erases everything.</span>
        </button>
      </div>
      <p className="app-note">
        On a shared or public computer, choose <strong>Just this session</strong> or use a private window, and
        delete the downloaded PDF afterwards. This app can't remove files from your downloads.
      </p>
      <p className="app-note">
        Saved data belongs to this browser on this device. It won't appear on your phone or in another browser.
      </p>
    </section>
  );
}
