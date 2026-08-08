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


def in_rr(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    if x < x0 + r and y < y0 + r:
        return (x - x0 - r) ** 2 + (y - y0 - r) ** 2 <= r * r
    if x > x1 - r and y < y0 + r:
        return (x - (x1 - r)) ** 2 + (y - (y1 - r)) ** 2 <= r * r
    if x < x0 + r and y > y1 - r:
        return (x - x0 - r) ** 2 + (y - (y1 - r)) ** 2 <= r * r
    if x > x1 - r and y > y1 - r:
        return (x - (x1 - r)) ** 2 + (y - (y1 - r)) ** 2 <= r * r
    return True


def fill_rr(buf, size, x0, y0, x1, y1, r, col):
    for y in range(size):
        for x in range(size):
            if in_rr(x, y, x0, y0, x1, y1, r):
                i = (y * size + x) * 4
                buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = col[3]


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


# ── APP ICON: 紫渐变背景 + 浮起白卡片剪贴板（清新 / 有层次 / 视觉冲击）──
def draw_app(size):
    buf = bytearray(size * size * 4)
    s = size / 1024.0
    c0 = (52, 211, 153)   # #34d399 右上（清新薄荷绿，更亮更通透）
    c1 = (5, 150, 105)    # #059669 左下（品牌翠绿）
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            i = (y * size + x) * 4
            buf[i]     = int(c0[0] + (c1[0] - c0[0]) * t)
            buf[i + 1] = int(c0[1] + (c1[1] - c0[1]) * t)
            buf[i + 2] = int(c0[2] + (c1[2] - c0[2]) * t)
            buf[i + 3] = 255
    # 整图圆角遮罩（外部透明）
    R = 224 * s
    for y in range(size):
        for x in range(size):
            if not in_rr(x, y, 0, 0, size - 1, size - 1, R):
                buf[(y * size + x) * 4 + 3] = 0
    # 剪贴板卡片几何
    cx0, cy0, cx1, cy1, cr = 300 * s, 255 * s, 724 * s, 792 * s, 72 * s
    # 柔和投影：与背景预合成（偏移两层），避免缩放后透出桌面
    for y in range(size):
        for x in range(size):
            a = 0.0
            if in_rr(x, y - 22 * s, cx0, cy0, cx1, cy1, cr): a = max(a, 0.16)
            if in_rr(x, y - 40 * s, cx0, cy0, cx1, cy1, cr): a = max(a, 0.10)
            if a > 0:
                i = (y * size + x) * 4
                buf[i]     = int(buf[i] * (1 - a))
                buf[i + 1] = int(buf[i + 1] * (1 - a))
                buf[i + 2] = int(buf[i + 2] * (1 - a))
    # 白色浮起卡片
    fill_rr(buf, size, cx0, cy0, cx1, cy1, cr, (255, 255, 255, 255))
    # 顶部翠绿夹子
    fill_rr(buf, size, 437 * s, 232 * s, 587 * s, 300 * s, 20 * s, (5, 150, 105, 255))
    # 淡绿内容线（第三条更短，模拟段落）
    line = (52, 211, 153, 255)
    for ly, x1 in [(430 * s, 668 * s), (540 * s, 668 * s), (650 * s, 560 * s)]:
        fill_rr(buf, size, 360 * s, ly, x1, ly + 26 * s, 13 * s, line)
    return buf


# ── LOGO: 透明背景 + 翠绿剪贴板剪影（用于 README / 品牌，形态与 app 图标统一）──
def draw_logo(size):
    buf = bytearray(size * size * 4)  # 全透明
    s = size / 1024.0
    green = (16, 185, 129, 255)  # #10b981 品牌翠绿
    white = (255, 255, 255, 255)
    fill_rr(buf, size, 300 * s, 255 * s, 724 * s, 792 * s, 72 * s, green)
    fill_rr(buf, size, 437 * s, 232 * s, 587 * s, 300 * s, 20 * s, white)
    for ly, x1 in [(440 * s, 668 * s), (550 * s, 668 * s), (660 * s, 560 * s)]:
        fill_rr(buf, size, 360 * s, ly, x1, ly + 26 * s, 13 * s, white)
    return buf


base = draw_app(1024)
with open(os.path.join(OUT, "icon.png"), "wb") as f:
    f.write(make_png(1024, base))
print("wrote icon.png (1024)")

iconset = "/tmp/shelf.iconset"
os.makedirs(iconset, exist_ok=True)
files = {
    "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
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
print("ICNS_OK" if r.returncode == 0 else "ICNS_FAIL")

logo = draw_logo(1024)
with open(os.path.join(OUT, "logo.png"), "wb") as f:
    f.write(make_png(1024, logo))
print("wrote logo.png (1024, transparent)")
