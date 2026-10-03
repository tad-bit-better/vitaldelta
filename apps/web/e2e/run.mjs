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
  'r2.pdf': { patient: ARJUN, date: '12/07/2023', rows: [['Hemoglobin (Hb)', '13.3', 'g/dL', '13.5 - 17.5'], ['Cholesterol, Total', '205', 'mg/dL', '< 200']] },
  'r3.pdf': { patient: ARJUN, date: '20/03/2024', rows: [['Haemoglobin', '12.4', 'g/dL', '13.0 - 17.0'], ['Total Cholesterol', '247', 'mg/dL', '< 200'], ['TSH', '4.0', 'uIU/mL', '0.4 - 4.2']] },
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
const waitFor = async (expression, label) => {
  for (let i = 0; i < 80; i++) {
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
const pickPatient = (name) =>
  evaluate(`(() => { const o = [...document.querySelectorAll('.app-patient-options .app-option-row')].find((o) => o.innerText.includes(${JSON.stringify(name)})); o?.querySelector('input').click(); return !!o; })()`);
const saveBar = () => text('.app-savebar-status');
const saveEnabled = () => evaluate(`![...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Save ')).disabled`);

/** Uploads a report; `beforeReview` runs while low-confidence rows are still pending. */
const addReport = (file, beforeReview) => addReportWith(() => upload(file), beforeReview);

async function addReportWith(pick, beforeReview = async () => {}) {
  await click('+ Add a report') || (await click('Add a report'));
  await waitFor(`!!document.querySelector('input[type=file]')`, 'upload screen');
  await pick();
  await waitForText('Who is this report for?');
  await beforeReview();
  while (await click('Looks right')) await sleep(30);
}
const layoutButton = (name) =>
  `[...document.querySelectorAll('[aria-label="Layout"] button')].find((b) => b.innerText.includes(${JSON.stringify(name)}))`;
const layout = () => evaluate(`document.querySelector('.app-tests')?.classList.contains('app-tests-grid') ? 'grid' : 'list'`);
async function shot(name, width = 1280) {
  if (!process.env.SHOTS) return;
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: width < 600 });
  await sleep(300);
  const { data } = (await send('Page.captureScreenshot', { captureBeyondViewport: true, clip: await evaluate(
    `(() => { const r = document.querySelector('.app-group:has(.app-tests)').getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 16, width: ${width}, height: r.height + 32, scale: 1 }; })()`) })).result;
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
  await goto('/');
  await a11y('landing page');
  await goto('/app?demo=1');
  await waitForText('Asha Rao (sample)');
  check((await evaluate(`document.querySelectorAll('.app-patient').length`)) === 2, 'demo opens with two sample patients');
  check((await text('.app-content h1')) === 'Asha Rao (sample)' && (await evaluate('document.title')) === 'Asha Rao (sample) · VitalDelta', 'demo shows the first sample dashboard, with a page title');
  await a11y('dashboard');
  await fullShot('demo');
  await addReportWith(() => click('Use a made-up sample report'));
  const options = (await text('.app-patient-options')) ?? '';
  check(/^Asha Rao \(sample\)[^]*?Suggested[^]*Vikram/.test(options), 'sample report reads through the real pipeline and suggests its patient');
  await a11y('review');
  await pickPatient('Asha Rao (sample)');
  await save();
  check((await text('.app-patient[aria-current="page"]'))?.includes('5 reports'), 'sample report saved in the demo');
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
  await waitForText('No reports yet');
  await addReport('r1.pdf');
  check((await text('.app-patient-pick > p'))?.includes('Arjun Mehta · male · 34 years'), 'patient name, sex and age detected');
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
  await waitForText('No reports yet');
  await addReport('r1.pdf', async () => {
    check((await text('.app-result-pending'))?.includes('Homocysteine'), 'unrecognised test is held for review');
  });
  await pickPatient('New patient');
  await save();
  for (const file of ['r2.pdf', 'r3.pdf']) {
    await addReport(file);
    check((await text('.app-patient-options'))?.includes('Arjun Mehta Suggested'), `${file}: existing patient suggested`);
    await pickPatient('Arjun Mehta');
    await save();
  }
  await addReport('p1.pdf');
  await pickPatient('Arjun Mehta');
  check((await text('#review-mismatch'))?.includes('The report is for “Priya Nair”'), 'wrong patient: name mismatch explained');
  check(!(await saveEnabled()), 'wrong patient: save blocked until confirmed');
  await pickPatient('New patient');
  await save();
  check((await evaluate(`document.querySelectorAll('.app-patient').length`)) === 2, 'sidebar lists two patients');

  await addReport('r3.pdf');
  await pickPatient('Arjun Mehta');
  check(Boolean(await text('#review-duplicate')), 'duplicate report flagged');
  check(!(await saveEnabled()), 'duplicate: save blocked until confirmed');
  await click('Discard');
  await sleep(300);

  // ---------- Dashboard and test page ----------
  console.log('\nDashboard');
  await evaluate(`[...document.querySelectorAll('.app-patient')].find((a) => a.innerText.includes('Arjun')).click()`);
  await sleep(400);
  const groups = await evaluate(`[...document.querySelectorAll('.app-test-group h3')].map((h) => h.innerText)`);
  check(groups[0]?.startsWith('Outside the range'), 'tests needing attention listed first');
  check((await text('.app-highlights'))?.includes('Total cholesterol changed by +20%'), 'since-last-report change shown');
  check((await text('.app-highlights'))?.includes('Falling across your last 3 results'), 'steady trend shown');
  check((await layout()) === 'grid', 'tests shown as cards by default');
  await shot('grid');
  await shot('grid-phone', 400);
  await evaluate(`${layoutButton('List')}.click()`);
  await sleep(200);
  await shot('list');
  await evaluate(`[...document.querySelectorAll('.app-test')].find((a) => a.innerText.startsWith('Haemoglobin')).click()`);
  await waitFor(`!!document.querySelector('.chart svg')`, 'trend chart');
  await a11y('test page');
  await evaluate('history.back()');
  await sleep(600);
  check((await layout()) === 'list', 'list layout kept after opening a test and going back');
  await evaluate(`[...document.querySelectorAll('.app-test')].find((a) => a.innerText.startsWith('Haemoglobin')).click()`);
  await waitFor(`!!document.querySelector('.chart svg')`, 'trend chart');
  check((await evaluate(`document.querySelectorAll('.chart-mark').length`)) === 3, 'chart plots all three results');
  await send('Page.reload');
  check(await waitFor(`!!document.querySelector('.chart svg')`, 'chart after reload'), 'test page survives reload');
  await evaluate('history.back()');
  await sleep(600);
  check((await text('.app-content h1')) === 'Arjun Mehta', 'back button returns to the patient');

  // A report with no printed range falls back to the guideline range, and says so.
  await evaluate(`[...document.querySelectorAll('.app-patient')].find((a) => a.innerText.includes('Priya')).click()`);
  await sleep(400);
  const card = await evaluate(`[...document.querySelectorAll('.app-test')].find((a) => a.innerText.startsWith('HbA1c'))?.innerText`);
  check(card?.includes('Above range'), 'HbA1c without a printed range is flagged against the guideline');
  await evaluate(`[...document.querySelectorAll('.app-test')].find((a) => a.innerText.startsWith('HbA1c')).click()`);
  await waitFor(`!!document.querySelector('.chart svg')`, 'HbA1c chart');
  const page = await text('.app-content');
  check(page?.includes('Above the guideline range by 7%') && page.includes('< 5.7 · ADA guideline'), 'test page names the guideline and its source');
  await evaluate(`[...document.querySelectorAll('.app-patient')].find((a) => a.innerText.includes('Arjun')).click()`);
  await sleep(400);

  // ---------- Doctor summary ----------
  console.log('\nDoctor summary');
  await clickLink('Doctor summary');
  await waitFor(`!!document.querySelector('.summary-table')`, 'summary table');
  await a11y('doctor summary');
  const captions = await evaluate(`[...document.querySelectorAll('.summary-table caption')].map((c) => c.innerText)`);
  check(captions[0]?.startsWith('Outside or near the range (3)') && captions[1]?.startsWith('Other tests'), 'attention table first, then other tests');
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
    await evaluate(`getComputedStyle(document.querySelector('.app-sidebar')).display === 'none' && getComputedStyle(document.querySelector('.summary-actions')).display === 'none' && getComputedStyle(document.body).backgroundColor !== 'rgb(6, 17, 12)'`),
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
  await click('Delete all data');
  await click('Delete everything');
  await waitForText('Where should your results live?');
  check((await text('.app-choice-notice')) === 'All data deleted.', 'delete all returns to the first screen');
  check((await evaluate(`indexedDB.databases().then((d) => d.length)`)) === 0, 'delete all removed the database');
  await click('Save on this device');
  await waitForText('No reports yet');
  await clickLink('Your data');
  await waitForText('Backup file');
  if (backupFile) {
    await upload(backupFile.slice(work.length + 1));
    await waitForText('Will add 2 patients and 4 reports');
    await click('Restore');
    await waitForText('Restored 2 patients');
    check((await evaluate(`document.querySelectorAll('.app-patient').length`)) === 2, 'restore brings both patients back');
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
    check(Boolean(await text('.app-patient-options')), 'a PDF is read offline');
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
