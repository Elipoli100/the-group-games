/* סלט – שער ופתיח. השער מוצג פעם אחת בכל פתיחה של האתר: הקשה פותחת את האודיו ומפעילה את הפתיח.
   הפתיח: הצ'יפ מתרכב חלק אחרי חלק (2.2 שניות), "סלט" נחשף אות אחרי אות, ואז הצ'יפ מתכווץ אל הלוגו בפינה.
   בכל רגע הקשה מדלגת. שימוש: SalatSplash.play({ onDone }) */
(function () {
  "use strict";
  const CSS = `
  .salat-gate,.salat-splash{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(120% 80% at 50% 30%,var(--felt) 0%,var(--felt-deep) 62%);overflow:hidden;cursor:pointer}
  .salat-splash{z-index:9999}
  .salat-gate::before,.salat-splash::before{content:"";position:absolute;inset:0;opacity:var(--grain);pointer-events:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
  .s-chip{position:relative;width:min(56vw,240px);aspect-ratio:600/612;filter:drop-shadow(0 24px 40px rgba(0,0,0,.45))}
  .s-chip svg{width:100%;height:100%;display:block;overflow:visible}
  .s-word{margin:30px 0 0;display:flex;gap:10px;direction:rtl}
  .s-word.shake{animation:sShake .45s var(--ease-in-out)}
  @keyframes sShake{0%,100%{transform:none}20%{transform:translateX(-7px) rotate(-1.5deg)}40%{transform:translateX(7px) rotate(1.5deg)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}
  .s-win{position:relative;width:76px;height:92px;overflow:hidden;border-radius:var(--r-1);background:var(--felt-deep);
    box-shadow:0 0 0 2px var(--gold),0 0 0 5px var(--wood),var(--e-2)}
  .s-win::before,.s-win::after{content:"";position:absolute;left:0;right:0;height:32%;z-index:2;pointer-events:none}
  .s-win::before{top:0;background:linear-gradient(180deg,rgba(0,0,0,.6),transparent)}.s-win::after{bottom:0;background:linear-gradient(0deg,rgba(0,0,0,.6),transparent)}
  .s-strip{display:flex;flex-direction:column;will-change:transform}.s-strip.spin{filter:url(#vblur)}
  .s-strip span{height:92px;line-height:92px;text-align:center;font:400 70px/92px var(--f-brand);color:var(--ivory);text-shadow:0 4px 0 #8C6A1E,0 7px 10px rgba(0,0,0,.45)}
  .s-glow{position:absolute;inset:0;border-radius:50%;border:6px solid var(--gold);opacity:0;pointer-events:none}
  .s-win.hit{box-shadow:0 0 0 2px var(--gold),0 0 0 5px var(--wood),0 0 26px rgba(232,184,74,.55),var(--e-2)}
  .s-sub{margin:14px 0 0;font:500 var(--fs-1) var(--f-ui);letter-spacing:.42em;color:var(--gold);direction:ltr}
  .s-tap{margin-top:30px;font:500 var(--fs-3) var(--f-ui);color:var(--dim)}
  .s-copy{position:absolute;bottom:calc(20px + env(safe-area-inset-bottom,0px));margin:0;font:400 var(--fs-1) var(--f-ui);color:var(--dim);opacity:.6}
  .salat-gate .s-chip{animation:sBreath 3.2s var(--ease-in-out) infinite}
  @keyframes sBreath{0%,100%{transform:none}50%{transform:translateY(-6px)}}
  @media (prefers-reduced-motion:reduce){.salat-gate .s-chip{animation:none}}`;
  function style() { if (document.getElementById("salat-splash-css")) return; const st = document.createElement("style"); st.id = "salat-splash-css"; st.textContent = CSS; document.head.appendChild(st); }

  // ---------- sound (WebAudio, no files) ----------
  let ac = null;
  function tone(freq, dur, type = "triangle", vol = 0.06, slideTo = null, at = 0) {
    if (!ac) return; const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  }
  const sfx = {
    disc: () => tone(140, 0.25, "sine", 0.18, 70),
    ins: () => { for (let i = 0; i < 8; i++) tone(1200 + i * 60, 0.035, "square", 0.025, null, i * 0.045); },
    ring: () => tone(1320, 0.5, "sine", 0.06, 1760),
    bowl: () => tone(330, 0.18, "triangle", 0.08),
    leaves: () => { tone(660, 0.12, "triangle", 0.06); tone(880, 0.12, "triangle", 0.05, null, 0.08); },
    tom: () => tone(520, 0.14, "sine", 0.12, 260),
    word: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.3, "triangle", 0.07, null, i * 0.09)),
    tick: () => tone(900, 0.03, "square", 0.025),
    stop: () => tone(220, 0.12, "triangle", 0.1),
    piu: () => tone(700, 0.45, "sawtooth", 0.06, 120),
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const red = () => window.M && M.reduced();

  async function play({ onDone = () => {}, sound = true, copyright = "© פולצ׳ק הפקות 2026" } = {}) {
    style();
    if (sound) { try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {} try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); await Promise.race([ac.resume(), wait(250)]); } catch (e) { ac = null; } if (ac && ac.state !== "running") ac = null; }
    const root = document.createElement("div"); root.className = "salat-splash"; root.setAttribute("role", "img"); root.setAttribute("aria-label", "סלט");
    root.innerHTML = `<div class="s-chip"><div class="s-glow"></div>${SalatChip.svg()}</div><div class="s-word" aria-hidden="true"></div><p class="s-sub">THE GROUP GAMES</p><p class="s-copy"></p>`;
    root.querySelector(".s-copy").textContent = copyright;
    document.body.appendChild(root);
    // "סלט" comes up like a slot machine: three reels; the third stops on ק first ("סלק"), shakes, then clicks over to ט
    const POOL = "אבגדהוזחכמנעפצקרשת".split(""); const CELL = 92;
    const plan = [["ס"], ["ל"], ["ט", "ק"]];
    const reels = plan.map(([target, extra], i) => {
      const cells = [""]; for (let k = 0; k < 12 + i * 3; k++) cells.push(POOL.filter((c) => c !== target && c !== extra)[(k * 7 + i * 5) % 16]);
      if (extra) cells.push(extra); cells.push(target);
      const win = document.createElement("div"); win.className = "s-win"; const strip = document.createElement("div"); strip.className = "s-strip";
      strip.innerHTML = cells.map((c) => `<span>${c}</span>`).join(""); win.appendChild(strip); root.querySelector(".s-word").appendChild(win);
      return { win, strip, n: cells.length, pos: 0 };
    });
    root.querySelector(".s-word").style.opacity = 0;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const spin = (r, to, ms) => new Promise((ok) => { // rolls to a cell, with a tick on every letter and a small bounce on the stop
      const from = r.pos, t0 = performance.now(); let last = Math.floor(from); r.strip.classList.add("spin");
      (function f(now) {
        if (done) return ok(); const p = Math.min(1, (now - t0) / ms); const k = easeOut(p); const pos = from + (to - from) * k;
        r.strip.style.transform = `translateY(${-pos * CELL}px)`; if (Math.floor(pos) !== last) { last = Math.floor(pos); sfx.tick(); }
        if (p > 0.75) r.strip.classList.remove("spin");
        if (p < 1) requestAnimationFrame(f); else { r.pos = to; sfx.stop(); r.strip.animate([{ transform: `translateY(${-to * CELL - 10}px)` }, { transform: `translateY(${-to * CELL}px)` }], { duration: 220, easing: M.ease("back") }); ok(); }
      })(t0);
    });
    const sub = root.querySelector(".s-sub"); sub.style.opacity = 0;
    let done = false;
    const finish = async (skip) => {
      if (done) return; done = true;
      // the chip lands where the logo lives (top corner); the rest fades
      const chip = root.querySelector(".s-chip"); const logo = document.querySelector(".topbar .brandlogo");
      if (!red() && logo && chip) {
        const a = chip.getBoundingClientRect(), b = logo.getBoundingClientRect(); const k = b.height / a.height;
        chip.animate([{ transform: "none" }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px,${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${k})` }], { duration: M.T.scene(), easing: M.ease("inOut"), fill: "forwards" });
        root.animate([{ backgroundColor: "transparent" }], { duration: 1 });
        [root.querySelector(".s-word"), sub, root.querySelector(".s-copy")].forEach((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: M.T.ui(), fill: "forwards" }));
        root.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: M.T.scene() + 80, fill: "forwards" });
        await wait(M.T.scene() + 80);
      } else { root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }); await wait(200); }
      root.remove(); onDone();
    };
    root.addEventListener("click", () => finish(true));
    // the chip spins in like the original opening (five full turns, slowing down) while it builds itself
    const svgEl = root.querySelector(".s-chip svg");
    if (!red() && svgEl) svgEl.animate([{ transform: "scale(.4) rotate(-1800deg)" }, { transform: "none" }], { duration: 3200, easing: "cubic-bezier(.12,.75,.25,1)", fill: "both" });
    const built = SalatChip.assemble(root.querySelector(".s-chip"), { onStep: (n) => !done && sfx[n] && sfx[n]() });
    await wait(red() ? 0 : 500); if (done) return;
    // "סלט" letter by letter, Suez One
    const word = root.querySelector(".s-word");
    if (red()) { reels.forEach((r) => { r.pos = r.n - 1; r.strip.style.transform = `translateY(${-(r.n - 1) * CELL}px)`; }); word.style.opacity = 1; }
    else {
      word.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: M.T.ui(), easing: M.ease("out"), fill: "forwards" }); word.style.opacity = "";
      await Promise.all(reels.map((r, i) => spin(r, i === 2 ? r.n - 2 : r.n - 1, 1700 + i * 420)).concat([built]));
      if (done) return;
      await wait(220); word.classList.add("shake"); sfx.piu(); await wait(480); word.classList.remove("shake");
      await spin(reels[2], reels[2].n - 1, 300); if (done) return;
    }
    await built; if (done) return;
    reels.forEach((r, i) => setTimeout(() => r.win.classList.add("hit"), i * 70)); sfx.word();
    if (!red()) root.querySelector(".s-glow").animate([{ opacity: 0.9, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: M.T.reveal(), easing: M.ease("out") });
    sub.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: 300, easing: M.ease("out"), fill: "forwards" });
    await wait(1100); finish(false);
  }
  window.SalatSplash = { play, style };
})();
(function () {
  // the gate: once per site visit. Tapping it unlocks audio (phones need a tap first) and plays the opening.
  let seen = false; try { seen = !!sessionStorage.getItem("tgg_splash"); sessionStorage.setItem("tgg_splash", "1"); } catch (e) {}
  const soundOn = () => { try { const p = JSON.parse(localStorage.getItem("tgg_prefs") || "{}"); return p.sound !== false; } catch (e) { return true; } };
  let busy = false;
  const run = (sound) => { if (busy) return; busy = true; window.SalatSplash.play({ sound, onDone: () => { busy = false; } }); };
  window.SALAT_SPLASH = { play: () => run(soundOn()) };
  const mount = () => {
    const g = document.createElement("div"); g.className = "salat-gate"; g.setAttribute("role", "button"); g.setAttribute("aria-label", "הקש כדי להתחיל");
    g.innerHTML = `<div class="s-chip">${window.SALAT_CHIP_SVG}</div><p class="s-tap">הקש כדי להתחיל</p>`;
    document.body.appendChild(g);
    g.onclick = () => { g.onclick = null; run(soundOn()); setTimeout(() => g.remove(), 60); };
  };
  window.SalatSplash.style();
  window.SALAT_SPLASH.gate = mount; // pose("gate") for tests
  if (seen) return;
  mount();
})();
