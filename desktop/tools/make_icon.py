#!/usr/bin/env python3
"""Builds the desktop icon (Michi) from the web favicon so both apps share the same cat.

Usage: python3 desktop/tools/make_icon.py
Writes desktop/src/Overseer.Desktop/Assets/michi.ico and michi-256.png. Standard library only.
"""
import re
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'frontend' / 'src' / 'favicon.svg'
ASSETS = ROOT / 'desktop' / 'src' / 'Overseer.Desktop' / 'Assets'
GRID = 24
SUPER = 20  # render at 480 px, then box-filter down to each icon size
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def parse_rects(svg: str):
    for match in re.finditer(r'<rect\s+([^>]*?)/>', svg):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', match.group(1)))
        color = attrs['fill'].lstrip('#')
        yield (int(attrs['x']), int(attrs['y']), int(attrs['width']), int(attrs['height']),
               tuple(int(color[i:i + 2], 16) for i in (0, 2, 4)))


def render_grid(rects):
    pixels = [[(0, 0, 0, 0)] * GRID for _ in range(GRID)]
    for x, y, w, h, rgb in rects:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < GRID and 0 <= yy < GRID:
                    pixels[yy][xx] = (*rgb, 255)
    return pixels


def resample(grid, size):
    """Area-average the 24×24 pixel art into size×size with a small transparent margin."""
    inner = size if size <= 24 else round(size * 0.94)
    offset = (size - inner) // 2
    big = GRID * SUPER
    out = [[(0, 0, 0, 0)] * size for _ in range(size)]
    for oy in range(inner):
        for ox in range(inner):
            x0, x1 = ox * big // inner, max(ox * big // inner + 1, (ox + 1) * big // inner)
            y0, y1 = oy * big // inner, max(oy * big // inner + 1, (oy + 1) * big // inner)
            acc = [0, 0, 0, 0]
            count = 0
            for sy in range(y0, y1):
                row = grid[sy // SUPER]
                for sx in range(x0, x1):
                    r, g, b, a = row[sx // SUPER]
                    acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
                    count += 1
            alpha = acc[3] / count
            color = tuple(round(acc[i] / acc[3]) for i in range(3)) if acc[3] else (0, 0, 0)
            out[oy + offset][ox + offset] = (*color, round(alpha))
    return out


def png_bytes(pixels):
    size = len(pixels)
    raw = b''.join(b'\x00' + bytes(c for px in row for c in px) for row in pixels)
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def dib_bytes(pixels):
    """32-bit BGRA DIB with AND mask; the most compatible ICO frame for tray icons."""
    size = len(pixels)
    header = struct.pack('<IiiHHIIiiII', 40, size, size * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    xor = b''.join(bytes((b, g, r, a)) for row in reversed(pixels) for (r, g, b, a) in row)
    stride = ((size + 31) // 32) * 4
    mask = bytearray()
    for row in reversed(pixels):
        bits = bytearray(stride)
        for x, (_, _, _, a) in enumerate(row):
            if a == 0:
                bits[x // 8] |= 0x80 >> (x % 8)
        mask += bits
    return header + xor + bytes(mask)


def main():
    grid = render_grid(parse_rects(SOURCE.read_text(encoding='utf-8')))
    frames = [(size, png_bytes(img) if size >= 256 else dib_bytes(img)) for size in SIZES for img in [resample(grid, size)]]
    directory = struct.pack('<HHH', 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    body = b''
    for size, data in frames:
        directory += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        body += data
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / 'michi.ico').write_bytes(directory + body)
    (ASSETS / 'michi-256.png').write_bytes(png_bytes(resample(grid, 256)))
    print(f'Wrote {ASSETS / "michi.ico"} ({len(frames)} sizes)')


if __name__ == '__main__':
    main()
