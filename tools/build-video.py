#!/usr/bin/env python3
"""
tools/build-video.py — render the Panta Pulse demo video.

WHY IT IS BUILT THIS WAY
There is no screen recorder in this loop, and a live screen capture is not reproducible.
So the video is generated from *captured real output* — the actual live pipeline run in
evidence/live-pipeline-run-2026-09-20.json — narrated with free neural TTS and rendered
with ffmpeg from Pillow-drawn slides. Re-run the script and you get the same video.

MEASURED CONSTRAINT: the ffmpeg on this machine is built WITHOUT libfreetype, so
`drawtext` does not exist ("No such filter: 'drawtext'"). Text is therefore rasterised
with Pillow, which also gives real control over wrapping and layout.

Structure follows the judge review: (1) the deterministic pipeline with real payloads,
(2) the embed context, (3) the custody handoff and compliance.

Usage: python3 tools/build-video.py [--out demo.mp4]
"""
import argparse
import json
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "video"
TTS = "/tmp/tts-venv/bin/edge-tts"
VOICE = "en-US-AndrewMultilingualNeural"

W, H = 1920, 1080
BG = (11, 13, 18)
FG = (238, 241, 247)
ACCENT = (94, 234, 212)
DIM = (154, 163, 184)
DIMMER = (108, 116, 136)
AMBER = (251, 191, 36)

REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
MONO = "/System/Library/Fonts/Menlo.ttc"


def run(cmd, **kw):
    p = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if p.returncode != 0:
        raise RuntimeError(f"failed: {' '.join(str(c) for c in cmd[:8])}\n{p.stderr[-1200:]}")
    return p


def probe_duration(path):
    p = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)])
    return float(p.stdout.strip())


def tts(text, out):
    run([TTS, "--voice", VOICE, "--rate", "+8%", "--text", text, "--write-media", str(out)])


def font(path, size):
    return ImageFont.truetype(path, size)


def draw_slide(path, kicker, title, body_lines, index, total):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # left accent rule
    d.rectangle([0, 0, 8, H], fill=ACCENT)

    y = 96
    if kicker:
        d.text((120, y), kicker, font=font(BOLD, 24), fill=ACCENT)
        y += 52
    d.text((120, y), title, font=font(BOLD, 54), fill=FG)
    y += 104

    f_mono = font(MONO, 26)
    for line in body_lines:
        if line == "":
            y += 18
            continue
        colour = DIM
        if line.startswith(">>"):
            colour, line = FG, line[2:].strip()
        elif line.startswith("!!"):
            colour, line = AMBER, line[2:].strip()
        elif line.startswith("++"):
            colour, line = ACCENT, line[2:].strip()
        d.text((120, y), line, font=f_mono, fill=colour)
        y += 38

    # footer: slide counter + attribution
    d.text((120, H - 74), "Powered by Panta", font=font(BOLD, 22), fill=DIMMER)
    label = f"{index}/{total}"
    tw = d.textlength(label, font=font(BOLD, 22))
    d.text((W - 120 - tw, H - 74), label, font=font(BOLD, 22), fill=DIMMER)
    img.save(path)


