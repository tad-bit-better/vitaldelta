// Regenerates public/og.png (the link preview image) from the landing page's hero.
// The page is laid out at a desktop width, then scaled down to 1200x630.
//
//   pnpm --filter web build && (cd apps/web && npx vite preview --port 4193 &)
//   node apps/web/scripts/og-image.mjs http://localhost:4193/ apps/web/public/og.png 1440
//
// Needs Chrome (macOS path below; pass CHROME= elsewhere).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, out, w = '1200'] = process.argv.slice(2);
const W = Number(w), H = Math.round((W * 630) / 1200);
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9344', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'og-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets; for (let i = 0; i < 40 && !targets; i++) { try { targets = await (await fetch('http://127.0.0.1:9344/json/list')).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.id) pending.get(m.id)?.(m); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url });
await sleep(1500);
await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
await sleep(400);
const { result } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1200 / W } });
writeFileSync(out, Buffer.from(result.data, 'base64'));
ws.close();
chrome.kill();
