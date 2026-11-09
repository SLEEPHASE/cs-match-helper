/**
 * pack_frontend.mjs —— 重打包前端资源
 *
 * 用法: node pack_frontend.mjs <frontendDir> <outDir> [cacheTag] [--no-api] [--no-inline]
 *   --no-api     跳过静态 API 改写 + AI/HUD 删除（用于二分定位）
 *   --no-inline  跳过 index.html 内联脚本（密码/主题/面板/更新桥）
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const NO_API = args.includes('--no-api');
const NO_INLINE = args.includes('--no-inline');
const NO_SNIFF = args.includes('--no-sniff');
const NO_BUST = args.includes('--no-bust');
const positional = args.filter((a) => !a.startsWith('--'));
const frontendDir = positional[0];
const outDir = positional[1];
const CACHE_TAG = positional[2] || '200';

fs.mkdirSync(outDir, { recursive: true });

const mainJsRaw = fs.readFileSync(path.join(frontendDir, 'assets', 'main-DWII-cul.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const inline = fs.readFileSync(path.join(frontendDir, 'assets', 'sleephase-inline.js'), 'utf8');

let mainJs = mainJsRaw;

/* ---------- 1. 标题静态落盘 ---------- */
mainJs = mainJs
  .split('CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发')
  .join('CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发 · 禁止传播')
  .split('CS Match Helper - By 小淳 · SLEEPHASE fork')
  .join('CS Match Helper - By 小淳 · SLEEPHASE fork · DO NOT DISTRIBUTE');

/* ---------- 2/3. 静态删除 + API 改写 ---------- */
if (!NO_API) {
  const AI_NAV = '{id:`ai`,label:c(`settings.ai`),desc:c(`settings.aiDesc`),icon:Bd},';
  if (!mainJs.includes(AI_NAV)) {
    console.error('AI 导航项没找到');
    process.exit(1);
  }
  mainJs = mainJs.split(AI_NAV).join('');

  const hudRe = /g\.value\?\(s\(\),i\(`button`,\{key:2,[\s\S]{0,1200}?\],8,mv\)\):a\(``,!0\),/;
  if (!hudRe.test(mainJs)) {
    console.error('对局 HUD 按钮块没匹配到');
    process.exit(1);
  }
  mainJs = mainJs.replace(hudRe, 'a(``,!0),');

  const REPLACEMENTS = [
    ['async function B_(){return J(`get_app_version`)}',
     'async function B_(){return `1.0.0`}'],
    ['async function V_(){return J(`check_for_update`)}',
     'async function V_(){return window.__CSMH_NET__.checkUpdate()}'],
    ['async function H_(){return J(`list_changelog_releases`)}',
     'async function H_(){return window.__CSMH_NET__.listReleases()}'],
    ['async function U_(e){return J(`get_changelog_release`,{tag:e})}',
     'async function U_(e){return window.__CSMH_NET__.getRelease(e)}'],
    ['async function W_(e){return J(`download_update`,{version:e})}',
     'async function W_(e){return window.__CSMH_NET__.download(e)}'],
    ['async function A_(){return J(`get_ai_settings_path`)}',
     'async function A_(){return window.__CSMH_NET__.aiPath()}'],
    ['async function j_(){return J(`load_ai_settings`)}',
     'async function j_(){return window.__CSMH_NET__.aiSettings()}'],
    ['async function M_(e){return J(`save_ai_settings`,{input:e})}',
     'async function M_(e){return window.__CSMH_NET__.aiSave(e)}'],
    ['async function N_(e){await J(`start_ai_analysis`,{input:e})}',
     'async function N_(e){return null}'],
    ['async function P_(){await J(`cancel_ai_analysis`)}',
     'async function P_(){return null}'],
  ];

  for (const [from, to] of REPLACEMENTS) {
    const n = mainJs.split(from).length - 1;
    if (n !== 1) {
      console.error(`静态改写失败（命中 ${n} 次）: ${from.slice(0, 60)}`);
      process.exit(1);
    }
    mainJs = mainJs.split(from).join(to);
  }
  console.log(`static: ai-nav removed, hud removed, api patches ${REPLACEMENTS.length}/${REPLACEMENTS.length}`);
} else {
  console.log('static: skipped (--no-api)');
}

/* ---------- 4. index.html ---------- */
let newIndex = indexHtml
  .replace(/^\s*<!--[^>]*-->\s*\n\s*<script defer src="\.\/assets\/sleephase-extras\.js"><\/script>\s*\n/gm, '')
  .replace(/^\s*<script defer src="\.\/assets\/sleephase-extras\.js"><\/script>\s*\n/gm, '');

if (!NO_INLINE) {
  newIndex = newIndex.replace(
    /(<script type="module"[^>]*src="\.\/assets\/[^"]+"><\/script>)/,
    (m) => `<script>${NO_SNIFF ? 'window.__CSMH_NO_SNIFF__=1;' : ''}\n${inline}\n</script>\n    ${m}`
  );
}

if (!NO_BUST) newIndex = newIndex.replace(/(src|href)="\.\/assets\/([^"?]+)"/g, (m, attr, file) => `${attr}="./assets/${file}?v=${CACHE_TAG}"`);

if (!NO_INLINE && !newIndex.includes('csmh-gate-input')) {
  console.error('内联脚本没插进 index.html');
  process.exit(1);
}

/* ---------- 5. 压缩 ---------- */
const outputs = [
  { key: '/assets/main-DWII-cul.js', name: 'main.br', text: mainJs },
  { key: '/index.html', name: 'index.br', text: newIndex },
];

const manifest = {};
for (const o of outputs) {
  const raw = Buffer.from(o.text, 'utf8');
  const br = zlib.brotliCompressSync(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  const p = path.join(outDir, o.name);
  fs.writeFileSync(p, br);
  manifest[o.key] = p;
  console.log(`${o.key.padEnd(34)} raw=${String(raw.length).padStart(7)}  br=${String(br.length).padStart(7)}  -> ${p}`);
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('\nmanifest written, cache tag = ' + CACHE_TAG);
