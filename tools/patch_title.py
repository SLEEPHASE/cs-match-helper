"""patch_title.py —— 把窗口标题里的「CS 匹配助手 -By 小淳」换成 SLEEPHASE 版（等长替换）

Rust 的 &str 带长度常量，所以只能等长替换；不够的部分用尾部空格补齐（标题里不可见）。
用法: python patch_title.py <in.exe> <out.exe>
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
d = bytearray(open(src, 'rb').read())

PAIRS = [
    ('CS 匹配助手 -By 小淳 v1.0.0', 'SLEEPHASE 匹配助手 v1.0.0'),
    ('CS Match Helper - By 小淳 v1.0.0', 'SLEEPHASE Match Helper v1.0.0'),
]

changed = 0
for old, new in PAIRS:
    ob, nb = old.encode('utf-8'), new.encode('utf-8')
    if len(nb) > len(ob):
        print(f'skip (too long): {old} {len(ob)} < {len(nb)}')
        continue
    pad = len(ob) - len(nb)
    repl = nb + b' ' * pad
    n = d.count(ob)
    if n:
        d = d.replace(ob, repl)
        changed += n
        print(f'replaced {n}x: {old} -> {new}{"." * 0} (+{pad} spaces)')
    else:
        print(f'not found: {old}')

open(dst, 'wb').write(d)
print(f'total {changed}, size {len(d)}')
