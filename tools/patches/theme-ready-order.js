/**
 * theme-ready-order.js —— 由 frontend/assets/sleephase-extras.js 生成（勿手改）
 * 用法：node tools/mod_loader.mjs --exe <原版exe> --patch tools/patches/theme-ready-order.js
 * 注意：注入发生在页面加载后，只记录注入之后的准备事件。
 *//**
 * sleephase-extras.js —— 主题切换 + 准备顺序面板（零依赖、可单独注入）
 *
 * 主题：跟随系统 / 浅色 / 深色 三态，标题栏按钮切换，Ctrl+Shift+L 快捷键，
 *       localStorage 记忆，监听系统外观变化。只覆盖设计令牌（--color-*）与
 *       少量硬编码浅色工具类，不动任何业务样式，所以不会和队伍色/胜负色打架。
 *
 * 准备顺序：不新增后端依赖，直接嗅探应用已有的 IPC 数据（readyUuids /
 *       ready_members / ready_player_id），按到达顺序记录 1st/2nd/3rd…，
 *       并用同批数据里的 players/teams 反查昵称。
 *
 * 用法：
 *   1) 重建版：index.html 里 <script defer src="./assets/sleephase-extras.js"></script>
 *   2) 原版：node tools/mod_loader.mjs --exe ... --patch tools/patches/theme-ready-order.js
 */
