"""verify_pack.py —— 从重打包后的 exe 里按资源表取出指定资源并解压到目录

用法: python verify_pack.py <exe> <outDir> [key ...]
"""
import sys, os, json, subprocess, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import repack_pe as R

exe, outdir = sys.argv[1], sys.argv[2]
keys = sys.argv[3:] or ['/assets/main-DWII-cul.js', '/index.html']
os.makedirs(outdir, exist_ok=True)

pe = R.PE(exe)
entries = R.find_entries(pe)
for key in keys:
    e = entries[key]
    off = pe.rva2off(e['data_ptr'] - pe.imagebase)
    data = bytes(pe.data[off:off + e['data_len']])
    name = key.strip('/').replace('/', '_')
    br = os.path.join(outdir, name + '.br')
    open(br, 'wb').write(data)
    print(f'{key:34s} ptr_off={off:#x} len={len(data)} head={data[:4].hex()}')
