"""从 cs-match-helper.exe 的 .rsrc 中还原 icon.ico（RT_GROUP_ICON + RT_ICON）。"""
import struct, sys, os

exe, out = sys.argv[1], sys.argv[2]
d = open(exe, 'rb').read()

e = struct.unpack_from('<I', d, 0x3C)[0]
nsec = struct.unpack_from('<H', d, e + 6)[0]
opt = e + 24
magic = struct.unpack_from('<H', d, opt)[0]
ddoff = opt + (112 if magic == 0x20b else 96)
secoff = ddoff + 16 * 8

secs = []
for i in range(nsec):
    nm, vs, va, rs, rp, lp, ln, nr, nl, sc = struct.unpack_from('<8sIIIIIIHHI', d, secoff + i * 40)
    secs.append((nm.rstrip(b'\0').decode('latin1'), vs, va, rs, rp))

def rva2off(rva):
    for nm, vs, va, rs, rp in secs:
        if va <= rva < va + max(vs, rs):
            return rp + (rva - va)
    return None

rsrc_rva, rsrc_size = struct.unpack_from('<II', d, ddoff + 2 * 8)
base = rva2off(rsrc_rva)

leaves = {}  # (type, name) -> (rva, size)

def walk(off, path):
    chars, ts, maj, minr, nn, ni = struct.unpack_from('<IIHHHH', d, base + off)
    for i in range(nn + ni):
        name, o = struct.unpack_from('<II', d, base + off + 16 + i * 8)
        if name & 0x80000000:
            so = base + (name & 0x7FFFFFFF)
            ln = struct.unpack_from('<H', d, so)[0]
            key = d[so + 2:so + 2 + ln * 2].decode('utf-16le')
        else:
            key = name
        if o & 0x80000000:
            walk(o & 0x7FFFFFFF, path + [key])
        else:
            drva, dsize, cp, _ = struct.unpack_from('<IIII', d, base + o)
            leaves[tuple(path + [key])] = (drva, dsize)

walk(0, [])

group = None
for k, v in leaves.items():
    if len(k) == 3 and k[0] == 14:
        group = v
        break
if not group:
    raise SystemExit('no RT_GROUP_ICON')

grp_off = rva2off(group[0])
reserved, rtype, count = struct.unpack_from('<HHH', d, grp_off)
entries = []
for i in range(count):
    w, h, cc, rsv, planes, bits, size, nid = struct.unpack_from('<BBBBHHIH', d, grp_off + 6 + i * 14)
    entries.append(dict(w=w, h=h, cc=cc, planes=planes, bits=bits, size=size, nid=nid))

images = {}
for k, v in leaves.items():
    if len(k) == 3 and k[0] == 3:
        images[k[1]] = v
    elif len(k) == 4 and k[0] == 3:
        images[k[1]] = v

blobs = []
for ent in entries:
    img = images.get(ent['nid'])
    if not img:
        continue
    off = rva2off(img[0])
    blobs.append((ent, d[off:off + img[1]]))

# 组装 ICO
out_buf = bytearray()
out_buf += struct.pack('<HHH', 0, 1, len(blobs))
offset = 6 + 16 * len(blobs)
dir_entries = bytearray()
for ent, blob in blobs:
    dir_entries += struct.pack('<BBBBHHII', ent['w'], ent['h'], ent['cc'], 0,
                               ent['planes'] or 1, ent['bits'], len(blob), offset)
    offset += len(blob)
out_buf += dir_entries
for _, blob in blobs:
    out_buf += blob

os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'wb').write(out_buf)
print(f"icon.ico written: {len(out_buf)} bytes, {len(blobs)} images: " +
      ", ".join(f"{e['w']}x{e['h']}@{e['bits']}bit" for e, _ in blobs))
