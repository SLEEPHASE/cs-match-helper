/**
 * pack_plain.mjs —— 诊断用：只改标题文字，不做任何逻辑改动
 * 用法: node pack_plain.mjs <frontendDir> <outDir>
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [, , frontendDir, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

const mainJs = fs
  .readFileSync(path.join(frontendDir, 'assets', 'main-DWII-cul.js'), 'utf8')
  .split('CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发')
  .join('CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发 · 禁止传播');

const indexHtml = fs
  .readFileSync(path.join(frontendDir, 'index.html'), 'utf8')
  .replace('<title>CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发</title>',
           '<title>CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发 · 禁止传播</title>');

const outputs = [
  { key: '/assets/main-DWII-cul.js', name: 'main.br', text: mainJs },
  { key: '/index.html', name: 'index.br', text: indexHtml },
];
const manifest = {};
for (const o of outputs) {
  const raw = Buffer.from(o.text, 'utf8');
  const br = zlib.brotliCompressSync(raw, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  });
  const p = path.join(outDir, o.name);
  fs.writeFileSync(p, br);
  manifest[o.key] = p;
  console.log(`${o.key} raw=${raw.length} br=${br.length}`);
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
