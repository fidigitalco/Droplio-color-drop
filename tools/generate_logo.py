#!/usr/bin/env python3
"""
Droplio — logo & app icon generator.

Draws every brand image with signed-distance-field shapes and a tiny PNG
writer, using only the Python standard library (no Pillow needed):

  assets/icon.png                     1024  iOS / store icon (full bleed)
  assets/android-icon-foreground.png   512  adaptive icon foreground (safe zone)
  assets/android-icon-background.png   512  adaptive icon background
  assets/android-icon-monochrome.png   432  themed icon silhouette
  assets/splash-icon.png              1024  splash image (transparent)
  assets/favicon.png                    48  web favicon
  assets/logo.png                 1400x420  "DROPLIO" wordmark used in the app

Usage:
    python3 tools/generate_logo.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"


# ---------------------------------------------------------------- canvas
class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.px = [0.0] * (w * h * 4)  # straight-alpha RGBA, 0..1

    def blend(self, x: int, y: int, r: float, g: float, b: float, a: float):
        if a <= 0:
            return
        i = (y * self.w + x) * 4
        p = self.px
        da = p[i + 3]
        oa = a + da * (1 - a)
        if oa <= 0:
            return
        k = da * (1 - a)
        p[i] = (r * a + p[i] * k) / oa
        p[i + 1] = (g * a + p[i + 1] * k) / oa
        p[i + 2] = (b * a + p[i + 2] * k) / oa
        p[i + 3] = oa

    def shape(self, sdf, bbox, color, aa: float = 1.0, alpha: float = 1.0):
        """Fill pixels where sdf < 0 with anti-aliased edges. color(x, y, d) -> (r,g,b,a)."""
        x0, y0, x1, y1 = bbox
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(self.w, int(x1) + 1), min(self.h, int(y1) + 1)
        for y in range(y0, y1):
            fy = y + 0.5
            for x in range(x0, x1):
                fx = x + 0.5
                d = sdf(fx, fy)
                cov = 0.5 - d / aa
                if cov <= 0:
                    continue
                if cov > 1:
                    cov = 1.0
                r, g, b, a = color(fx, fy, d)
                self.blend(x, y, r, g, b, a * cov * alpha)

    def save(self, path: Path):
        raw = bytearray()
        p = self.px
        for y in range(self.h):
            raw.append(0)
            for x in range(self.w):
                i = (y * self.w + x) * 4
                raw += bytes(int(max(0.0, min(1.0, p[i + c])) * 255 + 0.5) for c in range(4))

        def chunk(tag: bytes, data: bytes) -> bytes:
            return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        png += chunk(b"IEND", b"")
        path.write_bytes(png)
        print(f"  {path.relative_to(ROOT)}  {self.w}x{self.h}  {path.stat().st_size // 1024} KB")


# ------------------------------------------------------------- helpers
def hexc(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def sd_circle(cx, cy, r):
    return lambda x, y: math.hypot(x - cx, y - cy) - r


def sd_round_rect(cx, cy, hw, hh, r):
    def f(x, y):
        qx = abs(x - cx) - (hw - r)
        qy = abs(y - cy) - (hh - r)
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
    return f


def sd_segment(ax, ay, bx, by, half):
    dx, dy = bx - ax, by - ay
    ll = dx * dx + dy * dy

    def f(x, y):
        t = clamp01(((x - ax) * dx + (y - ay) * dy) / ll) if ll else 0
        return math.hypot(x - ax - dx * t, y - ay - dy * t) - half
    return f


def sd_right_arc(cx, cy, r, half):
    """Right half of a ring (used for D, P, R bowls)."""
    def f(x, y):
        if x >= cx:
            return abs(math.hypot(x - cx, y - cy) - r) - half
        return min(math.hypot(x - cx, y - cy + r), math.hypot(x - cx, y - cy - r)) - half
    return f


def sd_drop(cx, cy, r1, r2, h):
    """Tear drop: uneven capsule, round bottom at (cx, cy), tip h pixels above."""
    b = (r1 - r2) / h
    a = math.sqrt(1 - b * b)

    def f(x, y):
        px = abs(x - cx)
        py = cy - y  # y up
        k = -b * px + a * py
        if k < 0:
            return math.hypot(px, py) - r1
        if k > a * h:
            return math.hypot(px, py - h) - r2
        return a * px + b * py - r1
    return f


def union(*fs):
    return lambda x, y: min(f(x, y) for f in fs)


def solid(rgb, a=1.0):
    return lambda x, y, d: (rgb[0], rgb[1], rgb[2], a)


def glossy_ball(cx, cy, r, base):
    """Studio-lit glossy sphere shading (matches the in-game matcap look)."""
    hi = mix(base, (1, 1, 1), 0.45)
    lo = mix(base, (0.08, 0.04, 0.2), 0.35)

    def c(x, y, d):
        nx, ny = (x - cx) / r, (y - cy) / r
        nn = min(1.0, nx * nx + ny * ny)
        nz = math.sqrt(1 - nn)
        light = clamp01(0.55 + 0.45 * (-0.45 * nx - 0.6 * ny + 0.65 * nz))
        col = mix(lo, hi, light)
        # crisp specular highlight up-left
        sx, sy = nx + 0.36, ny + 0.42
        spec = clamp01(1 - math.hypot(sx * 1.25, sy * 1.7) / 0.42)
        col = mix(col, (1, 1, 1), spec ** 1.6 * 0.95)
        # soft bounce light along the bottom rim
        rim = clamp01((ny - 0.55) / 0.45) * clamp01(nn * 1.2)
        col = mix(col, mix(base, (1, 1, 1), 0.6), rim * 0.35)
        return (*col, 1.0)
    return c


def vgrad(y0, y1, stops):
    """Vertical gradient through (t, rgb) stops."""
    def c(x, y, d):
        t = clamp01((y - y0) / (y1 - y0))
        for (ta, ca), (tb, cb) in zip(stops, stops[1:]):
            if t <= tb:
                return (*mix(ca, cb, (t - ta) / (tb - ta) if tb > ta else 0), 1.0)
        return (*stops[-1][1], 1.0)
    return c


RED, BLUE, YELLOW = hexc("#ff3b5c"), hexc("#2f7bff"), hexc("#ffc812")
INK = hexc("#2b2350")
WHITE = (1.0, 1.0, 1.0)
BG_STOPS = [(0.0, hexc("#6ec3ff")), (0.55, hexc("#a98bff")), (1.0, hexc("#ff8ec7"))]


# ------------------------------------------------------------- the emblem
def draw_background(cv: Canvas):
    s = cv.w / 1024
    cv.shape(lambda x, y: -1, (0, 0, cv.w - 1, cv.h - 1), vgrad(0, cv.h, BG_STOPS))
    glow = lambda x, y, d: (1, 1, 1, 0.38 * clamp01(-d / (430 * s)) ** 1.4)
    cv.shape(sd_circle(512 * s, 420 * s, 430 * s), (0, 0, cv.w, cv.h), glow)
    for (bx, by, br, ba) in [(170, 200, 90, 0.18), (860, 300, 70, 0.16), (130, 620, 60, 0.12), (900, 640, 100, 0.12)]:
        bc = lambda x, y, d, ba=ba, br=br: (1, 1, 1, ba * clamp01(-d / (br * s)))
        cv.shape(sd_circle(bx * s, by * s, br * s), ((bx - br) * s, (by - br) * s, (bx + br) * s, (by + br) * s), bc)


def draw_emblem(cv: Canvas, scale: float, ox: float, oy: float, mono: bool = False):
    """Drop falling into the three-colour tray. Design space is 1024x1024."""
    S = lambda v: v * scale
    X = lambda v: ox + v * scale
    Y = lambda v: oy + v * scale
    m = solid(WHITE)

    def paint(fn):
        return m if mono else fn

    # motion streaks above the drop
    for (sx, sy0, sy1, w) in [(330, 170, 300, 16), (694, 150, 270, 16), (378, 90, 170, 12), (650, 70, 140, 12)]:
        cv.shape(sd_segment(X(sx), Y(sy0), X(sx), Y(sy1), S(w)),
                 (X(sx - w - 2), Y(sy0 - w - 2), X(sx + w + 2), Y(sy1 + w + 2)),
                 paint(solid(WHITE, 0.75)))

    # balls waiting in the side compartments (drawn before the tray front)
    for (bx, col) in [(262, RED), (762, YELLOW)]:
        r = 78
        cy = 742
        cv.shape(sd_circle(X(bx), Y(cy + 10), S(r + 10)), (X(bx - r - 14), Y(cy - r), X(bx + r + 14), Y(cy + r + 24)),
                 paint(solid(INK, 0.25)))
        cv.shape(sd_circle(X(bx), Y(cy), S(r)), (X(bx - r - 2), Y(cy - r - 2), X(bx + r + 2), Y(cy + r + 2)),
                 paint(glossy_ball(X(bx), Y(cy), S(r), col)))

    # tray body
    tray = sd_round_rect(X(512), Y(842), S(400), S(118), S(64))
    cv.shape(sd_round_rect(X(512), Y(860), S(400), S(118), S(64)), (X(100), Y(720), X(924), Y(1000)),
             paint(solid(INK, 0.28)))
    cv.shape(tray, (X(108), Y(720), X(916), Y(964)),
             paint(vgrad(Y(724), Y(960), [(0, WHITE), (0.6, hexc("#eef0ff")), (1, hexc("#c9cbe8"))])))
    # compartments
    for i, col in enumerate([RED, BLUE, YELLOW]):
        cx = 512 + (i - 1) * 258
        comp = sd_round_rect(X(cx), Y(852), S(112), S(78), S(36))
        cv.shape(comp, (X(cx - 116), Y(770), X(cx + 116), Y(934)),
                 paint(vgrad(Y(774), Y(930), [(0, mix(col, WHITE, 0.35)), (1, mix(col, INK, 0.25))])))
        # gloss on each compartment
        cv.shape(sd_round_rect(X(cx), Y(806), S(90), S(18), S(18)), (X(cx - 94), Y(784), X(cx + 94), Y(828)),
                 paint(solid(WHITE, 0.45)))

    # the big drop (white outline + shadow + glossy body)
    cx, cy, r1, r2, h = 512, 500, 200, 14, 330
    shadow = sd_drop(X(cx + 10), Y(cy + 22), S(r1 + 18), S(r2 + 10), S(h))
    outline = sd_drop(X(cx), Y(cy), S(r1 + 18), S(r2 + 12), S(h + 4))
    body = sd_drop(X(cx), Y(cy), S(r1), S(r2), S(h))
    bb = (X(cx - r1 - 40), Y(cy - h - 60), X(cx + r1 + 40), Y(cy + r1 + 50))
    cv.shape(shadow, bb, paint(solid(INK, 0.3)), aa=S(6))
    cv.shape(outline, bb, m)
    if not mono:
        top, bot = Y(cy - h - r2), Y(cy + r1)
        base_t, base_b = hexc("#5fb0ff"), hexc("#2350e6")

        def drop_col(x, y, d):
            t = clamp01((y - top) / (bot - top))
            col = mix(base_t, base_b, t)
            nx = (x - X(cx)) / S(r1)
            col = mix(col, mix(base_b, INK, 0.3), clamp01(abs(nx) - 0.55) * 0.9)  # edge depth
            # big glossy highlight (left) and small spark
            hx, hy = (x - X(cx - 78)) / S(54), (y - Y(cy - 70)) / S(118)
            g = clamp01(1 - math.hypot(hx, hy))
            col = mix(col, WHITE, (g ** 0.8) * 0.85)
            sx, sy = (x - X(cx - 40)) / S(22), (y - Y(cy - 205)) / S(30)
            col = mix(col, WHITE, clamp01(1 - math.hypot(sx, sy)) * 0.9)
            # warm bounce at the bottom
            col = mix(col, hexc("#9fd0ff"), clamp01((y - Y(cy + 120)) / S(80)) * 0.5)
            return (*col, 1.0)

        cv.shape(body, bb, drop_col)
    # front lip of the tray drawn over the drop tip landing area
    cv.shape(sd_round_rect(X(512), Y(942), S(372), S(14), S(14)), (X(130), Y(920), X(894), Y(962)),
             paint(solid(hexc("#c3c6e6"), 0.9)))


# ------------------------------------------------------------- wordmark
LETTER_COLORS = [hexc(c) for c in ("#ff3b5c", "#ff7a2f", "#2f7bff", "#25c48a", "#ffc812", "#ff5fa2", "#a05cff")]


def letter_shapes(ch: str, left: float, top: float, H: float, T: float):
    """Returns (sdf, width) for one chunky rounded letter."""
    h = T / 2
    x0, yt, yb = left + h, top + h, top + H - h
    ym = (yt + yb) / 2
    if ch == "D":
        cxo = 30
        R = (yb - yt) / 2
        return union(sd_segment(x0, yt, x0, yb, h), sd_segment(x0, yt, x0 + cxo, yt, h),
                     sd_segment(x0, yb, x0 + cxo, yb, h), sd_right_arc(x0 + cxo, ym, R, h)), T + cxo + R
    if ch in "PR":
        bx, rb = 44, (H - T) * 0.31
        parts = [sd_segment(x0, yt, x0, yb, h), sd_segment(x0, yt, x0 + bx, yt, h),
                 sd_segment(x0, yt + 2 * rb, x0 + bx, yt + 2 * rb, h), sd_right_arc(x0 + bx, yt + rb, rb, h)]
        w = T + bx + rb
        if ch == "R":
            parts.append(sd_segment(x0 + bx - 6, yt + 2 * rb, x0 + bx + rb + 4, yb, h))
            w += 6
        return union(*parts), w
    if ch == "Z":
        w = 104
        return union(sd_segment(x0, yt, x0 + w, yt, h), sd_segment(x0, yb, x0 + w, yb, h),
                     sd_segment(x0 + w, yt, x0, yb, h)), T + w
    if ch == "Y":
        w = 116
        return union(sd_segment(x0, yt, x0 + w / 2, ym, h), sd_segment(x0 + w, yt, x0 + w / 2, ym, h),
                     sd_segment(x0 + w / 2, ym, x0 + w / 2, yb, h)), T + w
    if ch == "L":
        w = 84
        return union(sd_segment(x0, yt, x0, yb, h), sd_segment(x0, yb, x0 + w, yb, h)), T + w
    if ch == "I":
        return sd_segment(x0, yt, x0, yb, h), T
    if ch == "0":  # round O: a ring around a short vertical capsule
        rw = 78
        cx = x0 + rw
        seg = sd_segment(cx, yt + rw, cx, yb - rw, 0)
        return (lambda x, y: abs(seg(x, y) - rw) - h), T + 2 * rw
    if ch == "O":  # the drop replaces the first O
        r1, r2 = H * 0.33, 8
        h = H - r1 - r2 - 6  # bottom-circle centre to tip-circle centre
        return sd_drop(left + r1 + 4, top + H - r1 - 2, r1, r2, h), 2 * r1 + 8
    raise ValueError(ch)


def rotated(f, cx, cy, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return lambda x, y: f(cx + (x - cx) * c + (y - cy) * s, cy - (x - cx) * s + (y - cy) * c)


def draw_wordmark(cv: Canvas):
    H, T, gap = 240, 60, 22
    word = "DROPLI0"  # "O" = drop, "0" = round O
    widths = [letter_shapes(ch, 0, 0, H, T)[1] for ch in word]
    total = sum(widths) + gap * (len(word) - 1)
    left = (cv.w - total) / 2
    top = (cv.h - H) / 2 - 10
    letters = []
    for i, ch in enumerate(word):
        lift = -8 if i % 2 else 8
        f, w = letter_shapes(ch, left, top + lift, H, T)
        f = rotated(f, left + w / 2, top + lift + H / 2, -4 if i % 2 == 0 else 4)
        letters.append((f, (left - 40, top + lift - 40, left + w + 40, top + lift + H + 56), LETTER_COLORS[i], top + lift))
        left += w + gap

    # pass 1: drop shadows + dark ink outline (all letters, so outlines never cover fills)
    for f, bb, col, lt in letters:
        cv.shape(lambda x, y, f=f: f(x, y - 18) - 22, bb, solid(INK, 0.35), aa=4)
        cv.shape(lambda x, y, f=f: f(x, y) - 22, bb, solid(INK))
    # pass 2: white outline + glossy coloured fill
    for f, bb, col, lt in letters:
        cv.shape(lambda x, y, f=f: f(x, y) - 11, bb, solid(WHITE))
        hi = mix(col, WHITE, 0.4)
        lo = mix(col, INK, 0.18)

        def fill(x, y, d, lt=lt, hi=hi, lo=lo):
            t = clamp01((y - lt) / H)
            c = mix(hi, lo, t)
            if t < 0.42:  # gloss band
                c = mix(c, WHITE, 0.22 * (1 - t / 0.42))
            if d > -9:  # inner edge highlight
                c = mix(c, WHITE, 0.12)
            return (*c, 1.0)

        cv.shape(f, bb, fill)


# ------------------------------------------------------------------ main
def main():
    print("drawing Droplio brand assets:")
    icon = Canvas(1024, 1024)
    draw_background(icon)
    draw_emblem(icon, 1.0, 0, 30)
    icon.save(ASSETS / "icon.png")

    fav = Canvas(48, 48)
    draw_background(fav)
    draw_emblem(fav, 48 / 1024, 0, 1.5)
    fav.save(ASSETS / "favicon.png")

    # Android adaptive icon: content must stay inside the central ~66% safe zone.
    fg = Canvas(512, 512)
    sc = 300 / 900
    draw_emblem(fg, sc, 256 - 512 * sc, 256 - 545 * sc)
    fg.save(ASSETS / "android-icon-foreground.png")

    bg = Canvas(512, 512)
    draw_background(bg)
    bg.save(ASSETS / "android-icon-background.png")

    mono = Canvas(432, 432)
    sc = 250 / 900
    draw_emblem(mono, sc, 216 - 512 * sc, 216 - 545 * sc, mono=True)
    mono.save(ASSETS / "android-icon-monochrome.png")

    splash = Canvas(1024, 1024)
    sc = 0.7
    draw_emblem(splash, sc, 512 - 512 * sc, 512 - 545 * sc)
    splash.save(ASSETS / "splash-icon.png")

    logo = Canvas(1400, 420)
    draw_wordmark(logo)
    logo.save(ASSETS / "logo.png")


if __name__ == "__main__":
    main()
