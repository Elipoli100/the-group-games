"""Records the motion moments as frame strips (real clock): opening, countdown, one reveal.
Usage: python3 record_motion.py dist/index.html OUTDIR [--reduce]"""
import sys, os
from PIL import Image
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]; reduce = "--reduce" in sys.argv; os.makedirs(out, exist_ok=True)
errs = []
def strip(name, pg, times):
    frames = []; t0 = 0
    for t in times:
        pg.wait_for_timeout(t - t0); t0 = t; p = f"{out}/_{name}_{t}.png"; pg.screenshot(path=p); frames.append(p)
    ims = [Image.open(f).resize((195, 422)) for f in frames]
    W = Image.new("RGB", (195 * len(ims), 422)); [W.paste(im, (i * 195, 0)) for i, im in enumerate(ims)]
    W.save(f"{out}/{name}.png"); [os.remove(f) for f in frames]
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, reduced_motion="reduce" if reduce else "no-preference")
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith(("file:", "data:")) else r.fulfill(status=200, body='{"games":[]}'))
    pg.goto("file://" + os.path.abspath(src)); pg.wait_for_timeout(400)
    pg.locator(".salat-gate").click()
    strip("opening", pg, [50, 350, 700, 1000, 1300, 1600, 1900, 2300, 2900, 3700])
    pg.locator("[data-a=goSolo]").click(); pg.wait_for_timeout(500)
    pg.locator("[data-a=pickChar]").first.click(); pg.wait_for_timeout(200); pg.locator("[data-a=claim]").click(); pg.wait_for_timeout(1500)
    for _ in range(8):
        g = pg.locator("[data-gd=next],[data-gd=done]")
        if g.count(): g.first.click(); pg.wait_for_timeout(250)
    pg.evaluate("() => { if (!document.querySelector('.cdwrap')) { const b = document.querySelector('[data-a=start]'); b && b.click(); } }")
    strip("countdown", pg, [80, 350, 700, 1100, 2100, 3100, 3500, 3800])
    pg.wait_for_timeout(600)
    # answer: first option, a bet, lock
    pg.locator("[data-a=betOpen]").first.click(); pg.wait_for_timeout(300)
    pg.evaluate("() => document.querySelector('.betpop [data-a=bfOp]').click()"); pg.wait_for_timeout(200); pg.evaluate("() => [...document.querySelectorAll('.betpop [data-a=betClose]')].pop().click()"); pg.wait_for_timeout(300)
    pg.evaluate("() => { const o = document.querySelector('[data-a=sel]'); o && o.click(); }")
    pg.wait_for_timeout(300); strip("question", pg, [0, 1500])
    pg.evaluate("() => document.querySelector('[data-a=soloLock]').click()")
    strip("reveal", pg, [100, 500, 1000, 1250, 1450, 1700, 2000, 2300, 2600, 3200])
    b.close()
print("ERRORS:", errs)
