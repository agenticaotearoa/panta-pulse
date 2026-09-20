#!/usr/bin/env python3
"""
tools/build-assets.py — generate the project logo and the pitch video.

Two artifacts Colosseum's editor requires that the demo video does not cover:
  * a project logo/graphic (image upload)
  * a PITCH video, explicitly "separate from the demo video"

Both are generated deterministically with Pillow + ffmpeg-free composition, so they can
be rebuilt at any time. Text is rasterised with Pillow because the ffmpeg on this machine
is built without libfreetype (no `drawtext` filter).

Usage: python3 tools/build-assets.py
"""
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
TTS = "/tmp/tts-venv/bin/edge-tts"
VOICE = "en-US-AndrewMultilingualNeural"

BG = (11, 13, 18)
FG = (238, 241, 247)
ACCENT = (94, 234, 212)
DIM = (154, 163, 184)
DIMMER = (108, 116, 136)
VIOLET = (167, 139, 250)
AMBER = (251, 191, 36)

REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
MONO = "/System/Library/Fonts/Menlo.ttc"


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"failed: {' '.join(str(c) for c in cmd[:6])}\n{p.stderr[-900:]}")
    return p


def font(path, size):
    return ImageFont.truetype(path, size)


def make_logo():
    """A 1024x1024 logo: a market curve resolving into a pulse."""
    S = 1024
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)

    # rounded frame
    d.rounded_rectangle([40, 40, S - 40, S - 40], radius=96, outline=(35, 40, 56), width=6)

    # the curve: an S-shaped market path rising left to right
    pts = []
    import math
    for i in range(0, 101):
        x = 190 + (S - 380) * i / 100
        t = i / 100
        y = 660 - 300 / (1 + math.exp(-(t - 0.5) * 12))
        pts.append((x, y))
    for w, col in ((26, (30, 80, 74)), (10, ACCENT)):
        d.line(pts, fill=col, width=w, joint="curve")

    # the pulse: a vertical spike through the curve, the "Panta Pulse" beat
    px = 512
    d.line([(px, 300), (px, 760)], fill=VIOLET, width=12)
    d.ellipse([px - 30, 660 - 30, px + 30, 660 + 30], fill=BG, outline=VIOLET, width=12)

    # yes / no markers
    d.ellipse([190 - 16, 660 - 16, 190 + 16, 660 + 16], fill=ACCENT)
    d.ellipse([S - 190 - 16, 360 - 16, S - 190 + 16, 360 + 16], fill=VIOLET)

    # wordmark
    d.text((190, 800), "Panta Pulse", font=font(BOLD, 96), fill=FG)
    d.text((192, 906), "Powered by Panta", font=font(BOLD, 34), fill=DIMMER)

    path = OUT / "panta-pulse-logo.png"
    img.save(path)
    print(f"  logo   {path.name}  {S}x{S}")
    return path


def probe(path):
    p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)])
    return float(p.stdout.strip())


def tts(text, out):
    run([TTS, "--voice", VOICE, "--rate", "+6%", "--text", text, "--write-media", str(out)])


def slide(idx, kicker, title, lines, narration):
    png = OUT / f"p{idx}.png"
    aud = OUT / f"pa{idx}.mp3"
    vid = OUT / f"pv{idx}.mp4"

    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 8, H], fill=ACCENT)
    y = 120
    if kicker:
        d.text((130, y), kicker, font=font(BOLD, 26), fill=ACCENT)
        y += 58
    d.text((130, y), title, font=font(BOLD, 60), fill=FG)
    y += 120
    fm = font(MONO, 28)
    for ln in lines:
        if ln == "":
            y += 20
            continue
        col = DIM
        if ln.startswith(">>"):
            col, ln = FG, ln[2:].strip()
        elif ln.startswith("++"):
            col, ln = ACCENT, ln[2:].strip()
        elif ln.startswith("!!"):
            col, ln = AMBER, ln[2:].strip()
        d.text((130, y), ln, font=fm, fill=col)
        y += 42
    d.text((130, H - 84), "Powered by Panta", font=font(BOLD, 24), fill=DIMMER)
    img.save(png)

    tts(narration, aud)
    dur = probe(aud) + 0.6
    run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(png), "-i", str(aud),
         "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k",
         "-af", "apad", "-shortest", str(vid)])
    print(f"  pitch {idx}/4  {dur:5.1f}s  {title[:52]}")
    return vid


