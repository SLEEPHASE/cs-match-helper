/**
 * example-mod.js —— 运行时魔改示例
 * 由 mod_loader.mjs 通过 CDP 注入到 cs-match-helper 的 WebView 里。
 * 改完保存，重新运行 mod_loader 即可生效（热重载未实现）。
 */
(() => {
  if (window.__MODDED__) return;
  window.__MODDED__ = true;

  const TAG = '[MOD]';
  const log = (...a) => console.log(TAG, ...a);

  /* ---------- 1. 拦截后端 invoke ---------- */
  const internals = window.__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function' && !internals.__wrapped) {
    const raw = internals.invoke.bind(internals);
    internals.invoke = async (cmd, args, opts) => {
      // 1.1 屏蔽 5E 调试端口链路（PAC/5E 风险最高的功能）
      if (['launch_5e_with_cdp', 'start_5e_cdp_collector'].includes(cmd)) {
        log('blocked', cmd);
        throw new Error('该功能已在 mod 中禁用');
      }

      // 1.2 改版本号
      if (cmd === 'get_app_version') {
        const v = await raw(cmd, args, opts).catch(() => null);
        return { ...(v || {}), version: '4.0.2-mod', name: 'CS 匹配助手 MOD' };
      }

      const t0 = performance.now();
      try {
        const r = await raw(cmd, args, opts);
        log(cmd, Math.round(performance.now() - t0) + 'ms');
        return r;
      } catch (e) {
        log(cmd, 'ERR', String(e));
        throw e;
      }
    };
    internals.__wrapped = true;
  }

  /* ---------- 2. 改标题 / 注入徽标 ---------- */
  const applyDom = () => {
    document.title = 'CS 匹配助手 · MOD';
    if (document.getElementById('mod-badge')) return;
    const b = document.createElement('div');
    b.id = 'mod-badge';
    b.textContent = 'MOD';
    Object.assign(b.style, {
      position: 'fixed', right: '10px', bottom: '10px', zIndex: 2147483647,
      padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
      color: '#fff', background: 'linear-gradient(90deg,#f43f5e,#f59e0b)',
      boxShadow: '0 4px 12px rgba(0,0,0,.25)', pointerEvents: 'none',
      fontFamily: 'system-ui, sans-serif',
    });
    document.body.appendChild(b);
  };
  applyDom();
  new MutationObserver(applyDom).observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- 3. 监听后端事件（AI 流式输出等） ---------- */
  try {
    const ev = window.__TAURI_INTERNALS__?.callbacks;
    log('callbacks ready:', !!ev);
    if (internals.event?.listen) {
      internals.event.listen('ai-analysis-delta', (e) => log('ai-delta', e?.payload));
    }
  } catch (e) {
    log('event hook skipped', String(e));
  }

  /* ---------- 4. 文案替换（不动 bundle，运行时替换 DOM 文本） ---------- */
  const dict = { '完美平台账号': '完美账号', 'CS 匹配助手': 'CS 匹配助手 MOD' };
  const walk = (root) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) {
      const t = n.nodeValue;
      if (!t) continue;
      let next = t;
      for (const [a, b] of Object.entries(dict)) if (next.includes(a)) next = next.split(a).join(b);
      if (next !== t) n.nodeValue = next;
    }
  };
  walk(document.body);

  log('example-mod ready');
})();
