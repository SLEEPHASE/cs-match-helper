// sleephase-custom.js（运行时注入版，配合 extras 使用）
/**
 * sleephase-custom.js —— SLEEPHASE 定制层（拼在 extras 之后、主包之前执行）
 *
 * 1. 启动密码：必须输入 SLEEPHASE（本次启动有效）
 * 2. 更新通道：检查更新 / 更新日志 全部走 github.com/SLEEPHASE/cs-match-helper
 * 3. 版本号：统一显示 1.0.0
 * 4. 移除 AI：设置里的 AI 入口、对局页 AI 面板、所有 ai_* 命令
 * 5. 移除对局 HUD：标题栏入口 + HUD 窗口创建
 * 6. 标题追加「禁止传播」
 */
(() => {
  if (window.__CSMH_CUSTOM__) return;
  window.__CSMH_CUSTOM__ = true;

  const REPO = 'SLEEPHASE/cs-match-helper';
  const VERSION = '1.0.0';
  const PASSWORD = 'SLEEPHASE';
  const GATE_KEY = 'csmh.gate.ok';
  const TITLE_SUFFIX = ' · 禁止传播';
  const rawInvoke = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke
    ? window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__)
    : null;

  /* ---------------- 6. 标题 ---------------- */
  function fixTitle() {
    if (!document.title.includes('禁止传播')) {
      document.title = document.title + TITLE_SUFFIX;
    }
  }
  fixTitle();
  setInterval(fixTitle, 800);

  /* ---------------- 1. 启动密码 ---------------- */
  function showGate() {
    const wrap = document.createElement('div');
    wrap.id = 'csmh-gate';
    wrap.innerHTML = `
      <div class="csmh-gate__panel">
        <div class="csmh-gate__logo">CS 匹配助手</div>
        <div class="csmh-gate__sub">SLEEPHASE 定制版 · 禁止传播</div>
        <input id="csmh-gate-input" type="password" autocomplete="off" spellcheck="false"
               placeholder="请输入启动密码" />
        <button id="csmh-gate-btn" type="button">进入</button>
        <div id="csmh-gate-msg" class="csmh-gate__msg"></div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #csmh-gate{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;
        background:radial-gradient(1200px 600px at 50% 0%,#16202e,#0b1017 60%);backdrop-filter:blur(6px);
        font:13px/1.5 "Segoe UI",system-ui,sans-serif;color:#e9eff8;-webkit-app-region:no-drag;}
      .csmh-gate__panel{width:320px;padding:26px 24px;border-radius:16px;background:#111823;
        border:1px solid #25344a;box-shadow:0 24px 60px rgba(0,0,0,.5);text-align:center;}
      .csmh-gate__logo{font-size:17px;font-weight:700;letter-spacing:.5px;}
      .csmh-gate__sub{margin-top:4px;font-size:11px;color:#8395ab;}
      #csmh-gate-input{margin-top:18px;width:100%;box-sizing:border-box;padding:9px 12px;border-radius:9px;
        border:1px solid #25344a;background:#0b1017;color:#e9eff8;font-size:13px;outline:none;}
      #csmh-gate-input:focus{border-color:#4a90e2;box-shadow:0 0 0 3px rgba(74,144,226,.18);}
      #csmh-gate-btn{margin-top:10px;width:100%;padding:9px 12px;border:0;border-radius:9px;cursor:pointer;
        background:#4a90e2;color:#fff;font-size:13px;font-weight:600;}
      #csmh-gate-btn:hover{background:#3b7dd8;}
      .csmh-gate__msg{margin-top:8px;height:16px;font-size:11px;color:#fb7185;}`
    document.head.appendChild(style);
    document.body.appendChild(wrap);

    const input = wrap.querySelector('#csmh-gate-input');
    const btn = wrap.querySelector('#csmh-gate-btn');
    const msg = wrap.querySelector('#csmh-gate-msg');

    const submit = () => {
      if (input.value.trim() === PASSWORD) {
        try { sessionStorage.setItem(GATE_KEY, '1'); } catch {}
        wrap.remove();
        style.remove();
        return;
      }
      msg.textContent = '密码错误';
      input.value = '';
      input.focus();
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    setTimeout(() => input.focus(), 60);

    // 挡住 Tab 逃逸
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        input.focus();
      }
    });
  }

  let unlocked = false;
  try { unlocked = sessionStorage.getItem(GATE_KEY) === '1'; } catch {}
  if (!unlocked) {
    if (document.body) showGate();
    else document.addEventListener('DOMContentLoaded', showGate, { once: true });
  }
  window.addEventListener('beforeunload', () => {
    try { sessionStorage.removeItem(GATE_KEY); } catch {}
  });

  /* ---------------- 2. GitHub 通道 ---------------- */
  function parseMaybeJson(v) {
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return null; }
    }
    if (v && typeof v === 'object' && typeof v.body === 'string') {
      try { return JSON.parse(v.body); } catch { return v; }
    }
    return v;
  }

  async function gh(path) {
    const url = 'https://api.github.com/repos/' + REPO + path;
    const headers = { Accept: 'application/vnd.github+json' };
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (!rawInvoke) throw e;
      const r = await rawInvoke('fetch_http_json', { url, headers });
      return parseMaybeJson(r);
    }
  }

  const stripV = (t) => String(t || '').replace(/^v/i, '');

  const EMPTY_UPDATE = {
    currentVersion: VERSION,
    hasUpdate: false,
    latestVersion: VERSION,
    releaseNotes: '',
    releaseUrl: `https://github.com/${REPO}/releases`,
    downloadUrl: '',
    publishedAt: '',
  };

  async function checkUpdate() {
    try {
      return await checkUpdateInner();
    } catch (e) {
      console.warn('[csmh] update check failed:', e && e.message);
      return { ...EMPTY_UPDATE };
    }
  }

  async function checkUpdateInner() {
    const rel = await gh('/releases/latest');
    const tag = rel.tag_name || rel.name || '';
    const asset = (rel.assets || []).find((a) => String(a.name || '').toLowerCase().endsWith('.exe'));
    return {
      currentVersion: VERSION,
      hasUpdate: !!tag && stripV(tag) !== VERSION,
      latestVersion: stripV(tag),
      releaseNotes: rel.body || '',
      releaseUrl: rel.html_url || `https://github.com/${REPO}/releases/latest`,
      downloadUrl: asset ? asset.browser_download_url : (rel.html_url || `https://github.com/${REPO}/releases/latest`),
      publishedAt: rel.published_at || '',
    };
  }

  async function listReleases() {
    let list;
    try { list = await gh('/releases?per_page=50'); } catch { return []; }
    if (!Array.isArray(list)) return [];
    return list.map((r) => ({
      tag: r.tag_name || '',
      name: r.name || r.tag_name || '',
      body: r.body || '',
      publishedAt: r.published_at || '',
      prerelease: !!r.prerelease,
    }));
  }

  async function getRelease(tag) {
    let r;
    try { r = await gh('/releases/tags/' + encodeURIComponent(tag)); } catch { return { tag, name: '', body: '', publishedAt: '' }; }
    return { tag: r.tag_name || tag, name: r.name || '', body: r.body || '', publishedAt: r.published_at || '' };
  }

  /* ---------------- 3/4/5. 拦截命令 ---------------- */
  const AI_CMDS = new Set([
    'start_ai_analysis', 'cancel_ai_analysis',
    'load_ai_settings', 'save_ai_settings', 'get_ai_settings_path',
  ]);

  if (rawInvoke) {
    const internals = window.__TAURI_INTERNALS__;
    const current = internals.invoke; // 已被 extras 包过一层（若存在）
    const callBase = current && current !== rawInvoke ? current.bind(internals) : rawInvoke;

    internals.invoke = async function (cmd, args, opts) {
      try {
        if (cmd === 'get_app_version') {
          return { name: 'CS 匹配助手', version: VERSION, platform: 'windows' };
        }
        if (cmd === 'check_for_update') return await checkUpdate();
        if (cmd === 'list_changelog_releases') return await listReleases();
        if (cmd === 'get_changelog_release') return await getRelease((args && args.tag) || '');
        if (cmd === 'download_update') {
          // 不落盘：直接打开 Releases 页面，交给用户手动下载
          try {
            await callBase('plugin:opener|open_url', { url: `https://github.com/${REPO}/releases/latest` });
          } catch {}
          throw new Error('请到 GitHub Releases 页面下载新版本');
        }
        if (AI_CMDS.has(cmd)) {
          if (cmd === 'load_ai_settings') {
            return { analysisEnabled: false, providerMode: 'deepseek', apiKey: '', hasApiKey: false, baseUrl: '', model: '', thinkingEnabled: false };
          }
          if (cmd === 'get_ai_settings_path') return { path: '' };
          if (cmd === 'save_ai_settings') return { analysisEnabled: false };
          throw new Error('AI 功能已移除');
        }
        // 对局 HUD 窗口创建（label 含 hud 的一律拒绝）
        if ((cmd === 'plugin:window|create' || cmd === 'plugin:webview|create_webview_window') &&
            args && JSON.stringify(args.options || args).toLowerCase().includes('hud')) {
          throw new Error('对局 HUD 已移除');
        }
      } catch (e) {
        throw e;
      }
      return callBase(cmd, args, opts);
    };
  }

  /* ---------------- 4/5. 移除 UI 入口 ---------------- */
  function hideEl(el) {
    if (!el) return;
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('data-csmh-removed', '1');
  }

  function sweep() {
    // 设置页：AI 导航项
    document.querySelectorAll('nav button').forEach((b) => {
      const t = (b.textContent || '').trim();
      if (/^AI( 设置)?$/i.test(t) || t === 'AI 设置' || t === 'AI Settings') hideEl(b);
    });

    // 标题栏：对局 HUD 按钮
    document.querySelectorAll('button').forEach((b) => {
      const label = (b.getAttribute('aria-label') || '').trim();
      const text = (b.textContent || '').trim();
      if (label === '对局 HUD' || label === 'Match HUD' || text === '对局 HUD' || text === 'Match HUD') {
        hideEl(b);
      }
    });

    // AI 卡片 / 面板：标题是「AI 分析」的容器整块隐藏
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const targets = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t === 'AI 分析' || t === 'AI analysis' || t === 'AI 设置' || t === 'AI settings') {
        targets.push(n.parentElement);
      }
    }
    for (const el of targets) {
      if (!el || el.closest('[data-csmh-removed]')) continue;
      const card = el.closest('section') || el.closest('[class*="rounded-2xl"]') || el.parentElement;
      hideEl(card);
    }
  }

  let scheduled = false;
  const scheduleSweep = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try { sweep(); } catch {}
    }, 300);
  };

  if (document.body) {
    scheduleSweep();
    try { new MutationObserver(scheduleSweep).observe(document.body, { childList: true, subtree: true }); } catch {}
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      scheduleSweep();
      try { new MutationObserver(scheduleSweep).observe(document.body, { childList: true, subtree: true }); } catch {}
    }, { once: true });
  }
  setInterval(sweep, 3000);
})();



