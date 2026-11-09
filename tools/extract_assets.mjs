import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const exe = process.argv[2];
const outDir = process.argv[3];
const buf = fs.readFileSync(exe);

// file offset <-> rva helpers for .rdata/.data/.text are not needed: we scan raw bytes.
const pathRe = /\/?(?:assets\/[A-Za-z0-9_\-./@]{1,140}\.(?:js|css|html|svg|png|jpg|jpeg|woff2?|json|ico|webp)|index\.html|favicon\.ico)/g;

const results = [];
let m;
while ((m = pathRe.exec(buf.toString('latin1'))) !== null) {
  // address conversion: latin1 string index == byte offset
  const start = m.index;
  let p = m[0];
  if (!p.startsWith('/')) p = '/' + p;
  const after = start + m[0].length;
  let ok = false, data = null, consumed = 0;
  try {
    data = zlib.brotliDecompressSync(buf.subarray(after, after + 6_000_000), { maxOutputLength: 60_000_000 });
    ok = true;
    consumed = 0;
  } catch (e) { ok = false; }
  if (ok) {
    results.push({ p, start, after, size: data.length, data, kind: 'brotli' });
  } else {
    // maybe raw png/svg/ico stored uncompressed
    const sig = buf.subarray(after, after + 8);
    if (sig[0] === 0x89 && sig[1] === 0x50) {
      const iend = buf.indexOf(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]), after);
      if (iend > 0) results.push({ p, start, after, size: iend + 8 - after, data: buf.subarray(after, iend + 8), kind: 'png-raw' });
    }
  }
}

// dedupe by path+size, keep first
const seen = new Set();
let written = 0;
for (const r of results) {
  const key = r.p + ':' + r.size;
  if (seen.has(key)) continue;
  seen.add(key);
  const dest = path.join(outDir, r.p.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, r.data);
  written++;
  console.log(`${r.kind.padEnd(9)} ${String(r.size).padStart(9)}  ${r.p}`);
}
console.log(`\nfiles written: ${written} (candidates: ${results.length})`);
