"""Plays a full solo game in headless Chrome with a fake clock and prints ERRORS: [...] at the end.
Usage: python3 probe_solo.py [dist/index.html] [--shots DIR] [--w 390 --h 844] [--verbose]
Screenshots each key screen the first time it appears (gate, home, claim, question, bet, reveal, break, casino, final)."""
import sys, os, json, argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("file", nargs="?", default="dist/index.html")
ap.add_argument("--shots", default=None)
ap.add_argument("--w", type=int, default=390)
ap.add_argument("--h", type=int, default=844)
ap.add_argument("--verbose", action="store_true")
ap.add_argument("--reduce", action="store_true")
ap.add_argument("--board", default='{"games":[]}', help="leaderboard JSON the fake cloud returns")
ap.add_argument("--steps", type=int, default=1400)
a = ap.parse_args()
path = "file://" + os.path.abspath(a.file)
if a.shots: os.makedirs(a.shots, exist_ok=True)

# key screens, detected by selector, shot once
SCREENS = [("gate", ".salat-gate"), ("home", "[data-a=goSolo]"), ("claim", "[data-a=pickChar]"),
           ("bet", ".betpop"), ("question", "[data-a=soloLock]"), ("reveal", ".reshero"),
           ("break", "[data-a=soloSkip]"), ("brksum", ".brksum"), ("guide", ".gdsheet"), ("final", ".moments, .rivals")]
# what to click, in priority order (the probe plays: picks a character, answers, bets once, skips casino games)
JS_STEP = r"""
() => {
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && getComputedStyle(e).visibility !== 'hidden'; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  const click = (e, why) => { e.scrollIntoView({block:'center'}); e.click(); return why + ':' + (e.dataset.a || e.className || e.tagName) + (e.dataset.v ? '=' + e.dataset.v : ''); };
  const W = window.__probe = window.__probe || { bet: 0, n: 0 };
  const g = q('.salat-gate'); if (g.length) return click(g[0], 'gate');
  const sp = q('.salat-splash, #salatSplash'); if (sp.length) return click(sp[0], 'splash');
  const gd = q('[data-gd=next], [data-gd=done]')[0]; if (gd) return click(gd, 'guide');
  if (document.querySelector('.moments, .rivals')) return 'DONE';
  for (const s of ['[data-close]', '.modal [data-a=closeGuide]', '.confirm .btn.pri']) { const e = q(s)[0]; if (e && e.closest('.modal, .overlay, .confirm, .sheet')) return click(e, 'modal'); }
  const home = q('[data-a=goSolo]')[0]; if (home) return click(home, 'home');
  if (q('[data-a=pickChar]').length) { const sel = q('[data-a=claim]')[0]; if (sel && !sel.disabled && document.querySelector('.charpick .on, .charpick .sel, [data-a=pickChar].on, [data-a=pickChar].sel')) return click(sel, 'claim'); return click(q('[data-a=pickChar]')[0], 'pick'); }
  const lock = [...document.querySelectorAll('[data-a=soloLock]')].filter(e => e.getBoundingClientRect().width > 0)[0];
  if (lock) {
    const hb = document.querySelector('.solohead .badge'); W.n = hb ? parseInt(hb.textContent) : W.n;
    if (W.n % 3 === 1 && !document.querySelector('.betpop') && q('[data-a=betOpen]')[0] && !W['b' + W.n]) { W['b' + W.n] = 1; return click(q('[data-a=betOpen]')[0], 'betOpen'); }
    if (document.querySelector('.betpop')) { const chip = q('.betpop [data-a=bfSet], .betpop [data-a=bfOp]').filter(e => e.dataset.v !== '0')[0]; if (chip && !W['c' + W.n]) { W['c' + W.n] = 1; return click(chip, 'chip'); } return click(q('.betpop [data-a=betClose]').pop(), 'betClose'); }
    const opt = q('[data-a=sel], [data-a=kp], [data-a=ord], [data-a=nrStep], [data-a=mt]')[0];
    if (opt && lock.disabled === false) return click(lock, 'lock');
    if (opt && !W['o' + W.n]) { W['o' + W.n] = 1; return click(opt, 'answer'); }
    if (!lock.disabled) return click(lock, 'lock');
    return null;
  }
  for (const s of ['[data-a=soloSkip]', '[data-a=host][data-v=continue]', '[data-a=host][data-v=next]', '[data-a=host]', '[data-a=start]', '[data-a=revealMore]']) { const e = q(s)[0]; if (e) return click(e, 'go'); }
  return null;
}
"""

errors, requests = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": a.w, "height": a.h}, device_scale_factor=2, locale="he-IL", reduced_motion="reduce" if a.reduce else "no-preference")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append("console: " + m.text))
    def on_route(route):
        u = route.request.url
        if not u.startswith("file:") and not u.startswith("data:"): requests.append(u)
        if "script.google.com" in u:
            return route.fulfill(status=200, content_type="application/json", body=a.board)
        if u.startswith("file:") or u.startswith("data:"): return route.continue_()
        return route.abort()
    page.route("**/*", on_route)
    page.clock.install()
    page.goto(path + ("&" if "?" in path else "?") + "probe=1")
    page.clock.run_for(1500)
    shot = set(); done = False; idle = 0; log = []
    for i in range(a.steps):
        for name, sel in SCREENS:
            if a.shots and name not in shot and page.locator(sel).count() and page.locator(sel).first.is_visible():
                page.clock.run_for(1200); shot.add(name); page.screenshot(path=f"{a.shots}/{name}.png")
        r = page.evaluate(JS_STEP)
        if a.verbose and r: print(i, r)
        if r: log.append(r)
        if r == "DONE": done = True; break
        page.clock.run_for(700 if r else 1500)
    if a.shots and "final" not in shot and done: page.screenshot(path=f"{a.shots}/final.png")
    if a.shots:
        page.screenshot(path=f"{a.shots}/final_full.png", full_page=True)
        if done:
            page.clock.resume()
            durl = page.evaluate("() => __TGG_APP.shareImage(__TGG_APP.A.view).then(b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }))")
            import base64; open(f"{a.shots}/share.png", "wb").write(base64.b64decode(durl.split(",", 1)[1]))
    emo = page.evaluate(r"() => [...new Set((document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []))]")
    if emo: errors.append("emoji in UI: " + " ".join(emo))
    hz = page.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
    if hz: errors.append("horizontal scroll at %dx%d" % (a.w, a.h))
    b.close()
if not done: errors.append("game did not reach the final screen (last: %s)" % log[-5:])
ext = [u for u in requests if "script.google.com" not in u]
if ext: errors.append("external requests: " + ", ".join(sorted(set(ext))[:8]))
print("steps:", len(log), "| screens:", ",".join(sorted(shot)) if a.shots else "-")
print("ERRORS:", json.dumps(errors, ensure_ascii=False))
