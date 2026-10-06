// Screenshots of every screen (landing, dashboard, test, summary, your data, upload, review,
// first screen, welcome) using the demo data, one image per screenful. For checking layouts by eye,
// especially on phones.
//
//   pnpm --filter web build && (cd apps/web && npx vite preview --port 4194 &)
//   node apps/web/scripts/screenshots.mjs http://localhost:4194 /tmp/shots        # phone, 390px
//   node apps/web/scripts/screenshots.mjs http://localhost:4194 /tmp/shots 1280   # desktop
//   PAGES=3 ... for up to three screenfuls per page (default 3).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [base, outDir, width = '390'] = process.argv.slice(2);
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9346', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mob-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 40 && !targets; i++) { try { targets = await (await fetch('http://127.0.0.1:9346/json/list')).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.id) pending.get(m.id)?.(m); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: 844, deviceScaleFactor: 2, mobile: Number(width) < 600 });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const PAGES = Number(process.env.PAGES ?? 3);
const shot = async (name) => {
  await sleep(500);
  const height = await ev('document.documentElement.scrollHeight');
  for (let i = 0; i < PAGES && i * 844 < height; i++) {
    await ev(`window.scrollTo(0, ${i * 844})`);
    await sleep(250);
    const { result } = await send('Page.captureScreenshot', {});
    writeFileSync(join(outDir, `${name}-${i}.png`), Buffer.from(result.data, 'base64'));
  }
  await ev('window.scrollTo(0, 0)');
  console.log('saved', name, height, await ev('document.documentElement.scrollWidth'));
};
const go = async (path) => { await send('Page.navigate', { url: base + path }); await sleep(1500); };
const click = (sel, text) => ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.innerText.trim().startsWith(${JSON.stringify(text)})); el?.click(); return !!el; })()`);
await go('/'); await shot('1-landing');
await go('/app?demo=1'); await sleep(800); await shot('2-dashboard');
await click('.app-results-name a', 'HbA1c'); await sleep(800); await shot('3-test');
await ev('history.back()'); await sleep(800);
await click('a', 'Summary for the doctor'); await sleep(800); await shot('4-summary');
await click('a', 'Your data'); await sleep(800); await shot('5-data');
await click('button', 'Add a report'); await sleep(800); await shot('6-upload');
await click('button', 'Use a made-up sample report'); await sleep(2500); await shot('7-review');
await click('button', 'Exit demo'); await sleep(800); await shot('8-choice');
await click('button', 'Just this session'); await sleep(800); await shot('9-welcome');
ws.close(); chrome.kill();
