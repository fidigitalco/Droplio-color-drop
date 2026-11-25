#!/usr/bin/env python3
"""
Droplio — level designer, generator and fairness validator.

Produces  src/data/levels.json  which the React Native game loads at runtime.

Every one of the levels is generated *deterministically* (fixed seed per
level) from a hand-tuned difficulty curve, then validated by a reachability
simulation that proves the level can be completed by a human-speed player:

  * each collectible ball must be catchable by its matching compartment,
  * the tray must be able to travel between consecutive catches in time,
  * every bomb must be dodgeable while still reaching the next ball.

If a candidate ball would make the level impossible, the generator tries other
positions and finally delays the ball until it becomes fair. Nothing about the
level is random at runtime: the game plays back exactly what this file wrote.

Usage:
    python3 tools/generate_levels.py            # generate + validate
    python3 tools/generate_levels.py --check    # only validate existing JSON
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "levels.json"

SAVE_FORMAT_VERSION = 1

# ---------------------------------------------------------------------------
# Shared world geometry (world units). The game reads these from the JSON, so
# this file is the single source of truth for both logic and validation.
# ---------------------------------------------------------------------------
GEOMETRY = {
    "fieldW": 9.0,
    "fieldH": 16.0,
    "ballR": 0.42,
    "compW": 1.7,
    "wallT": 0.16,
    "trayRimY": 2.2,
    "trayFloorY": 1.0,
    "spawnY": 17.2,
    "gravity": 24.0,
    "startSpeedFactor": 0.4,
}
G = GEOMETRY
TRAY_W = G["compW"] * 3
TRAY_C_MAX = (G["fieldW"] - TRAY_W) / 2           # tray centre limit (stays on screen)
TRAY_HALF = TRAY_W / 2
FALL_DIST = G["spawnY"] - G["trayRimY"]
COLOR_OFFSET = [-G["compW"], 0.0, G["compW"]]      # red, blue, yellow compartment offsets

# Global fall-speed factor. The tray sits higher (thumb zone below it), so the
# field is drawn ~13% smaller; slower falls give the player that reaction time back.
FALL_EASE = 0.88

# Player model used for fairness checks (deliberately conservative).
HUMAN_SPEED = 7.0        # world units / second the tray can comfortably travel
REACTION = 0.30          # seconds to perceive + decide before the player starts moving
CATCH_TOL = 0.35         # how far from compartment centre a ball may land and still drop cleanly in
BOMB_CLEAR = TRAY_HALF + G["ballR"] + 0.15

KIND_NORMAL, KIND_SLOW, KIND_GOLDEN, KIND_RAINBOW, KIND_BOMB = range(5)
KIND_NAMES = ["normal", "slow", "golden", "rainbow", "bomb"]

WORLDS = [
    {"id": 1, "name": "Beginner", "first": 1, "last": 30},
    {"id": 2, "name": "Challenge", "first": 31, "last": 60},
    {"id": 3, "name": "Expert", "first": 61, "last": 90},
    {"id": 4, "name": "Master", "first": 91, "last": 120},
    {"id": 5, "name": "Pro", "first": 121, "last": 150},
    {"id": 6, "name": "Bomb Zone", "first": 151, "last": 180},
    {"id": 7, "name": "Combo", "first": 181, "last": 210},
    {"id": 8, "name": "Rush", "first": 211, "last": 240},
    {"id": 9, "name": "Legend", "first": 241, "last": 270},
    {"id": 10, "name": "Grandmaster", "first": 271, "last": 300},
]
LEVEL_TOTAL = WORLDS[-1]["last"]


def fall_time(vmax: float) -> float:
    """Exact time to fall FALL_DIST with v(t) = min(v0 + g t, vmax). Mirrors the game."""
    v0 = vmax * G["startSpeedFactor"]
    g = G["gravity"]
    t_acc = (vmax - v0) / g
    d_acc = v0 * t_acc + 0.5 * g * t_acc * t_acc
    if d_acc >= FALL_DIST:
        # solve v0 t + g t^2 / 2 = D
        return (-v0 + math.sqrt(v0 * v0 + 2 * g * FALL_DIST)) / g
    return t_acc + (FALL_DIST - d_acc) / vmax


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


# ---------------------------------------------------------------------------
# Interval-set helpers for the reachability check
# ---------------------------------------------------------------------------
Intervals = list[tuple[float, float]]


def clamp_set(s: Intervals) -> Intervals:
    out = []
    for a, b in s:
        a, b = max(a, -TRAY_C_MAX), min(b, TRAY_C_MAX)
        if a <= b:
            out.append((a, b))
    return out


def expand(s: Intervals, r: float) -> Intervals:
    s = sorted((a - r, b + r) for a, b in s)
    merged: Intervals = []
    for a, b in s:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return clamp_set(merged)


def intersect(s: Intervals, t: Intervals) -> Intervals:
    out = []
    for a, b in s:
        for c, d in t:
            lo, hi = max(a, c), min(b, d)
            if lo <= hi:
                out.append((lo, hi))
    return out


def event_set(kind: int, color: int, x: float) -> Intervals | None:
    """Tray-centre positions that satisfy this event (None = no constraint)."""
    if kind == KIND_BOMB:
        return clamp_set([(-TRAY_C_MAX, x - BOMB_CLEAR), (x + BOMB_CLEAR, TRAY_C_MAX)])
    if kind in (KIND_NORMAL, KIND_SLOW):
        c = x - COLOR_OFFSET[color]
        return clamp_set([(c - CATCH_TOL, c + CATCH_TOL)])
    # golden / rainbow are optional, but must always be catchable (any compartment)
    h = TRAY_HALF - G["ballR"] - 0.1
    return clamp_set([(x - h, x + h)])


@dataclass
class Ball:
    t: float
    kind: int
    color: int
    x: float
    speed_mul: float = 1.0
    drift_amp: float = 0.0
    drift_freq: float = 0.0
    land: float = 0.0
    land_x: float = 0.0

    def to_json(self):
        return [round(self.t, 3), self.kind, self.color, round(self.x, 3),
                round(self.speed_mul, 3), round(self.drift_amp, 3), round(self.drift_freq, 3)]


def landing(ball: Ball, fall_speed: float) -> tuple[float, float]:
    ft = fall_time(fall_speed * ball.speed_mul)
    lx = ball.x + ball.drift_amp * math.sin(ball.drift_freq * ft)
    return ball.t + ft, lx


def drift_x(ball: Ball, age: float) -> float:
    return ball.x + ball.drift_amp * math.sin(ball.drift_freq * age)


# vertical span in which a bomb can touch the tray (top of walls .. under the floor)
BOMB_SPAN = (G["trayRimY"] + G["ballR"]) - (G["trayFloorY"] - 0.4 - G["ballR"])


def validate(balls: list[Ball], fall_speed: float) -> tuple[bool, str]:
    events = []
    for b in balls:
        land, lx = landing(b, fall_speed)
        if b.kind == KIND_BOMB:
            # A bomb is dangerous for the whole time it passes the tray's height,
            # so the dodge must hold from entry to exit (sampled densely).
            ft = land - b.t
            pass_t = BOMB_SPAN / (fall_speed * b.speed_mul)
            for k in range(5):
                tt = ft - 0.05 + (pass_t + 0.1) * k / 4
                events.append((b.t + tt, event_set(b.kind, b.color, drift_x(b, tt)), b))
            continue
        s = event_set(b.kind, b.color, lx)
        if s is not None:
            events.append((land, s, b))
    events.sort(key=lambda e: e[0])
    reach: Intervals = [(-TRAY_C_MAX, TRAY_C_MAX)]
    last_t = -10.0
    for land, s, b in events:
        dt = land - last_t
        reach = expand(reach, max(0.0, dt - REACTION) * HUMAN_SPEED) if dt < 50 else [(-TRAY_C_MAX, TRAY_C_MAX)]
        reach = intersect(reach, s)
        if not reach:
            return False, f"unreachable {KIND_NAMES[b.kind]} at t={b.t:.2f} x={b.x:.2f}"
        last_t = land
    return True, "ok"


# ---------------------------------------------------------------------------
# Difficulty curve — the "hand-tuning" lives here.
# ---------------------------------------------------------------------------
@dataclass
class LevelSpec:
    id: int
    world: int
    target: int
    lives: int
    fall_speed: float
    interval: float
    colors: list[int]
    obstacle_prob: float
    golden_prob: float
    slow_prob: float
    rainbow_prob: float
    drift_bombs: bool
    pairs_prob: float
    triples_prob: float
    rush: bool
    rush_prob: float
    bonus: dict
    intro: str | None
    balls: list[Ball] = field(default_factory=list)


INTROS = {
    1: "basics",
    3: "three_colors",
    11: "golden",
    18: "slow",
    25: "rainbow",
    31: "bomb",
    45: "rush",
    61: "drift",
    71: "pairs",
    91: "triples",
}


def spec_for(n: int) -> LevelSpec:
    world = (n - 1) // 30 + 1
    k = ((n - 1) % 30) / 29.0          # 0..1 progress inside the world
    # Small sawtooth so every 5th level is a little "breather".
    breather = 0.92 if n % 5 == 1 and n > 1 else 1.0

    if world == 1:
        fall = lerp(4.0, 5.8, k)
        interval = lerp(2.0, 1.35, k)
        target = round(lerp(8, 22, k))
    elif world == 2:
        fall = lerp(5.9, 7.4, k)
        interval = lerp(1.35, 1.02, k)
        target = round(lerp(20, 32, k))
    elif world == 3:
        fall = lerp(7.5, 8.9, k)
        interval = lerp(1.05, 0.82, k)
        target = round(lerp(28, 40, k))
    elif world == 4:
        fall = lerp(9.0, 10.4, k)
        interval = lerp(0.84, 0.66, k)
        target = round(lerp(36, 50, k))
    else:
        # Worlds 5-10: slow, steady climb. Each new world starts a little
        # easier than the previous one ended, then ramps past it.
        w = world - 5
        fall = lerp(9.4 + w * 0.45, 10.4 + w * 0.32, k)
        interval = lerp(0.78 - w * 0.03, 0.66 - w * 0.016, k)
        target = round(lerp(40 + w * 4, 52 + w * 3.6, k))
    fall *= breather * FALL_EASE
    interval /= breather

    colors = [0, 1] if n <= 2 else [0, 1, 2]
    lives = 5 if n <= 5 else (4 if n <= 15 else (3 if n <= 120 else 4))  # long late levels get 4

    obstacle = 0.0
    if n >= 31:
        obstacle = lerp(0.05, 0.12, min(1.0, (n - 31) / 60))
    golden = 0.07 if n >= 11 else 0.0
    slow = (0.10 if n < 61 else 0.07) if n >= 18 else 0.0
    rainbow = 0.05 if n >= 25 else 0.0
    drift = n >= 61
    pairs = 0.0 if n < 71 else lerp(0.10, 0.22, min(1.0, (n - 71) / 49))
    triples = 0.0 if n < 91 else lerp(0.05, 0.10, min(1.0, (n - 91) / 29))
    rush = n >= 45
    rush_prob = 0.06
    # World themes from 6 onward give each world its own flavour.
    if world == 6 or world == 10:
        obstacle = min(0.16, obstacle * 1.25)
        drift = True
    if world == 7 or world == 10:
        pairs = min(0.32, pairs * 1.4)
        triples = min(0.16, triples * 1.5)
    if world == 8 or world == 10:
        rush_prob = 0.13
    if world == 9:
        slow = 0.14
        golden = 0.09

    # Optional bonus objectives rotate so levels feel distinct.
    if n <= 10:
        bonus = {"type": "perfect", "count": 0}
    else:
        cycle = n % 4
        if cycle == 0 and golden > 0:
            bonus = {"type": "golden", "count": 2 if world <= 2 else 3}
        elif cycle == 1:
            bonus = {"type": "combo", "count": min(25, 6 + world * 3 + (n % 30) // 6)}
        elif cycle == 2:
            bonus = {"type": "perfect", "count": 0}
        else:
            bonus = {"type": "rainbow", "count": 1} if rainbow > 0 else {"type": "combo", "count": 8 + world * 2}

    return LevelSpec(n, world, target, lives, round(fall, 3), round(interval, 3), colors,
                     round(obstacle, 3), golden, slow, rainbow, drift, pairs, triples, rush,
                     rush_prob, bonus, INTROS.get(n))


# ---------------------------------------------------------------------------
# Sequence builder
# ---------------------------------------------------------------------------
def color_x_range(color: int) -> tuple[float, float]:
    """Spawn x range where the matching compartment can actually reach the ball."""
    off = COLOR_OFFSET[color]
    lo = max(-TRAY_C_MAX + off, -G["fieldW"] / 2 + 0.6)
    hi = min(TRAY_C_MAX + off, G["fieldW"] / 2 - 0.6)
    return lo + 0.1, hi - 0.1


def pick_color(rng: random.Random, spec: LevelSpec, history: list[int]) -> int:
    """Readable colour sequences: avoid long streaks, early levels use gentle patterns."""
    cols = spec.colors
    if spec.id <= 4:
        # Teaching levels: simple alternating / repeating patterns.
        pattern = [0, 1] if len(cols) == 2 else [0, 1, 2, 1]
        return cols[len(history) % len(pattern)] if len(cols) == 2 else pattern[len(history) % len(pattern)]
    weights = []
    for c in cols:
        w = 1.0
        if len(history) >= 2 and history[-1] == c and history[-2] == c:
            w = 0.15
        weights.append(w)
    return rng.choices(cols, weights=weights)[0]


def try_add(seq: list[Ball], cand: list[Ball], fall_speed: float) -> bool:
    # validate exactly what will be written to JSON (3-decimal rounding)
    for b in cand:
        b.t, b.x, b.speed_mul = round(b.t, 3), round(b.x, 3), round(b.speed_mul, 3)
        b.drift_amp, b.drift_freq = round(b.drift_amp, 3), round(b.drift_freq, 3)
    ok, _ = validate(seq + cand, fall_speed)
    if ok:
        seq.extend(cand)
    return ok


def build_level(spec: LevelSpec) -> LevelSpec:
    rng = random.Random(1000 + spec.id * 7919)
    seq: list[Ball] = []
    history: list[int] = []
    collectibles_needed = spec.target + spec.lives + 2
    t = 1.2
    collectibles = 0
    rush_left = 0
    guard = 0

    while collectibles < collectibles_needed:
        guard += 1
        if guard > 5000:
            raise RuntimeError(f"level {spec.id}: generator stuck")

        speed_mul = 1.0
        gap = spec.interval * rng.uniform(0.9, 1.15)
        if spec.rush and rush_left == 0 and collectibles > 6 and rng.random() < spec.rush_prob:
            rush_left = rng.randint(4, 6)
        if rush_left > 0:
            speed_mul = 1.18
            gap *= 0.85
            rush_left -= 1

        roll = rng.random()
        group: list[Ball] = []

        # --- obstacles -------------------------------------------------------
        if spec.obstacle_prob and collectibles > 2 and roll < spec.obstacle_prob:
            side = rng.choice([-1, 1])
            x = side * rng.uniform(1.6, 3.9)
            amp, freq = 0.0, 0.0
            if spec.drift_bombs and rng.random() < 0.5:
                amp = rng.uniform(0.5, 1.0)
                freq = rng.uniform(1.2, 2.2)
                x = side * min(3.9 - amp, abs(x))
            group = [Ball(t, KIND_BOMB, 0, x, speed_mul * 0.95, amp, freq)]
        # --- optional bonus balls -------------------------------------------
        elif spec.golden_prob and roll < spec.obstacle_prob + spec.golden_prob:
            group = [Ball(t, KIND_GOLDEN, 0, rng.uniform(-3.6, 3.6), speed_mul)]
        elif spec.rainbow_prob and roll < spec.obstacle_prob + spec.golden_prob + spec.rainbow_prob:
            group = [Ball(t, KIND_RAINBOW, 0, rng.uniform(-3.0, 3.0), speed_mul)]
        # --- simultaneous combinations (land together, one tray position) ---
        elif spec.triples_prob and rng.random() < spec.triples_prob and collectibles + 3 <= collectibles_needed:
            c = rng.uniform(-TRAY_C_MAX + 0.2, TRAY_C_MAX - 0.2)
            group = [Ball(t, KIND_NORMAL, col, c + COLOR_OFFSET[col], speed_mul) for col in (0, 1, 2)]
            gap *= 1.6
        elif spec.pairs_prob and rng.random() < spec.pairs_prob and collectibles + 2 <= collectibles_needed:
            a, b = rng.sample([0, 1, 2], 2)
            c = rng.uniform(-TRAY_C_MAX + 0.2, TRAY_C_MAX - 0.2)
            group = [Ball(t, KIND_NORMAL, a, c + COLOR_OFFSET[a], speed_mul),
                     Ball(t, KIND_NORMAL, b, c + COLOR_OFFSET[b], speed_mul)]
            gap *= 1.35
        # --- regular coloured ball ------------------------------------------
        else:
            color = pick_color(rng, spec, history)
            kind = KIND_NORMAL
            mul = speed_mul
            if spec.slow_prob and rng.random() < spec.slow_prob:
                kind, mul = KIND_SLOW, 0.55
            lo, hi = color_x_range(color)
            if spec.id <= 3:
                # very first levels: land near the middle, little travel needed
                mid = COLOR_OFFSET[color] * 0.6
                lo, hi = max(lo, mid - 1.0), min(hi, mid + 1.0)
            group = [Ball(t, kind, color, rng.uniform(lo, hi), mul)]

        # Try a few positions, then delay until fair.
        placed = False
        for attempt in range(14):
            if attempt:
                for b in group:
                    if b.kind in (KIND_NORMAL, KIND_SLOW) and len(group) == 1:
                        b.x = rng.uniform(*color_x_range(b.color))
                    elif b.kind == KIND_BOMB:
                        b.x = rng.choice([-1, 1]) * rng.uniform(1.6, 3.9 - b.drift_amp)
                if attempt >= 6:
                    for b in group:
                        b.t += spec.interval * 0.25
            if try_add(seq, group, spec.fall_speed):
                placed = True
                break
        if not placed:
            continue

        for b in group:
            if b.kind in (KIND_NORMAL, KIND_SLOW):
                collectibles += 1
                history.append(b.color)
        t = group[0].t + gap

    for b in seq:
        b.land, b.land_x = landing(b, spec.fall_speed)
    seq.sort(key=lambda b: b.t)
    spec.balls = seq
    # The bonus goal must be achievable with the bonus balls this level actually has.
    kind_for = {"golden": KIND_GOLDEN, "rainbow": KIND_RAINBOW}
    if spec.bonus["type"] in kind_for:
        have = sum(1 for b in seq if b.kind == kind_for[spec.bonus["type"]])
        if have < spec.bonus["count"]:
            spec.bonus = {"type": "combo", "count": 8 + spec.world * 2}
    return spec


def level_to_json(spec: LevelSpec) -> dict:
    last_land = max(b.land for b in spec.balls)
    return {
        "id": spec.id,
        "world": spec.world,
        "target": spec.target,
        "lives": spec.lives,
        "maxMistakes": spec.lives - 1,
        "fallSpeed": spec.fall_speed,
        "spawnInterval": spec.interval,
        "colors": spec.colors,
        "obstacleProb": spec.obstacle_prob,
        "bonus": spec.bonus,
        "intro": spec.intro,
        # loop period: when a player has used continues, playback repeats seamlessly
        "loopAfter": round(spec.balls[-1].t + max(1.6, spec.interval * 1.5), 3),
        "duration": round(last_land, 2),
        "balls": [b.to_json() for b in spec.balls],
    }


def check_file(path: Path) -> int:
    data = json.loads(path.read_text())
    assert data["version"] == SAVE_FORMAT_VERSION
    assert len(data["levels"]) == LEVEL_TOTAL, f"must contain exactly {LEVEL_TOTAL} levels"
    bad = 0
    prev_speed = 0.0
    for lv in data["levels"]:
        balls = [Ball(*b) for b in lv["balls"]]
        ok, why = validate(balls, lv["fallSpeed"])
        coll = sum(1 for b in balls if b.kind in (KIND_NORMAL, KIND_SLOW))
        if coll < lv["target"]:
            ok, why = False, "not enough collectible balls"
        bonus_kind = {"golden": KIND_GOLDEN, "rainbow": KIND_RAINBOW}.get(lv["bonus"]["type"])
        if bonus_kind is not None and sum(1 for b in balls if b.kind == bonus_kind) < lv["bonus"]["count"]:
            ok, why = False, f"bonus goal needs {lv['bonus']['count']} {lv['bonus']['type']} balls"
        if not ok:
            bad += 1
            print(f"  level {lv['id']:3d}: FAIL {why}")
        # gradual difficulty: no sudden speed spikes between neighbours
        if prev_speed and lv["fallSpeed"] > prev_speed * 1.12:
            print(f"  level {lv['id']:3d}: WARN speed jump {prev_speed} -> {lv['fallSpeed']}")
        prev_speed = lv["fallSpeed"]
        if lv["id"] <= 10:
            kinds = {b.kind for b in balls}
            if kinds - {KIND_NORMAL}:
                bad += 1
                print(f"  level {lv['id']:3d}: FAIL first 10 levels must teach only the core gameplay")
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not args.check:
        levels = []
        for n in range(1, LEVEL_TOTAL + 1):
            spec = build_level(spec_for(n))
            levels.append(level_to_json(spec))
        data = {
            "version": SAVE_FORMAT_VERSION,
            "geometry": GEOMETRY,
            "worlds": WORLDS,
            "levels": levels,
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, separators=(",", ":")))
        print(f"wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} KB)")

    bad = check_file(OUT)
    data = json.loads(OUT.read_text())
    for w in WORLDS:
        lv = [l for l in data["levels"] if w["first"] <= l["id"] <= w["last"]]
        print(f"  world {w['id']} {w['name']:<9} levels {w['first']:3d}-{w['last']:3d}  "
              f"speed {lv[0]['fallSpeed']:.1f}->{lv[-1]['fallSpeed']:.1f}  "
              f"target {lv[0]['target']}->{lv[-1]['target']}  "
              f"balls {len(lv[0]['balls'])}->{len(lv[-1]['balls'])}")
    print(f"all {LEVEL_TOTAL} levels validated as completable" if bad == 0 else f"{bad} problems found")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
