/* סלט · THE GROUP GAMES — motion system. One module, Web Animations API, no libraries.
   Every animation uses one of the four curves and one of the five durations from tokens.css.
   Rules: only transform and opacity move; every function returns a Promise that resolves when the motion ends
   (timer based, so it also resolves in a hidden tab); prefers-reduced-motion or the "פחות תנועה" switch → short fades only. */
(function () {
  "use strict";
  const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const ms = (k) => parseFloat(css(k)) || 0;
  const E = { out: "var(--ease-out)", inOut: "var(--ease-in-out)", back: "var(--ease-back)", in: "var(--ease-in)" };
  // WAAPI does not read var() in easing, so resolve once
  const ease = (k) => css("--ease-" + k) || "ease";
  const T = { tap: () => ms("--t-tap"), ui: () => ms("--t-ui"), scene: () => ms("--t-scene"), reveal: () => ms("--t-reveal"), moment: () => ms("--t-moment") };
  const wait = (t) => new Promise((r) => setTimeout(r, Math.max(0, t)));
  const reduced = () => !!(document.body && document.body.classList.contains("reduce")) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function anim(el, frames, dur, curve, extra) {
    if (!el || !el.animate) return wait(dur);
    el.animate(frames, Object.assign({ duration: dur, easing: ease(curve || "out"), fill: "backwards" }, extra || {}));
    return wait(dur + ((extra && extra.delay) || 0));
  }
  let layer = null;
  function fx() { if (!layer || !layer.isConnected) { layer = document.createElement("div"); layer.className = "mfx"; document.body.appendChild(layer); } return layer; }

  // 1) staggered entry: 40ms steps, max 6; from the 7th on everything enters together
  function enter(els, { stagger = 40, max = 6, y = 12 } = {}) {
    const list = Array.from(els || []).filter(Boolean); if (!list.length) return Promise.resolve();
    const d = reduced() ? 200 : T.ui();
    list.forEach((el, i) => anim(el, reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "none" }], d, "out", { delay: Math.min(i, max) * stagger }));
    return wait(d + Math.min(list.length - 1, max) * stagger);
  }

  // 2) screen change that continues a shape: the new screen opens out of the element that was tapped
  function scene(fromEl, renderFn) {
    const r = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    renderFn && renderFn();
    const app = document.getElementById("app"); if (!app) return Promise.resolve();
    const d = T.scene();
    if (reduced() || !r) return anim(app, [{ opacity: 0 }, { opacity: 1 }], reduced() ? 200 : d, "inOut");
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    const r0 = Math.max(r.width, r.height) / 2;
    return anim(app, [{ clipPath: `circle(${r0}px at ${cx}px ${cy}px)` }, { clipPath: `circle(${R}px at ${cx}px ${cy}px)` }], d, "inOut");
  }

  // 3) odometer: every digit is a column that slides (translateY); tabular digits keep the width still
  function odometer(el, from, to, { ms: dur = T.reveal(), fmt } = {}) {
    if (!el) return Promise.resolve();
    const f = fmt || ((n) => Math.round(n).toLocaleString("en-US"));
    const a = f(from), b = f(to);
    if (reduced() || a === b) { el.textContent = b; return Promise.resolve(); }
    const up = to > from; const A2 = a.padStart(b.length, " "), B2 = b.padStart(a.length, " ");
    el.textContent = ""; el.classList.add("odo");
    const cols = [];
    for (let i = 0; i < Math.max(A2.length, B2.length); i++) {
      const x = A2[i], y = B2[i];
      if (!/\d/.test(x) && !/\d/.test(y)) { const s = document.createElement("span"); s.className = "odo-s"; s.textContent = y === " " ? "" : y; el.appendChild(s); continue; }
      const dx = /\d/.test(x) ? +x : 0, dy = /\d/.test(y) ? +y : 0;
      const col = document.createElement("span"); col.className = "odo-c";
      const strip = document.createElement("span"); strip.className = "odo-strip";
      // digits from → to, wrapping in the direction of change, plus a full turn on the most significant changed column
      const seq = []; let k = dx; seq.push(k);
      const steps = ((up ? dy - dx : dx - dy) + 10) % 10 || (x !== y ? 10 : 0);
      for (let s = 0; s < steps; s++) { k = (k + (up ? 1 : 9)) % 10; seq.push(k); }
      if (y === " ") seq[seq.length - 1] = "";
      strip.innerHTML = seq.map((n) => `<span>${n}</span>`).join("");
      col.appendChild(strip); el.appendChild(col); cols.push([strip, seq.length]);
    }
    cols.forEach(([strip, n], i) => strip.animate([{ transform: "translateY(0)" }, { transform: `translateY(-${(n - 1) * 1.2}em)` }], { duration: dur * (0.6 + 0.4 * (i + 1) / cols.length), easing: ease("out"), fill: "forwards" }));
    return wait(dur).then(() => { el.classList.remove("odo"); el.textContent = b; });
  }

  // 4) coins fly in an arc from an element to the counter
  function coinsFly(fromEl, toEl, n = 8) {
    if (reduced() || !fromEl || !toEl) return Promise.resolve();
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect(); const L = fx(); const d = T.reveal();
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span"); c.className = "mcoin"; c.innerHTML = window.TGG_ICONS ? TGG_ICONS.gi("coin") : "";
      c.style.left = x0 + "px"; c.style.top = y0 + "px"; L.appendChild(c);
      const sx = (Math.random() - 0.5) * 70, lift = 60 + Math.random() * 50;
      c.animate([{ transform: "translate(-50%,-50%) scale(.5)", opacity: 0 },
        { transform: `translate(calc(-50% + ${sx}px),calc(-50% - ${lift}px)) scale(1.1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(calc(-50% + ${x1 - x0}px),calc(-50% + ${y1 - y0}px)) scale(.6)`, opacity: 1, offset: 0.95 },
        { transform: `translate(calc(-50% + ${x1 - x0}px),calc(-50% + ${y1 - y0}px)) scale(.3)`, opacity: 0 }],
        { duration: d * 0.8, delay: i * 45, easing: ease("inOut"), fill: "both" }).onfinish = () => c.remove();
    }
    return wait(d * 0.8 + (n - 1) * 45);
  }

  // 5) FLIP: measure, change the DOM, animate the difference
  function flip(list, mutate) {
    const els = Array.from(list || []); const first = new Map(els.map((e) => [e, e.getBoundingClientRect()]));
    mutate && mutate();
    if (reduced()) return Promise.resolve();
    const d = T.moment() * 0.5;
    els.forEach((e) => { const f = first.get(e), l = e.getBoundingClientRect(); const dy = f.top - l.top, dx = f.left - l.left; if (!dx && !dy) return;
      e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: d, easing: ease("back") }); });
    return wait(d);
  }

  // 6) celebrations, three tiers (replaces juice)
  function pop(el) { if (!el || reduced()) return; el.animate([{ transform: "scale(.96)" }, { transform: "scale(1.04)", offset: 0.5 }, { transform: "none" }], { duration: T.ui(), easing: ease("back") }); }
  function celebrate(tier, { label, origin, to } = {}) {
    if (tier === "small" || reduced()) { pop(origin); return wait(reduced() ? 0 : T.ui()); }
    const counter = to || document.querySelector("#coinPill");
    if (tier === "medium") { pop(origin); return coinsFly(origin, counter, 6 + Math.floor(Math.random() * 5)); }
    // big: dim to 40%, one big Suez number rises in the centre, one light sweep
    const L = fx(); const d = T.moment();
    const dim = document.createElement("div"); dim.className = "mdim"; L.appendChild(dim);
    const big = document.createElement("div"); big.className = "mbig"; big.textContent = label || ""; L.appendChild(big);
    const sweep = document.createElement("div"); sweep.className = "msweep"; L.appendChild(sweep);
    dim.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: d, easing: "linear", fill: "both" }).onfinish = () => dim.remove();
    big.animate([{ transform: "translate(-50%,-30%) scale(.7)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.25 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.8 }, { transform: "translate(-50%,-56%) scale(1)", opacity: 0 }], { duration: d, easing: ease("out"), fill: "both" }).onfinish = () => big.remove();
    sweep.animate([{ transform: "translateX(-120%) skewX(-18deg)", opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: "translateX(120%) skewX(-18deg)", opacity: 0 }], { duration: d * 0.6, delay: d * 0.15, easing: ease("inOut"), fill: "both" }).onfinish = () => sweep.remove();
    if (origin) coinsFly(origin, counter, 10);
    return wait(d);
  }

  // 7) text rises out of a mask, word by word (cinematic moments only: opening, countdown, finale)
  function maskWords(el, { stagger = 85 } = {}) {
    if (!el) return Promise.resolve(); const words = el.textContent.split(/(\s+)/);
    if (reduced()) return anim(el, [{ opacity: 0 }, { opacity: 1 }], 200, "out");
    el.innerHTML = words.map((w) => /^\s+$/.test(w) ? w : `<span class="mw"><span>${w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span></span>`).join("");
    const inner = el.querySelectorAll(".mw>span"); const d = T.scene();
    inner.forEach((s, i) => s.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: d, delay: i * stagger, easing: ease("out"), fill: "backwards" }));
    return wait(d + (inner.length - 1) * stagger);
  }

  window.M = { enter, scene, odometer, coinsFly, flip, celebrate, maskWords, reduced, pop, wait, anim, ease, T };
})();
