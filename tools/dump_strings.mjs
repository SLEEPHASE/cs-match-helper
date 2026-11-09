/**
 * dump_strings.mjs —— 抽取 bundle 里所有中文片段（不依赖引号解析，抗压缩/嵌套模板）
 * 用法: node dump_strings.mjs <bundle.js> <out.json>
 */
import fs from 'node:fs';

const file = process.argv[2];
const out = process.argv[3];
const src = fs.readFileSync(file, 'utf8');

// CJK 片段：中文 + 常见全角标点 + 数字/字母混排
const re = /[\u4e00-\u9fff][\u4e00-\u9fff0-9A-Za-z·・，。！？、：；（）《》“”‘’…—\-—\s]{0,60}/g;
const map = new Map();
let m;
while ((m = re.exec(src)) !== null) {
  let s = m[0].replace(/\s+$/, '');
  if (s.length < 2) continue;
  // 去掉尾部被代码截断的痕迹
  if (/[{}()[\];<>=$`]/.test(s)) s = s.replace(/[{}()[\];<>=$`].*$/, '').trim();
  if (s.length < 2) continue;
  if (!map.has(s)) map.set(s, { count: 0, offset: m.index });
  map.get(s).count++;
}

const rows = [...map.entries()]
  .map(([text, v]) => ({ text, count: v.count, offset: v.offset }))
  .sort((a, b) => b.count - a.count || b.text.length - a.text.length);

fs.writeFileSync(out, JSON.stringify(rows, null, 2));
console.log(`unique Chinese fragments: ${rows.length}`);
console.log(rows.slice(0, 30).map((r) => `${String(r.count).padStart(3)}x ${r.text}`).join('\n'));
