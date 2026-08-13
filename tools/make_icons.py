#!/usr/bin/env python3
"""Generate extension icons: a green rounded square with a white download arrow.

Pure-stdlib PNG writer (no dependencies). Run from anywhere:
    python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

SIZES = [16, 32, 48, 128]
GREEN = (22, 163, 74)    # #16a34a
WHITE = (255, 255, 255)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "icons")


def rounded_rect_alpha(x, y, size):
    """0-255 coverage of a rounded square, with ~1px feather at the corners."""
    r = size * 0.22
    px, py = x + 0.5, y + 0.5
    cx = min(max(px, r), size - r)
    cy = min(max(py, r), size - r)
    d = math.hypot(px - cx, py - cy)
    if d <= r - 0.75:
        return 255
    if d >= r + 0.75:
        return 0
    return int(255 * (r + 0.75 - d) / 1.5)


def inside_arrow(x, y, size):
    """White download arrow: downward triangle plus a vertical stem, centered."""
    cx = (size - 1) / 2.0
    top = size * 0.24
    bottom = size * 0.76
    half_w = size * 0.44
    tip_y = top + (bottom - top) * 0.45
    stem_half = size * 0.16

    # Triangle: A (left top), B (right top), C (tip, pointing down)
    ax, ay = cx - half_w, top
    bx, by = cx + half_w, top
    ccx, ccy = cx, tip_y
    denom = (by - ccy) * (ax - ccx) + (ccx - bx) * (ay - ccy)
    if denom != 0:
        a = ((by - ccy) * (x - ccx) + (ccx - bx) * (y - ccy)) / denom
        b = ((ccy - ay) * (x - ccx) + (ax - ccx) * (y - ccy)) / denom
        c = 1 - a - b
        if a >= 0 and b >= 0 and c >= 0:
            return True

    # Stem
    if abs(x - cx) <= stem_half and tip_y <= y <= bottom:
        return True
    return False


def write_png(path, size):
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type 0
        for x in range(size):
            alpha = rounded_rect_alpha(x, y, size)
            if alpha == 0:
                row += b"\x00\x00\x00\x00"
                continue
            base = WHITE if inside_arrow(x, y, size) else GREEN
            row += bytes((base[0], base[1], base[2], alpha))
        rows.append(bytes(row))

    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, "icon{}.png".format(size))
        write_png(path, size)
        print("wrote", os.path.relpath(path, os.path.join(HERE, "..")))


if __name__ == "__main__":
    main()
