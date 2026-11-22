/* סלט · casino table canvas: plinko, mines and crash move here.
   One loop for all of them: a fixed step of 1/60 s (so the motion is the same on every phone),
   drawn on requestAnimationFrame, and stopped while the tab is hidden. Results always come from engine.js:
   the canvas only shows a path the engine already decided. */
(function () {
  "use strict";
  const STEP = 1 / 60;
  const tok = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const reduced = () => window.M && M.reduced();

  // ── the loop ──
  function loop(update, draw) {
    let acc = 0, last = performance.now(), raf = 0, stopped = false;
    const frame = (t) => {
      if (stopped) return;
      if (document.hidden) { last = t; raf = requestAnimationFrame(frame); return; }
      acc += Math.min(0.25, (t - last) / 1000); last = t;
      let alive = true; while (acc >= STEP && alive) { alive = update(STEP) !== false; acc -= STEP; }
      draw(); if (alive) raf = requestAnimationFrame(frame); else stopped = true;
    };
    raf = requestAnimationFrame(frame);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }
  // a canvas laid exactly over an element, sharp on retina
  function overlay(host, cls) {
    let c = host.querySelector("canvas." + cls);
    if (!c) { c = document.createElement("canvas"); c.className = cls; host.appendChild(c); }
    const r = host.getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); c.style.width = r.width + "px"; c.style.height = r.height + "px";
    const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); return { c, g, w: r.width, h: r.height };
  }

  // ── particles (gem sparkle, mine blast) ──
  function burst(host, x, y, kind) {
    if (reduced() || !host) return;
    const { c, g, w, h } = overlay(host, "tfx");
    const gold = tok("--gold"), ivory = tok("--ivory"), win = tok("--win"), chip = tok("--chip");
    const P = []; const n = kind === "boom" ? 46 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (kind === "boom" ? 120 : 60) + Math.random() * (kind === "boom" ? 260 : 120);
      P.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === "boom" ? 60 : 30), life: 0, max: 0.45 + Math.random() * 0.45, r: kind === "boom" ? 2 + Math.random() * 3.5 : 1.5 + Math.random() * 2,
        col: kind === "boom" ? [chip, gold, ivory][i % 3] : [win, ivory, gold][i % 3] });
    }
    let ring = 0;
    return new Promise((done) => loop((dt) => {
      ring += dt; let any = false;
      for (const p of P) { p.life += dt; if (p.life < p.max) { any = true; p.vy += 520 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; } }
      if (!any) { c.remove(); done(); return false; }
    }, () => {
      g.clearRect(0, 0, w, h);
      if (kind === "boom" && ring < 0.35) { g.globalAlpha = 1 - ring / 0.35; g.strokeStyle = gold; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 10 + ring * 260, 0, Math.PI * 2); g.stroke(); }
      for (const p of P) if (p.life < p.max) { g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }));
  }

  // ── plinko: the ball falls under gravity from peg to peg along the engine's path, with a small bounce on each hit ──
  // geometry is the SVG's (viewBox 300×240): row r pegs at y = 22 + r·24, 30 apart; buckets at y 214–236
  function plinko(svg, path, { onPeg, onLand } = {}) {
    const host = svg.parentElement; const sr = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const { c, g, w, h } = overlay(host, "tcv"); const sx = sr.width / 300, sy = sr.height / 240, ox = sr.left - hr.left, oy = sr.top - hr.top;
    const X = (x) => ox + x * sx, Y = (y) => oy + y * sy;
    // contact points: the top of the peg the ball strikes in each row, then the bucket
    const pts = [[150, -6]]; let x = 150;
    path.forEach((b, r) => { pts.push([x, 22 + r * 24 - 6]); x += b ? 15 : -15; }); pts.push([x, 218]);
    if (reduced()) { onLand && onLand(); return Promise.resolve(); }
    const G = 2300; // units/s² in SVG space
    const segs = pts.slice(1).map((p, i) => { const a = pts[i]; const T = i === 0 ? 0.2 : i === pts.length - 2 ? 0.2 : 0.16; const dy = p[1] - a[1]; return { a, b: p, T, v0: (dy - 0.5 * G * T * T) / T }; });
    const gold = tok("--gold"), ivory = tok("--ivory");
    let i = 0, t = 0, flash = [], trail = [];
    return new Promise((done) => loop((dt) => {
      const s = segs[i]; t += dt;
      if (t >= s.T) { t -= s.T; i++; if (i < segs.length) { onPeg && onPeg(i); flash.push({ x: s.b[0], y: s.b[1] + 6, life: 0 }); } if (i >= segs.length) { onLand && onLand(); setTimeout(() => c.remove(), 450); done(); return false; } }
      flash.forEach((f) => (f.life += dt)); flash = flash.filter((f) => f.life < 0.25);
    }, () => {
      const s = segs[Math.min(i, segs.length - 1)]; const k = Math.min(1, t / s.T);
      const bx = s.a[0] + (s.b[0] - s.a[0]) * k, by = s.a[1] + s.v0 * t + 0.5 * G * t * t;
      trail.push([X(bx), Y(by)]); if (trail.length > 7) trail.shift();
      g.clearRect(0, 0, w, h);
      for (const f of flash) { g.globalAlpha = 1 - f.life / 0.25; g.fillStyle = gold; g.beginPath(); g.arc(X(f.x), Y(f.y), 3.2 * sx + f.life * 26, 0, Math.PI * 2); g.fill(); }
      trail.forEach((p, j) => { g.globalAlpha = (j / trail.length) * 0.25; g.fillStyle = gold; g.beginPath(); g.arc(p[0], p[1], 6 * sx * (j / trail.length), 0, Math.PI * 2); g.fill(); });
      g.globalAlpha = 1; const r = 6.5 * sx; const px = X(bx), py = Y(by);
      const grd = g.createRadialGradient(px - r * 0.4, py - r * 0.5, r * 0.1, px, py, r); grd.addColorStop(0, ivory); grd.addColorStop(0.35, gold); grd.addColorStop(1, "rgba(90,58,0,1)");
      g.fillStyle = grd; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }));
  }

  // ── crash: the curve, the area under it, drifting stars; the app supplies the numbers each frame ──
  function crash(cv, { pts, crashed, t }) {
    const host = cv.parentElement; const r = host.getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * d) || cv.height !== Math.round(r.height * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
    const g = cv.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height; const X = (x) => (x / 300) * W, Y = (y) => (y / 170) * H;
    g.clearRect(0, 0, W, H);
    // stars drift down as the rocket climbs (parallax), seeded so they don't jump
    g.fillStyle = "rgba(255,248,236,.5)";
    for (let i = 0; i < 26; i++) { const sx = ((i * 97) % 300) / 300 * W, sy = ((((i * 53) % 170) / 170 * H) + (t || 0) * (10 + (i % 3) * 8)) % H; g.globalAlpha = 0.25 + (i % 4) * 0.12; g.fillRect(sx, sy, i % 5 ? 1.2 : 2, i % 5 ? 1.2 : 2); }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,248,236,.06)"; g.lineWidth = 1; for (let i = 1; i <= 3; i++) { g.beginPath(); g.moveTo(0, Y(i * 42)); g.lineTo(W, Y(i * 42)); g.stroke(); }
    if (!pts || pts.length < 2) return;
    const col = crashed ? tok("--chip") : tok("--gold");
    const area = g.createLinearGradient(0, 0, 0, H); area.addColorStop(0, crashed ? "rgba(198,47,59,.35)" : "rgba(232,184,74,.42)"); area.addColorStop(1, "rgba(232,184,74,0)");
    g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1])); pts.forEach((p) => g.lineTo(X(p[0]), Y(p[1]))); g.lineTo(X(pts[pts.length - 1][0]), H); g.lineTo(X(pts[0][0]), H); g.closePath(); g.fillStyle = area; g.fill();
    g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1])); pts.forEach((p) => g.lineTo(X(p[0]), Y(p[1]))); g.strokeStyle = col; g.lineWidth = 4; g.lineCap = "round"; g.lineJoin = "round";
    g.shadowColor = col; g.shadowBlur = crashed ? 0 : 12; g.stroke(); g.shadowBlur = 0;
  }

  window.TABLE = { loop, overlay, burst, plinko, crash, STEP };
})();
