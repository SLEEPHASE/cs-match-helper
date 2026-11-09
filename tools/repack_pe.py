"""repack_pe.py —— 往 Tauri 资源表里塞新数据（不新增条目，只改 data_ptr/data_len）

Tauri 2 的 EmbeddedAssets 条目是 32 字节定长：
    [0] key_ptr  (u64, imagebase+rva, 指向 "/assets/...")
    [1] key_len  (u64)
    [2] data_ptr (u64)
    [3] data_len (u64)

流程：把新压缩好的 brotli 流追加到一个新节（.adata），再把对应条目的
data_ptr/data_len 指过去；节表、SizeOfImage 一并更新。

用法:
  python repack_pe.py <in.exe> <out.exe> <manifest.json> [--probe]
manifest.json: { "/assets/main-DWII-cul.js": "build/main.br", "/index.html": "build/index.br" }
"""
import struct, sys, os, json

def align(v, a):
    return (v + a - 1) & ~(a - 1)

class PE:
    def __init__(self, path):
        self.data = bytearray(open(path, 'rb').read())
        d = self.data
        e = struct.unpack_from('<I', d, 0x3C)[0]
        self.e = e
        self.nsec = struct.unpack_from('<H', d, e + 6)[0]
        optsize = struct.unpack_from('<H', d, e + 20)[0]
        self.opt = e + 24
        self.optsize = optsize
        magic = struct.unpack_from('<H', d, self.opt)[0]
        assert magic == 0x20b, 'need PE32+'
        self.imagebase = struct.unpack_from('<Q', d, self.opt + 24)[0]
        self.section_align = struct.unpack_from('<I', d, self.opt + 32)[0]
        self.file_align = struct.unpack_from('<I', d, self.opt + 36)[0]
        self.size_of_image_off = self.opt + 56
        self.secoff = self.opt + optsize
        self.sections = []
        for i in range(self.nsec):
            off = self.secoff + i * 40
            name, vsize, va, rawsize, rawptr, _, _, _, _, schar = struct.unpack_from('<8sIIIIIIHHI', d, off)
            self.sections.append(dict(hdr=off, name=name.rstrip(b'\0').decode('latin1'), vsize=vsize,
                                      va=va, rawsize=rawsize, rawptr=rawptr, schar=schar))
        # relocations
        ddoff = self.opt + 112
        rel_rva, rel_size = struct.unpack_from('<II', d, ddoff + 5 * 8)
        self.relocated = set()
        pos = self.rva2off(rel_rva)
        if pos:
            end = pos + rel_size
            while pos < end:
                page, blocksize = struct.unpack_from('<II', d, pos)
                if blocksize == 0:
                    break
                for i in range((blocksize - 8) // 2):
                    ent = struct.unpack_from('<H', d, pos + 8 + i * 2)[0]
                    if (ent >> 12) == 10:
                        self.relocated.add(page + (ent & 0xFFF))
                pos += blocksize

    def rva2off(self, rva):
        for s in self.sections:
            if s['va'] <= rva < s['va'] + max(s['vsize'], s['rawsize']):
                return s['rawptr'] + (rva - s['va'])
        return None

    def off2rva(self, off):
        for s in self.sections:
            if s['rawptr'] <= off < s['rawptr'] + s['rawsize']:
                return s['va'] + (off - s['rawptr'])
        return None


def find_entries(pe):
    """以 main.js 的 key_ptr 为锚点，前后按 32 字节步长收集条目。"""
    d = pe.data
    ib = pe.imagebase
    anchor = d.find(b'/assets/main-DWII-cul.js')
    assert anchor > 0, 'path not found'
    anchor_rva = pe.off2rva(anchor)
    needle = struct.pack('<Q', ib + anchor_rva)
    slot = d.find(needle)
    assert slot > 0, 'entry key_ptr not found'

    def looks_like_entry(off):
        if off < 0 or off + 32 > len(d):
            return None
        kp, kl, dp, dl = struct.unpack_from('<QQQQ', d, off)
        if not (ib < kp < ib + 0x800000):
            return None
        krva = kp - ib
        ko = pe.rva2off(krva)
        if ko is None:
            return None
        key = d[ko:ko + kl]
        if not key.startswith(b'/') or b'\x00' in key or kl < 4 or kl > 200:
            return None
        try:
            key.decode('ascii')
        except UnicodeDecodeError:
            return None
        if not (ib < dp < ib + 0x800000) or dl <= 0 or dl > 8_000_000:
            return None
        return key.decode('ascii'), kp, kl, dp, dl

    start = slot
    while looks_like_entry(start - 32):
        start -= 32
    entries = {}
    off = start
    while True:
        e = looks_like_entry(off)
        if not e:
            break
        key, kp, kl, dp, dl = e
        entries[key] = dict(off=off, key_ptr=kp, key_len=kl, data_ptr=dp, data_len=dl)
        off += 32
    return entries


def probe(path):
    pe = PE(path)
    entries = find_entries(pe)
    print(f'entries: {len(entries)}  imagebase={pe.imagebase:#x}')
    for key, e in entries.items():
        doff = pe.rva2off(e['data_ptr'] - pe.imagebase)
        head = pe.data[doff:doff + 4].hex() if doff else '??'
        rel = (e['off'] + 16) in pe.relocated
        print(f"  {key:42s} data_len={e['data_len']:8d} off={e['off']:#x} reloc={rel} head={head}")
    return pe, entries


def repack(inp, outp, manifest_path):
    pe, entries = probe(inp)
    manifest = json.load(open(manifest_path, 'r', encoding='utf-8'))
    missing = [k for k in manifest if k not in entries]
    assert not missing, f'manifest keys not in asset table: {missing}'

    # 1) 拼接新数据
    blob = bytearray()
    placed = {}
    for key, src in manifest.items():
        data = open(src, 'rb').read()
        offset = len(blob)
        blob += data
        while len(blob) % 16:
            blob += b'\x00'
        placed[key] = (offset, len(data))
        print(f'  + {key:42s} {len(data):8d} bytes')

    last = pe.sections[-1]
    new_va = align(last['va'] + last['vsize'], pe.section_align)
    new_raw = align(len(pe.data), pe.file_align)
    vsize = len(blob)
    rawsize = align(vsize, pe.file_align)

    # 2) 写节头（section table 后面必须还有 40 字节空间）
    table_end = pe.secoff + pe.nsec * 40
    first_raw = min(s['rawptr'] for s in pe.sections if s['rawptr'] > 0)
    assert first_raw - table_end >= 40, 'no room for a new section header'

    hdr = struct.pack('<8sIIIIIIHHI', b'.adata\0\0', vsize, new_va, rawsize, new_raw, 0, 0, 0, 0, 0x40000040)
    pe.data[table_end:table_end + 40] = hdr
    struct.pack_into('<H', pe.data, pe.e + 6, pe.nsec + 1)
    struct.pack_into('<I', pe.data, pe.size_of_image_off, align(new_va + vsize, pe.section_align))

    # 3) 追加数据
    pe.data += b'\x00' * (new_raw - len(pe.data))
    pe.data += blob
    pe.data += b'\x00' * (rawsize - vsize)

    # 4) 改条目
    for key, (offset, length) in placed.items():
        e = entries[key]
        slot_rva = pe.off2rva(e['off'] + 16)
        assert slot_rva in pe.relocated, f'{key}: data_ptr slot is not relocated (rva={slot_rva})'
        struct.pack_into('<Q', pe.data, e['off'] + 16, pe.imagebase + new_va + offset)
        struct.pack_into('<Q', pe.data, e['off'] + 24, length)
        print(f'  ~ {key:42s} -> rva {new_va + offset:#x} len {length}')

    open(outp, 'wb').write(pe.data)
    print(f'written {outp} ({len(pe.data)} bytes, +{len(pe.data) - os.path.getsize(inp)})')


if __name__ == '__main__':
    if '--probe' in sys.argv:
        probe(sys.argv[1])
    else:
        repack(sys.argv[1], sys.argv[2], sys.argv[3])

