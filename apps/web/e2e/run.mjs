// End-to-end test: drives headless Chrome over the DevTools protocol against the
// production build served by `vite preview` (which applies the real CSP from vercel.json).
// Uses synthetic PDFs generated here; never real reports.
//
//   pnpm e2e                                   build, serve locally, test
//   BASE=https://vitaldelta.app node apps/web/e2e/run.mjs   test a deployment (no build)
//   CHROME=/path/to/chrome ...                 if Chrome isn't in the default place
//   SHOTS=/some/dir ...                        also save dashboard screenshots there
//
// Exits non-zero if any check fails.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) {
  console.error('Chrome not found. Set CHROME=/path/to/chrome.');
  process.exit(2);
}

const PORT = 4180;
const local = !process.env.BASE;
const base = process.env.BASE ?? `http://localhost:${PORT}`;
const work = mkdtempSync(join(tmpdir(), 'vitaldelta-e2e-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

// ---------- Synthetic reports ----------

const ARJUN = 'Patient Name : Mr. ARJUN MEHTA   Age/Sex : 34 Y / M';
const PRIYA = 'Patient Name : Mrs. PRIYA NAIR   Age/Sex : 58 Y / F';
const REPORTS = {
  'r1.pdf': { patient: ARJUN, date: '05/01/2023', rows: [['Haemoglobin', '14.6', 'g/dL', '13.0 - 17.0'], ['Total Cholesterol', '182', 'mg/dL', '< 200'], ['Homocysteine', '12', 'umol/L', '5 - 15']] },
  'r2.pdf': { patient: ARJUN, date: '12/07/2023', rows: [['Hemoglobin (Hb)', '13.3', 'g/dL', '13.5 - 17.5'], ['Cholesterol, Total', '205', 'mg/dL', '< 200'], ['Urine Protein', 'Negative', 'Negative']] },
  'r3.pdf': { patient: ARJUN, date: '20/03/2024', rows: [['Haemoglobin', '12.4', 'g/dL', '13.0 - 17.0'], ['Total Cholesterol', '247', 'mg/dL', '< 200'], ['TSH - CLIA', '4.0', 'uIU/mL', '0.4 - 4.2'], ['Urine Protein', 'Trace', 'Negative']] },
  'p1.pdf': { patient: PRIYA, date: '02/05/2024', rows: [['Haemoglobin', '11.9', 'g/dL', '12.0 - 15.5'], ['TSH', '5.1', 'uIU/mL', '0.4 - 4.2'], ['HbA1c', '6.1', '%', '']] },
};

function writePdf(file, { patient, date, rows }) {
  const lines = [[patient], [`Sample Collected On : ${date}`], ['Test Name', 'Result', 'Unit', 'Reference Range'], ...rows];
  const xs = [40, 220, 300, 400];
  let y = 740;
  let ops = 'BT /F1 10 Tf ';
  for (const line of lines) {
    line.forEach((t, i) => (ops += `1 0 0 1 ${xs[i]} ${y} Tm (${t}) Tj `));
    y -= 16;
  }
  ops += 'ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(join(work, file), out);
}
for (const [file, report] of Object.entries(REPORTS)) writePdf(file, report);

// ---------- Servers and browser ----------

// Own process group, so stopping it (for the offline test) also stops the server npx starts.
const preview = local
  ? spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore', detached: true })
  : null;
const stopPreview = () => {
  try {
    if (preview) process.kill(-preview.pid);
  } catch {
    // Already stopped.
  }
};
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${join(work, 'chrome')}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const cleanup = async () => {
  const exited = new Promise((r) => chrome.once('exit', r));
  chrome.kill();
  stopPreview();
  await Promise.race([exited, sleep(3000)]);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};

let targets;
for (let i = 0; i < 60 && !targets; i++) {
  try {
    targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
    if (local) await fetch(base);
  } catch {
    targets = undefined;
    await sleep(250);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let nextId = 0;
const pending = new Map();
const problems = [];
const hosts = new Set();
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && pending.has(m.id)) return void (pending.get(m.id)(m), pending.delete(m.id));
  if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Log.entryAdded' && m.params.entry.source === 'security') problems.push(`security: ${m.params.entry.text.slice(0, 200)}`);
  if (m.method === 'Network.requestWillBeSent') {
    const url = new URL(m.params.request.url);
    if (url.protocol.startsWith('http')) hosts.add(url.host);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText.replace(/\\s+/g, ' ').trim() ?? null`);
const waitFor = async (expression, label, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return true;
    await sleep(250);
  }
  check(false, `timed out waiting for ${label}`);
  return false;
};
const waitForText = (t) => waitFor(`document.body.innerText.includes(${JSON.stringify(t)})`, `"${t}"`);
const click = (label) =>
  evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(label)})); b?.click(); return !!b; })()`);
const goto = async (path) => {
  await send('Page.navigate', { url: `${base}${path}` });
  await sleep(800);
};
const upload = async (file) => {
  const { result: { root } } = await send('DOM.getDocument', { depth: -1 });
  const { result: { nodeId } } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { nodeId, files: [join(work, file)] });
};
const clickLink = (label) =>
  evaluate(`(() => { const a = [...document.querySelectorAll('a')].find((a) => a.innerText.trim().startsWith(${JSON.stringify(label)})); a?.click(); return !!a; })()`);
// "Report is for" is a select: pick the option whose text includes the name.
const pickPatient = (name) =>
  evaluate(`(() => { const s = document.querySelector('#review-patient'); const o = [...s.options].find((o) => o.text.includes(${JSON.stringify(name)})); if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const patientOptions = () => evaluate(`[...document.querySelectorAll('#review-patient option')].slice(1).map((o) => o.text).join(' | ')`);
const saveBar = () => text('.rv-savebar-status');
const saveEnabled = () => evaluate(`![...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Save ')).disabled`);

/** Uploads a report; `beforeReview` runs while low-confidence rows are still pending. */
const addReport = (file, beforeReview) => addReportWith(() => upload(file), beforeReview);

async function addReportWith(pick, beforeReview = async () => {}) {
  await click('+ Add a report') || (await click('Add a report'));
  await waitFor(`!!document.querySelector('input[type=file]')`, 'upload screen');
  await pick();
  await waitForText('Report is for');
  await beforeReview();
  // Answer every check card with its main button ("The value is right", "Yes, it's …").
  while (await evaluate(`(() => { const b = document.querySelector('.rv-check [data-primary]:not(:disabled)'); b?.click(); return !!b; })()`)) await sleep(30);
}
// Patients are listed in the top bar's switcher menu (clickable even while it's closed).
const PATIENTS = `[...document.querySelectorAll('.app-switcher .app-menu-item:not(.app-menu-footer)')]`;
const patientCount = () => evaluate(`${PATIENTS}.length`);
const openPatient = (name) => evaluate(`${PATIENTS}.find((a) => a.innerText.includes(${JSON.stringify(name)})).click()`);
const openTest = (name) => evaluate(`[...document.querySelectorAll('.app-results-name a')].find((a) => a.innerText.startsWith(${JSON.stringify(name)})).click()`);
const resultRow = (name) => evaluate(`[...document.querySelectorAll('.app-results-row')].find((r) => r.querySelector('.app-results-name').innerText.startsWith(${JSON.stringify(name)}))?.innerText`);
const groupLabels = () => evaluate(`[...document.querySelectorAll('.app-results-group th')].map((h) => h.textContent)`);
const viewButton = (name) => `[...document.querySelectorAll('[aria-label="Group results"] button')].find((b) => b.innerText === ${JSON.stringify(name)})`;
async function shot(name, width = 1280) {
  if (!process.env.SHOTS) return;
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: width < 600 });
  await sleep(300);
  const { data } = (await send('Page.captureScreenshot', { captureBeyondViewport: true, clip: await evaluate(
    `(() => { const r = document.querySelector('.app-group:has(.app-results-table)').getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 16, width: ${width}, height: r.height + 32, scale: 1 }; })()`) })).result;
  writeFileSync(join(process.env.SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
}

// axe-core accessibility checks; fails on serious or critical problems.
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
async function a11y(label) {
  if (!(await evaluate(`typeof axe !== 'undefined'`))) await evaluate(axeSource);
  // Contrast is measured on finished screens, not mid fade-in.
  await evaluate('Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished))');
  const found = await evaluate(`axe.run(document, { resultTypes: ['violations'] }).then((r) => r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id + ': ' + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')))`);
  check(Array.isArray(found) && found.length === 0, `${label}: no serious accessibility problems${found?.length ? `:\n    ${found.join('\n    ')}` : ''}`);
}

/** With SHOTS=dir, saves a full-page screenshot. */
async function fullShot(name) {
  if (!process.env.SHOTS) return;
  const shot = (await send('Page.captureScreenshot', { captureBeyondViewport: true })).result;
  writeFileSync(join(process.env.SHOTS, `${name}.png`), Buffer.from(shot.data, 'base64'));
}

async function save() {
  await click('Save ');
  await waitForText('Report saved.');
}

for (const domain of ['Runtime', 'Log', 'Page', 'DOM', 'Network']) await send(`${domain}.enable`);
// Like Safari (every iOS browser): streams can't be looped with `for await`. pdf.js's
// getTextContent did that, and every PDF failed on iPhone while Chrome was fine.
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete ReadableStream.prototype[Symbol.asyncIterator]; delete ReadableStream.prototype.values;' });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

try {
  // ---------- Session mode: nothing on disk ----------
  // ---------- What crawlers see (no JavaScript) ----------
  console.log('\nCrawlers and link previews');
  const landingHtml = await (await fetch(`${base}/`)).text();
  check(landingHtml.includes('See how your lab results') && landingHtml.includes('Nothing is uploaded'), 'landing page text is in the HTML (prerendered)');
  check(['og:title', 'og:description', 'og:image', 'twitter:card'].every((t) => landingHtml.includes(t)), 'link preview tags present');
  const og = await fetch(`${base}/og.png`);
  check(og.ok && og.headers.get('content-type') === 'image/png', 'og.png is served');
  const appHtml = await (await fetch(`${base}/app/p/x/tests/y`)).text();
  check(!appHtml.includes('See how your lab results') && appHtml.includes('noindex'), 'app pages get the empty, noindex shell');

  // ---------- Demo ----------
  console.log('\nDemo');
  await goto('/app/about');
  check(await waitForText('This material contains content from LOINC'), 'About page shows the LOINC notice, before choosing where data lives');
  await a11y('about page');
  await goto('/');
  await a11y('landing page');
  await goto('/app?demo=1');
  await waitForText('Asha Rao (sample)');
  check((await patientCount()) === 2, 'demo opens with two sample patients');
  check((await text('.app-content h1')) === 'Asha Rao (sample)' && (await evaluate('document.title')) === 'Asha Rao (sample) · VitalDelta', 'demo shows the first sample dashboard, with a page title');
  await a11y('dashboard');
  await fullShot('demo');
  await addReportWith(() => click('Use a made-up sample report'));
  check(/^Asha Rao \(sample\) \(suggested\) \| Vikram/.test((await patientOptions()) ?? ''), 'sample report reads through the real pipeline and suggests its patient');
  check(await waitFor(`document.querySelector('.rv-page img')?.complete && document.querySelector('.rv-mark-selected') !== null`, 'page image'), 'the PDF page is shown beside the results, with the value highlighted');
  await a11y('review');
  check(await evaluate(`!!document.activeElement?.closest('#review-patient')`), 'after the last row to check, focus moves to the next thing to do (choose the patient)');
  await pickPatient('Asha Rao (sample)');
  await save();
  check((await evaluate(`${PATIENTS}.find((a) => a.getAttribute('aria-current') === 'page')?.textContent`))?.includes('5 reports'), 'sample report saved in the demo');
  check(await evaluate(`document.activeElement === document.querySelector('main h1')`), 'focus moves to the new page’s heading');
  await click('Exit demo');
  await waitForText('Where should your results live?');
  check((await evaluate(`indexedDB.databases().then((d) => d.length)`)) === 0, 'demo wrote nothing to disk');
  await a11y('first screen');
  await fullShot('first-screen');

  console.log('\nSession mode');
  await goto('/app');
  await waitForText('Where should your results live?');
  await click('Just this session');
  await waitForText('Add your first report');
  await addReport('r1.pdf');
  check((await text('#review-detected'))?.includes('Arjun Mehta · male · 34 years'), 'patient name, sex and age detected');
  check(!(await saveEnabled()) && (await saveBar()).includes('choose who this report is for'), 'save blocked until a patient is chosen');
  await pickPatient('New patient');
  check((await evaluate(`document.querySelector('#review-new-name').value`)) === 'Arjun Mehta', 'new patient pre-filled with detected name');
  await save();
  check((await evaluate(`indexedDB.databases().then((d) => d.length)`)) === 0, 'session mode wrote no database');
  await goto('/app');
  check(await waitForText('Where should your results live?'), 'session data gone after reload');

  // ---------- Saved on this device ----------
  console.log('\nSaved on this device, two patients');
  await click('Save on this device');
  await waitForText('Add your first report');
  await addReport('r1.pdf', async () => {
    check((await text('.rv-check'))?.includes('Homocysteine') && (await text('.rv-check'))?.includes('Name not recognised'), 'unrecognised test is held for review');
    check(await waitFor(`document.querySelector('.rv-check .rv-snippet img')?.complete`, 'snippet'), 'each value to check shows where it was printed');
  });
  await pickPatient('New patient');
  await save();
  for (const file of ['r2.pdf', 'r3.pdf']) {
    await addReport(file);
    check((await patientOptions())?.startsWith('Arjun Mehta (suggested)'), `${file}: existing patient suggested`);
    await pickPatient('Arjun Mehta');
    await save();
  }
  await addReport('p1.pdf');
  await pickPatient('Arjun Mehta');
  check((await text('#review-mismatch'))?.includes('The report is for “Priya Nair”'), 'wrong patient: name mismatch explained');
  check(!(await saveEnabled()), 'wrong patient: save blocked until confirmed');
  await pickPatient('New patient');
  await save();
  check((await patientCount()) === 2, 'patient switcher lists two patients');

  await addReport('r3.pdf');
  await pickPatient('Arjun Mehta');
  check(Boolean(await text('#review-duplicate')), 'duplicate report flagged');
  check(!(await saveEnabled()), 'duplicate: save blocked until confirmed');
  await click('Discard');
  await sleep(300);

  // ---------- Scanned report (OCR) ----------
  // A made-up report drawn on a canvas (synthetic values only), saved as a JPEG and uploaded
  // as a photo would be. First OCR fetches the engine (~6.5 MB, own origin), so waits are long.
  console.log('\nScanned report (OCR)');
  const jpeg = await evaluate(`(() => {
    const c = document.createElement('canvas'); c.width = 1240; c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111'; g.font = '28px Arial';
    const rows = [['Patient Name : Mr. ARJUN MEHTA'], ['Sample Collected On : 10/06/2022'],
      ['Test Name', 'Result', 'Unit', 'Reference Range'],
      ['Haemoglobin', '14.1', 'g/dL', '13.0 - 17.0'],
      ['Total Cholesterol', '190', 'mg/dL', '< 200']];
    const xs = [60, 560, 740, 900];
    let y = 80;
    for (const row of rows) { row.forEach((t, i) => g.fillText(t, xs[i], y)); y += 48; }
    return c.toDataURL('image/jpeg', 0.95);
  })()`);
  writeFileSync(join(work, 'scan.jpg'), Buffer.from(jpeg.split(',')[1], 'base64'));
  await click('+ Add a report') || (await click('Add a report'));
  await waitFor(`!!document.querySelector('input[type=file]')`, 'upload screen');
  await upload('scan.jpg');
  check(await waitFor(`document.body.innerText.includes('Report is for')`, 'OCR review', 360), 'a photo of a report is read by OCR');
  check((await patientOptions())?.includes('Arjun Mehta (suggested)'), 'OCR report suggests its patient');
  check((await evaluate(`document.body.innerText.includes('Read from a scan')`)), 'OCR rows are held for review, marked as read from a scan');
  check(
    await evaluate(`(() => { const c = [...document.querySelectorAll('.rv-check')].find((c) => c.innerText.includes('Haemoglobin')); return !!c && [...c.querySelectorAll('input')].some((i) => i.value === '14.1'); })()`),
    'OCR read the printed value correctly',
  );
  check(await waitFor(`[...document.querySelectorAll('.rv-check .rv-snippet img')].some((i) => i.complete && i.naturalWidth > 0)`, 'OCR snippet'), 'each OCR value shows where it sits on the photo');
  await click('Discard');
  await sleep(300);

  // ---------- Dashboard and test page ----------
  console.log('\nDashboard');
  await openPatient('Arjun');
  await sleep(400);
  const panels = await groupLabels();
  check(panels.length > 1 && !panels.includes('Outside the range') && panels.at(-1) === 'Results in words', 'results grouped by panel by default, results in words last');
  check((await text('.app-tile-since'))?.includes('changed by 10% or more'), 'since-last-report change shown');
  check((await text('.app-tile-since'))?.includes('moved the same way 3 or more times'), 'steady trend shown');
  check((await resultRow('Total cholesterol'))?.includes('+20%'), 'each test shows its change');
  const word = await resultRow('Urine Protein');
  check(word?.includes('Trace') && word.includes('Differs from expected') && word.includes('Was Negative'), 'a word result shows the expected word and what it was before');
  check((await evaluate(`document.querySelectorAll('.app-bar-dot').length`)) > 3, 'values drawn on their range');
  check((await text('.app-pill'))?.includes('Not backed up') && Boolean(await text('.app-side-warn')), 'no backup yet: the bar and the dashboard say so');
  await evaluate(`${viewButton('Needs attention first')}.click()`);
  await sleep(200);
  check((await groupLabels())[0] === 'Outside the range', 'needs attention first puts tests outside the range first');
  await shot('dashboard');
  await shot('dashboard-phone', 400);
  await openTest('Haemoglobin');
  await waitFor(`!!document.querySelector('.chart svg')`, 'trend chart');
  await a11y('test page');
  await evaluate('history.back()');
  await sleep(600);
  check((await groupLabels())[0] === 'Outside the range', 'grouping kept after opening a test and going back');
  await openTest('Haemoglobin');
  await waitFor(`!!document.querySelector('.chart svg')`, 'trend chart');
  check((await evaluate(`document.querySelectorAll('.chart-mark').length`)) === 3, 'chart plots all three results');
  await evaluate('history.back()');
  await sleep(600);
  await openTest('TSH');
  await waitFor(`!!document.querySelector('.app-table')`, 'TSH results');
  check((await text('.app-table'))?.includes('CLIA'), 'a method printed with the name ("TSH - CLIA") is split off and shown');
  await evaluate('history.back()');
  await sleep(600);
  await openTest('Haemoglobin');
  await waitFor(`!!document.querySelector('.chart svg')`, 'trend chart');
  await send('Page.reload');
  check(await waitFor(`!!document.querySelector('.chart svg')`, 'chart after reload'), 'test page survives reload');
  await evaluate('history.back()');
  await sleep(600);
  check((await text('.app-content h1')) === 'Arjun Mehta', 'back button returns to the patient');

  // A report with no printed range falls back to the guideline range, and says so.
  await openPatient('Priya');
  await sleep(400);
  check((await resultRow('HbA1c'))?.includes('Above range'), 'HbA1c without a printed range is flagged against the guideline');
  await openTest('HbA1c');
  await waitFor(`!!document.querySelector('.chart svg')`, 'HbA1c chart');
  const page = await text('.app-content');
  check(page?.includes('Above the guideline range by 7%') && page.includes('< 5.7 · ADA 2026 guideline'), 'test page names the guideline and its source');
  await openPatient('Arjun');
  await sleep(400);

  // ---------- Doctor summary ----------
  console.log('\nDoctor summary');
  await clickLink('Summary for the doctor');
  await waitFor(`!!document.querySelector('.summary-table')`, 'summary table');
  await a11y('doctor summary');
  const captions = await evaluate(`[...document.querySelectorAll('.summary-table caption')].map((c) => c.innerText)`);
  check(
    captions[0]?.startsWith('Outside or near the range (3)') && captions[1]?.startsWith('Results in words (1)') && captions.at(-1)?.startsWith('Other tests'),
    'attention table first, then results in words, then other tests',
  );
  const firstTable = await text('.summary-table');
  check(firstTable?.includes('Total cholesterol') && firstTable.includes('+20%') && firstTable.includes('▲ Above range'), 'summary rows show value, change and status label');
  check((await text('.summary-notes'))?.includes('Haemoglobin: falling across the last 3 results'), 'summary lists steady trends');
  if (process.env.SHOTS) {
    const { data } = (await send('Page.printToPDF', { preferCSSPageSize: true })).result;
    writeFileSync(join(process.env.SHOTS, 'summary.pdf'), Buffer.from(data, 'base64'));
    const shot = (await send('Page.captureScreenshot', { captureBeyondViewport: true })).result;
    writeFileSync(join(process.env.SHOTS, 'summary.png'), Buffer.from(shot.data, 'base64'));
  }
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  check(
    await evaluate(`getComputedStyle(document.querySelector('.app-bar')).display === 'none' && getComputedStyle(document.querySelector('.summary-actions')).display === 'none' && getComputedStyle(document.body).backgroundColor !== 'rgb(6, 17, 12)'`),
    'print view shows only the summary',
  );
  await send('Emulation.setEmulatedMedia', { media: '' });

  // ---------- Backup, delete all, restore ----------
  console.log('\nYour data');
  const downloads = join(work, 'downloads');
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await clickLink('Your data');
  await waitForText('Download backup');
  await click('Download backup');
  const backupFile = await (async () => {
    for (let i = 0; i < 50; i++, await sleep(100)) {
      const f = existsSync(downloads) && readdirSync(downloads).find((n) => /^vitaldelta-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n));
      if (f) return join(downloads, f);
    }
    return null;
  })();
  const backup = backupFile && JSON.parse(readFileSync(backupFile, 'utf8'));
  check(backup?.profiles.length === 2 && backup.reports.length === 4, 'backup downloads with both patients and all reports');
  check(await waitFor(`document.querySelector('.app-pill')?.innerText.startsWith('Backed up')`, 'backed-up pill'), 'after a backup, the bar says when it was made');
  await click('Delete all data');
  await click('Delete everything');
  await waitForText('Where should your results live?');
  check((await text('.app-choice-notice')) === 'All data deleted.', 'delete all returns to the first screen');
  check((await evaluate(`indexedDB.databases().then((d) => d.length)`)) === 0, 'delete all removed the database');
  await click('Save on this device');
  await waitForText('Add your first report');
  check(!(await evaluate(`!!document.querySelector('.app-switcher, .app-bottom-bar')`)), 'welcome screen stands alone (no patient switcher before the first report)');
  await clickLink('Restore a backup');
  await waitForText('Backup file');
  if (backupFile) {
    await upload(backupFile.slice(work.length + 1));
    await waitForText('Will add 2 patients and 4 reports');
    await click('Restore');
    await waitForText('Restored 2 patients');
    check((await patientCount()) === 2, 'restore brings both patients back');
    await upload(backupFile.slice(work.length + 1));
    await waitForText('All of it is already here.');
    if (process.env.SHOTS) {
      const shot = (await send('Page.captureScreenshot', { captureBeyondViewport: true })).result;
      writeFileSync(join(process.env.SHOTS, 'data.png'), Buffer.from(shot.data, 'base64'));
    }
    check(await evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText === 'Restore').disabled`), 'restoring the same backup twice adds nothing');
    await a11y('your data');
  }

  // ---------- Offline ----------
  if (local) {
    console.log('\nOffline');
    await goto('/app');
    check(
      await waitFor(
        `navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller && caches.keys()).then((k) => k && k.some((n) => /^vitaldelta-[0-9a-f]{12}$/.test(n)))`,
        'service worker',
      ),
      'service worker installed and controls the page',
    );
    stopPreview();
    await sleep(500);
    check(await fetch(base).then(() => false, () => true), 'server stopped');
    await goto('/app');
    check(await waitForText('Arjun Mehta'), 'app opens offline with saved data');
    await addReport('r1.pdf');
    check(Boolean(await text('#review-patient')), 'a PDF is read offline');
    await click('Discard');
  }

  // ---------- Privacy ----------
  console.log('\nPrivacy');
  const expected = new URL(base).host;
  check([...hosts].every((h) => h === expected), `only ${expected} contacted (saw: ${[...hosts].join(', ')})`);
  check(problems.length === 0, `no CSP violations, exceptions or console errors${problems.length ? `:\n    ${problems.join('\n    ')}` : ''}`);
  await evaluate(`indexedDB.deleteDatabase('vitaldelta')`);
} finally {
  ws.close();
  await cleanup();
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