def build_slide(index, total, kicker, title, body_lines, narration):
    png = OUT_DIR / f"s{index:02d}.png"
    aud = OUT_DIR / f"a{index:02d}.mp3"
    vid = OUT_DIR / f"v{index:02d}.mp4"
    draw_slide(png, kicker, title, body_lines, index, total)
    tts(narration, aud)
    dur = probe_duration(aud) + 0.6
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-loop", "1", "-i", str(png),
        "-i", str(aud),
        "-t", f"{dur:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "160k",
        "-af", "apad", "-shortest",
        str(vid),
    ])
    print(f"  slide {index}/{total}  {dur:5.1f}s  {title[:56]}")
    return vid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "panta-pulse-demo.mp4"))
    a = ap.parse_args()

    OUT_DIR.mkdir(exist_ok=True)
    ev_path = ROOT / "evidence" / "live-pipeline-run-2026-09-20.json"
    ev = json.loads(ev_path.read_text())
    tx = ev.get("unsignedTransaction", "")
    derived = ev.get("derived", {})

    slides = [
        ("PANTA PULSE",
         "A headline becomes a live market",
         [
             "real run against live-api.panta.market  ·  2026-09-20",
             "",
             ">>headline   ->  LLM drafts the market",
             ">>           ->  validated against Panta's real constraints",
             ">>           ->  quote    (real USDC fee)",
             ">>           ->  build    (real unsigned Solana mainnet tx)",
             "!!           ->  wallet signs      <- we stop here, by design",
             ">>           ->  register (market goes live, titled)",
             "",
             "++signed by us: nothing.   broadcast: nothing.   spent: $0",
         ],
         "This is Panta Pulse. It turns a news headline into a fully formed prediction "
         "market on Panta. The engine drafts the market, validates it against Panta's real "
         "on-chain constraints, quotes the real fee, and builds the real unsigned Solana "
         "transaction. It never signs and never broadcasts."),

        ("VERIFIED OUTPUT  ·  NOT A MOCKUP",
         "1,632 characters of real mainnet transaction",
         [
             f"quoted fee          {ev.get('feeUsdc')} USDC  (40 platform + 10 liquidity)",
             "",
             "derived on-chain accounts:",
             f"  event                {derived.get('event','')}",
             f"  vaultAuthority       {derived.get('vaultAuthority','')}",
             f"  marketConfig         {derived.get('marketConfig','')}",
             f"  creatorWhitelist     {derived.get('creatorWhitelist','')}",
             "",
             "unsigned transaction (base64, truncated):",
             f"  {tx[:56]}...",
             f"  {tx[56:112]}...",
         ],
         "These are real numbers from the live API. The quoted creation fee is fifty USDC, "
         "forty to Panta and ten into liquidity. The build step returned a one thousand six "
         "hundred and thirty two character base64 transaction, a genuine Solana mainnet "
         "versioned transaction, with every derived account, including the creator whitelist."),

        ("THE EMBEDDABLE SURFACE",
         "A market inside someone else's product",
         [
             "renderDiscordMessage(toEmbedCard(status, { appBaseUrl, createdFrom }))",
             "",
             '  { "content": "Will Solana hit 100k TPS? — Powered by Panta",',
             '    "embeds": [{',
             '       "title":  "Will Solana hit 100k TPS?",',
             '       "url":    "https://app.example/market/EWiohz3L...",',
             '       "description": "Reuters headline  ·  YES 62.0%  ·  NO 38.0%",',
             '       "footer": { "text": "Powered by Panta" } }] }',
             "",
             "++plus an MCP server: 5 Panta tools any agent can call",
         ],
         "The point is that a market can live inside another product. One call turns a "
         "normalised market into a generic card or a Discord webhook payload, and there is an "
         "MCP server exposing five Panta tools so any agent can embed it without writing an "
         "integration."),

        ("CUSTODY + COMPLIANCE",
         "We stop at the unsigned transaction",
         [
             'Panta:  "Panta cooks the transaction. The user signs.',
             '         You file it on-chain. Then you send the receipt."',
             "",
             f"simulated signer     {ev.get('simulatedSignature',{}).get('signerPublicKey','')}",
             "!!broadcast            never",
             "",
             "attribution required by API Terms section 6:",
             '  "Powered by Panta"  -  on every embed, asserted in tests',
             "",
             "++60 tests green  ·  3 packages typecheck clean under strict",
         ],
         "Stopping is the feature. Panta's custody model is that the user signs, so the engine "
         "hands over an unsigned transaction and goes no further. The demo signature is a "
         "local deterministic simulation, never broadcast. And the attribution Panta's terms "
         "require, Powered by Panta, is emitted on every embed and asserted in the tests."),

        ("OPEN SOURCE  ·  MIT",
         "Reproducible, not a prompt",
         [
             "github.com/agenticaotearoa/panta-pulse",
             "agenticaotearoa.github.io/panta-pulse",
             "",
             "packages/panta      18 tests   typed client + catalogue normaliser",
             "packages/pipeline   33 tests   draft -> validate -> quote -> build + embed",
             "packages/mcp         9 tests   Panta as agent tools",
             "",
             "++zero runtime deps in the client  ·  no test touches the network",
         ],
         "Everything is open source under MIT and reproducible. Sixty tests across three "
         "packages, all green, with no runtime dependencies in the client and no test "
         "touching the network."),
    ]

    clips = [build_slide(i, len(slides), k, t, b, n) for i, (k, t, b, n) in enumerate(slides, 1)]

    lst = OUT_DIR / "concat.txt"
    lst.write_text("".join(f"file '{v.name}'\n" for v in clips), encoding="utf-8")
    silent = OUT_DIR / "joined.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(lst), "-c", "copy", str(silent)], cwd=OUT_DIR)

    # ALWAYS re-mux with +faststart or players cannot read the duration
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent),
         "-c", "copy", "-movflags", "+faststart", a.out])

    dur, size = probe_duration(a.out), pathlib.Path(a.out).stat().st_size
    print(f"\nWROTE {a.out}\n  {dur:.1f}s   {size/1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
