import { markers } from '@vitaldelta/extraction';

const GITHUB = 'https://github.com/tad-bit-better/vitaldelta';
const guidelines = markers.filter((m) => m.guideline);

/** What the app is, how it keeps data private, where its ranges come from, and licences. */
export default function About() {
  return (
    <section className="app-card app-about">
      <div>
        <h1>About VitalDelta</h1>
        <p className="app-muted">
          VitalDelta reads lab report PDFs and shows how each result changed across reports, so you can bring a short
          summary to your doctor.
        </p>
      </div>

      <div className="app-group">
        <h2>Your reports stay on your device</h2>
        <p>
          There is no server and no account. PDFs are read by this page in your browser, and results are saved in your
          browser’s storage (or only in memory, if you chose “Just this session”). The site’s security policy stops the
          browser from sending data anywhere else, and there are no analytics or trackers.
        </p>
      </div>

      <div className="app-group">
        <h2>Not medical advice</h2>
        <p>
          VitalDelta shows what your reports say and how values changed. It doesn’t diagnose anything. Reading a PDF can
          go wrong, so check values against the report, and talk to your doctor about what your results mean.
        </p>
      </div>

      <div className="app-group">
        <h2>Where ranges come from</h2>
        <p>
          The range printed on each report is used whenever there is one. Only when a report prints none does VitalDelta
          use a published guideline limit for these tests, and it always says so:
        </p>
        <ul className="app-about-list">
          {guidelines.map((m) => (
            <li key={m.id}>
              {m.name}: {m.guideline!.source}
            </li>
          ))}
        </ul>
      </div>

      <div className="app-group">
        <h2>Open source</h2>
        <p>
          VitalDelta is free and open source under the MIT licence. The code is on{' '}
          <a className="app-inline-link" href={GITHUB}>GitHub</a>.
        </p>
      </div>

      <div className="app-group">
        <h2>Licences and notices</h2>
        <p className="app-note">
          This material contains content from LOINC® (
          <a className="app-inline-link" href="https://loinc.org">https://loinc.org</a>). LOINC is copyright © Regenstrief
          Institute, Inc. and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no
          cost under the license at{' '}
          <a className="app-inline-link" href="https://loinc.org/license">https://loinc.org/license</a>. LOINC® is a
          registered United States trademark of Regenstrief Institute, Inc.
        </p>
        <p className="app-note">
          Built with pdf.js (Apache 2.0), Tesseract.js (Apache 2.0), React (MIT) and Dexie (Apache 2.0). Fonts: Bricolage Grotesque, Manrope and IBM
          Plex Mono (SIL Open Font License 1.1). All are served from this site; nothing is loaded from elsewhere.
        </p>
      </div>
    </section>
  );
}
