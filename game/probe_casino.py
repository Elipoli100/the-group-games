"""Plays full solo games and, unlike probe_solo, PLAYS every casino break (bets, plays a round, collects).
Runs games until every kind seen in a break has been played at least once (or --games is reached).
Usage: python3 probe_casino.py [dist/index.html] [--games 4] [--shots DIR]   → prints KINDS: [...] and ERRORS: [...]"""
import os, json, argparse
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument("file", nargs="?", default="dist/index.html"); ap.add_argument("--games", type=int, default=4); ap.add_argument("--shots", default=None)
a = ap.parse_args(); path = "file://" + os.path.abspath(a.file)
if a.shots: os.makedirs(a.shots, exist_ok=True)
STEP = r"""
() => {
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled; };
  const q = (s) => [...document.querySelectorAll(s)].filter(vis);
  const click = (e, why) => { e.scrollIntoView({block:'center'}); e.click(); return why + ':' + (e.dataset.a || e.className) + (e.dataset.v ? '=' + e.dataset.v : ''); };
  const W = window.__pc = window.__pc || { kinds: {}, t: 0 };
  const g = q('.salat-gate, .salat-splash')[0]; if (g) return click(g, 'gate');
  const gd = q('[data-gd=next], [data-gd=done]')[0]; if (gd) return click(gd, 'guide');
  const md = q('.modal [data-close], .confirm .btn.pri')[0]; if (md) return click(md, 'modal');
  if (document.querySelector('.moments, .rivals')) return 'DONE';
  const home = q('[data-a=goSolo]')[0]; if (home) return click(home, 'home');
  if (q('[data-a=pickChar]').length) { const c = q('[data-a=claim]')[0]; if (c && document.querySelector('.charpick.sel')) return click(c, 'claim'); return click(q('[data-a=pickChar]')[Math.floor(Math.random()*4)], 'pick'); }
  // ── casino break: play it
  const kind = (() => { const v = window.__TGG_APP.A.view; return v && v.round && v.round.roulette && v.phase === 'roulette' ? v.round.roulette.kind : null; })();
  if (kind) {
    W.kinds[kind] = W.kinds[kind] || 0;
    const go = q('[data-a=breakGo]')[0]; if (go) return click(go, 'breakGo:' + kind);
    // a bet: a chip preset if none set yet
    const pre = q('.presets [data-a=bfSet]').filter(e => e.dataset.v !== '0'); const amt = document.querySelector('.bfinput'); const noBet = amt && /^\s*0\s*$/.test(amt.textContent);
    const act = (s) => q(s)[0];
    let e;
    if ((e = act('[data-a=cashout]')) && W.t++ % 3 === 2) return click(e, 'cash');
    if ((e = act('[data-a=mnCash]')) && W.mn >= 2) { W.kinds[kind]++; return click(e, 'mnCash'); }
    if ((e = act('[data-a=mnPick]'))) { W.mn = (W.mn || 0) + 1; return click(e, 'mnPick'); }
    if ((e = act('[data-a=hlCash]')) && W.hl >= 1) { W.kinds[kind]++; return click(e, 'hlCash'); }
    if ((e = act('[data-a=hlGuess]'))) { W.hl = (W.hl || 0) + 1; return click(e, 'hlGuess'); }
    if ((e = act('[data-a=bjAct][data-v=stand]'))) { W.kinds[kind]++; return click(e, 'stand'); }
    if (pre.length && noBet && !W['bet' + kind + (window.__TGG_APP.A.view.round.n)]) { W['bet' + kind + window.__TGG_APP.A.view.round.n] = 1; return click(pre[0], 'bet'); }
    for (const s of ['[data-a=plinkoDrop]', '[data-a=diceRoll]', '[data-a=hlStart]', '[data-a=bjDeal]', '[data-a=mnStart]', '[data-a=wheelLock]']) if ((e = act(s))) { W.mn = 0; W.hl = 0; if (/plinko|dice|wheel/.test(s)) W.kinds[kind]++; return click(e, 'play:' + kind); }
    for (const s of ['[data-a=host][data-v=continue]', '[data-a=soloSkip]']) if ((e = act(s))) return click(e, 'leave:' + kind);
    return null;
  }
  const lock = [...document.querySelectorAll('[data-a=soloLock]')].filter(e => e.getBoundingClientRect().width > 0)[0];
  if (lock) { const o = q('[data-a=sel], [data-a=kp], [data-a=ord], [data-a=nrStep], [data-a=mt]')[0]; if (lock.disabled && o) return click(o, 'answer'); if (!lock.disabled) return click(lock, 'lock'); return null; }
  for (const s of ['[data-a=host][data-v=continue]', '[data-a=host]', '[data-a=start]']) { const e = q(s)[0]; if (e) return click(e, 'go'); }
  return null;
}
"""
errors, played = [], {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    for gn in range(a.games):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2); page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append("console: " + m.text))
        page.route("**/*", lambda r: r.continue_() if r.request.url.startswith(("file:", "data:")) else r.fulfill(status=200, body='{"games":[]}'))
        page.clock.install(); page.goto(path); page.clock.run_for(1500)
        done = False; shot = set()
        for i in range(2500):
            r = page.evaluate(STEP)
            if r == "DONE": done = True; break
            if a.shots and r and r.startswith("play:"):
                k = r.split(":")[2] if r.count(":") > 1 else r
                if k not in shot: shot.add(k); page.clock.run_for(900); page.wait_for_timeout(700); page.screenshot(path=f"{a.shots}/{k}.png")
            page.clock.run_for(400 if r else 1000)
            if r is None: page.wait_for_timeout(30)
        k = page.evaluate("() => (window.__pc || {}).kinds || {}")
        for kk, vv in k.items(): played[kk] = played.get(kk, 0) + vv
        if not done: errors.append(f"game {gn + 1} did not finish")
        ctx.close()
    b.close()
print("KINDS:", json.dumps(played))
print("ERRORS:", json.dumps(errors, ensure_ascii=False))
