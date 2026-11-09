/**
 * apply_strings.mjs —— 按映射批量替换 bundle 内中文（换皮 / 改名 / 汉化修正）
 * 用法:
 *   node apply_strings.mjs <in.js> <map.json> <out.js> [--dry]
 * map.json 形如: { "CS 匹配助手": "MyHelper", "完美平台": "PW" }
 */
import fs from 'node:fs';

const [, , inFile, mapFile, outFile, ...flags] = process.argv;
const dry = flags.includes('--dry');
const src = fs.readFileSync(inFile, 'utf8');
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

let out = src;
const report = [];
for (const [from, to] of Object.entries(map)) {
  const count = out.split(from).length - 1;
  report.push({ from, to, count });
  if (count && !dry) out = out.split(from).join(to);
}
report.sort((a, b) => b.count - a.count);
console.log(report.map((r) => `${String(r.count).padStart(3)}x  ${r.from}  ->  ${r.to}`).join('\n'));
const total = report.reduce((a, b) => a + b.count, 0);
console.log(`\ntotal replacements: ${total}${dry ? ' (dry-run)' : ''}`);
if (!dry) {
  fs.writeFileSync(outFile, out);
  console.log(`written: ${outFile} (${Buffer.byteLength(out)} bytes)`);
}
