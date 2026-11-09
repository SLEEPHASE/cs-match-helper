"""patch_version.py —— 把 exe 里所有 4.0.2 版本串换成 1.0.0（等长替换）

- UTF-16LE：版本资源里的 FileVersion / ProductVersion
- ASCII：代码里的 APP_VERSION 常量与标题串
用法: python patch_version.py <in.exe> <out.exe>
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
d = bytearray(open(src, 'rb').read())

old_a, new_a = b'4.0.2', b'1.0.0'
old_u, new_u = '4.0.2'.encode('utf-16le'), '1.0.0'.encode('utf-16le')

ca = d.count(old_a)
cu = d.count(old_u)
d = d.replace(old_a, new_a)
d = d.replace(old_u, new_u)

open(dst, 'wb').write(d)
print(f'ascii replaced: {ca}, utf16 replaced: {cu}, size {len(d)}')