def make_pitch():
    slides = [
        ("THE PROBLEM",
         "Prediction markets are a destination",
         [
             "Panta's own brief: markets are \"usually experienced as a destination\".",
             "",
             ">>So every product that wants them sends users somewhere else.",
             ">>And the catalogue shows the strain: measured live, the title field is",
             ">>empty on 50 of 50 markets, and only 8 of 50 carry a description.",
         ],
         "Panta's own brief says prediction markets are usually experienced as a destination. "
         "So every product that wants them sends its users somewhere else. And the catalogue "
         "shows the strain: when we measured it live, the title field was empty on all fifty "
         "markets, and only eight carried a description."),

        ("THE PRODUCT",
         "Panta Pulse: markets as infrastructure",
         [
             ">>Give it a headline. It returns a market.",
             "",
             "  draft    the question, resolution rule, sources of truth, category, timing",
             "  validate against Panta's real on-chain constraints",
             "  quote    the real USDC creation fee",
             "  build    a real unsigned Solana mainnet transaction",
             "!!sign     the user's wallet. We stop here, by design.",
         ],
         "Panta Pulse turns that around. Give it a headline and it returns a market: it drafts "
         "the question, the resolution rule, the sources of truth and the timing, validates all "
         "of it against Panta's real on-chain constraints, gets the real fee quoted, and builds "
         "a real unsigned Solana transaction. The user's wallet signs. We stop there, by design."),

        ("WHY IT WINS",
         "Built for other products to embed",
         [
             ">>toEmbedCard()          a market as a generic card",
             ">>renderDiscordMessage() a Discord webhook payload",
             ">>MCP server             5 Panta tools any agent can call",
             "",
             "Markets are born with a question, a resolution rule and named sources",
             "of truth -- which is exactly what the live catalogue is missing.",
         ],
         "The reason this matters is that it is built for other products to embed. One call "
         "turns a market into a card or a Discord payload, and an MCP server exposes five Panta "
         "tools to any agent. Markets created this way are born with a question and a resolution "
         "rule, which is exactly what the live catalogue is missing."),

        ("STATUS",
         "Verified live. Nothing spent.",
         [
             "++50.00 USDC fee quoted      ++1,632-char unsigned mainnet tx",
             "++60 tests green             ++3 packages typecheck clean",
             "",
             ">>github.com/agenticaotearoa/panta-pulse",
             ">>agenticaotearoa.github.io/panta-pulse",
             "",
             "!!Never custodies keys. Never broadcasts. \"Powered by Panta\" throughout.",
         ],
         "It is verified against the live API, not mocked: a fifty USDC fee quote and a one "
         "thousand six hundred and thirty two character unsigned mainnet transaction, with "
         "nothing spent. Sixty tests green across three packages. It never custodies keys and "
         "never broadcasts, and it carries the attribution Panta's terms require."),
    ]
    clips = [slide(i, k, t, ln, n) for i, (k, t, ln, n) in enumerate(slides, 1)]
    (OUT / "pconcat.txt").write_text("".join(f"file '{c.name}'\n" for c in clips), encoding="utf-8")
    joined = OUT / "pjoined.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(OUT / "pconcat.txt"), "-c", "copy", str(joined)])
    out = ROOT / "panta-pulse-pitch.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined), "-c", "copy",
         "-movflags", "+faststart", str(out)])
    print(f"  pitch video -> {out.name}  {probe(out):.1f}s  {out.stat().st_size/1e6:.2f} MB")
    return out


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    print("building assets...")
    make_logo()
    make_pitch()
    sys.exit(0)
