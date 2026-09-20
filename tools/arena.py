#!/usr/bin/env python3
"""
tools/arena.py — drive arena.ai (frontier intelligence) from the agent.

WHY THIS EXISTS
The owner's tool split is explicit: free models are for WEB SEARCH, arena.ai is for
FRONTIER INTELLIGENCE, jev is for typed judgement, agent-reach is for platform reach.
arena.ai is a website, so it is driven through opencli's bridge to the owner's real
Chrome (which is what makes the invisible reCAPTCHA pass).

MEASURED SELECTORS (2026-09-20, do not re-derive):
  input   textarea[name=message]   placeholder "Ask anything…"
  send    button[aria-label="Send message"]      (Enter does NOT submit)
  modes   buttons whose text is Battle | "Agent Mode" | "Side by Side" | Direct
  gate    a Terms dialog with a single "Agree" button appears on the first visit
  reply   anonymous models answer as "Assistant A" / "Assistant B"

CAUTION (owner was told): arena.ai's own terms say conversations "may otherwise be
disclosed publicly to help support our community and advance AI research". Never send
credentials, API keys, personal data, or anything whose disclosure would hurt us.

Usage:
  python3 tools/arena.py --mode agent  --prompt-file /tmp/p.md
  python3 tools/arena.py --mode direct --prompt "text"
  python3 tools/arena.py --mode agent  --prompt-file /tmp/p.md --out /tmp/reply.md
"""
import argparse
import json
import re
import subprocess
import sys
import time

SESSION = "ar"
URL = "https://arena.ai/"


def oc(*args, timeout=120):
    p = subprocess.run(["opencli", "browser", SESSION, *args],
                       capture_output=True, text=True, timeout=timeout)
    return p.stdout + p.stderr


def oc_eval(js, timeout=120):
    out = oc("eval", js, timeout=timeout)
    # opencli prints a JSON envelope; tolerate plain strings too
    for line in reversed(out.strip().splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(line)
        except Exception:
            continue
    return out.strip()


def dismiss_gate():
    """First visit shows a Terms dialog; clicking Agree is required to chat."""
    oc_eval("""(() => {
      const b = [...document.querySelectorAll('button')]
        .find(e => e.textContent.trim() === 'Agree');
      if (b) { b.click(); return 'agreed'; }
      return 'no-gate';
    })()""")


def set_mode(mode):
    """mode: battle | agent | side | direct

    The control is a [role=combobox] whose label is the CURRENT mode. Clicking it
    opens a menu; the option is a separate element carrying the target label.
    Measured 2026-09-20: a single querySelector look-up finds only the current mode
    button, which is why the first version reported 'mode-control-not-found'.
    """
    label = {"battle": "Battle", "agent": "Agent Mode",
             "side": "Side by Side", "direct": "Direct"}[mode]
    # 1) open the menu
    opened = oc_eval("""(() => {
      const c = document.querySelector('button[role=combobox]');
      if (!c) return 'no-combobox';
      c.click(); return 'opened:' + (c.textContent||'').trim();
    })()""")
    time.sleep(2)
    # 2) click the option carrying the wanted label
    picked = oc_eval(f"""(() => {{
      const want = {json.dumps(label)};
      const cands = [...document.querySelectorAll(
        '[role=menuitem],[role=option],button,li,div[role=button]')]
        .filter(e => (e.textContent||'').trim().startsWith(want));
      if (!cands.length) return 'option-not-found';
      cands[cands.length - 1].click();
      const c = document.querySelector('button[role=combobox]');
      return 'picked:' + (c ? (c.textContent||'').trim() : '?');
    }})()""")
    time.sleep(2)
    return f"{opened} -> {picked}"


def textareas():
    return oc_eval("""JSON.stringify([...document.querySelectorAll('textarea')]
      .map(t => ({name: t.name, ph: t.getAttribute('placeholder'),
                  vis: t.offsetParent !== null})))""")


def send(prompt):
    # `type` sets React state (fill does not). Enter does not submit — the button does.
    oc("type", "textarea[name=message]", prompt)
    time.sleep(1)
    got = oc_eval("""(() => {
      const b = document.querySelector('button[aria-label="Send message"]');
      if (!b) return 'no-send-button';
      b.click(); return 'sent';
    })()""")
    return got


def read_reply(stable_for=3, max_wait=240):
    """Poll until the transcript stops growing, then return the last assistant block."""
    last, stable, waited = "", 0, 0
    while waited < max_wait:
        time.sleep(5)
        waited += 5
        txt = oc_eval("""(() => {
          const els = [...document.querySelectorAll(
            '[data-message-author-role], .prose, main p, main div')];
          return (document.body.innerText || '');
        })()""")
        if isinstance(txt, str) and txt == last:
            stable += 1
            if stable >= stable_for:
                return last
        else:
            stable = 0
            last = txt if isinstance(txt, str) else last
    return last


def extract(reply):
    """Pull the assistant answer out of the page transcript."""
    if not isinstance(reply, str):
        return ""
    # Drop the boilerplate footer arena always renders.
    cut = reply.find("Inputs are processed by third-party AI")
    if cut > 0:
        reply = reply[:cut]
    return reply.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="agent",
                    choices=["battle", "agent", "side", "direct"])
    ap.add_argument("--prompt")
    ap.add_argument("--prompt-file")
    ap.add_argument("--out")
    ap.add_argument("--url", default=URL)
    ap.add_argument("--wait", type=int, default=240)
    a = ap.parse_args()

    prompt = a.prompt
    if a.prompt_file:
        prompt = open(a.prompt_file, encoding="utf-8").read()
    if not prompt:
        print("no prompt given", file=sys.stderr)
        return 2

    oc("open", a.url)
    time.sleep(6)
    dismiss_gate()
    time.sleep(1)
    print("mode:", set_mode(a.mode), file=sys.stderr)
    time.sleep(1)
    print("textareas:", textareas(), file=sys.stderr)
    print("send:", send(prompt), file=sys.stderr)

    raw = read_reply(max_wait=a.wait)
    answer = extract(raw)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(answer)
        print(f"wrote {a.out} ({len(answer)} chars)", file=sys.stderr)
    else:
        print(answer)
    return 0


if __name__ == "__main__":
    sys.exit(main())
