/**
 * sleephase-custom.js —— SLEEPHASE 定制层（静态注入版）
 *
 * 和上一版的区别：不再劫持 __TAURI_INTERNALS__.invoke（Tauri 里那玩意儿可能是只读属性，
 * 赋值会抛异常，把后面的逻辑全部带走）。改成两条互不影响的路径：
 *
 *   A. 打包时静态改写前端 API 层的函数体（版本号 / 更新检查 / 更新日志 / AI 命令）
 *   B. 运行时只做纯 DOM 的事（标题后缀、启动密码、隐藏入口），每段独立 try/catch
 *
 * 所以这里只定义 window.__CSMH_NET__ 供 A 调用，以及 DOM 相关的 UI。
 */
(() => {
  if (window.__CSMH_CUSTOM__) return;
  window.__CSMH_CUSTOM__ = true;
  try { localStorage.setItem('csmh.boot.custom', String(Date.now())); } catch {}
  try { sessionStorage.removeItem('csmh.gate.ok'); } catch {}

  const REPO = 'SLEEPHASE/cs-match-helper';
  const VERSION = '1.0.0';
  const PASSWORD = 'SLEEPHASE';
  const GATE_KEY = 'csmh.gate.ok';
  const SUFFIX = ' · 禁止传播';

  /* ================= 1. 网络层（静态改写的函数会调用这里） ================= */
  const stripV = (t) => String(t || '').replace(/^v/i, '');

  async function gh(path) {
    const url = 'https://api.github.com/repos/' + REPO + path;
    const headers = { Accept: 'application/vnd.github+json' };
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  window.__CSMH_NET__ = {
    async checkUpdate() {
      try {
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
      } catch (e) {
        console.warn('[csmh] update check failed:', e && e.message);
        return {
          currentVersion: VERSION, hasUpdate: false, latestVersion: VERSION,
          releaseNotes: '', releaseUrl: `https://github.com/${REPO}/releases`,
          downloadUrl: '', publishedAt: '',
        };
      }
    },

    async listReleases() {
      try {
        const list = await gh('/releases?per_page=50');
        if (!Array.isArray(list)) return [];
        return list.map((r) => ({
          tag: r.tag_name || '',
          name: r.name || r.tag_name || '',
          body: r.body || '',
          publishedAt: r.published_at || '',
          prerelease: !!r.prerelease,
        }));
      } catch {
        return [];
      }
    },

    async getRelease(tag) {
      try {
        const r = await gh('/releases/tags/' + encodeURIComponent(tag));
        return { tag: r.tag_name || tag, name: r.name || '', body: r.body || '', publishedAt: r.published_at || '' };
      } catch {
        return { tag, name: '', body: '', publishedAt: '' };
      }
    },

    async download() {
      try {
        await window.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', {
          url: `https://github.com/${REPO}/releases/latest`,
        });
      } catch {}
      throw new Error('请到 GitHub Releases 页面下载新版本');
    },

    async aiSettings() {
      try {
        const s = await window.__TAURI_INTERNALS__.invoke('load_ai_settings');
        return Object.assign({}, s || {}, { analysisEnabled: false });
      } catch {
        return { analysisEnabled: false, hasApiKey: false };
      }
    },

    async aiSave(input) {
      try {
        return await window.__TAURI_INTERNALS__.invoke('save_ai_settings', {
          input: Object.assign({}, input || {}, { analysisEnabled: false }),
        });
      } catch {
        return { analysisEnabled: false };
      }
    },

    async aiPath() {
      try {
        return await window.__TAURI_INTERNALS__.invoke('get_ai_settings_path');
      } catch {
        return '';
      }
    },
  };

  /* ================= 2. 标题后缀 ================= */
  try {
    const fixTitle = () => {
      if (!document.title.includes('禁止传播')) document.title = document.title + SUFFIX;
    };
    fixTitle();
    setInterval(fixTitle, 800);
  } catch {}

  /* ================= 3. 启动密码 ================= */
  try {
    const unlocked = sessionStorage.getItem(GATE_KEY) === '1';
    if (!unlocked) {
      const mount = () => {
        const wrap = document.createElement('div');
        wrap.id = 'csmh-gate';
        wrap.innerHTML = `
          <div class="csmh-gate__panel">
            <div class="csmh-gate__logo">CS 匹配助手</div>
            <div class="csmh-gate__sub">SLEEPHASE 定制版 · 禁止传播</div>
            <input id="csmh-gate-input" type="password" autocomplete="off" spellcheck="false" placeholder="请输入启动密码" />
            <button id="csmh-gate-btn" type="button">进入</button>
            <div id="csmh-gate-msg" class="csmh-gate__msg"></div>
          </div>`;
        const style = document.createElement('style');
        style.id = 'csmh-gate-style';
        style.textContent = `
          #csmh-gate{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;
            background:radial-gradient(1200px 600px at 50% 0%,#16202e,#0b1017 60%);
            font:13px/1.5 "Segoe UI",system-ui,sans-serif;color:#e9eff8;}
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
          .csmh-gate__msg{margin-top:8px;height:16px;font-size:11px;color:#fb7185;}`;
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
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        setTimeout(() => input.focus(), 60);
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); input.focus(); } });
      };

      if (document.body) mount();
      else document.addEventListener('DOMContentLoaded', mount, { once: true });
    }

    window.addEventListener('beforeunload', () => {
      try { sessionStorage.removeItem(GATE_KEY); } catch {}
    });
  } catch (e) {
    console.warn('[csmh] gate failed:', e && e.message);
  }

  /* ================= 4. 隐藏 AI / 对局 HUD 入口 ================= */
  try {
    const style = document.createElement('style');
    style.id = 'csmh-hide-style';
    style.textContent = '.csmh-hidden{display:none !important}';
    document.head.appendChild(style);

    const hideEl = (el) => {
      if (!el || el.nodeType !== 1) return;
      el.classList.add('csmh-hidden');
      el.setAttribute('data-csmh-removed', '1');
    };

    const sweep = () => {
      document.querySelectorAll('nav button').forEach((b) => {
        const t = (b.textContent || '').trim();
        if (t === 'AI 设置' || t === 'AI Settings') hideEl(b);
      });

      document.querySelectorAll('button').forEach((b) => {
        const label = (b.getAttribute('aria-label') || '').trim();
        const text = (b.textContent || '').trim();
        if (label === '对局 HUD' || label === 'Match HUD' || text === '对局 HUD' || text === 'Match HUD') {
          hideEl(b);
        }
      });

      document.querySelectorAll('section').forEach((sec) => {
        const h = sec.querySelector(':scope > header');
        if (!h) return;
        const t = (h.textContent || '').trim();
        if (t === 'AI 分析' || t === 'AI analysis') hideEl(sec);
      });
    };

    let panic = 0;
    const watchdog = () => {
      const app = document.querySelector('#app') || document.body;
      if (!app || !app.getBoundingClientRect) return;
      const h = app.getBoundingClientRect().height;
      if (h < 60) {
        if (++panic >= 2) {
          document.querySelectorAll('.csmh-hidden').forEach((el) => el.classList.remove('csmh-hidden'));
          panic = 0;
          console.warn('[csmh] watchdog restored hidden nodes');
        }
      } else {
        panic = 0;
      }
    };

    let scheduled = false;
    const scheduleSweep = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { scheduled = false; try { sweep(); } catch {} }, 300);
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
    setInterval(() => { try { sweep(); } catch {} try { watchdog(); } catch {} }, 3000);
  } catch (e) {
    console.warn('[csmh] ui tweaks failed:', e && e.message);
  }
})();

