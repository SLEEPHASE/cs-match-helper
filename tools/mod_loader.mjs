/**
 * mod_loader.mjs —— 对 cs-match-helper 做「运行时魔改」：CDP 注入 JS
 *
 * 原理：Tauri 的 WebView2 支持 --remote-debugging-port，注入脚本后可
 *   1) 包一层 window.__TAURI_INTERNALS__.invoke，拦截/改写任意后端命令；
 *   2) 直接改 DOM / 文案 / 样式 / 加按钮；
 *   3) 监听事件通道，改写 AI/对局推送。
 *
 * 用法：
 *   node mod_loader.mjs --exe "C:\\path\\cs-match-helper.exe" --patch patches/example-mod.js
 *   node mod_loader.mjs --attach --port 9333 --patch patches/disable-5e.js
 *   node mod_loader.mjs --exe ... --patch a.js --patch b.js --port 9333 --keep-open
 *
 * 说明：程序 manifest 要求管理员，UAC 需要你手动点“是”。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function arg(name, def = null) {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? (argv[i + 1] ?? true) : def;
}
function all(name) {
  const out = [];
  argv.forEach((a, i) => { if (a === '--' + name) out.push(argv[i + 1]); });
  return out;
}

const exe = arg('exe');
const port = Number(arg('port', 9333));
const attach = argv.includes('--attach');
const keepOpen = argv.includes('--keep-open');
const patches = all('patch');

if (!attach && !exe) {
  console.error('用法: node mod_loader.mjs --exe <cs-match-helper.exe> --patch <mod.js> [--port 9333]');
  process.exit(1);
}
if (!patches.length) {
  console.error('至少给一个 --patch <file.js>');
  process.exit(1);
}

const sources = patches.map((p) => ({ file: p, code: fs.readFileSync(p, 'utf8') }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function waitTarget(timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(400);
  }
  throw new Error('等待 CDP target 超时');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error('ws error'));
      this.ws.onclose = () => {
        for (const { rej } of this.pending.values()) rej(new Error('ws closed'));
        this.pending.clear();
      };
    });
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) {
        const fns = this.handlers.get(msg.method) || [];
        for (const fn of fns) fn(msg.params);
      }
    };
  }
  on(method, fn) {
    this.handlers.set(method, [...(this.handlers.get(method) || []), fn]);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function inject(cdp, tag) {
  for (const { file, code } of sources) {
    const wrapped = `(() => { try {\n${code}\n;console.log('[mod] loaded: ' + ${JSON.stringify(path.basename(file))}); } catch (e) { console.error('[mod] error', e && e.stack || e); } })();`;
    try {
      const r = await cdp.send('Runtime.evaluate', {
        expression: wrapped,
        awaitPromise: false,
        returnByValue: true,
        userGesture: true,
      });
      console.log(`[mod] injected ${path.basename(file)} <- ${tag}${r.exceptionDetails ? ' (exception: ' + (r.exceptionDetails.text || '') + ')' : ''}`);
    } catch (e) {
      console.error('[mod] inject failed:', e.message);
    }
  }
}

let child = null;
if (!attach) {
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
  child = spawn(exe, [], { env, detached: false, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log('[mod] app exited:', code);
    process.exit(0);
  });
  console.log(`[mod] launched ${exe} with CDP :${port}`);
}

const page = await waitTarget();
console.log('[mod] target:', page.url);

const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

cdp.on('Runtime.consoleAPICalled', (p) => {
  const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
  if (text) console.log('[page]', text);
});

cdp.on('Page.loadEventFired', async () => {
  await sleep(300);
  await inject(cdp, 'reload');
});

await sleep(1200);
await inject(cdp, 'initial');

console.log('[mod] ready. Ctrl+C 退出。');
if (!keepOpen) {
  // 保持进程存活以便持续监听
}
process.on('SIGINT', () => { try { child?.kill(); } catch {} process.exit(0); });