(() => {
  if (window.__CSMH_EXTRAS__) return;
  window.__CSMH_EXTRAS__ = true;

  const THEME_KEY = 'csmh.theme';
  const PANEL_KEY = 'csmh.readyOrder.collapsed';
  const MODES = ['system', 'light', 'dark'];
  const MODE_LABEL = { system: '跟随系统', light: '浅色', dark: '深色' };

  /* ============================================================
   *  0. 样式（全部挂在 html[data-theme="dark"] 下，浅色零影响）
   * ============================================================ */
  const CSS = `
html[data-theme="dark"]{
  color-scheme: dark;
  --color-base:#0b1017;
  --color-surface:#111823;
  --color-elevated:#18212e;
  --color-muted:#0e1520;
  --color-border:#25344a;
  --color-border-subtle:#1a2434;
  --color-fg:#e9eff8;
  --color-fg-secondary:#b7c5d7;
  --color-fg-muted:#8395ab;
  --color-accent:#5aa2f0;
  --color-accent-hover:#7bb6f7;
  --color-accent-muted:#3f7fd0;
  --color-team-a:#5aa2f0;
  --color-team-b:#f7b34c;
  /* 中性色反相：浅底变深底、深字变亮字 */
  --color-slate-50:#0d141d;
  --color-slate-100:#121b27;
  --color-slate-200:#1b2737;
  --color-slate-300:#26374d;
  --color-slate-400:#5c728a;
  --color-slate-500:#8698ad;
  --color-slate-600:#aebccd;
  --color-slate-700:#ccd8e5;
  /* 800/900/950 在浅色里就是遮罩/浮层底色，深色下保持深色 */
  --color-slate-800:#1c2738;
  --color-slate-900:#141d2a;
  --color-slate-950:#0a111a;
}
html[data-theme="dark"],
html[data-theme="dark"] body{ background-color:#0b1017 !important; }
html[data-theme="dark"] .text-slate-800,
html[data-theme="dark"] .text-slate-900,
html[data-theme="dark"] .text-slate-950{ color:#e9eff8; }
html[data-theme="dark"] .text-black{ color:#e9eff8; }
html[data-theme="dark"] [class~="bg-white"]{ background-color:var(--color-surface); }
html[data-theme="dark"] [class*="bg-white/"]{
  background-color:color-mix(in srgb, var(--color-surface) 92%, transparent);
}
html[data-theme="dark"] [class*="bg-[#F8FAFC]"],
html[data-theme="dark"] [class*="bg-[#FAFBFC]"],
html[data-theme="dark"] [class*="bg-[#FAFAFA]"],
html[data-theme="dark"] [class*="bg-[#F1F5F9]"]{ background-color:var(--color-surface); }
html[data-theme="dark"] [class~="from-orange-50"],
html[data-theme="dark"] [class*="from-orange-50/"]{
  --tw-gradient-from:color-mix(in srgb, #f7b34c 14%, transparent);
}
html[data-theme="dark"] img[src*="logo-perfect"]{ filter:brightness(1.06); }
/* 语义色：只提亮文字，不动背景色，胜负/队伍含义不变 */
html[data-theme="dark"] .text-emerald-600{ color:#34d399; }
html[data-theme="dark"] .text-rose-500{ color:#fb7185; }
html[data-theme="dark"] .text-amber-600{ color:#fbbf24; }
html[data-theme="dark"] .text-sky-600{ color:#38bdf8; }
html[data-theme="dark"] .text-blue-600{ color:#60a5fa; }
html[data-theme="dark"] .text-indigo-600{ color:#818cf8; }
html[data-theme="dark"] .text-orange-500{ color:#fb923c; }
/* 浅色底徽标：换成同色系深底，避免刺眼白块（精确匹配 -50，不会误伤 -500） */
html[data-theme="dark"] [class~="bg-emerald-50"],
html[data-theme="dark"] [class*="bg-emerald-50/"]{ background-color:#10241d; }
html[data-theme="dark"] [class~="bg-rose-50"],
html[data-theme="dark"] [class*="bg-rose-50/"]{ background-color:#2a1418; }
html[data-theme="dark"] [class~="bg-amber-50"],
html[data-theme="dark"] [class*="bg-amber-50/"]{ background-color:#2a2213; }
html[data-theme="dark"] [class~="bg-sky-50"],
html[data-theme="dark"] [class*="bg-sky-50/"]{ background-color:#10202c; }
html[data-theme="dark"] [class~="bg-blue-50"],
html[data-theme="dark"] [class*="bg-blue-50/"]{ background-color:#121d2e; }
html[data-theme="dark"] [class~="bg-indigo-50"],
html[data-theme="dark"] [class*="bg-indigo-50/"]{ background-color:#171a2e; }
html[data-theme="dark"] [class~="bg-violet-50"],
html[data-theme="dark"] [class*="bg-violet-50/"]{ background-color:#1e1630; }
html[data-theme="dark"] [class~="bg-orange-50"],
html[data-theme="dark"] [class*="bg-orange-50/"]{ background-color:#2a1c12; }
html.theme-anim, html.theme-anim *, html.theme-anim *::before, html.theme-anim *::after{
  transition:background-color .22s ease, border-color .22s ease, color .22s ease,
             fill .22s ease, stroke .22s ease !important;
}

/* ---------- 标题栏按钮 ---------- */
.csmh-theme-btn{
  display:inline-flex; align-items:center; justify-content:center;
  width:28px; height:28px; margin-right:4px; border:0; padding:0;
  border-radius:8px; background:transparent; cursor:pointer;
  color:var(--color-fg-muted);
  -webkit-app-region:no-drag; app-region:no-drag;
  transition:background-color .15s ease, color .15s ease;
}
.csmh-theme-btn:hover{ background:var(--color-elevated); color:var(--color-fg); }
.csmh-theme-btn svg{ width:15px; height:15px; display:block; }
.csmh-theme-btn.csmh-floating{
  position:fixed; top:10px; right:104px; z-index:2147483001;
  background:var(--color-surface); border:1px solid var(--color-border);
  box-shadow:0 2px 8px rgba(0,0,0,.12);
}

/* ---------- 准备顺序面板 ---------- */
.csmh-ready{
  position:fixed; left:12px; bottom:12px; z-index:2147483000;
  width:236px; font:12px/1.45 "Segoe UI", system-ui, sans-serif;
  color:var(--color-fg); background:var(--color-surface);
  border:1px solid var(--color-border); border-radius:12px;
  box-shadow:0 10px 28px rgba(0,0,0,.16);
  overflow:hidden; user-select:none;
  -webkit-app-region:no-drag; app-region:no-drag;
}
.csmh-ready__head{
  display:flex; align-items:center; gap:6px; padding:8px 10px;
  background:var(--color-elevated); border-bottom:1px solid var(--color-border-subtle);
  cursor:pointer;
}
.csmh-ready__title{ font-weight:600; font-size:12px; }
.csmh-ready__badge{
  margin-left:auto; font-size:11px; font-variant-numeric:tabular-nums;
  color:var(--color-fg-muted);
}
.csmh-ready__body{ max-height:236px; overflow:auto; padding:6px; }
.csmh-ready--collapsed .csmh-ready__body{ display:none; }
.csmh-ready--collapsed{ width:auto; }
.csmh-ready--collapsed .csmh-ready__head{ border-bottom:0; }
.csmh-ready__row{
  display:flex; align-items:center; gap:8px; padding:4px 6px; border-radius:6px;
}
.csmh-ready__row:hover{ background:var(--color-elevated); }
.csmh-ready__rank{
  flex:0 0 18px; height:18px; border-radius:50%; font-size:10px; font-weight:700;
  display:flex; align-items:center; justify-content:center;
  background:var(--color-muted); color:var(--color-fg-secondary);
}
.csmh-ready__row[data-rank="1"] .csmh-ready__rank{ background:#f6c945; color:#3a2a00; }
.csmh-ready__row[data-rank="2"] .csmh-ready__rank{ background:#cfd6de; color:#25303c; }
.csmh-ready__row[data-rank="3"] .csmh-ready__rank{ background:#d79a63; color:#2e1b08; }
.csmh-ready__name{
  flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.csmh-ready__time{
  flex:0 0 auto; font-size:10px; font-variant-numeric:tabular-nums;
  color:var(--color-fg-muted);
}
.csmh-ready__empty{ padding:10px 8px; color:var(--color-fg-muted); font-size:11px; }
.csmh-ready__foot{
  display:flex; gap:6px; padding:6px 8px; border-top:1px solid var(--color-border-subtle);
}
.csmh-ready__btn{
  flex:1; border:1px solid var(--color-border); background:transparent; color:var(--color-fg-secondary);
  border-radius:6px; padding:3px 0; font-size:11px; cursor:pointer;
}
.csmh-ready__btn:hover{ background:var(--color-elevated); color:var(--color-fg); }
`;

  const style = document.createElement('style');
  style.id = 'csmh-extras-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ============================================================
   *  1. 主题
   * ============================================================ */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let mode = localStorage.getItem(THEME_KEY) || 'system';
  if (!MODES.includes(mode)) mode = 'system';

  const ICONS = {
    system:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7"/><path d="M12 17v4"/></svg>',
    light:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>',
    dark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.6 8.6 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg>',
  };

  const resolve = () =>
    mode === 'dark' || (mode === 'system' && mq && mq.matches) ? 'dark' : 'light';

  let btn = null;

  function paintTheme(animate) {
    const root = document.documentElement;
    if (animate) {
      root.classList.add('theme-anim');
      setTimeout(() => root.classList.remove('theme-anim'), 280);
    }
    root.dataset.theme = resolve();
    root.dataset.themeMode = mode;
    if (btn) {
      btn.innerHTML = ICONS[mode];
      btn.title = `主题：${MODE_LABEL[mode]}（点击切换）`;
      btn.setAttribute('aria-label', btn.title);
    }
  }

  function setMode(next, animate = true) {
    mode = MODES.includes(next) ? next : 'system';
    localStorage.setItem(THEME_KEY, mode);
    paintTheme(animate);
  }

  function cycle() {
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  }

  function mountButton() {
    if (btn && document.body.contains(btn)) return;
    const header = document.querySelector('header[data-tauri-drag-region]');
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csmh-theme-btn';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cycle();
    });
    if (header) {
      const rightGroup = header.lastElementChild || header;
      rightGroup.insertBefore(btn, rightGroup.firstChild);
    } else {
      btn.classList.add('csmh-floating');
      document.body.appendChild(btn);
    }
    paintTheme(false);
  }

  if (mq) {
    const onSystem = () => {
      if (mode === 'system') paintTheme(true);
    };
    mq.addEventListener ? mq.addEventListener('change', onSystem) : mq.addListener(onSystem);
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      cycle();
    }
  });

  paintTheme(false);

  /* ============================================================
   *  2. 准备顺序
   * ============================================================ */
  const READY_ARRAY_KEYS = ['readyUuids', 'readyMembers', 'ready_members', 'readyPlayerIds', 'readySteamIds'];
  const READY_SINGLE_KEYS = ['ready_player_id', 'readyPlayerId', 'ready_steam_id', 'readySteamId'];
  const PLAYER_LIST_KEYS = ['players', 'unassigned', 'members'];
  const MATCH_KEYS = ['matchId', 'platformGameId', 'gameId', 'matchCode'];

  const ready = {
    matchId: null,
    order: [], // [{ id, name, at }]
    seen: new Set(),
    names: new Map(),
    startedAt: 0,
  };

  let panel = null;
  let listEl = null;
  let badgeEl = null;

  const fmt = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function buildPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'csmh-ready' + (localStorage.getItem(PANEL_KEY) === '1' ? ' csmh-ready--collapsed' : '');
    panel.innerHTML = `
      <div class="csmh-ready__head" role="button" tabindex="0">
        <span class="csmh-ready__title">准备顺序</span>
        <span class="csmh-ready__badge">暂无数据</span>
      </div>
      <div class="csmh-ready__body"><div class="csmh-ready__empty">等待对局数据…</div></div>
      <div class="csmh-ready__foot">
        <button type="button" class="csmh-ready__btn" data-act="reset">清空</button>
        <button type="button" class="csmh-ready__btn" data-act="hide">隐藏</button>
      </div>`;
    document.body.appendChild(panel);

    listEl = panel.querySelector('.csmh-ready__body');
    badgeEl = panel.querySelector('.csmh-ready__badge');

    const head = panel.querySelector('.csmh-ready__head');
    const toggle = () => {
      panel.classList.toggle('csmh-ready--collapsed');
      localStorage.setItem(PANEL_KEY, panel.classList.contains('csmh-ready--collapsed') ? '1' : '0');
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    panel.addEventListener('click', (e) => {
      const act = e.target && e.target.closest && e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'reset') resetReady(true);
      if (act.dataset.act === 'hide') {
        panel.style.display = 'none';
        setTimeout(() => (panel.style.display = ''), 8000);
      }
    });
  }

  function renderPanel() {
    buildPanel();
    const total = ready.order.length;
    badgeEl.textContent = total ? `${total} 人已准备` : '暂无数据';
    if (!total) {
      listEl.innerHTML = '<div class="csmh-ready__empty">等待对局数据…</div>';
      return;
    }
    const rows = ready.order
      .map((it, i) => {
        const n = i + 1;
        const dt = it.at && ready.startedAt ? `+${fmt(it.at - ready.startedAt)}` : '';
        return `<div class="csmh-ready__row" data-rank="${n}">
          <span class="csmh-ready__rank">${n}</span>
          <span class="csmh-ready__name" title="${escapeHtml(it.name || it.id)}">${escapeHtml(it.name || shortId(it.id))}</span>
          <span class="csmh-ready__time">${dt}</span>
        </div>`;
      })
      .join('');
    listEl.innerHTML = rows;
    listEl.scrollTop = listEl.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function shortId(id) {
    const s = String(id);
    return s.length > 10 ? s.slice(0, 4) + '…' + s.slice(-3) : s;
  }

  function resetReady(rerender) {
    ready.matchId = null;
    ready.order = [];
    ready.seen.clear();
    ready.startedAt = 0;
    if (rerender) renderPanel();
  }

  // 一次嗅探批次内的 ready 数据先入 buffer，等批次结束再决定是否换局清空，
  // 避免同一份 payload 里 matchId 排在 readyUuids 之后导致刚记的顺位被清掉。
  let batch = null;
  let pendingMatch = null;

  function noteMatch(id) {
    if (!id) return;
    pendingMatch = String(id);
  }

  function pushNow(id) {
    if (!id) return;
    const key = String(id);
    if (ready.seen.has(key)) return;
    ready.seen.add(key);
    const at = Date.now();
    if (!ready.startedAt) ready.startedAt = at;
    ready.order.push({ id: key, name: ready.names.get(key) || '', at });
    renderPanel();
  }

  function pushReady(id) {
    if (batch) batch.push(id);
    else pushNow(id);
  }

  function commitBatch() {
    const id = pendingMatch;
    pendingMatch = null;
    if (id) {
      if (ready.matchId && ready.matchId !== id) resetReady(false);
      ready.matchId = id;
    }
    const items = batch || [];
    batch = null;
    for (const it of items) pushNow(it);
    renderPanel();
  }

  function collectNames(list) {
    if (!Array.isArray(list)) return;
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      const id = p.steamId || p.steam_id || p.uuid || p.uuidStr || p.platformId;
      const name = p.nickname || p.nickName || p.name || p.playerName;
      if (id && name) ready.names.set(String(id), String(name));
    }
    // 名字后到：回填已有顺序
    let dirty = false;
    for (const it of ready.order) {
      if (!it.name && ready.names.has(it.id)) {
        it.name = ready.names.get(it.id);
        dirty = true;
      }
    }
    if (dirty) renderPanel();
  }

  function sniff(value, depth = 0, budget = { n: 0 }, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') return;
    if (depth > 6 || budget.n > 4000) return;
    if (seen.has(value)) return;
    seen.add(value);
    budget.n++;

    if (Array.isArray(value)) {
      for (const v of value) sniff(v, depth + 1, budget, seen);
      return;
    }

    for (const [k, v] of Object.entries(value)) {
      if (MATCH_KEYS.includes(k) && (typeof v === 'string' || typeof v === 'number')) noteMatch(v);
      if (PLAYER_LIST_KEYS.includes(k) && Array.isArray(v)) collectNames(v);
      if (READY_ARRAY_KEYS.includes(k) && Array.isArray(v)) {
        for (const id of v) {
          if (typeof id === 'string' || typeof id === 'number') pushReady(id);
        }
      }
      if (READY_SINGLE_KEYS.includes(k) && (typeof v === 'string' || typeof v === 'number')) {
        pushReady(v);
      }
      if (v && typeof v === 'object') sniff(v, depth + 1, budget, seen);
    }
  }

  function sniffSafely(value) {
    const outer = batch === null;
    if (outer) batch = [];
    try {
      sniff(value);
    } catch {
    } finally {
      if (outer) commitBatch();
    }
  }

  // 2.1 嗅探 invoke 返回值
  const internals = window.__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function' && !internals.__csmhInvoke) {
    const rawInvoke = internals.invoke.bind(internals);
    internals.invoke = async function (cmd, args, opts) {
      const res = await rawInvoke(cmd, args, opts);
      sniffSafely(res);
      return res;
    };
    internals.__csmhInvoke = true;
  }

  // 2.2 嗅探事件回调（perfect-teams / perfect-party / 5e-cdp …）
  if (internals && typeof internals.transformCallback === 'function' && !internals.__csmhCb) {
    const rawCb = internals.transformCallback.bind(internals);
    internals.transformCallback = function (cb, once) {
      const wrapped = function (payload) {
        sniffSafely(payload);
        return cb.apply(this, arguments);
      };
      return rawCb(wrapped, once);
    };
    internals.__csmhCb = true;
  }

  // 2.3 对外 API + 启动
  window.__CSMH_THEME__ = {
    get mode() {
      return mode;
    },
    get resolved() {
      return resolve();
    },
    set: setMode,
    cycle,
  };
  window.__CSMH_READY__ = {
    list: () => ready.order.slice(),
    push: (id, name) => {
      if (name) ready.names.set(String(id), String(name));
      pushReady(id);
    },
    reset: () => resetReady(true),
    names: (list) => collectNames(list),
  };

  const boot = () => {
    mountButton();
    buildPanel();
    renderPanel();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  // SPA 重渲染后补挂按钮（低频轮询，避免 MutationObserver 在高频更新下开销）
  setInterval(() => {
    if (!btn || !document.body.contains(btn)) mountButton();
  }, 1500);
})();



