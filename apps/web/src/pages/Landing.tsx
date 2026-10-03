import './Landing.css';

type LandingProps = {
  /** Where "Get started" goes, e.g. the app's upload screen. */
  startHref?: string;
  /** Where "Try with sample reports" goes, e.g. the app in demo mode. */
  demoHref?: string;
  githubHref?: string;
};

const checkpoints = [
  { x: 30, y: 140, label: 'Jan' },
  { x: 150, y: 125, label: 'Apr' },
  { x: 270, y: 110, label: 'Jul' },
  { x: 390, y: 92, label: 'Oct' },
  { x: 490, y: 64, label: 'Jan' },
];

export default function Landing({
  startHref = '/app',
  demoHref = '/app?demo=1',
  githubHref = 'https://github.com/tad-bit-better/vitaldelta',
}: LandingProps) {
  const linePath = checkpoints.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

  return (
    <div className="lp">
      <header className="lp-container lp-nav">
        <a href="#top" className="lp-logo">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="28" height="28" rx="8" stroke="var(--accent)" strokeWidth="1.5" />
            <path d="M6 20 L11 15 L15 17 L20 10 L24 12" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>VitalDelta</span>
        </a>
        <nav aria-label="Main" className="lp-nav-links">
          <a href="#how" className="lp-nav-section">How it works</a>
          <a href="#privacy" className="lp-nav-section">Privacy</a>
          <a href={githubHref}>GitHub</a>
          {/* Phones hide this: the hero's own button is right below. */}
          <a href={startHref} className="lp-btn lp-btn-primary lp-btn-sm lp-nav-cta">Get started</a>
        </nav>
      </header>

      <main>
        <section id="top" className="lp-container lp-hero">
          <div className="lp-hero-copy">
            <div className="lp-pill"><span className="lp-dot" />Open source · Free · No account needed</div>
            <h1>See how your lab results <span className="lp-glow-text">change over time.</span></h1>
            <p className="lp-lead">
              Drop in your lab report PDFs. VitalDelta reads the values, shows what changed since last time and flags
              anything outside range — all inside your browser. Nothing is uploaded.
            </p>
            <div className="lp-actions">
              <a href={startHref} className="lp-btn lp-btn-primary">
                Get started
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <a href={demoHref} className="lp-btn lp-btn-ghost">Try with sample reports</a>
            </div>
            <p className="lp-note">No signup. Works offline once loaded.</p>
          </div>

          <div className="lp-hero-visual">
            <div className="lp-halo" />
            <div className="lp-card">
              <div className="lp-card-head">
                <div>
                  <div className="lp-label">Fasting glucose</div>
                  <div className="lp-value">108 <small>mg/dL</small></div>
                </div>
                <span className="lp-flag">Above range</span>
              </div>
              <svg
                viewBox="0 0 520 220"
                className="lp-chart"
                role="img"
                aria-label="Sample trend: fasting glucose rising from 88 to 108 mg/dL over five reports, crossing above the 70 to 99 reference range"
              >
                <rect x="0" y="86" width="520" height="94" fill="var(--glow-faint)" />
                <line x1="0" y1="86" x2="520" y2="86" stroke="var(--line-strong)" strokeDasharray="4 6" />
                <line x1="0" y1="180" x2="520" y2="180" stroke="var(--line-strong)" strokeDasharray="4 6" />
                <text x="512" y="80" textAnchor="end" fill="var(--text-3)" fontSize="12">99</text>
                <text x="512" y="198" textAnchor="end" fill="var(--text-3)" fontSize="12">70</text>
                <path d={linePath} className="lp-line" stroke="var(--accent)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {checkpoints.map((p, i) =>
                  i === checkpoints.length - 1 ? (
                    <circle key={i} cx={p.x} cy={p.y} r="7" fill="var(--accent)" className="lp-last" />
                  ) : (
                    <circle key={i} cx={p.x} cy={p.y} r="5" fill="var(--card)" stroke="var(--accent)" strokeWidth="2.5" />
                  ),
                )}
                {checkpoints.map((p, i) => (
                  <text key={`l${i}`} x={p.x} y="214" textAnchor="middle" fill="var(--text-3)" fontSize="12">{p.label}</text>
                ))}
              </svg>
              <div className="lp-rows">
                <div><span>Vitamin D</span><span className="lp-up">+38% since last report</span></div>
                <div><span>LDL cholesterol</span><span className="lp-muted">In range</span></div>
                <div><span>Haemoglobin</span><span className="lp-muted">Steady across 5 reports</span></div>
              </div>
              <div className="lp-sample lp-sample-gap">Sample data</div>
            </div>
          </div>
        </section>

        <section id="how" className="lp-band">
          <div className="lp-container lp-section">
            <div className="lp-section-head">
              <div className="lp-eyebrow">How it works</div>
              <h2 className="lp-h2">From a stack of PDFs to a clear picture in three steps</h2>
            </div>
            <ol className="lp-steps">
              <li className="lp-step">
                <div className="lp-step-num" aria-hidden="true">01</div>
                <h3>Add your report</h3>
                <p className="lp-muted">Pick a lab report PDF from any lab. It's read right here in your browser.</p>
              </li>
              <li className="lp-step">
                <div className="lp-step-num" aria-hidden="true">02</div>
                <h3>Check the values</h3>
                <p className="lp-muted">Confirm what was read. Anything uncertain is highlighted for a quick look.</p>
              </li>
              <li className="lp-step">
                <div className="lp-step-num" aria-hidden="true">03</div>
                <h3>See what changed</h3>
                <p className="lp-muted">Trends for every marker, with anything outside range or drifting brought to the top.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="privacy" className="lp-container lp-split">
          <div className="lp-split-copy">
            <div className="lp-eyebrow">Privacy</div>
            <h2 className="lp-h2">Your reports never leave your device</h2>
            <p className="lp-muted">
              There's no server holding your health data, because there's no server at all. Everything stays in this
              browser on this device.
            </p>
          </div>
          <div className="lp-split-side">
            <div className="lp-feature">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="4" y="3" width="20" height="22" rx="3" stroke="var(--accent)" strokeWidth="1.8" />
                <path d="M9 10h10M9 14h10M9 18h6" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div>
                <h3>Read in your browser</h3>
                <p className="lp-muted">PDFs are processed on your device. Nothing is uploaded, not even for a moment.</p>
              </div>
            </div>
            <div className="lp-feature">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <circle cx="14" cy="10" r="5" stroke="var(--accent)" strokeWidth="1.8" />
                <path d="M5 24c1.5-4.5 5-6.5 9-6.5s7.5 2 9 6.5" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M4 4l20 20" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div>
                <h3>No accounts, no tracking</h3>
                <p className="lp-muted">No signup, no email, no analytics. We don't know who you are, and that's the point.</p>
              </div>
            </div>
            <div className="lp-feature">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path d="M14 3l9 4v6c0 6-4 10-9 12-5-2-9-6-9-12V7l9-4z" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M10 14l3 3 5-6" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <h3>Enforced, not just promised</h3>
                <p className="lp-muted">
                  A strict security policy tells your browser to block any connection to other servers. Open source, so
                  anyone can check.
                </p>
              </div>
            </div>
            <p className="lp-shared">
              On a shared or public computer? Choose <strong>Just this session</strong> and nothing is saved when you
              close the tab.
            </p>
          </div>
        </section>

        <section className="lp-band">
          <div className="lp-container lp-split lp-split-center">
            <div className="lp-summary">
              <div className="lp-summary-head lp-label"><span>Visit summary</span><span>Since last visit</span></div>
              <div className="lp-summary-row"><span>Fasting glucose</span><span className="lp-warn">101 → 108 · above range</span></div>
              <div className="lp-summary-row"><span>Vitamin D</span><span className="lp-up">21 → 29 · up 38%</span></div>
              <div className="lp-summary-row"><span>ALT</span><span className="lp-muted">Rising for 3 reports</span></div>
              <div className="lp-sample">Sample data</div>
            </div>
            <div className="lp-split-copy">
              <div className="lp-eyebrow">For your next appointment</div>
              <h2 className="lp-h2">Walk in with one page, not a folder</h2>
              <p className="lp-muted">
                Get a one-page summary of only what changed or sits outside range since your last visit. Save it as a
                PDF or share it from your phone.
              </p>
            </div>
          </div>
        </section>

        <section id="start" className="lp-container lp-cta">
          <h2>Your results, <span className="lp-glow-text">finally in one place.</span></h2>
          <p className="lp-muted lp-cta-sub">
            Free and open source. Start with your own report, or explore with sample data first.
          </p>
          <div className="lp-actions">
            <a href={startHref} className="lp-btn lp-btn-primary">Get started</a>
            <a href={demoHref} className="lp-btn lp-btn-ghost">Try with sample reports</a>
          </div>
          <p className="lp-disclaimer">
            VitalDelta compares your values with the ranges printed on your report. It doesn't diagnose anything — please
            talk to your doctor about what your results mean.
          </p>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container">
          <span>VitalDelta · open source, private by design</span>
          <nav aria-label="Footer">
            <a href="#privacy">Privacy</a>
            <a href={githubHref}>GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
