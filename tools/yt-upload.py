#!/usr/bin/env python3
"""
tools/yt-upload.py — upload a video to YouTube via the owner's signed-in Chrome session.

WHY THIS EXISTS
Colosseum's project editor accepts ONLY YouTube, Loom or Vimeo links for the demo and
pitch videos, so a self-hosted MP4 is rejected outright. YouTube Studio is the one
platform already signed in on this machine.

WHY IT DOES NOT USE `opencli browser upload`
Measured: that command waits for a native `Page.fileChooserOpened` event and times out
("Page.fileChooserOpened not received within 5s") because YouTube's file input is a
hidden 0x0 element behind a custom dropzone. So the file is assembled in the page from
base64 chunks and assigned to the input with a DataTransfer, which is the same technique
proven for X video attachments.

Usage:
  python3 tools/yt-upload.py --file panta-pulse-demo.mp4 \
      --title "Panta Pulse — demo" --description-file /tmp/yt-desc.txt \
      --visibility public --session yt
"""
import argparse
import base64
import json
import pathlib
import subprocess
import sys
import time

CHUNK = 55000


def oc(session, *args, timeout=180):
    p = subprocess.run(["opencli", "browser", session, *args],
                       capture_output=True, text=True, timeout=timeout)
    return (p.stdout + p.stderr).strip()


def ev(session, js, timeout=180):
    return oc(session, "eval", js, timeout=timeout)


def attach(session, path: pathlib.Path) -> str:
    """Assemble the file inside the page and hand it to the hidden input."""
    b64 = base64.b64encode(path.read_bytes()).decode()
    n = (len(b64) + CHUNK - 1) // CHUNK
    print(f"  file {path.name}  {path.stat().st_size/1e6:.2f} MB  -> {n} chunks", flush=True)
    ev(session, "window.__v='';")
    for i in range(n):
        part = b64[i * CHUNK:(i + 1) * CHUNK]
        ev(session, f"window.__v += {json.dumps(part)}; window.__v.length")
        if (i + 1) % 10 == 0 or i + 1 == n:
            print(f"    chunk {i+1}/{n}", flush=True)

    js = """(() => {
      const bin = atob(window.__v);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], %s, { type: 'video/mp4' });
      const input = document.querySelector('input[type=file]');
      if (!input) return 'NO_FILE_INPUT';
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'attached ' + input.files[0].name + ' ' + input.files[0].size;
    })()""" % json.dumps(path.name)
    return ev(session, js)


def wait_for_details(session, seconds=240):
    """Upload leaves the dialog on a details step; wait until the title box exists."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        got = ev(session, """(() => {
          const t = document.querySelector('#textbox[contenteditable], ytcp-video-metadata-editor, #title-textarea');
          const pct = (document.body.innerText.match(/(\\d{1,3})%/) || [])[1];
          return JSON.stringify({ ready: !!t, pct: pct || null,
            url: location.href.slice(0, 90) });
        })()""")
        try:
            d = json.loads(got)
        except Exception:
            d = {}
        print(f"    waiting… ready={d.get('ready')} pct={d.get('pct')}", flush=True)
        if d.get("ready"):
            return True
        time.sleep(12)
    return False


def set_text(session, selector, text):
    js = """(() => {
      const el = document.querySelector(%s);
      if (!el) return 'missing';
      el.focus();
      el.innerText = %s;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: %s }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'set';
    })()""" % (json.dumps(selector), json.dumps(text), json.dumps(text[:40]))
    return ev(session, js)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--description-file")
    ap.add_argument("--description", default="")
    ap.add_argument("--visibility", default="public", choices=["public", "unlisted", "private"])
    ap.add_argument("--session", default="yt")
    ap.add_argument("--publish", action="store_true")
    a = ap.parse_args()

    path = pathlib.Path(a.file).resolve()
    desc = pathlib.Path(a.description_file).read_text() if a.description_file else a.description

    oc(a.session, "open", "https://www.youtube.com/upload")
    time.sleep(12)
    print("attach:", attach(a.session, path)[:160], flush=True)
    print("waiting for the details step…", flush=True)
    if not wait_for_details(a.session):
        print("details step never appeared", file=sys.stderr)
        return 3

    print("title:", set_text(a.session, "#textbox", a.title)[:80], flush=True)
    time.sleep(2)
    print("desc:", set_text(a.session, "#textbox, #description-textarea, [aria-label*=Description]", desc)[:80], flush=True)
    time.sleep(2)

    if a.publish:
        js = """(() => {
          const btns = [...document.querySelectorAll('ytcp-button, button')];
          const next = btns.find(b => /^next$/i.test((b.textContent||'').trim()));
          if (next) { next.click(); return 'clicked Next'; }
          return 'no Next button';
        })()"""
        for step in range(3):
            print(f"  step {step+1}:", ev(a.session, js)[:60], flush=True)
            time.sleep(4)
        # visibility + publish on the last step
        vis = ev(a.session, """(() => {
          const r = [...document.querySelectorAll('tp-yt-paper-radio-button, [name=visibility]')]
            .find(e => /%s/i.test(e.textContent||''));
          if (r) { r.click(); return 'set %s'; }
          return 'visibility control not found';
        })()""" % (a.visibility, a.visibility))
        print("  visibility:", vis[:70], flush=True)
        time.sleep(3)
        done = ev(a.session, """(() => {
          const b = [...document.querySelectorAll('ytcp-button, button')]
            .find(x => /^(publish|save)$/i.test((x.textContent||'').trim()));
          if (b) { b.click(); return 'clicked ' + b.textContent.trim(); }
          return 'no publish button';
        })()""")
        print("  publish:", done[:70], flush=True)
        time.sleep(15)

    print("final url:", ev(a.session, "location.href")[:160], flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
