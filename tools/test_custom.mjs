/**
 * test_custom.mjs —— 用最小 DOM 桩验证 sleephase-custom.js
 * 覆盖：版本号、AI 命令拦截、GitHub 更新映射、HUD 拦截、启动密码闸门
 */
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const extrasCode = read('../frontend/assets/sleephase-extras.js');
const customCode = read('../frontend/assets/sleephase-custom.js');

function el(tag = 'div') {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    style: { setProperty() {} },
    dataset: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { node.children.push(c); return c; },
    insertBefore(c) { node.children.push(c); return c; },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute(k, v) { node.dataset[k] = v; },
    getAttribute() { return null; },
    querySelector() { return el('div'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains() { return false; },
    focus() {},
  };
  return node;
}

const store = new Map();
const session = new Map();
const documentElement = el('html');
const body = el('body');
const head = el('head');
const document = {
  documentElement, body, head,
  title: 'CS 匹配助手',
  readyState: 'complete',
  createElement: (t) => el(t),
  createTextNode: (t) => ({ nodeValue: t }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  createTreeWalker: () => ({ nextNode: () => null }),
};

const github = {
  latest: {
    tag_name: 'v1.1.0',
    body: '## 更新内容\n- 修复若干问题',
    html_url: 'https://github.com/SLEEPHASE/cs-match-helper/releases/tag/v1.1.0',
    published_at: '2026-11-09T00:00:00Z',
    assets: [{ name: 'cs-match-helper.exe', browser_download_url: 'https://github.com/SLEEPHASE/cs-match-helper/releases/download/v1.1.0/cs-match-helper.exe' }],
  },
  list: [{ tag_name: 'v1.1.0', name: 'v1.1.0', body: 'notes', published_at: '2026-11-09T00:00:00Z', prerelease: false }],
  one: { tag_name: 'v1.1.0', name: 'v1.1.0', body: 'detail body', published_at: '2026-11-09T00:00:00Z' },
};

const sandbox = {
  console,
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => {},
  encodeURIComponent,
  JSON,
  Date,
  Error,
  Promise,
  document,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
  fetch: async (url) => {
    const p = String(url);
    const data = p.includes('/releases/latest') ? github.latest
      : p.includes('/releases/tags/') ? github.one
      : p.includes('/releases?') ? github.list : {};
    return { ok: true, status: 200, json: async () => data };
  },
  MutationObserver: class { observe() {} },
  NodeFilter: { SHOW_TEXT: 4 },
  __calls: [],
};
sandbox.window = sandbox;
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
sandbox.addEventListener = () => {};
sandbox.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    sandbox.__calls.push(cmd);
    if (cmd === 'get_app_version') return { name: 'CS 匹配助手', version: '4.0.2' };
    return { echo: cmd, args };
  },
  transformCallback: () => 1,
};

vm.createContext(sandbox);
vm.runInContext(extrasCode, sandbox, { filename: 'extras.js' });
vm.runInContext(customCode, sandbox, { filename: 'custom.js' });

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  :', m); };
const invoke = (cmd, args) => sandbox.__TAURI_INTERNALS__.invoke(cmd, args);

const ver = await invoke('get_app_version');
assert(ver.version === '1.0.0', 'get_app_version → 1.0.0');
assert(ver.name === 'CS 匹配助手', 'name 保留');

const upd = await invoke('check_for_update');
assert(upd.hasUpdate === true, 'check_for_update 走 GitHub：hasUpdate');
assert(upd.latestVersion === '1.1.0', 'latestVersion 去掉 v');
assert(upd.currentVersion === '1.0.0', 'currentVersion = 1.0.0');
assert(String(upd.releaseUrl).includes('SLEEPHASE/cs-match-helper'), 'releaseUrl 指向 SLEEPHASE');
assert(String(upd.downloadUrl).includes('.exe'), 'downloadUrl 取到 exe 资产');

const list = await invoke('list_changelog_releases');
assert(Array.isArray(list) && list.length === 1 && list[0].tag === 'v1.1.0', '更新日志列表');

const one = await invoke('get_changelog_release', { tag: 'v1.1.0' });
assert(one.body === 'detail body', '单条更新日志 body');

let aiBlocked = false;
try { await invoke('start_ai_analysis', {}); } catch { aiBlocked = true; }
assert(aiBlocked, 'AI 命令被拦截');

const aiSettings = await invoke('load_ai_settings');
assert(aiSettings.hasApiKey === false, 'AI 设置返回空配置');

let hudBlocked = false;
try { await invoke('plugin:window|create', { options: { label: 'hud' } }); } catch { hudBlocked = true; }
assert(hudBlocked, '对局 HUD 窗口创建被拦截');

const normal = await invoke('some_other_cmd', { a: 1 });
assert(normal.echo === 'some_other_cmd', '其它命令透传');

assert(body.children.some((c) => String(c.innerHTML).includes('csmh-gate-input')), '启动密码闸门已插入');

console.log('\n' + (process.exitCode ? '有失败项' : '全部通过'));
