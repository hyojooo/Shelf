import zlib, struct, subprocess, os

OUT = "/Users/guho/Desktop/Developer/clipboard-manager/assets"


def make_png(size, buf):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw.extend(buf[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    return png


def draw(size):
    buf = bytearray(size * size * 4)
    s = size / 1024.0

    def px(x, y, r, g, b, a):
        x = int(x); y = int(y)
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a

    def in_rr(x, y, x0, y0, x1, y1, r):
        if x < x0 or x > x1 or y < y0 or y > y1:
            return False
        if x < x0 + r and y < y0 + r:
            return (x - x0 - r) ** 2 + (y - y0 - r) ** 2 <= r * r
        if x > x1 - r and y < y0 + r:
            return (x - (x1 - r)) ** 2 + (y - y0 - r) ** 2 <= r * r
        if x < x0 + r and y > y1 - r:
            return (x - x0 - r) ** 2 + (y - (y1 - r)) ** 2 <= r * r
        if x > x1 - r and y > y1 - r:
            return (x - (x1 - r)) ** 2 + (y - (y1 - r)) ** 2 <= r * r
        return True

    # 背景渐变（紫色 #7c3aed -> #a78bfa）
    for y in range(size):
        for x in range(size):
            t = y / size
            r = int(124 + (167 - 124) * t)
            g = int(58 + (139 - 58) * t)
            b = int(237 + (250 - 237) * t)
            px(x, y, r, g, b, 255)

    # 整图圆角遮罩（外部透明）
    R = 224 * s
    for y in range(size):
        for x in range(size):
            if not in_rr(x, y, 0, 0, size - 1, size - 1, R):
                i = (y * size + x) * 4
                buf[i + 3] = 0

    white = (255, 255, 255, 255)

    def stroke_rr(x0, y0, x1, y1, r, w, col):
        for y in range(size):
            for x in range(size):
                if in_rr(x, y, x0, y0, x1, y1, r) and not in_rr(x, y, x0 + w, y0 + w, x1 - w, y1 - w, r - w):
                    px(x, y, *col)

    def fill_rr(x0, y0, x1, y1, r, col):
        for y in range(size):
            for x in range(size):
                if in_rr(x, y, x0, y0, x1, y1, r):
                    px(x, y, *col)

    stroke_rr(240 * s, 300 * s, 784 * s, 784 * s, 72 * s, 32 * s, white)   # 剪贴板外框
    fill_rr(420 * s, 220 * s, 604 * s, 320 * s, 24 * s, white)             # 顶部夹子
    for ly in (460 * s, 580 * s, 700 * s):                                  # 三条文本线
        fill_rr(320 * s, ly, 704 * s, ly + 28 * s, 14 * s, white)
    return buf


def scale(src, src_size, size):
    dst = bytearray(size * size * 4)
    for y in range(size):
        sy = min(src_size - 1, int(y * src_size / size))
        for x in range(size):
            sx = min(src_size - 1, int(x * src_size / size))
            i = (sy * src_size + sx) * 4
            j = (y * size + x) * 4
            dst[j] = src[i]; dst[j + 1] = src[i + 1]; dst[j + 2] = src[i + 2]; dst[j + 3] = src[i + 3]
    return dst


base = draw(1024)
with open(os.path.join(OUT, "icon.png"), "wb") as f:
    f.write(make_png(1024, base))
print("wrote icon.png (1024)")

iconset = "/tmp/shelf.iconset"
os.makedirs(iconset, exist_ok=True)
files = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}
for name, sz in files.items():
    b = scale(base, 1024, sz)
    with open(os.path.join(iconset, name), "wb") as f:
        f.write(make_png(sz, b))
print("wrote iconset")

r = subprocess.run(
    ["iconutil", "--convert", "icns", iconset, "-o", os.path.join(OUT, "icon.icns")],
    capture_output=True, text=True,
)
print("iconutil rc", r.returncode, r.stderr)
print("OK" if r.returncode == 0 else "ICNS_FAIL")
