/**
 * sleephase-inline.js —— 以内联 <script> 的方式塞进 index.html（在模块之前执行）
 *
 * 关键：完全独立于应用 bundle。这里抛错也不会影响 Vue 挂载——这正是之前黑屏的教训。
 * 只做 DOM 层面的事 + 给静态改写的 API 层提供 __CSMH_NET__。
 */
(function () {
  var REPO = 'SLEEPHASE/cs-match-helper';
  var VERSION = '1.0.0';
  var PASSWORD = 'SLEEPHASE';
  var GATE_KEY = 'csmh.gate.ok';

  /* ---------------- 错误探针 ---------------- */
  window.__CSMH_ERRORS__ = [];
  window.__CSMH_TOAST__ = function (msg) {
    try {
      var el = document.getElementById('csmh-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'csmh-toast';
        el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;max-width:460px;padding:10px 12px;' +
          'border-radius:10px;background:#7f1d1d;color:#fff;font:12px/1.5 "Segoe UI",system-ui;white-space:pre-wrap;' +
          'box-shadow:0 10px 30px rgba(0,0,0,.45);cursor:pointer;';
        el.title = '点击关闭';
        el.addEventListener('click', function () { el.remove(); });
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = String(msg).slice(0, 800);
    } catch (e) {}
  };
  window.addEventListener('error', function (e) {
    var m = (e.message || '') + '  @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0);
    window.__CSMH_ERRORS__.push(m);
    try { localStorage.setItem('csmh.lastError', m); } catch (e2) {}
    window.__CSMH_TOAST__('JS 错误：' + m);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var m = String((r && (r.stack || r.message)) || r);
    window.__CSMH_ERRORS__.push('rejection: ' + m);
    try { localStorage.setItem('csmh.lastRejection', m); } catch (e2) {}
    window.__CSMH_TOAST__('未处理异常：' + m);
  });

  /* ---------------- 主题（CSS 立即注入，避免闪白） ---------------- */
  var THEME_CSS = 'html[data-theme="dark"]{color-scheme:dark;' +
    '--color-base:#0b1017;--color-surface:#111823;--color-elevated:#18212e;--color-muted:#0e1520;' +
    '--color-border:#25344a;--color-border-subtle:#1a2434;--color-fg:#e9eff8;--color-fg-secondary:#b7c5d7;' +
    '--color-fg-muted:#8395ab;--color-accent:#5aa2f0;--color-accent-hover:#7bb6f7;--color-accent-muted:#3f7fd0;' +
    '--color-team-a:#5aa2f0;--color-team-b:#f7b34c;' +
    '--color-slate-50:#0d141d;--color-slate-100:#121b27;--color-slate-200:#1b2737;--color-slate-300:#26374d;' +
    '--color-slate-400:#5c728a;--color-slate-500:#8698ad;--color-slate-600:#aebccd;--color-slate-700:#ccd8e5;' +
    '--color-slate-800:#1c2738;--color-slate-900:#141d2a;--color-slate-950:#0a111a}' +
    'html[data-theme="dark"],html[data-theme="dark"] body{background-color:#0b1017 !important}' +
    'html[data-theme="dark"] .text-slate-800,html[data-theme="dark"] .text-slate-900,html[data-theme="dark"] .text-slate-950{color:#e9eff8}' +
    'html[data-theme="dark"] .text-black{color:#e9eff8}' +
    'html[data-theme="dark"] [class~="bg-white"]{background-color:var(--color-surface)}' +
    'html[data-theme="dark"] [class*="bg-white/"]{background-color:var(--color-surface)}' +
    'html[data-theme="dark"] [class*="bg-[#F8FAFC]"],html[data-theme="dark"] [class*="bg-[#FAFBFC]"],' +
    'html[data-theme="dark"] [class*="bg-[#FAFAFA]"],html[data-theme="dark"] [class*="bg-[#F1F5F9]"]{background-color:var(--color-surface)}' +
    'html[data-theme="dark"] #perfect-auth-panel-qr>div{background-color:#fff !important}' +
    'html[data-theme="dark"] #perfect-auth-panel-qr img{background-color:#fff}' +
    'html[data-theme="dark"] img[alt*="二维码"],html[data-theme="dark"] img[alt*="QR code"]{background-color:#fff}';

  try {
    var st = document.createElement('style');
    st.id = 'csmh-theme';
    st.textContent = THEME_CSS;
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var mode = 'system';
  try { mode = localStorage.getItem('csmh.theme') || 'system'; } catch (e) {}
  var resolveTheme = function () {
    return mode === 'dark' || (mode === 'system' && mq && mq.matches) ? 'dark' : 'light';
  };
  var applyTheme = function () {
    document.documentElement.setAttribute('data-theme', resolveTheme());
    document.documentElement.setAttribute('data-theme-mode', mode);
    try { localStorage.setItem('csmh.theme', mode); } catch (e) {}
  };
  applyTheme();
  if (mq) {
    try {
      (mq.addEventListener ? mq.addEventListener.bind(mq) : mq.addListener.bind(mq))('change', function () {
        if (mode === 'system') applyTheme();
      });
    } catch (e) {}
  }

  /* ---------------- 标题 ---------------- */
  var fixTitle = function () {
    if (document.title && document.title.indexOf('禁止传播') < 0) {
      document.title += ' · 禁止传播';
    }
  };
  fixTitle();
  setInterval(fixTitle, 800);

  /* ---------------- 更新通道（静态改写的函数会调这里） ---------------- */
  function gh(path) {
    return fetch('https://api.github.com/repos/' + REPO + path, {
      headers: { Accept: 'application/vnd.github+json' },
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  window.__CSMH_NET__ = {
    checkUpdate: function () {
      return gh('/releases/latest').then(function (rel) {
        var tag = rel.tag_name || rel.name || '';
        var clean = String(tag).replace(/^v/i, '');
        var asset = (rel.assets || []).filter(function (a) {
          return /\.exe$/i.test(a.name || '');
        })[0];
        return {
          currentVersion: VERSION,
          hasUpdate: !!clean && clean !== VERSION,
          latestVersion: clean,
          releaseNotes: rel.body || '',
          releaseUrl: rel.html_url || ('https://github.com/' + REPO + '/releases/latest'),
          downloadUrl: asset ? asset.browser_download_url : (rel.html_url || ''),
          publishedAt: rel.published_at || '',
        };
      }).catch(function () {
        return {
          currentVersion: VERSION, hasUpdate: false, latestVersion: VERSION, releaseNotes: '',
          releaseUrl: 'https://github.com/' + REPO + '/releases', downloadUrl: '', publishedAt: '',
        };
      });
    },
    listReleases: function () {
      return gh('/releases?per_page=50').then(function (list) {
        return (list || []).map(function (r) {
          return {
            tag: r.tag_name || '', name: r.name || r.tag_name || '', body: r.body || '',
            publishedAt: r.published_at || '', prerelease: !!r.prerelease,
          };
        });
      }).catch(function () { return []; });
    },
    getRelease: function (tag) {
      return gh('/releases/tags/' + encodeURIComponent(tag)).then(function (r) {
        return { tag: r.tag_name || tag, name: r.name || '', body: r.body || '', publishedAt: r.published_at || '' };
      }).catch(function () { return { tag: tag, name: '', body: '', publishedAt: '' }; });
    },
    download: function () {
      var inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
      var p = inv ? inv('plugin:opener|open_url', { url: 'https://github.com/' + REPO + '/releases/latest' }) : Promise.resolve();
      return p.catch(function () {}).then(function () {
        throw new Error('请到 GitHub Releases 页面下载新版本');
      });
    },
    aiSettings: function () { return { analysisEnabled: false, hasApiKey: false }; },
    aiSave: function () { return { analysisEnabled: false }; },
    aiPath: function () { return ''; },
  };

  /* ---------------- 启动密码 ---------------- */
  function mountGate() {
    if (document.getElementById('csmh-gate')) return;
    var wrap = document.createElement('div');
    wrap.id = 'csmh-gate';
    wrap.innerHTML =
      '<div class="csmh-gate__panel">' +
        '<div class="csmh-gate__logo">CS 匹配助手</div>' +
        '<div class="csmh-gate__sub">SLEEPHASE 定制版 · 禁止传播 · v' + VERSION + '</div>' +
        '<input id="csmh-gate-input" type="password" autocomplete="off" spellcheck="false" placeholder="请输入启动密码" />' +
        '<button id="csmh-gate-btn" type="button">进入</button>' +
        '<div id="csmh-gate-msg" class="csmh-gate__msg"></div>' +
      '</div>';

    var style = document.createElement('style');
    style.id = 'csmh-gate-style';
    style.textContent =
      '#csmh-gate{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(1200px 600px at 50% 0%,#16202e,#0b1017 60%);' +
      'font:13px/1.5 "Segoe UI",system-ui,sans-serif;color:#e9eff8}' +
      '.csmh-gate__panel{width:320px;padding:26px 24px;border-radius:16px;background:#111823;' +
      'border:1px solid #25344a;box-shadow:0 24px 60px rgba(0,0,0,.5);text-align:center}' +
      '.csmh-gate__logo{font-size:17px;font-weight:700;letter-spacing:.5px}' +
      '.csmh-gate__sub{margin-top:4px;font-size:11px;color:#8395ab}' +
      '#csmh-gate-input{margin-top:18px;width:100%;box-sizing:border-box;padding:9px 12px;border-radius:9px;' +
      'border:1px solid #25344a;background:#0b1017;color:#e9eff8;font-size:13px;outline:none}' +
      '#csmh-gate-input:focus{border-color:#4a90e2;box-shadow:0 0 0 3px rgba(74,144,226,.18)}' +
      '#csmh-gate-btn{margin-top:10px;width:100%;padding:9px 12px;border:0;border-radius:9px;cursor:pointer;' +
      'background:#4a90e2;color:#fff;font-size:13px;font-weight:600}' +
      '#csmh-gate-btn:hover{background:#3b7dd8}' +
      '.csmh-gate__msg{margin-top:8px;height:16px;font-size:11px;color:#fb7185}';

    document.head.appendChild(style);
    document.body.appendChild(wrap);

    var input = wrap.querySelector('#csmh-gate-input');
    var btn = wrap.querySelector('#csmh-gate-btn');
    var msg = wrap.querySelector('#csmh-gate-msg');

    var submit = function () {
      if (input.value.trim() === PASSWORD) {
        try { localStorage.setItem(GATE_KEY, '1'); } catch (e) {}
        wrap.remove();
        style.remove();
      } else {
        msg.textContent = '密码错误';
        input.value = '';
        input.focus();
      }
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { input.focus(); }, 60);
  }

  var gateOn = false;
  try { gateOn = localStorage.getItem(GATE_KEY) === '1'; } catch (e) {}
  if (!gateOn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountGate, { once: true });
    } else {
      mountGate();
    }
  }

  /* ---------------- 主题按钮 ---------------- */
  var ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8.5 21h7M12 17v4"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.6 8.6 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg>',
  };

  var mountThemeBtn = function () {
    var old = document.getElementById('csmh-theme-btn');
    if (old && document.body.contains(old)) return;
    var header = document.querySelector('header[data-tauri-drag-region]');
    if (!header) return;
    var btn = document.createElement('button');
    btn.id = 'csmh-theme-btn';
    btn.type = 'button';
    btn.title = '主题：' + mode;
    btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-right:4px;' +
      'border:0;border-radius:8px;background:transparent;color:var(--color-fg-muted);cursor:pointer;-webkit-app-region:no-drag;';
    btn.innerHTML = ICONS[mode] || ICONS.system;
    btn.onclick = function () {
      var modes = ['system', 'light', 'dark'];
      mode = modes[(modes.indexOf(mode) + 1) % modes.length];
      btn.innerHTML = ICONS[mode];
      btn.title = '主题：' + mode;
      applyTheme();
    };
    var rightGroup = header.lastElementChild || header;
    rightGroup.insertBefore(btn, rightGroup.firstChild);
  };
  setInterval(mountThemeBtn, 1500);

  /* ---------------- 准备顺序面板（只读嗅探，失败不影响应用） ---------------- */
  (function () {
    var order = [], seen = {}, names = {}, startedAt = 0, matchId = null;

    var panel = document.createElement('div');
    panel.id = 'csmh-ready';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;width:236px;font:12px/1.45 "Segoe UI",system-ui;' +
      'color:var(--color-fg,#e9eff8);background:var(--color-surface,#111823);border:1px solid var(--color-border,#25344a);' +
      'border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.18);overflow:hidden;user-select:none;';
    panel.innerHTML =
      '<div id="csmh-ready-head" style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--color-elevated,#18212e);' +
        'border-bottom:1px solid var(--color-border-subtle,#1a2434);cursor:pointer;">' +
        '<span style="font-weight:600">准备顺序</span><span id="csmh-ready-badge" style="margin-left:auto;font-size:11px;opacity:.7">暂无数据</span></div>' +
      '<div id="csmh-ready-body" style="max-height:220px;overflow:auto;padding:6px">' +
        '<div style="padding:10px 8px;opacity:.6">等待对局数据…</div></div>';

    function render() {
      var badge = document.getElementById('csmh-ready-badge');
      var body = document.getElementById('csmh-ready-body');
      if (!badge || !body) return;
      badge.textContent = order.length ? order.length + ' 人已准备' : '暂无数据';
      if (!order.length) {
        body.innerHTML = '<div style="padding:10px 8px;opacity:.6">等待对局数据…</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < order.length; i++) {
        var it = order[i];
        var t = it.at && startedAt ? '+' + Math.round((it.at - startedAt) / 1000) + 's' : '';
        var medal = i === 0 ? '#f6c945' : i === 1 ? '#cfd6de' : i === 2 ? '#d79a63' : 'var(--color-muted,#0e1520)';
        html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px">' +
          '<span style="flex:0 0 18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
          'font-size:10px;font-weight:700;background:' + medal + ';color:#1e293b">' + (i + 1) + '</span>' +
          '<span style="flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          String(it.name || it.id).replace(/[<>&]/g, '') + '</span>' +
          '<span style="font-size:10px;opacity:.6">' + t + '</span></div>';
      }
      body.innerHTML = html;
    }

    function push(id, name) {
      id = String(id);
      if (seen[id]) return;
      seen[id] = 1;
      if (name) names[id] = name;
      var at = Date.now();
      if (!startedAt) startedAt = at;
      order.push({ id: id, name: names[id] || '', at: at });
      render();
    }

    function collect(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p || typeof p !== 'object') continue;
        var id = p.steamId || p.steam_id || p.uuid || p.platformId;
        var nm = p.nickname || p.nickName || p.name;
        if (id && nm) names[String(id)] = String(nm);
      }
    }

    function sniff(v, depth, budget) {
      if (!v || typeof v !== 'object' || depth > 6 || budget.n > 3000) return;
      budget.n++;
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) sniff(v[i], depth + 1, budget);
        return;
      }
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
        var val = v[k];
        if ((k === 'readyUuids' || k === 'readyMembers' || k === 'ready_members' || k === 'readyPlayerIds' || k === 'readySteamIds') && Array.isArray(val)) {
          for (var j = 0; j < val.length; j++) if (typeof val[j] === 'string' || typeof val[j] === 'number') push(val[j]);
        } else if ((k === 'ready_player_id' || k === 'readyPlayerId') && (typeof val === 'string' || typeof val === 'number')) {
          push(val);
        } else if ((k === 'players' || k === 'unassigned' || k === 'members') && Array.isArray(val)) {
          collect(val);
        } else if (k === 'matchId' || k === 'platformGameId' || k === 'gameId') {
          if (matchId && String(val) !== matchId) { order = []; seen = {}; startedAt = 0; }
          matchId = String(val);
        }
        if (val && typeof val === 'object') sniff(val, depth + 1, budget);
      }
    }

    function sniffSafe(v) { try { sniff(v, 0, { n: 0 }); } catch (e) {} }

    if (!window.__CSMH_NO_SNIFF__) {
    try {
      var internals = window.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') {
        var raw = internals.invoke.bind(internals);
        internals.invoke = function (cmd, args, opts) {
          return raw(cmd, args, opts).then(function (res) { sniffSafe(res); return res; });
        };
      }
    } catch (e) {}

    try {
      var internals2 = window.__TAURI_INTERNALS__;
      if (internals2 && typeof internals2.transformCallback === 'function') {
        var rawCb = internals2.transformCallback.bind(internals2);
        internals2.transformCallback = function (cb, once) {
          return rawCb(function (payload) { sniffSafe(payload); return cb.apply(this, arguments); }, once);
        };
      }
    } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', function () {
      document.body.appendChild(panel);
      render();
      document.getElementById('csmh-ready-head').addEventListener('click', function () {
        var body = document.getElementById('csmh-ready-body');
        body.style.display = body.style.display === 'none' ? '' : 'none';
      });
    }, { once: true });

    window.__CSMH_READY__ = { list: function () { return order.slice(); }, push: push, reset: function () { order = []; seen = {}; startedAt = 0; render(); } };
  })();
  /* ---------------- 隐藏 AI 导航 / 对局 HUD（兜底，静态已删） ---------------- */
  var sweep = function () {
    try {
      var i;
      var navBtns = document.querySelectorAll('nav button');
      for (i = 0; i < navBtns.length; i++) {
        var t = (navBtns[i].textContent || '').trim();
        if (t === 'AI 设置' || t === 'AI Settings') navBtns[i].style.display = 'none';
      }
      var btns = document.querySelectorAll('button');
      for (i = 0; i < btns.length; i++) {
        var lab = (btns[i].getAttribute('aria-label') || '').trim();
        var tx = (btns[i].textContent || '').trim();
        if (lab === '对局 HUD' || lab === 'Match HUD' || tx === '对局 HUD' || tx === 'Match HUD') {
          btns[i].style.display = 'none';
        }
      }
    } catch (e) {}
  };
  setInterval(sweep, 2000);
  document.addEventListener('DOMContentLoaded', sweep, { once: true });
})();

