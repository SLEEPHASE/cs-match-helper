/**
 * probe_headless.mjs —— 用 Edge headless 真机验证注入代码是否执行
 * 用法: node probe_headless.mjs <verifyDir> <frontendAssetsDir>
 * verifyDir: 解压后的 main.mjs 所在目录（build/verifyN）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const [, , verifyDir, assetsDir] = process.argv;
const root = path.resolve('build/probe');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });

// 1) 组装站点
fs.copyFileSync(path.join(verifyDir, 'main.mjs'), path.join(root, 'assets', 'main-DWII-cul.js'));
for (const f of fs.readdirSync(assetsDir)) {
  const src = path.join(assetsDir, f);
  const dst = path.join(root, 'assets', f);
  if (fs.statSync(src).isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
}

const stub = `<script>
window.__CALLS__ = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    window.__CALLS__.push(cmd);
    if (cmd === 'get_app_version') return { name: 'CS 匹配助手', version: '4.0.2' };
    if (cmd === 'list_match_history_documents' || cmd === 'list_match_history') return [];
    return {};
  },
  transformCallback: () => 1,
  event: { listen: async () => 1, emit: async () => 1, emitTo: async () => 1, unlisten: async () => 1 },
  metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  convertFileSrc: (p) => p,
};
</script>`;

const builtIndexPath = path.join(verifyDir, "index.html");
let index;
if (fs.existsSync(builtIndexPath)) {
  index = fs.readFileSync(builtIndexPath, "utf8").replace(/<head>/i, "<head>" + stub);
} else {
  index = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>probe</title>
${stub}
<script type="module" src="/assets/main-DWII-cul.js"></script></head>
<body class="bg-base text-fg"><div id="app"></div></body></html>`;
}
fs.writeFileSync(path.join(root, 'index.html'), index);

const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/' ? path.join(root, 'index.html') : path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8899, '127.0.0.1', r));

// 2) 起 Edge headless
const profile = path.join(root, 'edge-profile');
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9333', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonList() {
  const res = await fetch('http://127.0.0.1:9333/json/list');
  return res.json();
}

let target = null;
for (let i = 0; i < 40; i++) {
  try {
    const list = await jsonList();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) { console.error('no target'); edge.kill(); server.close(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push('[console] ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push('[exception] ' + (d.exception?.description || d.text));
  }
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8899/' });
await sleep(4000);

const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    extras: !!window.__CSMH_EXTRAS__,
    custom: !!window.__CSMH_CUSTOM__,
    gate: !!document.getElementById('csmh-gate'),
    theme: document.documentElement.dataset.theme || null,
    title: document.title,
    calls: (window.__CALLS__ || []).slice(0, 8),
    bodyLen: document.body ? document.body.innerHTML.length : -1,
    hasHudBtn: !!document.querySelector('button[aria-label="对局 HUD"]'),
    hudVisible: (() => { const b = document.querySelector('button[aria-label="对局 HUD"]'); return b ? getComputedStyle(b).display !== 'none' : null; })(),
    version100: (document.body ? document.body.innerText : '').includes('1.0.0'),
    text: (document.body ? document.body.innerText : '').replace(/\s+/g,' ').slice(0, 600)
  })`,
  returnByValue: true,
});

console.log('RESULT:', r.result?.value);

// 点一次 Perfect World Arena，看看登录页会不会崩
const clickRes = await send('Runtime.evaluate', {
  expression: `(() => {
    const els = [...document.querySelectorAll('button,div,a')];
    const t = els.find(e => (e.textContent || '').includes('Perfect World Arena'));
    if (t) { t.click(); return 'clicked'; }
    return 'not found';
  })()`,
  returnByValue: true,
});
await sleep(2500);
const r2 = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 700),
    errs: (window.__CSMH_ERRORS__ || []).slice(-3)
  })`,
  returnByValue: true,
});
console.log('CLICK:', clickRes.result?.value, 'AFTER:', r2.result?.value);
console.log('LOGS:');
for (const l of logs) console.log('  ' + l);

ws.close();
edge.kill();
server.close();
process.exit(0);




