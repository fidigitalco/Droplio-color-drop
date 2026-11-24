#!/usr/bin/env python3
"""
Droplio — procedural sound designer.

Synthesises every sound effect and the background music loop with pure Python
(standard library only) into  assets/sounds/*.wav . No third-party or
copyrighted audio is used, so all assets are original and license-free.

Usage:
    python3 tools/generate_audio.py
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "sounds"
SR = 44100
TAU = math.tau


def note(name: str) -> float:
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    base, octave = name[:-1], int(name[-1])
    semis = names[base[0]] + (1 if "#" in base else 0) - (1 if base.endswith("b") else 0)
    return 440.0 * 2 ** ((semis + (octave - 4) * 12) / 12)


def env_adsr(i: int, n: int, a: float, d: float, s: float, r: float, sr: int) -> float:
    t = i / sr
    dur = n / sr
    if t < a:
        return t / a
    if t < a + d:
        return 1 - (1 - s) * (t - a) / d
    if t > dur - r:
        return s * max(0.0, (dur - t) / r)
    return s


def write(name: str, samples: list[float], sr: int = SR, gain: float = 0.8) -> None:
    peak = max(1e-9, max(abs(x) for x in samples))
    k = gain / peak
    # short fade to avoid clicks
    fade = min(len(samples) // 4, int(sr * 0.004))
    for i in range(fade):
        samples[i] *= i / fade
        samples[-1 - i] *= i / fade
    path = OUT / name
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x * k)) * 32767)) for x in samples))
    print(f"  {name:<14} {path.stat().st_size // 1024:5d} KB")


def tone(freq: float, dur: float, decay: float = 8.0, harmonics=((1, 1.0),), attack=0.004,
         glide: float = 0.0, sr: int = SR) -> list[float]:
    n = int(dur * sr)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / sr
        f = freq * (1 + glide * t / dur)
        phase += TAU * f / sr
        a = min(1.0, t / attack) * math.exp(-decay * t)
        out.append(a * sum(amp * math.sin(phase * h) for h, amp in harmonics))
    return out


def mix(*tracks: tuple[float, list[float]], length: int | None = None) -> list[float]:
    n = length or max(int(off * SR) + len(tr) for off, tr in tracks)
    out = [0.0] * n
    for off, tr in tracks:
        o = int(off * SR)
        for i, x in enumerate(tr):
            if o + i < n:
                out[o + i] += x
    return out


GLASSY = ((1, 1.0), (2, 0.35), (3, 0.12), (4.2, 0.05))
SOFT = ((1, 1.0), (2, 0.18))


def make_sfx() -> None:
    # Catch: one gentle bell per compartment (a C-major triad), so collecting
    # balls in different compartments sounds musical.
    for i, n in enumerate(["C6", "E6", "G6"]):
        f = note(n)
        body = tone(f, 0.45, decay=9, harmonics=GLASSY)
        pop = tone(f * 0.5, 0.08, decay=40, harmonics=SOFT)
        write(f"catch_{i}.wav", mix((0, body), (0, [x * 0.6 for x in pop])), gain=0.55)

    # Wrong: soft low "bonk" with downward glide — gentle, not harsh.
    write("wrong.wav", mix((0, tone(220, 0.32, decay=10, harmonics=SOFT, glide=-0.35)),
                           (0.02, tone(165, 0.3, decay=11, harmonics=SOFT, glide=-0.3))), gain=0.5)

    # Coin: classic two-step sparkle.
    write("coin.wav", mix((0, tone(note("B6"), 0.09, decay=20, harmonics=GLASSY)),
                          (0.07, tone(note("E7"), 0.35, decay=10, harmonics=GLASSY))), gain=0.45)

    # Button: short wooden tick.
    write("button.wav", tone(note("A5"), 0.07, decay=60, harmonics=((1, 1), (2.7, 0.3))), gain=0.45)

    # Drop: very soft airy blip when a ball enters from the top.
    write("drop.wav", tone(note("G5"), 0.12, decay=30, harmonics=SOFT, glide=0.25), gain=0.22)

    # Bounce: tiny thud for wall/rim collisions.
    write("bounce.wav", tone(320, 0.08, decay=45, harmonics=SOFT, glide=-0.2), gain=0.35)

    # Win: rising arpeggio with a sustained chord.
    seq = ["C5", "E5", "G5", "C6"]
    parts = [(i * 0.11, tone(note(n), 0.9 - i * 0.1, decay=4, harmonics=GLASSY)) for i, n in enumerate(seq)]
    parts += [(0.44, tone(note("E6"), 0.9, decay=3, harmonics=GLASSY)),
              (0.44, tone(note("G6"), 0.9, decay=3, harmonics=SOFT))]
    write("win.wav", mix(*parts), gain=0.6)

    # Lose: gentle descending minor phrase.
    seq = ["G5", "Eb5", "C5"]
    write("lose.wav", mix(*[(i * 0.16, tone(note(n), 0.6, decay=5, harmonics=SOFT)) for i, n in enumerate(seq)]),
          gain=0.5)

    # Bomb: filtered noise burst + low thump (soft, not startling).
    rng = random.Random(7)
    n = int(0.55 * SR)
    noise, lp = [], 0.0
    for i in range(n):
        lp += (rng.uniform(-1, 1) - lp) * 0.08
        noise.append(lp * math.exp(-7 * i / SR))
    write("bomb.wav", mix((0, noise), (0, tone(70, 0.5, decay=7, harmonics=SOFT, glide=-0.4))), gain=0.6)

    # Star: bright ping used for each star on the victory screen.
    write("star.wav", tone(note("A6"), 0.5, decay=7, harmonics=GLASSY), gain=0.45)


def make_music() -> None:
    """Soft looping ambient tune: pad chords + plucked pentatonic melody, 90 BPM, 8 bars."""
    sr = 22050
    bpm = 90
    beat = 60 / bpm
    bars = 8
    total = int(bars * 4 * beat * sr)
    out = [0.0] * total
    chords = [["C4", "E4", "G4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"], ["G3", "B3", "D4"]] * 2

    def add(start: float, freq: float, dur: float, amp: float, kind: str) -> None:
        s = int(start * sr)
        n = int(dur * sr)
        phase = 0.0
        for i in range(n):
            if s + i >= total:
                # wrap around so the loop is seamless
                idx = (s + i) % total
            else:
                idx = s + i
            t = i / sr
            phase += TAU * freq / sr
            if kind == "pad":
                e = env_adsr(i, n, 0.6, 0.4, 0.8, 0.9, sr)
                v = math.sin(phase) + 0.25 * math.sin(phase * 2.0 + 0.3) + 0.1 * math.sin(phase * 0.5)
            else:
                e = min(1.0, t / 0.005) * math.exp(-5.5 * t)
                v = math.sin(phase) + 0.3 * math.sin(phase * 2) + 0.08 * math.sin(phase * 3)
            out[idx] += amp * e * v

    for b, ch in enumerate(chords):
        for nm in ch:
            add(b * 4 * beat, note(nm), 4 * beat + 0.8, 0.10, "pad")
        add(b * 4 * beat, note(ch[0]) / 2, 4 * beat, 0.12, "pad")

    melody = ["E5", "G5", "A5", "G5", "C6", "A5", "G5", "E5",
              "D5", "E5", "G5", "E5", "D5", "C5", "D5", "E5"]
    rng = random.Random(3)
    step = 0
    for b in range(bars):
        for q in range(8):  # eighth notes, but leave space
            if rng.random() < 0.55:
                add((b * 4 + q * 0.5) * beat, note(melody[step % len(melody)]), 1.4, 0.09, "pluck")
                step += 1

    write("music.wav", out, sr=sr, gain=0.5)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("synthesising sound effects:")
    make_sfx()
    print("synthesising music loop:")
    make_music()


if __name__ == "__main__":
    main()
