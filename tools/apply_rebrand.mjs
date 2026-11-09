/**
 * apply_rebrand.mjs —— 把品牌/仓库/更新通道换成 SLEEPHASE fork
 * 用法: node apply_rebrand.mjs <file...>
 *
 * 做四件事：
 *   1. 标题栏 & 关于页：原作者 小淳 后面加「SLEEPHASE 源码二次开发」
 *   2. 仓库地址 qianjiachun/cs-match-helper → SLEEPHASE/cs-match-helper
 *   3. 更新下载通道 cdn.lunaris.win → GitHub Releases
 *   4. 关于页展示文本同步
 * 作者个人主页（github.com/qianjiachun/）保留，作为原作者署名。
 */
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('用法: node apply_rebrand.mjs <file...>');
  process.exit(1);
}

const RULES = [
  // 标题栏（中/英）
  ['CS 匹配助手 -By 小淳', 'CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发'],
  ['CS Match Helper - By 小淳', 'CS Match Helper - By 小淳 · SLEEPHASE fork'],
  // 关于页 By 行
  ['`By `+V(Dz)', '`By `+V(Dz)+` · SLEEPHASE 源码二次开发`'],
  // 仓库地址（先长后短）
  ['https://github.com/qianjiachun/cs-match-helper', 'https://github.com/SLEEPHASE/cs-match-helper'],
  ['github.com/qianjiachun/cs-match-helper', 'github.com/SLEEPHASE/cs-match-helper'],
  // 更新下载通道
  [
    'https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download',
    'https://github.com/SLEEPHASE/cs-match-helper/releases/latest/download/cs-match-helper.exe',
  ],
  // index.html / 窗口标题兜底
  ['<title>CS 匹配助手 -By 小淳</title>', '<title>CS 匹配助手 - By 小淳 · SLEEPHASE 源码二次开发</title>'],
];

let total = 0;
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const [from, to] of RULES) {
    const count = text.split(from).length - 1;
    if (count) {
      text = text.split(from).join(to);
      total += count;
      rows.push(`  ${String(count).padStart(2)}x  ${from.slice(0, 58)}`);
    }
  }
  if (rows.length) {
    fs.writeFileSync(file, text);
    console.log(`${file}\n${rows.join('\n')}`);
  } else {
    console.log(`${file}  (no match)`);
  }
}
console.log(`\ntotal replacements: ${total}`);
