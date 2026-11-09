"""strip_admin.py —— 把 PE 清单里的 requireAdministrator 改成 asInvoker（等长替换，不动节区）

用法: python strip_admin.py <in.exe> <out.exe>
原理: 资源里的清单是明文 XML，把 `requireAdministrator"`(21B) 换成 `asInvoker"` + 12 个空格，
      总长度不变，因此不需要重建 .rsrc，也不会移动任何节。
"""
import sys, shutil

src, dst = sys.argv[1], sys.argv[2]
data = bytearray(open(src, 'rb').read())

needle = b'requireAdministrator"'
idx = data.find(needle)
if idx < 0:
    raise SystemExit('未找到 requireAdministrator（可能已经是 asInvoker 或清单被压缩）')

repl = b'asInvoker"' + b' ' * (len(needle) - len(b'asInvoker"'))
assert len(repl) == len(needle)
data[idx:idx + len(needle)] = repl

open(dst, 'wb').write(data)
print(f'patched at 0x{idx:x}: requireAdministrator -> asInvoker  ({len(data)} bytes)')
print('提示: 清单已改，PE 校验和不再有效（未签名二进制不影响运行）')
