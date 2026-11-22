"""Photographs every pose twice at three screen sizes and checks the two shots are identical bit for bit.
Also audits each screen: at most one red (primary) button and at most one gold highlight, no horizontal scroll, no cut text.
Usage: python3 probe_pose.py [dist/index.html] [--shots DIR]   → prints ERRORS: [...]"""
import os, sys, json, hashlib, argparse
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument("file", nargs="?", default="dist/index.html"); ap.add_argument("--shots", default=None)
a = ap.parse_args(); url = "file://" + os.path.abspath(a.file) + "?dev=2828"
POSES = ["gate", "home", "claim", "countdown", "question", "reveal", "casino", "break-sum", "final", "share"]
SIZES = [(390, 844), (1024, 768), (900, 1440)]
AUDIT = r"""
() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const col = (e) => { const s = getComputedStyle(e); const bg = s.backgroundColor; const m = bg.match(/[\d.]+/g); if (m && (m[3] === undefined || +m[3] > 0.6)) return m.map(Number); const g = s.backgroundImage.match(/rgba?\(([^)]+)\)/g); if (!g) return null; return g[Math.min(1, g.length - 1)].match(/[\d.]+/g).map(Number); };
  const isRed = (e) => { const c = col(e); if (!c) return false; const [r, g, b] = c; return r > 150 && g < 80 && b < 90; };
  // primary actions: a red filled button (not a casino chip, not a red playing-card / negative label)
  const reds = [...document.querySelectorAll('button, a.btn')].filter((e) => vis(e) && !e.closest('.presets,.cstack,.chipbtn,.mgrid5,.hlstage,.bjtable,.slots,.gdwrap,.modal') && isRed(e) && e.getBoundingClientRect().width > 120);
  // gold highlights: gold-filled buttons / gold-filled badges (outlines and text don't count)
  const isGold = (e) => { const c = col(e); if (!c) return false; const [r, g, b, al] = c; return r > 200 && g > 150 && g < 210 && b < 110 && (al === undefined || al > 0.6); };
  const golds = [...document.querySelectorAll('button, .badge, .btn')].filter((e) => vis(e) && !e.closest('.presets,.cstack,.mgrid5,.plinko,.slots,.board,.rivals,.gddots,.lvl') && isGold(e));
  const cut = [...document.querySelectorAll('button, h1, h2, h3, b')].filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible' && !/ellipsis/.test(getComputedStyle(e).textOverflow)).map((e) => (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 20));
  return { reds: reds.map((e) => e.textContent.trim().slice(0, 24)), golds: golds.map((e) => e.textContent.trim().slice(0, 24)), hscroll: document.documentElement.scrollWidth > innerWidth + 1, cut };
}
"""
errors, report = [], []
if a.shots: os.makedirs(a.shots, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for (w, h) in SIZES:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        reqs = []; pg.route("**/*", lambda r: (reqs.append(r.request.url) if not r.request.url.startswith(("file:", "data:")) else None, r.continue_() if r.request.url.startswith(("file:", "data:")) else r.abort())[1])
        pg.goto(url); pg.wait_for_timeout(500)
        for name in POSES:
            hs = []
            for k in range(2):
                pg.evaluate(f"() => __TGG_APP.pose({json.dumps(name)})"); pg.wait_for_timeout(250)
                png = pg.screenshot(full_page=False); hs.append(hashlib.sha256(png).hexdigest())
                if a.shots and k == 0: open(f"{a.shots}/{w}x{h}_{name}.png", "wb").write(png)
            if hs[0] != hs[1]: errors.append(f"{name} @{w}x{h}: two shots differ")
            au = pg.evaluate(AUDIT)
            if len(au["reds"]) > 1: errors.append(f"{name} @{w}x{h}: {len(au['reds'])} red buttons {au['reds']}")
            if len(au["golds"]) > 1: errors.append(f"{name} @{w}x{h}: {len(au['golds'])} gold highlights {au['golds']}")
            if au["hscroll"]: errors.append(f"{name} @{w}x{h}: horizontal scroll")
            if au["cut"]: errors.append(f"{name} @{w}x{h}: cut text {au['cut'][:3]}")
            report.append((w, name, len(au["reds"]), len(au["golds"])))
        reqs = [u for u in reqs if "script.google.com" not in u]  # the leaderboard is the one address the game may call
        if reqs: errors.append("network requests during poses: " + ", ".join(sorted(set(reqs))[:5]))
        # pose(null) gives the normal game back
        pg.evaluate("() => { localStorage.setItem('tgg_marker', 'x'); }")
        ctx.close()
    b.close()
for r in report: print(*r)
print("ERRORS:", json.dumps(errors, ensure_ascii=False))
