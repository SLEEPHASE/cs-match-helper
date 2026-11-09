/**
 * dump_i18n.mjs —— 从 i18n bundle 里把内联的多语言消息对象抠出来
 * 用法: node dump_i18n.mjs <i18n-*.js> <outDir>
 * 产物: zh-CN.json / en.json / index.json
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const outDir = process.argv[3] || '.';
const src = fs.readFileSync(file, 'utf8');

/** 从 start（指向 '{'）开始做括号配对，正确处理 ' " ` 与 ${ } */
function matchObject(text, start) {
  let i = start, depth = 0;
  let quote = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (quote === '`' && c === '$' && text[i + 1] === '{') {
        // 模板插值：递归到对应 }
        let d = 1; i += 2;
        while (i < text.length && d > 0) {
          if (text[i] === '{') d++;
          else if (text[i] === '}') d--;
          i++;
        }
        i--;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  throw new Error('unbalanced object at ' + start);
}

const found = [];
for (const m of src.matchAll(/[A-Za-z_$][\w$]*\s*=\s*\{common:\{appName:/g)) {
  const brace = src.indexOf('{', m.index);
  const literal = matchObject(src, brace);
  let data;
  try { data = new Function('return (' + literal + ')')(); }
  catch (e) { console.warn('eval failed:', e.message); continue; }
  found.push({ at: m.index, name: src.slice(m.index, m.index + 4).trim(), data, literal });
}

if (!found.length) throw new Error('no i18n message object found');

fs.mkdirSync(outDir, { recursive: true });
const summary = [];
for (const f of found) {
  const isZh = f.data?.common?.appName?.includes('匹配助手');
  const name = isZh ? 'zh-CN' : 'en';
  const dest = path.join(outDir, name + '.json');
  fs.writeFileSync(dest, JSON.stringify(f.data, null, 2));
  const leafCount = countLeaves(f.data);
  summary.push({ name, dest, namespace: Object.keys(f.data), leaves: leafCount, size: f.literal.length });
  console.log(`${name.padEnd(6)} -> ${dest}  namespaces=${Object.keys(f.data).length} leaves=${leafCount} bytes=${f.literal.length}`);
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(summary, null, 2));

function countLeaves(o) {
  let n = 0;
  for (const v of Object.values(o)) n += (v && typeof v === 'object') ? countLeaves(v) : 1;
  return n;
}
