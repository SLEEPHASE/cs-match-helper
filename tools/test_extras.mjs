/**
 * test_extras.mjs —— 用最小 DOM 桩跑一遍 sleephase-extras.js 的核心逻辑
 * 只验证：主题状态机 / IPC 嗅探 → 准备顺序 / 换局重置 / 昵称回填
 * 用法: node tools/test_extras.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../frontend/assets/sleephase-extras.js', import.meta.url), 'utf8');

function el(tag = 'div') {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    children: [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        on ? classes.add(c) : classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c),
    },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    insertBefore(child) {
      node.children.unshift(child);
      return child;
    },
    addEventListener() {},
    setAttribute() {},
    querySelector() {
      return el('div');
    },
    closest() {
      return null;
    },
    contains() {
      return true;
    },
  };
  Object.defineProperty(node, 'classList', { value: node.classList });
  return node;
}

const store = new Map();
const documentElement = el('html');
const document = {
  documentElement,
  head: el('head'),
  body: el('body'),
  readyState: 'complete',
  createElement: (t) => el(t),
  querySelector: () => null,
  addEventListener() {},
};

const sandbox = {
  console,
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => {},
  document,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  __result: null,
};
sandbox.window = sandbox;
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
sandbox.addEventListener = () => {};
sandbox.__TAURI_INTERNALS__ = {
  invoke: async () => sandbox.__result,
  transformCallback: (cb) => 1,
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'sleephase-extras.js' });

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
};

// ---- 主题 ----
assert(documentElement.dataset.theme === 'light', '默认 system + 系统浅色 → light');
sandbox.__CSMH_THEME__.set('dark');
assert(documentElement.dataset.theme === 'dark', 'set("dark") → data-theme=dark');
assert(documentElement.dataset.themeMode === 'dark', 'data-theme-mode 记录偏好');
sandbox.__CSMH_THEME__.cycle();
assert(documentElement.dataset.themeMode === 'system', 'dark → system（三态循环）');
sandbox.__CSMH_THEME__.cycle();
assert(documentElement.dataset.themeMode === 'light', 'system → light');
sandbox.__CSMH_THEME__.set('dark');

// ---- 准备顺序 ----
sandbox.__result = {
  matchId: 'm1',
  readyUuids: ['76561190000000001', '76561190000000002'],
  teams: [
    {
      players: [
        { steamId: '76561190000000001', nickname: 'Alice' },
        { steamId: '76561190000000002', nickname: 'Bob' },
      ],
    },
  ],
};

await sandbox.__TAURI_INTERNALS__.invoke('resolve_perfect_match_teams', {});
let list = sandbox.__CSMH_READY__.list();
assert(list.length === 2, '嗅探到 2 个 ready');
assert(list[0].id === '76561190000000001' && list[0].name === 'Alice', '第 1 个准备 = Alice');
assert(list[1].name === 'Bob', '第 2 个准备 = Bob');

// 同一局再来 1 个，且重复项不重复计数
sandbox.__result = { matchId: 'm1', readyUuids: ['76561190000000001', '76561190000000003'] };
await sandbox.__TAURI_INTERNALS__.invoke('whatever', {});
list = sandbox.__CSMH_READY__.list();
assert(list.length === 3, '同局追加 → 3 人');
assert(list[2].id === '76561190000000003', '第 3 个准备 = ...003');

// 换局 → 清零
sandbox.__result = { matchId: 'm2', readyUuids: ['76561190000000009'] };
await sandbox.__TAURI_INTERNALS__.invoke('whatever', {});
list = sandbox.__CSMH_READY__.list();
assert(list.length === 1 && list[0].id === '76561190000000009', '换局自动清空并重新计数');

// 单条 ready_player_id
sandbox.__result = { matchId: 'm2', ready_player_id: '76561190000000010' };
await sandbox.__TAURI_INTERNALS__.invoke('whatever', {});
list = sandbox.__CSMH_READY__.list();
assert(list.length === 2 && list[1].id === '76561190000000010', 'ready_player_id 单条也能记录');

// 手动 API
sandbox.__CSMH_READY__.push('76561190000000011', 'Carol');
list = sandbox.__CSMH_READY__.list();
assert(list.length === 3 && list[2].name === 'Carol', '手动 push 带昵称');

console.log('\n' + (process.exitCode ? '有失败项' : '全部通过'));
