/**
 * no-5e.js —— 关闭全部 5E 相关高风险动作（CDP 调试端口 / 进程重启 / 抓包）
 * 目标：打完美平台时不再出现 5E 客户端调试链路，降低平台风控与 5E 反作弊命中面。
 */
(() => {
  const i = window.__TAURI_INTERNALS__;
  if (!i || i.__no5e) return;
  i.__no5e = true;

  const BLOCK = new Set([
    'launch_5e_with_cdp',
    'start_5e_cdp_collector',
    'probe_5e_cdp_active',
    'set_5e_cdp_gate_debug_mode',
    'set_5e_cdp_ws_debug_mode',
    'fetch_5e_match_detail',
    'fetch_5e_player_home',
    'fetch_5e_player_home_batch',
  ]);

  const raw = i.invoke.bind(i);
  i.invoke = async (cmd, args, opts) => {
    if (BLOCK.has(cmd)) {
      console.warn('[no-5e] blocked', cmd);
      if (cmd === 'get_5e_cdp_status') return { running: false, cdpReady: false, port: null };
      if (cmd === 'stop_5e_cdp_collector') return null;
      throw new Error('5E 功能已禁用（no-5e mod）');
    }
    return raw(cmd, args, opts);
  };
  console.log('[no-5e] active');
})();
