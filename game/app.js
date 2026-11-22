window.addEventListener("DOMContentLoaded",function(){ /* THE GROUP GAMES — UI, networking (PeerJS), sound. Engine lives in engine.js (window.TGG). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
  const mx = (m) => `<span class="mx">${m}×</span>`;
  const sgn = (n) => (n > 0 ? "+" : "") + fmt(n);
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const CH = TGG.CHARS;
  const AVATARS = ["🦁", "🐺", "🦊", "🐯", "🐸", "🐵", "🦄", "🐲", "👽", "🤖", "🤠", "🧛", "🥷", "👑", "🍕", "🔥"];
  const MODES = {
    WHO_WAS_IT: ["WHO WAS IT?", "מי כתב את זה?"], LOVE_DETECTIVE: ["LOVE DETECTIVE", "בלש האהבה"], GUESS_THE_TIMELINE: ["GUESS THE TIMELINE", "ציר הזמן"],
    WHO_KNOWS_WHO: ["WHO KNOWS WHO?", "מי מכיר את מי"], THE_OUTSIDER: ["THE OUTSIDER", "הדמויות מבחוץ"], NUMBERS_GAME: ["THE NUMBERS GAME", "משחק המספרים"],
    EMOTIONAL_RADAR: ["EMOTIONAL RADAR", "מכ״ם רגשי"], CONTRADICTION_DETECTOR: ["CONTRADICTION DETECTOR", "גלאי סתירות"], THE_LOST_TRIP: ["THE LOST TRIP", "הטיול שלא היה"],
    COMPLETE_THE_STORY: ["COMPLETE THE STORY", "השלימו את הסיפור"], THE_GROUP_COURT: ["THE GROUP COURT", "בית המשפט של הסלט"], FINAL_BOSS: ["FINAL BOSS", "הבוס האחרון"],
    WHO_IS_MORE_LIKELY: ["WHO IS MORE LIKELY?", "מי הכי סביר"], RANK_THEM: ["RANK THEM", "דרגו אותם"], CLOSEST_GUESS: ["CLOSEST GUESS", "הניחוש הקרוב"],
    WHO_SAID_WHAT: ["WHO SAID WHAT?", "מי אמר מה"], TWO_TRUTHS_AND_A_LIE: ["TWO TRUTHS & A LIE", "שתי אמיתות ושקר"], MEMORY_TRAP: ["MEMORY TRAP", "מלכודת זיכרון"],
  };
  // icons live in icons.js (one stroke set + filled glyphs); window.TGG_ICONS
  const ICP = window.TGG_ICONS.stroke; const ic = window.TGG_ICONS.ic; const gi = window.TGG_ICONS.gi;
  const CONF = { low: "לא בטוח", mid: "די בטוח", high: "בטוח לגמרי" };
  const EVENTS = { HIGH_ROLLER: "HIGH ROLLER", HOT_STREAK: "HOT STREAK", UNDERDOG: "UNDERDOG", BOUNTY: "BOUNTY", BANKRUPTCY: "BANKRUPTCY", COMEBACK: "COMEBACK" };

  // ───────── app state ─────────
  const token = LS.get("tgg_token", null) || (() => { const t = rid(); LS.set("tgg_token", t); return t; })();
  const prefs = Object.assign({ sound: true, music: true, vol: 0.7, reduce: false }, LS.get("tgg_prefs", {}));
  const A = { screen: "home", role: null, room: null, view: null, lobby: null, tab: "game", offset: 0, conn: "ok", ui: {}, lastPhaseKey: null, err: null, length: "medium" };
  const HOST = { state: null, peer: null, conns: new Map(), loop: null, bank: null };

  // ───────── question bank (encoded so it is not readable at a glance) ─────────
  function rawBank() {
    if (HOST.bank) return HOST.bank;
    const raw = atob(document.getElementById("qbank").textContent.trim());
    const key = "salat-2026"; const b = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    HOST.bank = JSON.parse(new TextDecoder().decode(b)).questions;
    return HOST.bank;
  }
  // editor changes (saved on this device) are applied to every game this device hosts
  const EDITS_KEY = "tgg_edits";
  function getEdits() { return Object.assign({ status: {}, notes: {}, over: {} }, LS.get(EDITS_KEY, {})); }
  function applyEdit(q, o) {
    if (!o) return q;
    const c = JSON.parse(JSON.stringify(q));
    if (o.prompt != null) c.prompt = o.prompt;
    if (o.explanation != null) c.explanation = o.explanation;
    if (o.options && c.options) c.options = c.options.map((x) => (o.options[x.id] != null ? { ...x, text: o.options[x.id] } : x));
    if (o.correct != null) { c.correct_answer = o.correct; if (c.numeric) c.numeric = { ...c.numeric, answer: o.correct }; }
    if (o.difficulty) { c.difficulty = o.difficulty; c.score_value = { EASY: 100, MEDIUM: 150, HARD: 200, INSANE: 300 }[o.difficulty]; }
    c._edited = true; return c;
  }
  // the archive has two WhatsApp groups; players know them by name, not by the research labels A / B
  const GROUP_NAMES = [[/חברי קבוצה A/g, "חברי קבוצת סלט"], [/בקבוצה B/g, "בקבוצה הישנה"], [/קבוצה A/g, "קבוצת סלט"], [/קבוצה B/g, "הקבוצה הישנה"], [/ב-A(?![A-Za-z])/g, "בקבוצת סלט"], [/ב-B(?![A-Za-z])/g, "בקבוצה הישנה"]];
  const plainGroups = (t) => (typeof t === "string" ? GROUP_NAMES.reduce((x, [re, to]) => x.replace(re, to), t) : t);
  function plainQ(q) {
    const o = { ...q, prompt: plainGroups(q.prompt), explanation: plainGroups(q.explanation), instructions: plainGroups(q.instructions) };
    if (Array.isArray(q.options)) o.options = q.options.map((x) => (x && typeof x === "object" ? { ...x, text: plainGroups(x.text) } : x));
    return o;
  }
  // inside stories that questions mention by name: a short "what is this?" that does not give the answer away
  const TERMS = {
    "המסיבה האחרת": "פולצ׳ק לא קיבל אישור כניסה למסיבה שהחבר׳ה הלכו אליה. הוא נעלב והודיע בקבוצה שהוא הולך “למסיבה אחרת עם ריקי”. כמה דקות אחר כך דוד גילה שזו בדיוק אותה מסיבה.",
    "קבוצת סלט": "הקבוצה של היום. היא קיימת מ-2022, אבל התעוררה רק באוקטובר 2024, כשיוני הצטרף, ומאז היא הבית של החבורה.",
    "הקבוצה הישנה": "הקבוצה שבה החבורה דיברה מינואר 2023 עד אוקטובר 2024, עם חבר חמישי: חמיאל (אלעזר). יוני לא היה בה.",
    "שתי הקבוצות": "בארכיון יש שתי קבוצות ווטסאפ: הקבוצה הישנה (2023–2024, עם חמיאל ובלי יוני) וקבוצת סלט (מאוקטובר 2024, עם יוני). “בשתי הקבוצות” = סך הכל בשתיהן.",
  };
  function termsIn(q) { const t = [q.prompt, q.instructions, ...(Array.isArray(q.options) ? q.options.map((o) => (o && o.text) || "") : [])].join(" "); return Object.keys(TERMS).filter((k) => t.includes(k)); }
  function loadBank(includeRemoved) {
    const E = getEdits();
    return rawBank().filter((q) => includeRemoved || (E.status[q.id] !== "out" && !q.removed)).map((q) => plainQ(applyEdit(q, E.over[q.id])));
  }

  // ───────── sound (Web Audio, generated, no files) ─────────
  // ───────── SOUND: layered Web Audio synthesis (no files), routed through a casino-room reverb ─────────
  // iPhone: Web Audio goes quiet when the ring/silent switch is on silent. Asking for the "playback" audio session
  // (Safari 16.4+), plus one silent <audio> element started from a tap for older versions, makes the game sound like a video does.
  let iosAudioDone = false;
  function iosAudio() {
    if (iosAudioDone) return; iosAudioDone = true;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    try {
      const a = document.createElement("audio"); a.setAttribute("playsinline", ""); a.setAttribute("x-webkit-airplay", "deny"); a.loop = true; a.volume = 0.01; a.preload = "auto";
      a.src = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=="; // 0.1 s of silence
      const p = a.play(); if (p && p.catch) p.catch(() => { iosAudioDone = false; });
    } catch (e) { iosAudioDone = false; }
  }
  window.TGG_IOS_AUDIO = iosAudio;
  const SND = {
    ctx: null, out: null, wet: null, nbuf: null, musicTimer: null, rocket: null,
    init() {
      iosAudio();
      // iPhone leaves the context "interrupted" (not only "suspended") after a call, a lock or a trip to another app: wake it on any tap
      if (this.ctx) { if (this.ctx.state !== "running" && this.ctx.resume) this.ctx.resume().catch(() => {}); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      const c = this.ctx;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -9; comp.ratio.value = 12; comp.knee.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
      this.master = c.createGain(); this.master.gain.value = 2.4; this.master.connect(comp).connect(c.destination);
      this.out = c.createGain(); this.out.connect(this.master);
      // small, bright room: decaying stereo noise impulse
      const len = Math.floor(c.sampleRate * 1.3), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 80 ? i / 80 : 1); }
      const conv = c.createConvolver(); conv.buffer = ir; this.wet = c.createGain(); this.wet.gain.value = 0.22; this.wet.connect(conv).connect(this.master);
      const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.nbuf = nb;
      this.shaper = c.createWaveShaper(); const k = 30, n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; cv[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x)); } this.shaper.curve = cv;
    },
    ok() { return this.ctx && prefs.sound; },
    // one enveloped voice; returns the gain node so callers can chain
    env(g, t, a, d, v, sustain = 0) { const p = g.gain; p.cancelScheduledValues(t); p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(Math.max(0.0002, v * prefs.vol), t + a); p.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d); },
    send(node, wet = 0.25) { node.connect(this.out); if (wet) { const s = this.ctx.createGain(); s.gain.value = wet; node.connect(s).connect(this.wet); } },
    osc(f, d, { type = "sine", v = 0.2, a = 0.004, when = 0, slide, wet = 0.2, detune = 0, pan = 0 } = {}) {
      const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      this.env(g, t, a, d, v); let n = o.connect(g); if (pan && c.createStereoPanner) { const P = c.createStereoPanner(); P.pan.value = pan; n = n.connect(P); }
      this.send(n, wet); o.start(t); o.stop(t + a + d + 0.05);
    },
    noise(d, { v = 0.2, when = 0, type = "bandpass", f = 2000, q = 1, a = 0.002, wet = 0.2, fTo, pan = 0 } = {}) {
      const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(); s.buffer = this.nbuf;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + d);
      const g = c.createGain(); this.env(g, t, a, d, v); let n = s.connect(fl).connect(g);
      if (pan && c.createStereoPanner) { const P = c.createStereoPanner(); P.pan.value = pan; n = n.connect(P); }
      this.send(n, wet); s.start(t, Math.random() * 1.5, a + d + 0.05);
    },
    // FM bell: bright casino "ding"
    bell(f, d = 0.9, v = 0.16, when = 0, ratio = 3.5, idx = 2.2) {
      const c = this.ctx, t = c.currentTime + when, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f * ratio; mg.gain.setValueAtTime(f * idx, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + d);
      mod.connect(mg).connect(car.frequency); this.env(g, t, 0.003, d, v); this.send(car.connect(g), 0.35);
      car.start(t); mod.start(t); car.stop(t + d + 0.1); mod.stop(t + d + 0.1);
    },
    // a metal coin: inharmonic partials + contact click
    coin(when = 0, v = 0.12) {
      const f = 2600 + Math.random() * 1400, pan = Math.random() * 1.2 - 0.6;
      [1, 2.32, 4.25].forEach((r, i) => this.osc(f * r * 0.5, 0.18 + Math.random() * 0.25 - i * 0.05, { type: "sine", v: v / (1 + i * 1.4), a: 0.001, when, wet: 0.3, pan }));
      this.noise(0.012, { v: v * 0.8, when, type: "highpass", f: 5000, wet: 0.1, pan });
    },
    // clay poker chip on felt/table
    chip(when = 0, v = 0.22) {
      const pan = Math.random() * 0.6 - 0.3, f = 2200 + Math.random() * 900;
      this.noise(0.03, { v, when, f, q: 3.5, wet: 0.15, pan }); this.noise(0.02, { v: v * 0.7, when: when + 0.012, f: f * 1.35, q: 5, wet: 0.15, pan });
      this.osc(f * 0.62, 0.035, { type: "triangle", v: v * 0.25, when, wet: 0.1, pan });
    },
    thump(when = 0, v = 0.3, f = 110) { this.osc(f, 0.18, { v, when, slide: f * 0.45, wet: 0.08 }); this.noise(0.03, { v: v * 0.5, when, type: "lowpass", f: 900, wet: 0.05 }); },
    click(when = 0, v = 0.12, f = 2400) { this.noise(0.008, { v, when, type: "highpass", f: 3500, wet: 0.08 }); this.osc(f, 0.018, { type: "triangle", v: v * 0.6, when, wet: 0.05 }); },
    card(when = 0, v = 0.2) { this.noise(0.09, { v, when, type: "bandpass", f: 1400, fTo: 4200, q: 0.8, a: 0.01, wet: 0.12 }); this.noise(0.012, { v: v * 0.9, when: when + 0.085, type: "highpass", f: 2500, wet: 0.1 }); },
    die(when = 0, v = 0.2) { const f = 700 + Math.random() * 900; this.noise(0.025, { v, when, f, q: 4, wet: 0.2 }); this.osc(f * 0.35, 0.03, { type: "sine", v: v * 0.5, when, wet: 0.1 }); },
    boom(v = 0.5) {
      const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.nbuf;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
      const g = c.createGain(); this.env(g, t, 0.004, 1.5, v); this.send(s.connect(lp).connect(this.shaper).connect(g), 0.3); s.start(t, 0, 1.6);
      this.osc(90, 0.9, { v: v * 0.9, slide: 28, a: 0.005, wet: 0.1 }); this.osc(55, 1.2, { v: v * 0.6, slide: 20, wet: 0 });
      for (let i = 0; i < 7; i++) this.noise(0.05, { v: v * 0.25, when: 0.08 + Math.random() * 0.6, type: "bandpass", f: 900 + Math.random() * 2500, q: 2, wet: 0.4 });
    },
    // continuous rocket engine, pitch follows the multiplier
    rocketStart() {
      if (!this.ok() || this.rocket) return; const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.nbuf; s.loop = true; const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400; lp.Q.value = 3;
      const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 60; const og = c.createGain(); og.gain.value = 0.25; const ol = c.createBiquadFilter(); ol.type = "lowpass"; ol.frequency.value = 500;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * prefs.vol, t + 0.4);
      s.connect(lp).connect(g); o.connect(ol).connect(og).connect(g); this.send(g, 0.15); s.start(); o.start();
      this.rocket = { s, o, lp, ol, g };
    },
    rocketSet(m) { const r = this.rocket; if (!r) return; const t = this.ctx.currentTime, k = Math.min(1, Math.log(m) / Math.log(20));
      r.lp.frequency.setTargetAtTime(400 + k * 2600, t, 0.1); r.ol.frequency.setTargetAtTime(500 + k * 1500, t, 0.1); r.o.frequency.setTargetAtTime(60 + k * 160, t, 0.1); r.g.gain.setTargetAtTime((0.12 + k * 0.1) * prefs.vol, t, 0.2); },
    rocketStop(fade = 0.15) { const r = this.rocket; if (!r) return; this.rocket = null; const t = this.ctx.currentTime; r.g.gain.cancelScheduledValues(t); r.g.gain.setTargetAtTime(0.0001, t, fade); setTimeout(() => { try { r.s.stop(); r.o.stop(); } catch (e) {} }, fade * 6000); },
    play(name) {
      this.init(); if (!this.ok()) return;
      const O = this.osc.bind(this), N = this.noise.bind(this), B = this.bell.bind(this);
      switch (name) {
        case "tap": O(1250, 0.03, { type: "sine", v: 0.16, wet: 0.05 }); N(0.006, { v: 0.1, type: "highpass", f: 4000, wet: 0 }); break;
        case "select": this.click(0, 0.1, 1800); O(990, 0.06, { type: "triangle", v: 0.07, when: 0.01, wet: 0.1 }); break;
        case "chip": this.chip(0); this.chip(0.07, 0.16); break;
        case "lock": for (let i = 0; i < 4; i++) this.chip(i * 0.045, 0.2 - i * 0.03); this.thump(0.2, 0.18, 140); break;
        case "tick": this.click(0, 0.11, 2200); break;
        case "tickLow": this.click(0, 0.16, 1500); O(700, 0.05, { type: "square", v: 0.04, wet: 0 }); break;
        case "peg": O(1600 + Math.random() * 800, 0.06, { type: "triangle", v: 0.15, wet: 0.2, pan: Math.random() - 0.5 }); this.click(0, 0.05, 3000); break;
        case "whoosh": N(0.45, { v: 0.16, type: "bandpass", f: 300, fTo: 3000, q: 0.7, a: 0.12, wet: 0.25 }); break;
        case "card": this.card(0); break;
        case "flip": this.card(0, 0.16); O(520, 0.05, { type: "triangle", v: 0.05, when: 0.08 }); break;
        case "dice": for (let i = 0, t = 0; i < 9; i++) { this.die(t, 0.22 - i * 0.018); t += 0.04 + i * 0.022 + Math.random() * 0.02; } break;
        case "gem": B(1760, 0.6, 0.11, 0, 2.01, 1.2); B(2637, 0.5, 0.07, 0.04, 2.01, 1); N(0.2, { v: 0.04, type: "highpass", f: 7000, a: 0.02, wet: 0.5 }); break;
        case "reveal": this.thump(0, 0.22, 90); [196, 247, 294, 392].forEach((f, i) => O(f, 0.5, { type: "sawtooth", v: 0.05, a: 0.03, when: i * 0.09, wet: 0.35, detune: (i % 2 ? 7 : -7) })); break;
        case "correct": B(1047, 0.7, 0.15); B(1568, 0.9, 0.14, 0.11); this.coin(0.18, 0.07); break;
        case "wrong": [0, 0.22].forEach((w, i) => { O(i ? 147 : 175, 0.32, { type: "square", v: 0.07, a: 0.01, when: w, wet: 0.15 }); O(i ? 149 : 177, 0.32, { type: "sawtooth", v: 0.05, when: w, wet: 0.1 }); }); break;
        case "quote": B(1319, 0.5, 0.08, 0, 1.5, 0.8); B(1760, 0.6, 0.07, 0.1, 1.5, 0.8); break;
        case "coins": for (let i = 0; i < 14; i++) this.coin(i * 0.035 + Math.random() * 0.03, 0.1 - i * 0.004); B(2093, 0.5, 0.05, 0.02, 3.5, 1); break;
        case "cashout": for (let i = 0; i < 3; i++) this.chip(i * 0.04, 0.16); [1047, 1319, 1568].forEach((f, i) => B(f, 0.6, 0.1, 0.08 + i * 0.07)); for (let i = 0; i < 8; i++) this.coin(0.2 + i * 0.04, 0.07); break;
        case "spin": { // wheel pegs: fast clicks slowing down (matches the 4s wheel)
          let t = 0; for (let i = 0; i < 46; i++) { this.click(t, 0.09, 2000 + (i % 2) * 300); t += 0.025 + Math.pow(i / 46, 2.4) * 0.32; if (t > 4.1) break; }
          N(3.6, { v: 0.05, type: "lowpass", f: 600, fTo: 150, a: 0.2, wet: 0.1 }); break;
        }
        case "reels": N(1.6, { v: 0.07, type: "bandpass", f: 900, q: 0.8, a: 0.1, wet: 0.1 }); for (let i = 0; i < 22; i++) this.click(i * 0.065, 0.05, 1500); break;
        case "reelStop": this.thump(0, 0.28, 95); this.click(0, 0.12, 1200); break;
        case "jackpot": [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => B(f, 1.1, 0.12, i * 0.09)); for (let i = 0; i < 30; i++) this.coin(0.3 + i * 0.045 + Math.random() * 0.04, 0.09);
          O(392, 1.6, { type: "sawtooth", v: 0.05, a: 0.05, when: 0.6, slide: 784, wet: 0.4 }); break;
        case "boom": this.boom(0.55); break;
        case "bankrupt": [392, 370, 349, 262].forEach((f, i) => O(f, i === 3 ? 0.9 : 0.3, { type: "sawtooth", v: 0.07, a: 0.02, when: i * 0.3, wet: 0.3, slide: i === 3 ? 230 : undefined })); this.thump(1.0, 0.15, 70); break;
        case "allin": this.thump(0, 0.35, 70); N(0.6, { v: 0.12, type: "bandpass", f: 200, fTo: 2400, q: 0.8, a: 0.4, wet: 0.3 }); for (let i = 0; i < 8; i++) this.chip(0.35 + i * 0.035, 0.16); break;
        case "fanfare": [[523, 0], [659, 0.13], [784, 0.26], [1047, 0.42], [784, 0.62], [1047, 0.75]].forEach(([f, w]) => { B(f, 0.7, 0.12, w, 1, 1.4); O(f / 2, 0.3, { type: "square", v: 0.03, when: w, wet: 0.3 }); }); this.play("coins"); break;
        case "phase": B(880, 0.4, 0.07, 0, 2, 0.8); B(1318, 0.5, 0.06, 0.08, 2, 0.8); break;
        case "tension": [0, 0.55].forEach((w) => { this.thump(w, 0.22, 60); this.thump(w + 0.16, 0.15, 55); }); N(1.4, { v: 0.05, type: "lowpass", f: 150, fTo: 700, a: 0.5, wet: 0.2 }); break;
      }
    },
    // lounge loop: swung Rhodes-like chords, walking bass, brushed hat (lobby & summaries only)
    music(on) {
      this.init(); if (!this.ctx) return;
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      if (!on || !prefs.music || !prefs.sound) return;
      const prog = [[146.8, 174.6, 220, 261.6], [98, 123.5, 174.6, 220], [130.8, 164.8, 196, 246.9], [110, 130.8, 164.8, 196]];
      const bass = [[73.4, 87.3, 110, 98], [49, 61.7, 73.4, 82.4], [65.4, 82.4, 98, 110], [55, 65.4, 82.4, 61.7]];
      let beat = 0; const spb = 0.62;
      const tickFn = () => {
        if (!this.ok()) return; const bar = Math.floor(beat / 4) % 4, b = beat % 4;
        if (b === 0 || b === 2.5) prog[bar].forEach((f, i) => this.bell(f * 2, 1.6, 0.022, i * 0.012, 1, 0.6));
        if (b === 1) prog[bar].forEach((f) => this.bell(f * 2, 0.5, 0.012, spb * 0.66, 1, 0.5));
        this.osc(bass[bar][b], spb * 0.9, { type: "sine", v: 0.06, a: 0.01, wet: 0.05 }); this.osc(bass[bar][b] * 2, 0.12, { type: "triangle", v: 0.012, wet: 0 });
        this.noise(0.07, { v: 0.018, type: "highpass", f: 7000, a: 0.01, wet: 0.2 }); this.noise(0.04, { v: 0.012, when: spb * 0.66, type: "highpass", f: 8000, wet: 0.2 });
        beat++;
      };
      tickFn(); this.musicTimer = setInterval(tickFn, spb * 1000);
    },
  };
  // iPhone only unlocks audio on a finished tap (touchend / click), not on the touch's start — listen to all three
  ["pointerdown", "touchend", "click"].forEach((ev) => document.addEventListener(ev, () => SND.init(), { passive: true }));

  // ───────── helpers for rendering ─────────
  function playerById(v, id) { return v && v.players.find((p) => p.id === id); }
  // the four friends' portraits (cut out, embedded at build time)
  const AVIMG = window.TGG_AV || {};
  const faceImg = (id, cls = "") => (AVIMG[id] ? `<img class="avimg ${cls}" src="${AVIMG[id].face}" alt="" draggable="false">` : "");
  function avatar(p, size = "", extra = "") {
    if (!p) return `<span class="av ${size}">?</span>`;
    const st = p.connected === false ? `<i class="st" style="background:var(--red)"></i>` : "";
    const pic = AVIMG[p.id] ? faceImg(p.id) : esc(p.avatar || "?");
    return `<span class="av ${size} ${AVIMG[p.id] ? "hasimg" : ""} ${p.connected === false ? "off" : ""}" style="--c:${p.color}" ${extra}>${pic}${st}</span>`;
  }
  function modeHead(q, r) {
    const m = MODES[q.mode] || [q.mode, ""];
    return `<div class="qhead"><span class="mode en">${m[0]}</span><span class="diff d-${q.difficulty}">${q.difficulty}</span>
      <span class="badge">פרק ${q.chapter} · ${esc(q.chapter_name)}</span>${r ? `<span class="badge">${r.n}/${r.total}</span>` : ""}
      ${q.interpretive ? `<span class="badge pink">פרשנות</span>` : ""}${r && r.isFinal ? `<span class="badge gold">FINAL JACKPOT</span>` : ""}</div>`;
  }
  function optText(q, id) { const o = (q.options || []).find((x) => x.id === id); return o ? o.text : id; }
  function targetName(q, id) { const o = (q.match_targets || []).find((x) => x.id === id) || (q.options || []).find((x) => x.id === id); return o ? o.text : (CH[id] ? CH[id].name : id); }
  function fmtAnswer(q, v) {
    if (v == null) return "<span class='muted'>לא ענה</span>";
    const t = q.answer_type;
    if (t === "choice" || t === "vote") return esc(optText(q, v));
    if (t === "number") return `<span class="money">${fmt(v)}</span>`;
    if (t === "ranking" || t === "order") return v.map((x, i) => `${i + 1}. ${esc(optText(q, x))}`).join(" · ");
    if (t === "matching") return Object.entries(v).map(([k, w]) => `${esc(optText(q, k))} ← ${esc(targetName(q, w))}`).join("<br>");
    return esc(JSON.stringify(v));
  }
  function now() { return Date.now() + (A.role === "guest" ? A.offset : 0); }
  function remaining(v) {
    if (!v) return null; if (v.paused) return v.pausedRemaining;
    return v.phaseEndsAt ? Math.max(0, v.phaseEndsAt - now()) : null;
  }
  function toast(msg, ms = 2200) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
  function modal(html, onMount, bindActions) {
    const m = document.createElement("div"); m.className = "modal"; m.innerHTML = `<div class="box">${html}</div>`;
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) m.remove(); });
    document.body.appendChild(m);
    if (bindActions) m.querySelectorAll("[data-a]").forEach((el) => el.addEventListener("click", onClick));
    if (onMount) onMount(m); return m;
  }
  const closeModals = () => document.querySelectorAll(".modal").forEach((m) => m.remove());

  // ───────── editor password (stored only as a hash) ─────────
  const PIN_HASH = 3349484705224010;
  function cyrb53(str, seed = 0) { let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed; for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909); return 4294967296 * (2097151 & h2) + (h1 >>> 0); }
  function edOK() { if (A.edUnlocked) return true; try { return sessionStorage.getItem("tgg_ed_ok") === "1"; } catch (e) { return false; } }
  function editorGate(cb) {
    if (edOK()) return cb();
    modal(`<h2>🔒 כלי עורך</h2><p class="small muted">הכנס את סיסמת העורך</p><input id="pinIn" class="numin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"><p id="pinErr" class="small neg" style="min-height:20px"></p><div class="col"><button class="btn pri" id="pinGo">כניסה</button><button class="btn ghost" data-close>ביטול</button></div>`, (m) => {
      const go = () => { if (cyrb53("tgg-salat:" + $("#pinIn", m).value) === PIN_HASH) { A.edUnlocked = true; try { sessionStorage.setItem("tgg_ed_ok", "1"); } catch (e) {} m.remove(); SND.play("correct"); cb(); } else { $("#pinErr", m).textContent = "סיסמה שגויה"; $("#pinIn", m).value = ""; SND.play("wrong"); } };
      $("#pinGo", m).onclick = go; $("#pinIn", m).addEventListener("keydown", (e) => { if (e.key === "Enter") go(); }); setTimeout(() => $("#pinIn", m).focus(), 60);
    });
  }
  function editorHub() { openDev(); }

  function confirmBox(text, okLabel, onOk, danger) {
    modal(`<h2>${esc(text)}</h2><div class="col" style="margin-top:14px"><button class="btn ${danger ? "red" : "pri"}" id="cOk">${esc(okLabel)}</button><button class="btn ghost" data-close>ביטול</button></div>`,
      (m) => { $("#cOk", m).onclick = () => { m.remove(); onOk(); }; });
  }
  function confetti() {
    if (prefs.reduce) return; const c = document.createElement("canvas"); c.className = "confetti"; document.body.appendChild(c);
    const W = (c.width = innerWidth), H = (c.height = innerHeight), x = c.getContext("2d");
    const cols = ["#c62f3b", "#e8b84a", "#e8b84a", "#8fe0a6", "#c62f3b"];
    const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H, r: 4 + Math.random() * 6, vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3, c: cols[(Math.random() * 5) | 0], a: Math.random() * 6 }));
    let f = 0; (function step() { x.clearRect(0, 0, W, H); for (const p of ps) { p.y += p.vy; p.x += p.vx; p.a += 0.1; x.fillStyle = p.c; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); x.restore(); } if (++f < 220) requestAnimationFrame(step); else c.remove(); })();
  }
  function chart(players, key = "coins") {
    const W = 340, H = 170, pad = 26; let maxI = 1, maxV = 1, minV = Infinity;
    for (const p of players) for (const h of p.history) { maxI = Math.max(maxI, h.i); maxV = Math.max(maxV, h[key]); minV = Math.min(minV, h[key]); }
    if (minV === Infinity) minV = 0; if (maxV === minV) maxV = minV + 1;
    const X = (i) => pad + (i / maxI) * (W - pad * 2), Y = (v) => H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);
    const lines = players.map((p) => `<polyline fill="none" stroke="${p.color}" stroke-width="2.5" stroke-linejoin="round" points="${p.history.map((h) => `${X(h.i).toFixed(1)},${Y(h[key]).toFixed(1)}`).join(" ")}"/>`).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" direction="ltr"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#164532"/><text x="${pad}" y="14" fill="#c9d6c3" font-size="10">${fmt(maxV)}</text><text x="${pad}" y="${H - 8}" fill="#c9d6c3" font-size="10">${fmt(minV)}</text>${lines}</svg>
      <div class="row wrap small" style="justify-content:center">${players.map((p) => `<span class="row" style="gap:4px"><i style="width:12px;height:3px;background:${p.color};display:inline-block"></i>${esc(p.name)}</span>`).join(" &nbsp; ")}</div>`;
  }

  // ───────── networking: HOST ─────────
  function hostStart(room, practice, restored) {
    A.role = practice ? "practice" : "host"; A.room = room;
    if (!restored) {
      const pt = practice && A.playtest; const bank = loadBank();
      const onlyIds = pt && A.onlyNew ? bank.filter((q) => !getEdits().status[q.id]).map((q) => q.id) : null;
      HOST.state = TGG.newState({ room, questions: bank, now: Date.now(), practice, solo: A.solo !== false, length: A.length, playtest: pt, noTimer: pt && A.noTimer, onlyIds });
      if (!pt) HOST.state.seen = A.posing ? [] : LS.get("tgg_seen", []);
    }
    HOST.test = !!practice; LS.set(practice ? "tgg_test_host" : "tgg_host", { room, practice });
    clearInterval(HOST.loop);
    HOST.loop = setInterval(hostTick, 300);
    hostChanged();
  }
  function saveHost() {
    const s = HOST.state; if (!s) return;
    const { bank, ...rest } = s; LS.set(s.practice || HOST.test ? "tgg_test_host_state" : "tgg_host_state", rest); // test games never overwrite a real one
  }
  function hostChanged() {
    const s = HOST.state; if (!s) return; const t = Date.now();
    const mine = Object.values(s.players).find((p) => p.token === token);
    A.view = mine ? TGG.view(s, mine.id, t) : null;
    saveHost(); if (A.view && A.view.phase === "game_over") recordGame(A.view); onView();
  }
  function hostTick() {
    const s = HOST.state; if (!s) return; const t = Date.now(); let ch = TGG.tick(s, t);
    if (s.playtest && applyScenario(s, t)) ch = true;
    if (ch) hostChanged();
  }
  function hostLocal(type, payload) {
    const s = HOST.state; if (!s) return null; /* no game on this phone (e.g. the guide opened from home) */ const t = Date.now(); const me = Object.values(s.players).find((p) => p.token === token);
    let r;
    if (type === "claim") r = TGG.join(s, t, { token, char: payload.char, avatar: payload.avatar, isHost: true });
    else if (type === "wheel") r = TGG.rouletteStake(s, t, me.id, payload.amount, payload.key, payload.auto);
    else if (type === "cashout") r = TGG.crashCashout(s, t, me.id, payload.key);
    else if (type === "solo") r = TGG.submitSolo(s, t, me.id, payload.value, payload.bet, payload.key, payload.think);
    else if (type === "side") r = TGG.sideAction(s, t, me.id, payload.act, payload.key);
    else if (type === "soloSkip") r = TGG.soloSkip(s, t, me.id);
    else if (type === "ready") r = TGG.setReady(s, me.id, payload.on);
    else if (type === "host") r = payload.action === "start" ? TGG.start(s, t, { allowFew: payload.allowFew }) : TGG.hostAction(s, t, payload.action);
    if (r && r.error && r.error !== "confirm3") toast(r.error);
    hostChanged(); return r;
  }

  function send(type, payload = {}) {
    const key = rid();
    if (A.free && type === "side") return freeSide(payload.act, key);
    return hostLocal(type, { ...payload, key });
  }

  // ───────── view change hooks (sounds, resets) ─────────
  function onView() {
    const v = A.view;
    { const r0 = v && v.round && v.round.roulette; if (r0 && r0.solo && r0.done && r0.done[v.me] !== undefined && r0.done[v.me] !== null && (!A.soloDoneAt || A.soloDoneAt.n !== r0.breakNo)) A.soloDoneAt = { n: r0.breakNo, t: Date.now() }; }
    const ro = v && v.round && v.round.roulette;
    if (ro && ro.kind === "crash" && ro.crash && ro.crash.cashed[v.me] && A.crashCashSeen !== v.round.n) { A.crashCashSeen = v.round.n; SND.play("cashout"); setTimeout(() => juice("medium", $("#crashMult")), 30); }
    if (ro && ro.kind === "crash" && ro.crash && A.crashStartSeen !== v.round.n) { A.crashStartSeen = v.round.n; A.crashLastWhole = 1; SND.play("whoosh"); }
    if (v) {
      const key = v.phase + ":" + (v.round ? v.round.n : "") + ":" + (v.round && v.round.roulette && v.round.roulette.results ? "spun" : "") + ":" + (v.summary ? v.summary.ch : "");
      if (key !== A.lastPhaseKey) {
        const prev = A.lastPhaseKey; A.lastPhaseKey = key; if (prev !== null && A.screen === "game") closeKeypad();
        if (prev !== null) phaseSound(v);
        if (["betting", "chapter_summary", "game_over", "roulette"].includes(v.phase)) window.scrollTo(0, 0);
        /* game over: confetti comes from the final screen's overtake sequence (once a game) */
        SND.music(v.phase === "lobby" || v.phase === "chapter_summary");
      }
      if (A.screen === "game" && !v.playtest && !A.guide && !$(".gdwrap") && v.phase !== "game_over" && !LS.get("tgg_guide_seen", false) && (v.players.some((p) => p.id === v.me))) { setTimeout(() => { if (!$(".gdwrap") && !LS.get("tgg_guide_seen", false)) openGuide(true); }, 300); }
      if (A.screen === "demo" && A.demo && A.demo.ret === "game" && v.phase !== "lobby") { A.screen = "game"; toast("המשחק התחיל"); }
      if (v.round && A.ui.n !== v.round.n) A.ui = { n: v.round.n, sub: "q", btab: "own", bet: { conf: "mid", own: 0, friendTarget: null, friendOutcome: "right", friendAmt: 0, ouSide: null, ouAmt: 0 }, ans: { sel: null, num: "", order: [], match: {} }, wheel: 0 };
    }
    render();
  }
  function phaseSound(v) {
    const meRes = v.round && v.round.results ? v.round.results[v.me] : null;
    if (v.phase === "betting") SND.play("whoosh");
    else if (v.phase === "answering") SND.play("phase");
    else if (v.phase === "reveal") {
      SND.play("reveal");
      if (v.solo && v.round.q.answer_type === "number" && v.round.q.nscale) return; // the number-line reveal plays its own ending
      setTimeout(() => { if (meRes) SND.play(meRes.win ? "correct" : "wrong"); if (v.round.q.original_quote) setTimeout(() => SND.play("quote"), 500); if (meRes && meRes.coins > 0) setTimeout(() => SND.play("coins"), 700); if (meRes && meRes.events.includes("BANKRUPTCY")) setTimeout(() => SND.play("bankrupt"), 900);
        if (meRes && !v.solo) revealJuice(v, meRes); }, v.solo ? 1100 : 650);
    } else if (v.phase === "roulette") {
      const rr = v.round.roulette && v.round.roulette.results; const slots = v.round.roulette && v.round.roulette.kind === "slots";
      if (v.round.roulette && v.round.roulette.kind === "crash") {
        if (rr) { SND.rocketStop(0.05); SND.play("boom"); addTrauma(0.6); vib([80, 40, 160]); const mine = rr[v.me]; if (mine && mine.delta > 0) setTimeout(() => juice(mine.mult >= 5 ? "big" : "medium", $("#crashMult"), mine.mult >= 5 ? `${mine.mult}×!` : undefined), 300); }
        else SND.play("tension");
        return;
      }
      if (rr) { SND.play(slots ? "reels" : "spin"); const mine = rr[v.me]; const at = slots ? (mine && mine.reels && mine.reels[0] === mine.reels[1] ? 3300 : 2500) : 4100;
        if (mine) setTimeout(() => { const big = ["jackpot", "friend3"].includes(mine.seg); SND.play(big ? "jackpot" : mine.delta > 0 ? "coins" : mine.delta < 0 ? "wrong" : "tap");
          if (big) juice("big", $(".slots") || $("#wheel"), mine.seg === "jackpot" ? "JACKPOT!" : "3 חברים!"); else if (mine.delta > 0) juice("medium", $(".slots") || $("#wheel")); else if (mine.delta < 0) addTrauma(0.2); }, at); }
      else SND.play("tension");
    } else if (v.phase === "chapter_summary") SND.play("fanfare");
    else if (v.phase === "game_over") SND.play("fanfare");
    if (v.phase === "chapter_summary") setTimeout(() => juice("medium", $(".stage .center")), 300);
  }
  function revealJuice(v, r) {
    const coins = (r.bets || []).reduce((a, b) => a + b.delta, 0); const ev = r.events || [];
    const origin = $(".rrow.me") || $(".opt.ok");
    if (ev.includes("BANKRUPTCY")) { banner("פשיטת רגל", "var(--loss)"); addTrauma(0.6); vib([80, 60, 160]); return; }
    if (r.win && (coins >= 2000 || ev.some((e) => ["HIGH_ROLLER", "HOT_STREAK", "BOUNTY"].includes(e)))) { juice("big", origin, ev.includes("HIGH_ROLLER") ? "HIGH ROLLER!" : ev.includes("HOT_STREAK") ? "HOT STREAK!" : ev.includes("BOUNTY") ? "BOUNTY!" : "BIG WIN!"); return; }
    if (r.win || coins > 0) { juice("medium", origin); const d = prevRanks(v)[v.me]; if (d > 0) setTimeout(() => banner(`עקפת! ▲${d}`, "var(--green)", true), 500); return; }
    addTrauma(0.22); vib(50);
  }

  // ───────── RENDER ─────────
  function render() {
    document.body.classList.toggle("reduce", !!prefs.reduce);
    const app = $("#app"); const focus = document.activeElement && document.activeElement.id; const sel = focus && document.activeElement.selectionStart;
    let body = "";
    if (A.screen === "home") body = renderHome();
    else if (A.screen === "create") body = renderPlaytestSetup();
    else if (A.screen === "free") body = renderFree();
    else if (A.screen === "editor") { A.screen = "dev"; DEV.area = "questions"; body = renderDev(); }
    else if (A.screen === "dev") body = renderDev();
    else if (A.screen === "claim" || (A.screen === "game" && !A.view)) body = renderClaim();
    else body = renderGameShell();
    app.innerHTML = body;
    bind(); if (A.inspector || $("#insp")) updateInspector();
    if (focus) { const el = document.getElementById(focus); if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch (e) {} } }
    afterRender(); sceneEnter();
  }
  function topbar(extra = "") {
    const st = A.conn === "ok" ? "" : A.conn === "connecting" ? "wait" : "off";
    const lbl = A.role === "practice" ? "תרגול" : A.conn === "ok" ? "מחובר" : A.conn === "connecting" ? "מתחבר..." : "אין חיבור";
    return `<div class="topbar"><button class="brandlogo" data-a="logoHome" aria-label="סלט · מסך הבית"></button><span class="sp"></span>${extra}
      ${A.role && A.view && A.view.playtest ? `<span class="pill"><i class="dot ${st}"></i>${A.view && A.view.playtest ? "בדיקה" : lbl}</span>` : ""}
      <button class="pill icbtn" data-a="mute" aria-label="צליל">${ic(prefs.sound ? "sound" : "mute")}</button></div>`;
  }
  // ═════ LOCAL HISTORY (this phone only): best scores, last games, free-casino wallet ═════
  const HIST_KEY = "tgg_history", FREE_KEY = "tgg_free_wallet";
  function history() { const h = LS.get(HIST_KEY, []); return Array.isArray(h) ? h : []; }
  function bestOf(h) { return h.length ? { score: Math.max(...h.map((x) => x.score || 0)), profit: Math.max(...h.map((x) => x.profit || 0)), correct: Math.max(...h.map((x) => x.correct || 0)) } : null; }
  // ═════ CLOUD LEADERBOARD (a Google Sheet behind an Apps Script web app) ═════
  const CLOUD = window.TGG_CLOUD || ""; const BOARD = { games: null, at: 0, loading: false, err: false };
  function cloudPost(rec) {
    if (!CLOUD || A.posing) return; const q = LS.get("tgg_cloud_q", []); if (!q.some((x) => x.key === rec.key)) q.push(rec); LS.set("tgg_cloud_q", q.slice(-20)); cloudFlush();
  }
  function cloudFlush() {
    if (!CLOUD) return; const q = LS.get("tgg_cloud_q", []); if (!q.length) return;
    const rec = q[0];
    fetch(CLOUD, { method: "POST", body: JSON.stringify(rec) }).then((r) => r.text()).then(() => {
      LS.set("tgg_cloud_q", LS.get("tgg_cloud_q", []).filter((x) => x.key !== rec.key)); BOARD.at = 0; loadBoard(true); if (LS.get("tgg_cloud_q", []).length) setTimeout(cloudFlush, 500);
    }).catch(() => {});
  }
  function loadBoard(force) {
    if (!CLOUD || A.posing || BOARD.loading || (!force && BOARD.games && Date.now() - BOARD.at < 60000)) return;
    BOARD.loading = true;
    fetch(CLOUD + (CLOUD.includes("?") ? "&" : "?") + "t=" + Date.now()).then((r) => r.json()).then((d) => { BOARD.games = (d && d.games) || []; BOARD.err = false; })
      .catch(() => { BOARD.err = true; }).then(() => { BOARD.at = Date.now(); BOARD.loading = false; if (["home", "game"].includes(A.screen)) render(); });
  }
  // best per friend, for the knowledge table (score) and the casino table (coins)
  function boardRows(field) {
    const best = {}; const cnt = {};
    for (const g of BOARD.games || []) { if (!CH[g.char]) continue; cnt[g.char] = (cnt[g.char] || 0) + 1; if (!best[g.char] || g[field] > best[g.char][field]) best[g.char] = g; }
    return Object.keys(best).map((id) => ({ id, g: best[id], n: cnt[id] })).sort((a, b) => b.g[field] - a.g[field]);
  }
  function boardCard(mine) {
    if (!CLOUD) return "";
    const tab = A.boardTab || "score"; const field = tab === "score" ? "score" : "coins";
    const rows = boardRows(field); const medal = [1, 2, 3].map((n) => `<i class="medal m${n}">${n}</i>`);
    const body = BOARD.games == null ? `<p class="small muted">${BOARD.err ? "אין חיבור לטבלה כרגע" : "טוען את הטבלה…"}</p>`
      : !rows.length ? `<p class="small muted">עוד אין תוצאות. המשחק הראשון שמסתיים נכנס לטבלה.</p>`
      : rows.map((x, i) => `<div class="brow ${i === 0 ? "top" : ""} ${mine && x.id === mine ? "me" : ""}"><span class="brk">${i < 3 ? medal[i] : i + 1}</span>${avatar({ id: x.id, avatar: "•", color: CH[x.id].color }, "sm")}<b class="grow">${esc(CH[x.id].name)}</b><span class="tiny muted">${x.n === 1 ? "משחק אחד" : x.n + " משחקים"}</span><b class="mx bval">${fmt(x.g[field])}</b></div>`).join("");
    const last = (BOARD.games || []).slice(-3).reverse().filter((g) => CH[g.char]).map((g) => `<div class="hrow"><span class="tiny muted">${dateHe(g.at)}</span>${avatar({ id: g.char, avatar: "•", color: CH[g.char].color }, "xs")}<b class="grow">${esc(CH[g.char].name)}</b><span class="row" style="gap:3px">${ic("star")}<span class="mx">${fmt(g.score)}</span></span><span class="mx">${ic("coin")} ${fmt(g.coins)}</span></div>`).join("");
    return `<div class="card board"><div class="row between"><h3 style="margin:0" class="row">${ic("trophy")} טבלת השיאים</h3><button class="pill icbtn" data-a="boardReload" aria-label="רענון">${ic("refresh")}</button></div>
      <div class="lbtabs"><button class="${tab === "score" ? "on" : ""}" data-a="boardTab" data-v="score">${ic("star")} מלך הידע</button><button class="${tab === "coins" ? "on" : ""}" data-a="boardTab" data-v="coins">${ic("coin")} מלך הקזינו</button></div>
      <p class="tiny muted" style="margin:6px 0">${tab === "score" ? "הניקוד הכי גבוה של כל אחד" : "הכי הרבה מטבעות בסוף משחק"}</p>${body}
      ${last ? `<div class="tiny muted" style="margin-top:8px">משחקים אחרונים</div><div class="hlist">${last}</div>` : ""}</div>`;
  }
  // how this game moved you on the board: overtakes, gap to the next friend, personal best
  function rivalry(S) {
    if (!CLOUD || !BOARD.games) return null;
    let skip = true; const games = BOARD.games.filter((g) => { if (skip && g.char === S.me.id && g.score === S.score && g.coins === S.me.coins && g.correct === S.correct) { skip = false; return false; } return true; });
    const one = (field, val) => {
      const best = {}; for (const g of games) if (CH[g.char] && (best[g.char] == null || g[field] > best[g.char])) best[g.char] = g[field];
      const pb = best[S.me.id]; const top = Math.max(pb == null ? -1 : pb, val); const floor = pb == null ? -Infinity : pb;
      const others = Object.keys(best).filter((id) => id !== S.me.id).map((id) => ({ id, v: best[id] }));
      const passed = others.filter((o) => o.v >= floor && o.v < val).sort((a, b) => b.v - a.v).map((o) => o.id);
      const above = others.filter((o) => o.v >= top).sort((a, b) => a.v - b.v);
      // the table before this game and after it, for the overtake animation on the final screen
      const before = Object.keys(best).map((id) => ({ id, v: best[id] })).sort((a, b) => b.v - a.v); if (pb == null) before.push({ id: S.me.id, v: null });
      const after = others.concat([{ id: S.me.id, v: top }]).sort((a, b) => b.v - a.v || (a.id === S.me.id ? -1 : 1));
      return { val, pb, isPB: pb != null && val > pb, first: pb == null, passed, rank: above.length + 1, next: above[0] ? { id: above[0].id, gap: above[0].v - val + 1 } : null, before, after };
    };
    return { score: one("score", S.score), coins: one("coins", S.me.coins) };
  }
  // the overtake: rows in the old order; then your row rises above whoever you passed (FLIP)
  function ovtTable(x, kind, me) {
    if (!x || !x.before) return ""; const unit = kind === "score" ? ic("star") : ic("coin");
    return `<div class="ovt" data-kind="${kind}" data-after="${x.after.map((r) => r.id).join(",")}" data-new="${x.val}">${x.before.map((r, i) => `<div class="ovt-r ${r.id === me ? "me" : ""}" data-id="${r.id}"><i class="medal m${Math.min(i + 1, 4)}">${i + 1}</i>${avatar({ id: r.id, avatar: "•", color: CH[r.id].color }, "xs")}<b class="grow">${esc(CH[r.id].name)}</b><span class="mx ovt-v">${r.v == null ? "—" : fmt(r.v)}</span>${unit}</div>`).join("")}</div>`;
  }
  // the final screen, in a fixed order: portrait · score and balance counted over 1600ms · the table · highlights · share
  function finalSequence() {
    const box = $(".sfinal"); const v = A.view; if (!box || !v) return; const key = v.room + ":" + (v.progress && v.progress.total);
    const celebrate = () => { if (A.celebrated === key) return; A.celebrated = key; confetti(); SND.play("fanfare"); };
    if (A.finSeq === key) { // re-render, or the cloud table arrived late
      const o = $(".ovt"); if (o && !o.classList.contains("done")) { if (A.ovtDone === key || M.reduced()) ovtSwap(true); else { A.ovtDone = key; setTimeout(() => ovtSwap(false).then(celebrate), M.T.ui()); } }
      return;
    }
    A.finSeq = key;
    const sEl = $(".fin-s", box), pEl = $(".fin-p", box); const sc = Number(box.dataset.score), pr = Number(box.dataset.profit);
    const later = [...document.querySelectorAll(".rivals, .moments, main .board, [data-a=soloShare]")];
    if (M.reduced()) { if ($(".ovt")) { A.ovtDone = key; ovtSwap(true); } return; }
    later.forEach((e) => (e.style.opacity = 0));
    const t = M.T.moment();
    M.odometer(sEl, 0, sc, { ms: t, fmt }); M.odometer(pEl, 0, pr, { ms: t, fmt: (n) => { const r = Math.round(n); return r ? sgn(r) : "0"; } });
    M.maskWords($(".sfinal .tiny"));
    setTimeout(() => {
      later.forEach((e) => (e.style.opacity = "")); M.enter(later);
      const ovt = $(".ovt");
      if (ovt) { A.ovtDone = key; setTimeout(() => { ovtSwap(false).then(celebrate); }, M.T.reveal()); }
      else if (box.dataset.pb === "1") celebrate();
    }, t);
  }
  function ovtSwap(instant) {
    const ovt = $(".ovt"); if (!ovt) return Promise.resolve(); const rows = [...ovt.children]; const order = ovt.dataset.after.split(",");
    const mutate = () => {
      order.forEach((id) => { const r = rows.find((x) => x.dataset.id === id); if (r) ovt.appendChild(r); });
      [...ovt.children].forEach((r, i) => { const m = r.querySelector(".medal"); m.className = "medal m" + Math.min(i + 1, 4); m.textContent = i + 1; if (r.classList.contains("me")) r.querySelector(".ovt-v").textContent = fmt(Number(ovt.dataset.new)); });
      ovt.classList.add("done");
    };
    if (instant) { mutate(); return Promise.resolve(); }
    SND.play("whoosh"); return M.flip(rows, mutate);
  }
  function rivalLine(x, kind) {
    const T = kind === "score" ? "מלך הידע" : "מלך הקזינו"; const unit = kind === "score" ? "נקודות" : "מטבעות";
    const names = (ids) => ids.map((id) => CH[id].name).join(" ו");
    const faces = (ids) => ids.map((id) => avatar({ id, avatar: "•", color: CH[id].color }, "xs")).join("");
    let t;
    if (x.passed.length) t = `<b class="pos">עקפת את ${esc(names(x.passed))}!</b> ${x.rank === 1 ? `אתה ${T} ${gi("crown")}` : `עכשיו מקום ${x.rank} ב${T}`}`;
    else if (x.rank === 1) t = `<b>אתה ${T} ${gi("crown")}</b>${x.first ? "" : " ואף אחד לא קרוב"}`;
    else t = `מקום ${x.rank} ב${T} · ${x.next ? `חסרו <b class="mx">${fmt(x.next.gap)}</b> ${unit} כדי לעקוף את ${esc(CH[x.next.id].name)}` : ""}`;
    return `<div class="rv"><span class="rv-ic">${ic(kind === "score" ? "star" : "coin")}</span><div class="grow">${t}${x.isPB ? ` <span class="badge gold">שיא אישי חדש</span>` : x.first ? ` <span class="badge">נכנסת לטבלה</span>` : ""}</div>${x.passed.length ? `<span class="rv-f">${faces(x.passed)}</span>` : ""}</div>`;
  }
  function recordGame(v) {
    const s = HOST.state; if (!s || !v || v.phase !== "game_over" || v.playtest || A.posing) return;
    const key = s.room + ":" + (s.startedAt || 0); const h = history(); if (h.some((x) => x.key === key)) return;
    const S = soloStats(v); h.unshift({ key, at: Date.now(), name: S.me.name, char: S.me.id, score: S.score, coins: S.me.coins, profit: S.profit, correct: S.correct, total: S.total });
    LS.set(HIST_KEY, h.slice(0, 30));
    const ids = s.order || []; const bankN = Object.keys(s.bank || {}).length; let seen = LS.get("tgg_seen", []).filter((id) => !ids.includes(id)).concat(ids);
    if (bankN && bankN - seen.length < 25) seen = ids.slice(); LS.set("tgg_seen", seen); // when almost everything was seen, start a new cycle
    cloudPost({ key, char: S.me.id, name: S.me.name, score: S.score, coins: S.me.coins, profit: S.profit, correct: S.correct, total: S.total });
  }
  const dateHe = (t) => { try { return new Date(t).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }); } catch (e) { return ""; } };
  function histRows(h, n) {
    return h.slice(0, n).map((x) => `<div class="hrow"><span class="tiny muted">${dateHe(x.at)}</span><b class="grow">${esc(x.name || "")}</b><span class="row" style="gap:3px">${ic("star")}<span class="mx">${fmt(x.score)}</span></span><span class="mx ${x.profit > 0 ? "pos" : x.profit < 0 ? "neg" : "muted"}">${x.profit ? sgn(x.profit) : "0"}</span><span class="tiny muted">${x.correct}/${x.total}</span></div>`).join("");
  }
  function renderHome() {
    const resume = LS.get("tgg_host", null); const st = LS.get("tgg_host_state", null);
    const h = history(); const B = bestOf(h); const unlocked = h.length > 0;
    return `${topbar()}<main>
      <div class="herobanner"><div class="hb-txt"><div class="tiny hb-kicker">SALAD ORIGINALS · 25 שאלות</div><h1>THE GROUP<br>GAMES</h1><p>חידון על ההיסטוריה של הקבוצה. 25 שאלות אקראיות, 10,000 מטבעות להתחלה.</p>
        <button class="btn gold big herostart" data-a="goSolo">${ic("play")} התחל משחק</button></div>
        <div class="hb-art hb-logo"><div class="hb-chip" role="img" aria-label="סלט">${SalatChip.svg("hero")}</div></div></div>
      ${resume && st && st.phase !== "game_over" ? `<button class="btn pri" style="margin-bottom:10px" data-a="resumeHost">${ic("refresh")} המשך את המשחק שנקטע</button>` : ""}
      ${boardCard()}
      <div class="card"><div class="row between"><h3 style="margin:0" class="row">${ic("trophy")} השיא שלי</h3><span class="tiny muted">${h.length ? `${h.length} משחקים במכשיר הזה` : ""}</span></div>
        ${B ? `<div class="sgrid sm"><div><b class="mx">${fmt(B.score)}</b><small>ניקוד הכי גבוה</small></div><div><b class="mx ${B.profit > 0 ? "pos" : ""}">${B.profit > 0 ? "+" + fmt(B.profit) : "0"}</b><small>הרווח הכי גדול</small></div><div><b class="mx">${B.correct}/25</b><small>הכי הרבה נכונות</small></div></div>
          <div class="hlist">${histRows(h, 3)}</div>` : `<p class="small muted" style="margin:6px 0 0">עוד לא שיחקת במכשיר הזה. אחרי המשחק הראשון השיא וההיסטוריה יישמרו כאן.</p>`}</div>
      <button class="freecard ${unlocked ? "" : "locked"}" data-a="${unlocked ? "openFree" : "freeLocked"}"><span class="fc-ic">${ic(unlocked ? "chips" : "lock")}</span><span class="grow"><b>קזינו חופשי</b><small>${unlocked ? `PLINKO, MINES, DICE, HI-LO ו-BLACKJACK · ארנק נפרד: ${fmt(freeWallet())}` : "נפתח אחרי שמסיימים משחק אחד"}</small></span><span class="chev">‹</span></button>
      <div class="homemore"><button data-a="openGuideHome">${ic("book")}<span>איך משחקים</span></button><button data-a="settings">${ic("gear")}<span>הגדרות</span></button><button data-a="goEditor">${ic("lock")}<span>פיתוח</span></button></div>
</main>`;
  }
  // ═════ FREE CASINO: unlocked after one finished game; its own wallet, saved on this phone ═════
  const FREE_GAMES = ["plinko", "mines", "dice", "hilo", "bj"];
  const FREE = { state: null };
  function freeWallet() { const w = LS.get(FREE_KEY, null); return w && Number.isFinite(w.coins) ? w.coins : 10000; }
  function freeSetup() {
    const t = Date.now(); const s = TGG.newState({ room: "free", questions: [], now: t, solo: true });
    TGG.join(s, t, { token, char: "yoni", avatar: "a0", isHost: true }); const pid = Object.keys(s.players)[0];
    s.players[pid].coins = freeWallet(); FREE.state = s; FREE.pid = pid;
  }
  function freeView() { const s = FREE.state; A.view = TGG.view(s, FREE.pid, Date.now()); return A.view; }
  function freeSide(act, key) {
    const s = FREE.state; if (!s) return; const r = TGG.sideAction(s, Date.now(), FREE.pid, act, key, true);
    if (r && r.error) toast(r.error);
    LS.set(FREE_KEY, { coins: s.players[FREE.pid].coins }); freeView(); render(); return r;
  }
  function openFree() { if (!history().length) { toast("הקזינו החופשי נפתח אחרי משחק אחד"); return; } A.free = true; A.freeGame = null; freeSetup(); freeView(); A.screen = "free"; SND.play("whoosh"); render(); window.scrollTo(0, 0); }
  function closeFree() { A.free = false; A.freeGame = null; FREE.state = null; A.view = null; A.screen = "home"; if (HOST.state) hostChanged(); render(); }
  function renderFree() {
    const v = freeView(); const me = playerById(v, v.me);
    const pill = `<span class="pill" title="ארנק הקזינו החופשי">${COIN_ICON}<span class="mx">${fmt(me.coins)}</span></span>`;
    if (A.freeGame) {
      const scr = { plinko: plinkoScreen, mines: minesScreen, dice: diceScreen, hilo: hiloScreen, bj: bjScreen }[A.freeGame];
      return `${topbar(pill)}<main class="stagewrap">${stage(v, scr(v))}</main>`;
    }
    return `${topbar(pill)}<main><div class="row between"><h2 style="margin:0">קזינו חופשי</h2><button class="btn sm ghost" data-a="freeClose">${ic("home")} למסך הבית</button></div>
      <p class="small muted">ארנק נפרד מהמשחק, שנשמר במכשיר. התוצאות כאן לא משפיעות על השיא שלך.</p>
      <div class="card center"><div class="tiny muted">הארנק שלך</div><div class="money" style="font-size:38px">${fmt(me.coins)}</div>${me.coins < 1000 ? `<button class="btn sm" style="margin:8px auto 0" data-a="freeRefill">${ic("refresh")} מילוי ל-10,000</button>` : ""}</div>
      <div class="freegrid">${FREE_GAMES.map((k) => `<button class="fg" data-a="freePlay" data-v="${k}">${tileArt(k)}</button>`).join("")}</div></main>`;
  }
  function renderCreate() {
    if (A.playtest) return renderPlaytestSetup();
    const L = { short: "קצר · ~15 שאלות", medium: "בינוני · ~28 שאלות", long: "ארוך · ~42 שאלות" };
    return `${topbar()}<main><h2>${A.practice ? "תרגול על מכשיר אחד" : "יצירת חדר"}</h2>
      <div class="card"><h3>אורך המשחק</h3><p class="tiny muted">${loadBank().length} שאלות פעילות במאגר${(() => { const n = Object.values(getEdits().status).filter((x) => x === "out").length; return n ? ` (${n} הוסרו במצב עורך)` : ""; })()}</p><div class="col">${Object.entries(L).map(([k, l]) => `<button class="opt ${A.length === k ? "sel" : ""}" data-a="len" data-v="${k}"><span class="k">${k === "short" ? "S" : k === "medium" ? "M" : "L"}</span>${l}</button>`).join("")}</div></div>
      ${A.practice ? `<p class="small muted">מצב תרגול לא מסונכרן עם טלפונים אחרים ולא חולק יתרות עם חדרים אמיתיים.</p>` : `<p class="small muted">אתה תהיה המארח. הטלפון שלך מריץ את המשחק, אז השאירו אותו פתוח ומחובר לאורך כל המשחק. למארח אין שום יתרון ואין לו גישה לתשובות.</p>`}
      <div class="col"><button class="btn pri" data-a="create">יאללה, ${A.practice ? "להתחיל" : "פתח חדר"}</button><button class="btn ghost" data-a="home">חזרה</button></div></main>`;
  }
  function renderPlaytestSetup() {
    const bank = loadBank(); const E = getEdits(); const fresh = bank.filter((q) => !E.status[q.id]).length;
    const L = { short: "קצר · ~15", medium: "בינוני · ~28", long: "ארוך · ~42", all: `כל השאלות · ${bank.length}` };
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(A[key]) === String(v) ? "sel" : ""}" data-a="ptSet" data-k="${key}" data-v="${v}">${l}</button>`).join("")}</div>`;
    return `${topbar()}<main><div class="row between"><h2 style="margin:0">🎮 משחק בדיקה</h2><span class="badge gold">עורך</span></div>
      <p class="small muted">משחקים על הטלפון הזה כשחקן רגיל, עם שחקנים ממוחשבים במקום החברים. בכל שאלה יש פס עורך: מסמנים ✅ / 🛠 / 🗑, כותבים הערה, ואחרי החשיפה אפשר גם לערוך. הכול נשמר בדוח העורך.</p>
      <div class="card"><h3>כמה שאלות</h3><div class="col">${Object.entries(L).map(([k, l]) => `<button class="opt ${A.length === k ? "sel" : ""}" data-a="len" data-v="${k}"><span class="k">${k === "all" ? "∞" : k[0].toUpperCase()}</span>${l}</button>`).join("")}</div></div>
      <div class="card"><h3>שחקנים ממוחשבים (מהמרים ועונים בערך חצי נכון)</h3>${seg("bots", [[0, "בלי"], [1, "1"], [2, "2"], [3, "3"]])}
        <h3 style="margin-top:12px">טיימר</h3>${seg("noTimer", [["true", "בלי טיימר: אני קובע את הקצב"], ["false", "עם טיימר כמו במשחק"]])}
        <h3 style="margin-top:12px">אילו שאלות</h3>${seg("onlyNew", [["false", `כולן (${bank.length})`], ["true", `רק שלא בדקתי (${fresh})`]])}</div>
      <div class="col"><button class="btn pri" data-a="create">יאללה, לשחק</button><button class="btn ghost" data-a="home">חזרה</button></div></main>`;
  }
  function renderClaim() {
    const st = HOST.state; const L = st ? { players: Object.values(st.players).map((x) => ({ id: x.id, name: x.name, avatar: x.avatar })), taken: { chars: Object.keys(st.players), avatars: Object.values(st.players).map((x) => x.avatar) } } : null;
    if (A.err && !L) return `${topbar()}<main><div class="card center"><h2>${ic("info")}</h2><p>${esc(A.err)}</p><button class="btn" data-a="home">למסך הבית</button></div></main>`;
    if (!L) return `${topbar()}<main><div class="locked"><div class="spinner"></div><p>מתחבר לחדר ${esc(A.room || "")}...</p><p class="small muted">אם זה לוקח הרבה זמן, נסו שכולם יהיו על אותו Wi-Fi.</p></div><button class="btn ghost" data-a="home">ביטול</button></main>`;
    const last = LS.get("tgg_last_char", null);
    if (!A.ui.claim && last && CH[last] && !L.taken.chars.includes(last)) A.ui.claim = { char: last, avatar: AVATARS[["polchak", "tego", "mozzarella", "yoni"].indexOf(last)] || AVATARS[0] };
    const sel = A.ui.claim || {}; const taken = L.taken;
    const chars = Object.entries(CH).map(([id, c]) => `<button class="charpick ${sel.char === id ? "sel" : ""}" data-a="pickChar" data-v="${id}" style="--c:${c.color}" ${taken.chars.includes(id) ? "disabled" : ""}>${AVIMG[id] ? `<img src="${AVIMG[id].full}" alt="" draggable="false">` : ""}<b>${esc(c.name)}</b></button>`).join("");
    return `${topbar()}<main><h2>מי אתה?</h2><p class="small muted" style="margin-top:-4px">בחר את הדמות שלך</p><div class="chargrid ${sel.char ? "has-sel" : ""}">${chars}</div>
      <button class="btn gold big claimbtn" style="margin-top:12px" data-a="claim" ${sel.char ? "" : "disabled"}><span class="cb-t">${sel.char ? `זה אני, ${esc(CH[sel.char].name)}!` : "בחר דמות"}</span></button></main>`;
  }

  function renderGameShell() {
    const v = A.view; const me = playerById(v, v.me);
    // while a number answer is still being revealed, the counters show the balance from before it
    const rq = v.round && v.round.q; const holdRes = v.phase === "reveal" && rq && v.round.results && (rq.answer_type === "number" && rq.nscale ? A.nrDone !== v.round.n : v.solo && !M.reduced() && A.tlDone !== v.round.n) ? v.round.results[v.me] : null;
    const shownC = me ? me.coins - (holdRes ? holdRes.coins || 0 : 0) : 0; const shownS = me ? (me.score || 0) - (holdRes ? holdRes.points || 0 : 0) : 0;
    const coinsPill = (me ? `<span class="pill" id="coinPill" title="מטבעות">${COIN_ICON}<span class="money" data-coins="${shownC}">${fmt(A.shownCoins != null && A.shownCoins !== shownC ? A.shownCoins : shownC)}</span></span>` : "")
      + (me ? `<span class="pill scorepill" title="ניקוד: לפי תשובות נכונות, רצפים ומהירות">${ic("star")}<span class="mx" data-score="${shownS}">${fmt(A.shownScore != null && A.shownScore !== shownS ? A.shownScore : shownS)}</span></span>` : "")
      + (v.playtest && HOST.state ? `<button class="pill icbtn ${A.inspector ? "on" : ""}" data-a="inspToggle" aria-label="Inspector">${ic("eye")}</button>` : "") + (v.playtest && v.round ? `<button class="pill icbtn" data-a="edSheet" aria-label="עורך">${ic("book")}</button>` : "")
      + (v.isHost && v.phase !== "lobby" && v.phase !== "game_over" && v.phase !== "answering" ? `<button class="pill icbtn" data-a="hostSheet" aria-label="הגדרות משחק">${ic("gear")}</button>` : "");
    if (!["home", "game", "profile"].includes(A.tab)) A.tab = "game";
    const inRound = A.tab === "game" && ["answering", "reveal", "roulette"].includes(v.phase) && v.round !== undefined;
    const content = A.tab === "home" ? renderGameHome(v) : A.tab === "profile" ? renderProfile(v) : renderGame(v);
    const tabs = [["home", "home", "בית"], ["game", "game", "משחק"], ["profile", "user", "פרופיל"]];
    return `${topbar(coinsPill)}<div class="shellgrid"><main class="${inRound ? "stagewrap" : ""}">${content}</main><aside class="sidepanel" aria-label="המסלול והמצב שלך">${sidePanel(v)}</aside></div>
      <nav class="tabs"><div class="in">${tabs.map(([k, i, l]) => `<button class="${A.tab === k ? "on" : ""}" data-a="tab" data-v="${k}"><span class="i">${ic(i)}</span><span>${l}</span>${k === "game" && v.phase !== "lobby" && v.phase !== "game_over" && A.tab !== "game" ? `<i class="navdot"></i>` : ""}</button>`).join("")}</div></nav>`;
  }
  function sidePanel(v) {
    const me = playerById(v, v.me); const st = v.myStats || {}; const B = bestOf(history());
    return `${me ? `<div class="card sp-me">${avatar(me, "lg")}<div><b>${esc(me.name)}</b><div class="sp-stats"><span>${ic("coin")} ${fmt(me.coins)}</span><span>${ic("star")} ${fmt(me.score || 0)}</span><span>${ic("check")} ${st.correct || 0}/${st.answered || 0}</span></div></div></div>` : ""}
      <div class="card"><div class="flabel"><span class="row" style="gap:6px">${ic("flag")} המסלול</span></div>${routeMap(v, true)}</div>
      ${B ? `<div class="card"><h3 class="row" style="gap:6px;margin:0 0 6px">${ic("trophy")} השיא שלי</h3><div class="sgrid sm"><div><b class="mx">${fmt(B.score)}</b><small>ניקוד</small></div><div><b class="mx">${B.profit > 0 ? "+" + fmt(B.profit) : "0"}</b><small>רווח</small></div><div><b class="mx">${B.correct}/25</b><small>נכונות</small></div></div></div>` : ""}`;
  }
  function renderGameHome(v) {
    const pr = v.progress; const live = v.phase !== "lobby" && v.phase !== "game_over"; const B = bestOf(history());
    const next = v.round ? v.rules.ROULETTE_EVERY - (v.round.n % v.rules.ROULETTE_EVERY) : null;
    return `<div class="card"><div class="row between"><h3 style="margin:0">${live ? `שאלה ${pr ? pr.n : 0} מתוך ${pr ? pr.total : 25}` : v.phase === "game_over" ? "המשחק נגמר" : "מוכנים להתחיל"}</h3>${live && next ? `<span class="badge">קזינו בעוד ${next === v.rules.ROULETTE_EVERY ? 0 : next} שאלות</span>` : ""}</div>
        <button class="btn gold" style="margin-top:10px" data-a="tab" data-v="game">${ic("play")} ${live ? "חזרה לשאלה" : v.phase === "game_over" ? "לתוצאות" : "להתחלה"}</button></div>
      <div class="rt-card"><div class="flabel"><span class="row" style="gap:6px">${ic("flag")} המסלול</span><button class="infobtn" data-a="openGuide">${ic("book")} הסבר</button></div>${routeMap(v, true)}</div>
      ${B ? `<div class="card"><h3 class="row" style="gap:6px">${ic("trophy")} השיא שלי</h3><div class="sgrid sm"><div><b class="mx">${fmt(B.score)}</b><small>ניקוד</small></div><div><b class="mx">${B.profit > 0 ? "+" + fmt(B.profit) : "0"}</b><small>רווח</small></div><div><b class="mx">${B.correct}/25</b><small>נכונות</small></div></div></div>` : ""}
      <button class="li rulesli" data-a="rulesHub"><span>${ic("info")}</span><span class="grow">איך משחקים בכל משחק קזינו</span><span class="chev">‹</span></button>`;
  }
  // ───────── CRASH (everyone together, live) ─────────
  const AUTO_OPTS = [0, 1.5, 2, 3, 5, 10];
  function crashGraph() {
    return `<div class="crashbox"><canvas id="crashSvg" class="crashcv"></canvas>
      <div class="rocket" id="crashRocket">${gi("rocket", "lg")}</div><div class="cmult" id="crashMult">1.00×</div><div class="csub" id="crashSub"></div></div>`;
  }
  function crashScreen(v) {
    const ro = v.round.roulette; const c = ro.crash; const me = playerById(v, v.me); const myStake = ro.stakes[v.me];
    const list = v.players.map((p) => { const st = ro.stakes[p.id]; const cashed = c && c.cashed[p.id]; const res = ro.results && ro.results[p.id];
      return `<div class="rrow ${p.id === v.me ? "me" : ""}">${avatar(p, "xs")}<b class="nm">${esc(p.name)}</b>${st === "locked" ? `<span class="badge">${ic("lock")}</span>` : st ? `<span class="small muted">${fmt(st)}</span>` : st === 0 ? `<span class="small muted">צופה</span>` : `<span class="small muted">…</span>`}
        ${res ? `<span class="cn ${res.delta > 0 ? "pos" : "neg"}">${sgn(res.delta)}</span>` : cashed ? `<span class="badge green">${mx(cashed.toFixed(2))}</span>` : ""}</div>`; }).join("");
    let body, foot;
    if (!c && myStake == null) {
      const max = v.caps.wheel; const w = A.ui.wheel || 0;
      body = `${crashGraph()}<div class="betpanel">${betField("wheel", w, max)}<div class="flabel"><span>יציאה אוטומטית ב-</span><span class="muted">שומר עליך מהדיליי</span></div>
        <div class="presets">${AUTO_OPTS.map((x) => `<button class="${(A.ui.auto || 0) === x ? "sel" : ""}" data-a="autoSet" data-v="${x}">${x ? mx(x) : "ידני"}</button>`).join("")}</div></div>`;
      foot = `<button class="btn gold big" id="lockBtn" data-a="wheelLock" data-kind="crash">${w ? `${ic("play")} הצטרף ב-${fmt(w)}` : "לצפות בלבד"}</button>`;
    } else if (!ro.results) {
      const mine = c && c.cashed[v.me];
      body = `${crashGraph()}<div class="rtable">${list}</div>`;
      foot = myStake && !mine ? `<button class="btn gold big cashbtn" id="cashBtn" data-a="cashout" ${c ? "" : "disabled"} data-stake="${myStake}">${c ? "CASH OUT" : "מחכים לשאר..."}</button>${ro.myAuto ? `<p class="tiny muted center" style="margin:3px 0 0">יציאה אוטומטית ב-${mx(ro.myAuto)}</p>` : ""}`
        : mine ? `<div class="waitbox pos">${ic("check")} יצאת ב-${mx(mine.toFixed(2))} · +${fmt(Math.floor(myStake * mine) - myStake)}</div>` : `<div class="waitbox">${c ? "צופים ברקטה" : "מחכים לשאר..."}</div>`;
    } else {
      body = `${crashGraph()}<div class="rtable">${list}</div>`;
      foot = v.isHost ? `<button class="btn gold big" data-a="host" data-v="continue">${nextLabel(v)}</button>` : `<div class="waitbox">ממתינים למארח...</div>`;
    }
    return { head: headHTML(v, { title: "CRASH", noStrip: true, info: "crash" }), body, foot };
  }
  function crashLoop() {
    A.crashRaf = null; const v = A.view; const svg = $("#crashSvg");
    if (!svg || !v || !v.round || !v.round.roulette || v.round.roulette.kind !== "crash") { SND.rocketStop(); return; }
    const ro = v.round.roulette; const c = ro.crash; const rate = c ? c.rate : 0.11;
    let t = 0, m = 1, crashed = false, count = 0;
    if (c) { t = (now() - c.startAt) / 1000; if (t < 0) { count = Math.ceil(-t); t = 0; } m = Math.max(1, Math.exp(rate * t)); if (c.point != null) { crashed = true; m = c.point; t = Math.log(m) / rate; } }
    const xmax = Math.max(8, t * 1.18), ymax = Math.max(2, m * 1.25); const pts = [];
    for (let i = 0; i <= 40; i++) { const tt = (t * i) / 40; const mm = Math.exp(rate * tt); pts.push([8 + (tt / xmax) * 284, 162 - ((mm - 1) / (ymax - 1)) * 150]); }
    TABLE.crash(svg, { pts, crashed, t });
    const tip = pts[40]; const prev = pts[38]; const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) * 180 / Math.PI + 45;
    const box = svg.getBoundingClientRect(); const rk = $("#crashRocket");
    rk.style.left = (tip[0] / 300) * box.width + "px"; rk.style.top = (tip[1] / 170) * box.height + "px"; rk.style.transform = `translate(-50%,-50%) rotate(${crashed ? 0 : ang}deg)`; rk.innerHTML = gi(crashed ? "boom" : "rocket", "lg");
    const mEl = $("#crashMult"); mEl.textContent = m.toFixed(2) + "×"; mEl.classList.toggle("bust", crashed);
    const sub = $("#crashSub"); sub.innerHTML = !c ? "מכניסים הימורים" : crashed ? `התרסק ב-${mx(m.toFixed(2))}` : count ? `ממריאים בעוד ${count}...` : "";
    const cb = $("#cashBtn"); if (cb && c && !crashed && !count && !cb.disabled) cb.innerHTML = `CASH OUT · <span class="money">${fmt(Math.floor(Number(cb.dataset.stake) * m))}</span>`;
    if (c && !crashed && !count) { SND.rocketStart(); SND.rocketSet(m); } else if (crashed || !c) SND.rocketStop();
    if (c && !crashed && !count) { const whole = Math.floor(m); if (A.crashLastWhole !== whole && whole >= 2) { A.crashLastWhole = whole; SND.play("tick"); pop(mEl); } }
    if (!crashed) A.crashRaf = document.hidden ? (document.addEventListener("visibilitychange", function w() { document.removeEventListener("visibilitychange", w); if (!A.crashRaf || A.crashRaf === -1) { A.crashRaf = null; crashLoop(); } }), -1) : requestAnimationFrame(crashLoop);
    else if (A.crashBoomSeen !== (c && c.startAt)) { A.crashBoomSeen = c && c.startAt; const rk2 = $("#crashRocket"), host = svg.parentElement; if (rk2 && host) { const a = rk2.getBoundingClientRect(), h = host.getBoundingClientRect(); TABLE.burst(host, a.left - h.left + a.width / 2, a.top - h.top + a.height / 2, "boom"); } }
  }

  // ───────── PLINKO (solo, any time) ─────────
  function plinkoScreen(v) {
    const risk = A.plinkoRisk || "low"; const T = TGG.PLINKO[risk]; const max = v.caps.wheel;
    const pegs = []; for (let r = 0; r < 8; r++) for (let j = 0; j < r + 3; j++) pegs.push(`<circle cx="${150 + (j - (r + 2) / 2) * 30}" cy="${22 + r * 24}" r="3.2" fill="#fff8ec"/>`);
    const col = (m) => (m >= 10 ? "#ed4163" : m >= 2 ? "#e8b84a" : m >= 1 ? "#e8b84a" : "#2e9b4f");
    const buckets = T.map((m, k) => `<g class="bkt" data-k="${k}"><rect x="${150 + (k - 4) * 30 - 13}" y="214" width="26" height="22" rx="4" fill="${col(m)}"/><text x="${150 + (k - 4) * 30}" y="229" text-anchor="middle" font-size="${String(m).length >= 3 ? 9.5 : 11}" font-weight="700" fill="#05080a" font-family="Rubik,Arial" direction="ltr"${String(m).length >= 4 ? ' textLength="23" lengthAdjust="spacingAndGlyphs"' : ""}>${m}×</text></g>`).join("");
    const last = v.side && v.side.plinko;
    const body = `<div class="plinko"><svg viewBox="0 0 300 240" id="plinkoSvg">${pegs.join("")}${buckets}</svg><div class="pball" id="pBall"></div></div>
      <div class="betpanel"><div class="seg" style="margin-bottom:4px"><button class="${risk === "low" ? "sel" : ""}" data-a="plRisk" data-v="low">סיכון נמוך</button><button class="${risk === "high" ? "sel" : ""}" data-a="plRisk" data-v="high">סיכון גבוה</button></div>
      ${betField("side", A.sideAmt || 0, max)}</div>
      ${last ? `<p class="tiny muted center" style="margin:2px 0" id="plLast">אחרון: ${mx(last.mult)} · <span class="mx">${sgn(last.payout - last.stake)}</span></p>` : ""}`;
    const foot = `<div class="row" style="gap:8px">${A.free ? `<button class="btn sm" style="flex:none" data-a="freeBack">${ic("arrow")} משחקים</button>` : ""}<button class="btn gold big" style="flex:1" data-a="plinkoDrop">${ic("down")} שחרר כדור${A.sideAmt ? ` · ${fmt(A.sideAmt)}` : ""}</button></div>`;
    return { head: headHTML(v, { title: "PLINKO", noStrip: true, info: "plinko" }), body, foot };
  }
  function plinkoAfterRender() {
    const v = A.view; const res = v && v.side && v.side.plinko; const ball = $("#pBall"); const svg = $("#plinkoSvg");
    if (ball && !res) { A.plinkoSeen = 0; return; }
    if (!res || !ball || !svg) return;
    if (A.plinkoSeen == null) { A.plinkoSeen = res.id; return; }
    if (A.plinkoSeen === res.id) return; A.plinkoSeen = res.id;
    ball.style.opacity = 0; const pl = $("#plLast"); if (pl) pl.style.visibility = "hidden";
    TABLE.plinko(svg, res.path, { onPeg: () => SND.play("peg"), onLand: () => {
      const b = document.querySelector(`.bkt[data-k="${res.k}"]`); if (b) { b.classList.add("hit"); setTimeout(() => b.classList.remove("hit"), 700); }
      const win = res.payout > res.stake; SND.play(res.mult >= 10 ? "jackpot" : win ? "coins" : "wrong");
      if (res.mult >= 10) juice("big", b, `${res.mult}×!`); else if (win) juice("medium", b); else addTrauma(0.15);
      const pl2 = $("#plLast"); if (pl2) pl2.style.visibility = "";
    } });
  }

  // ───────── MINES (solo, any time) ─────────
  function minesScreen(v) {
    const g = v.side && v.side.mines; const playing = g && g.status === "playing"; const max = v.caps.wheel; const cnt = A.minesCount || 3;
    const cells = Array.from({ length: 25 }, (_, i) => {
      const rev = g && g.revealed.includes(i); const isMine = g && g.board && g.board.includes(i); const boom = g && g.boom === i;
      const cls = rev ? "gem" : g && g.board ? (isMine ? (boom ? "boom" : "mine") : "dim") : "";
      return `<button class="mcell ${cls}" ${playing && !rev ? `data-a="mnPick" data-v="${i}"` : "disabled"}>${rev ? gi("gem") : isMine ? gi(boom ? "boom" : "bomb") : g && g.board ? gi("gem") : ""}</button>`;
    }).join("");
    const info = playing ? `<div class="oddsrow"><span>מכפיל עכשיו <b class="pos">${mx(g.mult)}</b></span><span>הבא <b>${mx(g.next)}</b></span></div>`
      : g ? `<div class="oddsrow"><span>${g.status === "bust" ? "עלית על מוקש" : `${ic("check")} יצאת ב-${mx(g.mult)}`}</span><b class="mx ${g.status === "bust" ? "neg" : "pos"}">${g.status === "bust" ? "-" + fmt(g.stake) : "+" + fmt(Math.floor(g.stake * g.mult) - g.stake)}</b></div>` : "";
    const controls = playing ? "" : `<div class="betpanel"><div class="flabel"><span>מוקשים</span><span class="muted">יותר מוקשים = מכפיל גבוה יותר</span></div>
      <div class="presets">${TGG.MINES.counts.map((n) => `<button class="${cnt === n ? "sel" : ""}" data-a="mnCount" data-v="${n}">${n} ${gi("bomb")}</button>`).join("")}</div>${betField("side", A.sideAmt || 0, max)}</div>`;
    const body = `${info}<div class="mgrid5">${cells}</div>${controls}`;
    const foot = `<div class="row" style="gap:8px">${A.free ? `<button class="btn sm" style="flex:none" data-a="freeBack">${ic("arrow")} משחקים</button>` : ""}${playing
      ? `<button class="btn gold big" style="flex:1" data-a="mnCash" ${g.revealed.length ? "" : "disabled"}>CASH OUT · ${fmt(Math.floor(g.stake * g.mult))}</button>`
      : `<button class="btn gold big" style="flex:1" data-a="mnStart">${ic("play")} התחל${A.sideAmt ? ` · ${fmt(A.sideAmt)}` : ""}</button>`}</div>`;
    return { head: headHTML(v, { title: "MINES", noStrip: true, info: "mines" }), body, foot };
  }
  function minesAfterRender() {
    const v = A.view; const g = v && v.side && v.side.mines; if (!g || !$(".mgrid5")) return;
    const key = g.id + ":" + g.status + ":" + g.revealed.length;
    if (A.minesKey === undefined) { A.minesKey = key; return; }
    if (A.minesKey === key) return; A.minesKey = key;
    const at = (el) => { const grid = $(".mgrid5"); if (!el || !grid) return; const a = el.getBoundingClientRect(), b = grid.getBoundingClientRect(); return [grid, a.left - b.left + a.width / 2, a.top - b.top + a.height / 2]; };
    if (g.status === "bust") { SND.play("boom"); addTrauma(0.55); vib([60, 40, 120]); pop($(".mcell.boom")); const p = at($(".mcell.boom")); if (p) TABLE.burst(p[0], p[1], p[2], "boom"); }
    else if (g.status === "cashed") { SND.play("cashout"); juice(g.mult >= 5 ? "big" : "medium", $(".mgrid5"), g.mult >= 5 ? `${g.mult}×!` : undefined); }
    else if (g.revealed.length) { SND.play("gem"); const cs = document.querySelectorAll(".mcell"); const cell = cs[g.revealed[g.revealed.length - 1]]; pop(cell); const p = at(cell); if (p) TABLE.burst(p[0], p[1], p[2], "gem"); }
  }


  // ───────── shared bits for solo table games ─────────
  // suits as small SVGs (an iPhone may draw ♥ and ♦ as colour emoji)
  const SUIT_P = ["M12 3C9 7.5 4 10 4 14a4 4 0 0 0 7 2.6L10 21h4l-1-4.4A4 4 0 0 0 20 14c0-4-5-6.5-8-11z", "M12 20.5S3.5 15 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2C20.5 15 12 20.5 12 20.5z", "M12 2.5l7 9.5-7 9.5-7-9.5z", "M12 3a3.6 3.6 0 0 0-3.3 5A3.6 3.6 0 1 0 10.8 15L10 21h4l-.8-6A3.6 3.6 0 1 0 15.3 8 3.6 3.6 0 0 0 12 3z"];
  const SUITS = SUIT_P.map((d) => `<svg class="suit" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`), RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  function pcard(c, cls = "", style = "") {
    if (!c) return `<div class="pcard back ${cls}" style="${style}"><span>${gi("salad")}</span></div>`;
    const red = c.s === 1 || c.s === 2;
    return `<div class="pcard ${red ? "red" : ""} ${cls}" style="${style}"><b>${RANKS[c.r]}</b><i>${SUITS[c.s]}</i><em>${SUITS[c.s]}</em></div>`;
  }
  function soloFoot(main) {
    const v = A.view; const ro = v && v.round && v.round.roulette;
    if (ro && ro.solo) {
      if (ro.done[v.me] !== undefined) return breakWaitFoot(v);
      const started = v.side && v.side[ro.kind];
      return `<div class="row" style="gap:8px">${started ? "" : `<button class="btn sm" style="flex:none" data-a="soloSkip">דלג</button>`}${main}</div>`;
    }
    return `<div class="row" style="gap:8px"><button class="btn sm" style="flex:none" data-a="freeBack">${ic("arrow")} משחקים</button>${main}</div>`;
  }
  function breakWaitFoot(v) {
    const ro = v.round.roulette; const n = v.players.filter((p) => ro.done[p.id] !== undefined).length;
    if (ro.results) return v.isHost ? `<button class="btn gold big" data-a="host" data-v="continue">לשאלה הבאה ▶</button>` : `<div class="waitbox">ממתינים למארח...</div>`;
    return `<div class="waitbox">${ic("check")} סיימת · מחכים לשאר (${n}/${v.players.length})</div>${v.isHost ? `<button class="btn sm ghost" style="width:100%;margin-top:4px" data-a="host" data-v="continue">לסגור את ההפסקה עכשיו</button>` : ""}`;
  }
  function soloHead(v, title, k) { return headHTML(v, { title, noStrip: true, info: k }); }

  // ───────── DICE ─────────
  function diceZones(chance, over) { const t = over ? 100 - chance : chance; return { t, win: over ? [t, 100] : [0, t] }; }
  function diceScreen(v) {
    const max = v.caps.wheel; const chance = A.diceChance || 49.5; const over = A.diceDir !== "under"; const z = diceZones(chance, over); const m = TGG.diceMult(chance);
    const last = v.side && v.side.dice; const hist = (A.diceHist || []).slice(-8);
    const body = `<div class="dicebox"><div class="droll mx" id="dRoll">${last ? last.roll.toFixed(2) : "50.00"}</div>
        <div class="dtrack" id="dTrack"><div class="dwin" id="dWin" style="left:${z.win[0]}%;width:${z.win[1] - z.win[0]}%"></div><div class="dmark" id="dMark" style="left:${last ? last.roll : 50}%"><span>${gi("dice")}</span></div></div>
        <div class="dscale mx"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        <div class="dhist">${hist.map((h) => `<span class="${h.win ? "pos" : "neg"}">${h.roll.toFixed(2)}</span>`).join("")}</div></div>
      <div class="betpanel"><div class="dstats"><div><small>מכפיל</small><b class="mx" id="dMult">${m.toFixed(2)}×</b></div><div><small>${over ? "גבוה מ-" : "נמוך מ-"}</small><b class="mx" id="dTarget">${z.t.toFixed(2)}</b></div><div><small>סיכוי לזכות</small><b class="mx" id="dChance">${chance.toFixed(1)}%</b></div></div>
        <input type="range" class="dslider" id="dSlider" min="${TGG.DICE.min}" max="${TGG.DICE.max}" step="0.5" value="${chance}" aria-label="סיכוי לזכות">
        <div class="seg" style="margin:6px 0"><button class="${over ? "sel" : ""}" data-a="dDir" data-v="over">${ic("up")} גבוה מ-</button><button class="${!over ? "sel" : ""}" data-a="dDir" data-v="under">${ic("down")} נמוך מ-</button></div>
        ${betField("side", A.sideAmt || 0, max)}</div>`;
    const foot = soloFoot(`<button class="btn gold big" style="flex:1" data-a="diceRoll">${ic("play")} זרוק${A.sideAmt ? ` · ${fmt(A.sideAmt)}` : ""}</button>`);
    return { head: soloHead(v, "DICE", "dice"), body, foot };
  }
  function diceLive(el) { // slider drag: update numbers without re-rendering
    const chance = Number(el.value); const over = A.diceDir !== "under"; const z = diceZones(chance, over);
    $("#dMult").textContent = TGG.diceMult(chance).toFixed(2) + "×"; $("#dTarget").textContent = z.t.toFixed(2); $("#dChance").textContent = chance.toFixed(1) + "%";
    const w = $("#dWin"); w.style.left = z.win[0] + "%"; w.style.width = z.win[1] - z.win[0] + "%";
  }
  function diceAfterRender() {
    const v = A.view; const d = v && v.side && v.side.dice; const mk = $("#dMark"); if (!mk) return;
    if (!d) { A.diceSeen = 0; return; } if (A.diceSeen == null) { A.diceSeen = d.id; return; } if (A.diceSeen === d.id) return; A.diceSeen = d.id;
    (A.diceHist = A.diceHist || []).push({ roll: d.roll, win: d.win }); const rollEl = $("#dRoll"); const from = 50;
    SND.play("dice"); mk.animate([{ left: from + "%" }, { left: d.roll + "%" }], { duration: prefs.reduce ? 10 : 650, easing: "cubic-bezier(.2,.9,.3,1.15)" });
    const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 650); rollEl.textContent = (k < 1 ? Math.random() * 100 : d.roll).toFixed(2); if (k < 1) requestAnimationFrame(step); else { rollEl.classList.add(d.win ? "pos" : "neg"); pop(rollEl);
      if (d.win) { SND.play(d.mult >= 10 ? "jackpot" : "coins"); juice(d.mult >= 10 ? "big" : "small", rollEl, d.mult >= 10 ? `${d.mult.toFixed(2)}×!` : undefined); } else { SND.play("wrong"); addTrauma(0.15); } } };
    rollEl.classList.remove("pos", "neg"); requestAnimationFrame(step);
  }

  // ───────── HIGH-LOW ─────────
  function hiloScreen(v) {
    const g = v.side && v.side.hilo; const playing = g && g.status === "playing"; const max = v.caps.wheel;
    const trail = g ? g.trail.map((t) => `<div class="hlt">${pcard(t.c, "mini")}<span class="${t.g === "skip" ? "muted" : t.ok ? "pos" : "neg"}">${t.g === "skip" ? ic("next") : t.g === "hi" ? ic("up") : ic("down")}</span></div>`).join("") : "";
    const info = playing ? `<div class="oddsrow"><span>מכפיל <b class="pos mx">${g.mult}×</b></span><b class="mx">${fmt(Math.floor(g.stake * g.mult))}</b></div>`
      : g ? `<div class="oddsrow"><span>${g.status === "bust" ? "טעות, הסבב נגמר" : `${ic("check")} יצאת ב-${mx(g.mult)}`}</span><b class="mx ${g.status === "bust" ? "neg" : "pos"}">${g.status === "bust" ? "-" + fmt(g.stake) : "+" + fmt(Math.floor(g.stake * g.mult) - g.stake)}</b></div>` : `<p class="small muted center" style="margin:2px 0">יוצא קלף. נחשו אם הבא יהיה גבוה או נמוך ממנו. A הכי נמוך, K הכי גבוה.</p>`;
    const card = g ? g.card : { r: 7, s: 0 };
    const btn = (dir, o) => { const dis = !playing || o.p >= 1; return `<button class="btn hlbtn ${dir}" data-a="hlGuess" data-v="${dir}" ${dis ? "disabled" : ""}><b>${dir === "hi" ? `${ic("up")} גבוה או שווה` : `${ic("down")} נמוך או שווה`}</b><small class="mx">${o.p >= 1 ? "—" : `${o.m}× · ${Math.round(o.p * 100)}%`}</small></button>`; };
    const body = `${info}<div class="hlstage"><div class="hltrail">${trail}</div><div class="hlcard" id="hlCard">${pcard(card, "big")}</div></div>
      ${playing ? `<div class="row" style="gap:8px">${btn("hi", g.hi)}${btn("lo", g.lo)}</div><button class="btn sm" style="width:100%;margin-top:6px" data-a="hlSkip">⤼ דלג על הקלף (בחינם)</button>`
        : `<div class="betpanel">${betField("side", A.sideAmt || 0, max)}</div>`}`;
    const foot = soloFoot(playing ? `<button class="btn gold big" style="flex:1" data-a="hlCash" ${g.steps ? "" : "disabled"}>CASH OUT · ${fmt(Math.floor(g.stake * g.mult))}</button>`
      : `<button class="btn gold big" style="flex:1" data-a="hlStart">🃏 התחל${A.sideAmt ? ` · ${fmt(A.sideAmt)}` : ""}</button>`);
    return { head: soloHead(v, "HIGH-LOW", "hilo"), body, foot };
  }
  function hiloAfterRender() {
    const v = A.view; const g = v && v.side && v.side.hilo; if (!$("#hlCard")) return; if (!g) { A.hiloKey = ""; return; }
    const key = g.id + ":" + g.trail.length + ":" + g.status; if (A.hiloKey === undefined) { A.hiloKey = key; return; } if (A.hiloKey === key) return;
    const fresh = !A.hiloKey.startsWith(g.id + ":"); A.hiloKey = key;
    const c = $("#hlCard .pcard"); if (c) { c.classList.add("flipin"); SND.play("card"); }
    if (fresh) return;
    const lastT = g.trail[g.trail.length - 1];
    if (g.status === "bust") setTimeout(() => { SND.play("wrong"); addTrauma(0.35); vib([40, 30, 80]); }, 250);
    else if (g.status === "cashed") { SND.play("cashout"); juice(g.mult >= 5 ? "big" : "medium", $("#hlCard"), g.mult >= 5 ? `${g.mult}×!` : undefined); }
    else if (lastT && lastT.g !== "skip") setTimeout(() => { SND.play("select"); pop($(".oddsrow b")); }, 220);
  }

  // ───────── BLACKJACK ─────────
  function bjScreen(v) {
    const g = v.side && v.side.bj; const playing = g && g.status === "playing"; const max = v.caps.wheel; const me = playerById(v, v.me);
    const seen = A.bjAnim && g && A.bjAnim.id === g.id ? A.bjAnim : null;
    const row = (cards, who) => cards.map((c, i) => pcard(c, "deal", `--i:${i}`)).join("");
    const tot = (t) => (t ? `${t.t}${t.soft && t.t < 21 ? ` / ${t.t - 10}` : ""}` : "");
    const resTxt = g && g.status === "done" ? { bj: ["בלאק ג׳ק! ×2.5", "pos"], win: ["ניצחת!", "pos"], dbust: ["הדילר נשרף! ניצחת", "pos"], push: ["תיקו, ההימור חוזר", ""], lose: ["הדילר ניצח", "neg"], bust: ["עברת 21", "neg"] }[g.result] : null;
    const body = `<div class="bjtable"><div class="bjside"><div class="bjlbl">דילר <span class="bjt mx">${g ? tot(g.dt) : ""}</span></div><div class="bjcards" id="bjD">${g ? row(g.d, "d") : pcard(null) + pcard(null)}</div></div>
        <div class="bjmid">${resTxt ? `<div class="bjres ${resTxt[1]}" id="bjRes">${resTxt[0]}${g.payout ? ` <b class="mx">+${fmt(g.payout)}</b>` : ""}</div>` : `<div class="bjrule">BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17</div>`}</div>
        <div class="bjside"><div class="bjcards" id="bjP">${g ? row(g.p, "p") : ""}</div><div class="bjlbl">אתה <span class="bjt mx">${g ? tot(g.pt) : ""}</span>${g ? ` <span class="tiny muted">· הימור ${fmt(g.bet)}${g.doubled ? " (דאבל)" : ""}</span>` : ""}</div></div></div>
      ${playing ? "" : `<div class="betpanel">${betField("side", A.sideAmt || 0, max)}</div>`}`;
    const canDouble = playing && g.p.length === 2 && me && me.coins >= g.stake;
    const foot = playing ? `<div class="row bjbtns" style="gap:6px"><button class="btn big" data-a="bjAct" data-v="hit">HIT<small>קלף</small></button><button class="btn big" data-a="bjAct" data-v="stand">STAND<small>עוצר</small></button><button class="btn big gold" data-a="bjAct" data-v="double" ${canDouble ? "" : "disabled"}>DOUBLE<small>כפול</small></button></div>`
      : soloFoot(`<button class="btn gold big" style="flex:1" data-a="bjDeal">${ic("play")} חלק${A.sideAmt ? ` · ${fmt(A.sideAmt)}` : ""}</button>`);
    return { head: soloHead(v, "BLACKJACK", "bj"), body, foot };
  }
  function bjAfterRender() {
    const v = A.view; const g = v && v.side && v.side.bj; if (!$("#bjD")) return; if (!g) { A.bjAnim = null; return; }
    const prev = A.bjAnim && A.bjAnim.id === g.id ? A.bjAnim : { id: g.id, p: 0, d: 0, done: false, first: A.bjAnim === undefined };
    if (prev.first) { A.bjAnim = { id: g.id, p: g.p.length, d: g.d.length, done: g.status === "done" }; return; }
    const pc = $("#bjP").children, dc = $("#bjD").children; let t = 0; const gap = prefs.reduce ? 0 : 0.42;
    const order = prev.p === 0 ? [["p", 0], ["d", 0], ["p", 1], ["d", 1]] : [];
    const seq = order.length ? order : [];
    for (let i = prev.p; i < g.p.length; i++) if (!seq.some(([w, k]) => w === "p" && k === i)) seq.push(["p", i]);
    if (prev.d === 0) { for (let i = 2; i < g.d.length; i++) seq.push(["d", i]); }
    else { if (g.status === "done" && !prev.done) seq.push(["dflip", 1]); for (let i = Math.max(prev.d, 2); i < g.d.length; i++) seq.push(["d", i]); }
    Array.from(pc).forEach((el) => (el.style.opacity = 1)); Array.from(dc).forEach((el) => (el.style.opacity = 1));
    for (const [w, k] of seq) {
      const el = w === "p" ? pc[k] : dc[k]; if (!el) continue;
      if (w === "dflip") { el.style.animation = `flipin .45s ${t}s both`; setTimeout(() => SND.play("flip"), t * 1000); t += gap; continue; }
      el.style.animation = `dealin .38s ${t}s both`; setTimeout(() => SND.play("card"), t * 1000); t += gap;
    }
    const res = $("#bjRes"); if (res && !prev.done) { res.style.animation = `fadeup .3s ${t}s both`;
      setTimeout(() => { const win = ["bj", "win", "dbust"].includes(g.result); if (win) { SND.play(g.result === "bj" ? "jackpot" : "cashout"); juice(g.result === "bj" ? "big" : "medium", res, g.result === "bj" ? "BLACKJACK!" : undefined); } else if (g.result === "push") SND.play("chip"); else { SND.play("wrong"); addTrauma(0.25); } }, t * 1000 + 150); }
    A.bjAnim = { id: g.id, p: g.p.length, d: g.d.length, done: g.status === "done" };
  }


  // ───────── HOW TO PLAY: one sheet per game ─────────
  const GAME_ORDER = ["quiz", "crash", "wheel", "slots", "plinko", "mines", "bj", "hilo", "dice"];
  function gameRules(k) {
    const C = TGG.CONST, OM = C.OWN_MULT, W = TGG.WHEEL, tw = W.reduce((a, x) => a + x.w, 0);
    const steps = (a) => `<ol class="howsteps">${a.map((x) => `<li>${x}</li>`).join("")}</ol>`;
    const R = {
      quiz: { when: "המשחק הראשי · כל שאלה", rtp: "משחק ידע: מי שמכיר את החבר׳ה מרוויח", body: steps([
        "<b>הימורים (20 שניות):</b> לפני שרואים את התשובות מהמרים כמה אתם בטוחים שתצדקו, על חבר שיצדק או יטעה, ובשאלות מספר גם מעל/מתחת.",
        "<b>תשובה:</b> עונים על השאלה. מהר יותר = בונוס מהירות. רצף תשובות נכונות = בונוס רצף.",
        "<b>חשיפה:</b> רואים מי צדק, את המקור מהקבוצה, ואת הזכיות בהימורים."]) +
        `<table class="rules"><tr><td>על עצמך לפי קושי</td><td class="mx">×${OM.EASY} · ×${OM.MEDIUM} · ×${OM.HARD} · ×${OM.INSANE}</td></tr><tr><td>על חבר (יצדק/יטעה)</td><td class="mx">×2</td></tr><tr><td>מעל/מתחת</td><td class="mx">×2</td></tr><tr><td>FINAL JACKPOT (שאלה אחרונה, עד חצי מהיתרה)</td><td class="mx">×${C.FINAL_MULT}</td></tr></table>` },
      crash: { when: "הפסקת קזינו · כולם משחקים יחד", rtp: "~96%", body: steps([
        "מכניסים סכום, ואם רוצים קובעים <b>יציאה אוטומטית</b> (למשל ×2). אפשר גם לצפות בלי להמר.",
        "אחרי ספירה לאחור הרקטה ממריאה, והמכפיל עולה משנייה לשנייה.",
        "לוחצים <b>CASH OUT</b> מתי שרוצים: מקבלים את ההימור כפול המכפיל באותו רגע.",
        "אם הרקטה מתפוצצת לפני שיצאתם, ההימור הולך. אף אחד לא יודע מראש מתי היא תתפוצץ."]) +
        `<table class="rules"><tr><td>סיכוי להגיע ל-×2</td><td>48%</td></tr><tr><td>סיכוי להגיע ל-×5</td><td>19%</td></tr><tr><td>סיכוי להגיע ל-×10</td><td>9.6%</td></tr><tr><td>פיצוץ מיידי</td><td>4%</td></tr></table>` },
      wheel: { when: "הפסקת קזינו · כולם משחקים יחד", rtp: "~96% · רווח ב-27% מהסיבובים", body: steps(["בוחרים סכום ונועלים.", "הגלגל מסתובב לכולם יחד, וכל אחד מקבל את הסכום שלו כפול המכפיל שיצא."]) +
        `<table class="rules">${W.map((w) => `<tr><td>${{ lose: "הפסד", refund: "החזר" }[w.id] || w.label}</td><td class="mx">×${w.mult} · ${Math.round((w.w / tw) * 100)}%</td></tr>`).join("")}</table>` },
      slots: { when: "הפסקת קזינו · כולם משחקים יחד", rtp: "~96% · רווח ב-32% מהמשיכות", body: steps(["בוחרים סכום ומושכים.", "שלוש גלגלות עוצרות אחת אחרי השנייה. הסמלים הם האווטרים שלכם, 🪙 ו-🥗.", "כששני הראשונים זהים, הגלגלת האחרונה מאטה לקצת מתח."]) +
        `<table class="rules">${TGG.SLOT_PAYS.map((p) => `<tr><td>${esc(p.label)}</td><td class="mx">×${p.mult}</td></tr>`).join("")}</table>` },
      plinko: { when: "הפסקת קזינו · כל אחד סיבוב אחד", rtp: "~96%", body: steps(["בוחרים רמת סיכון וסכום.", "משחררים כדור. הוא קופץ בין היתדות ונוחת באחת הקופסאות למטה.", "מקבלים את ההימור כפול המספר על הקופסה. בקצוות המכפילים הגדולים, באמצע הקטנים."]) +
        `<table class="rules"><tr><td>סיכון נמוך</td><td class="mx">${TGG.PLINKO.low.join(" · ")}</td></tr><tr><td>סיכון גבוה</td><td class="mx">${TGG.PLINKO.high.join(" · ")}</td></tr></table>` },
      mines: { when: "הפסקת קזינו · כל אחד סיבוב אחד", rtp: "~96%", body: steps(["בוחרים כמה מוקשים יש בלוח (1, 3, 5 או 10) וסכום.", "פותחים משבצות. כל 💎 מעלה את המכפיל.", "מתי שרוצים לוחצים CASH OUT. אם פותחים 💣, מפסידים את ההימור."]) +
        `<table class="rules">${TGG.MINES.counts.map((m) => `<tr><td>${m} מוקשים: אחרי 1 / 3 / 5 יהלומים</td><td class="mx">×${TGG.minesMult(m, 1)} · ×${TGG.minesMult(m, 3)} · ×${TGG.minesMult(m, 5)}</td></tr>`).join("")}</table>` },
      bj: { when: "הפסקת קזינו · כל אחד סיבוב אחד", rtp: "~99% במשחק מושלם", body: steps([
        "מקבלים שני קלפים, וגם הדילר (אחד מהם הפוך). המטרה: להגיע הכי קרוב ל-21 בלי לעבור.",
        "<b>HIT</b> = עוד קלף. <b>STAND</b> = עוצרים. <b>DOUBLE</b> = מכפילים את ההימור ומקבלים קלף אחד בלבד.",
        "אחרי שעוצרים, הדילר הופך את הקלף ומושך עד שיש לו 17 לפחות.",
        "מי שקרוב יותר ל-21 מנצח. מעל 21 = נשרפים."]) +
        `<table class="rules"><tr><td>A</td><td>1 או 11</td></tr><tr><td>J · Q · K</td><td>10</td></tr><tr><td>ניצחון</td><td class="mx">×2</td></tr><tr><td>בלאק ג׳ק (A + 10 בשני קלפים)</td><td class="mx">×2.5</td></tr><tr><td>תיקו</td><td>ההימור חוזר</td></tr></table>
        <p class="tiny muted">טיפ: עם 12–16 מול קלף של הדילר בין 2 ל-6, עדיף לעצור. עם 11 עדיף DOUBLE. אין פיצול זוגות.</p>` },
      hilo: { when: "הפסקת קזינו · כל אחד סיבוב אחד", rtp: "~96%", body: steps(["בוחרים סכום ומתחילים. יוצא קלף.", "מנחשים אם הקלף הבא יהיה <b>גבוה או שווה</b> או <b>נמוך או שווה</b>. A הכי נמוך, K הכי גבוה.", "כל ניחוש נכון מגדיל את המכפיל. ניחוש קשה יותר = קפיצה גדולה יותר. אפשר לדלג על קלף בחינם.", "CASH OUT מתי שרוצים. ניחוש שגוי = מפסידים את ההימור."]) +
        `<table class="rules"><tr><td>על 7: גבוה או שווה (54%)</td><td class="mx">×${Math.floor(96 / (7 / 13)) / 100}</td></tr><tr><td>על Q: גבוה או שווה (15%)</td><td class="mx">×${Math.floor(96 / (2 / 13)) / 100}</td></tr><tr><td>על 3: נמוך או שווה (23%)</td><td class="mx">×${Math.floor(96 / (3 / 13)) / 100}</td></tr></table>` },
      dice: { when: "הפסקת קזינו · כל אחד סיבוב אחד", rtp: "~96%", body: steps(["גוררים את הסרגל כדי לבחור סיכוי לזכות (2%–95%). ככל שהסיכוי קטן, המכפיל גדל.", "בוחרים אם המספר צריך לצאת <b>גבוה מ-</b> או <b>נמוך מ-</b> היעד.", "זורקים: יוצא מספר בין 0.00 ל-99.99. נפל באזור הירוק = זכייה."]) +
        `<table class="rules"><tr><td>סיכוי 50%</td><td class="mx">×${TGG.diceMult(50).toFixed(2)}</td></tr><tr><td>סיכוי 25%</td><td class="mx">×${TGG.diceMult(25).toFixed(2)}</td></tr><tr><td>סיכוי 10%</td><td class="mx">×${TGG.diceMult(10).toFixed(2)}</td></tr><tr><td>סיכוי 2%</td><td class="mx">×${TGG.diceMult(2).toFixed(2)}</td></tr></table>` },
    };
    return R[k];
  }
  function gameInfo(k) {
    const g = GAMES[k], r = gameRules(k); if (!g || !r) return; SND.play("phase");
    modal(`${exampleSlide(k)}
      <details class="gidet"><summary>כל הפרטים: תשלומים וסיכויים <span class="badge green">החזר ${r.rtp}</span></summary>${r.body}</details><p class="tiny muted">מטבעות וירטואליים בלבד, בשביל הכיף.</p>
      <div class="row" style="gap:8px"><button class="btn sm" data-a="rulesHub">כל המשחקים</button><button class="btn pri" style="flex:1" data-close>הבנתי</button></div>`);
  }
  function rulesHub() {
    modal(`<h2 class="row" style="gap:8px">${ic("book")} איך משחקים</h2><p class="small muted">בחרו משחק כדי לראות הסבר, תשלומים וסיכויים.</p>
      <div class="list">${GAME_ORDER.map((k) => `<button class="li" data-a="gameInfo" data-v="${k}"><span class="gimini">${tileArt(k)}</span><span class="grow"><b>${GAMES[k].name}</b><br><span class="tiny muted">${gameRules(k).when}</span></span><span class="chev">‹</span></button>`).join("")}</div>
      <button class="btn pri" data-close>סגור</button>`);
  }


  // ───────── CASINO BREAKS: intro slide → play one round → everyone's results ─────────
  const SOLO_SCREENS = { plinko: () => plinkoScreen, mines: () => minesScreen, dice: () => diceScreen, hilo: () => hiloScreen, bj: () => bjScreen };
  function stripBetpanel(html) {
    const i = html.indexOf('<div class="betpanel">'); if (i < 0) return html;
    let depth = 0, j = i; const re = /<\/?div\b[^>]*>/g; re.lastIndex = i; let m;
    while ((m = re.exec(html))) { depth += m[0][1] === "/" ? -1 : 1; if (depth === 0) { j = re.lastIndex; break; } }
    return html.slice(0, i) + html.slice(j);
  }
  function breakTitle(v) { const ro = v.round.roulette; const st = v.route && v.route.stops; const idx = st ? st.findIndex((x) => x.at === v.round.n) : -1; return `הפסקת קזינו ${idx >= 0 ? `${idx + 1}/${st.length}` : ""}`; }
  function breakIntroScreen(v) {
    const ro = v.round.roulette; const k = ro.kind; const g = GAMES[k];
    const body = `<div class="brkintro"><div class="brkkicker">${ic("chips")} ${breakTitle(v)} · ${ro.solo ? "כל אחד משחק סיבוב אחד" : "כולם משחקים יחד"}</div>${exampleSlide(k)}</div>`;
    const foot = `<div class="row" style="gap:8px">${ro.solo ? `<button class="btn sm" style="flex:none" data-a="soloSkip">לא משתתף</button>` : ""}<button class="btn gold big" style="flex:1" data-a="breakGo">הבנתי, בוא נשחק ▶</button></div>`;
    return { head: headHTML(v, { title: g.name, noStrip: true }), body, foot };
  }
  function soloBreakScreen(v) {
    const ro = v.round.roulette; const k = ro.kind; const mine = ro.done[v.me];
    const lingerLeft = A.soloDoneAt && A.soloDoneAt.n === ro.breakNo ? 2600 - (Date.now() - A.soloDoneAt.t) : 0;
    if (ro.results && lingerLeft <= 0) return soloResultsScreen(v);
    if (ro.results && lingerLeft > 0 && !A.lingerTimer) A.lingerTimer = setTimeout(() => { A.lingerTimer = null; render(); }, lingerLeft + 60);
    if (mine === null && !ro.results) return { head: headHTML(v, { title: GAMES[k].name, noStrip: true, info: k }), body: `<div class="brkskip"><div style="font-size:46px">${ic("next")}</div><h3>דילגת על הסיבוב הזה</h3><p class="small muted">מחכים שכולם יסיימו, ואז רואים מי הרוויח.</p>${breakProgress(v)}</div>`, foot: breakWaitFoot(v) };
    A._brkDone = mine !== undefined;
    const sc = SOLO_SCREENS[k]()(v); A._brkDone = false;
    const body = (mine !== undefined ? stripBetpanel(sc.body) : sc.body) + (mine !== undefined ? breakProgress(v) : "");
    return { head: sc.head, body, foot: sc.foot };
  }
  function breakProgress(v) {
    const ro = v.round.roulette;
    return `<div class="brkprog">${v.players.map((p) => { const d = ro.done[p.id]; return `<span class="bp ${d === undefined ? "" : d === null ? "skip" : "ok"}">${avatar(p, "xs")}${d === undefined ? "…" : d === null ? "דילג" : "✓"}</span>`; }).join("")}</div>`;
  }
  function soloResultsScreen(v) {
    const ro = v.round.roulette; const rows = v.players.map((p) => ({ p, r: ro.results[p.id] })).sort((a, b) => (b.r ? b.r.delta : -1e9) - (a.r ? a.r.delta : -1e9));
    const best = rows[0] && rows[0].r && rows[0].r.delta > 0 ? rows[0].p.id : null;
    const list = rows.map(({ p, r }) => `<div class="rrow ${p.id === v.me ? "me" : ""} ${p.id === best ? "best" : ""}">${avatar(p, "xs")}<b class="nm">${esc(p.name)}${p.id === best ? ` ${ic("trophy")}` : ""}</b>
      ${r ? `<span class="small muted">${fmt(r.stake)} → <span class="mx">${esc(r.label)}</span></span><span class="cn ${r.delta > 0 ? "pos" : r.delta < 0 ? "neg" : ""}">${sgn(r.delta)}</span>` : `<span class="small muted">דילג</span>`}</div>`).join("");
    let mid = `<div class="giart big">${tileArt(ro.kind)}</div><div class="rtable">${list}</div>`;
    if (v.players.length === 1) {
      const r = ro.results[v.me]; const me = playerById(v, v.me); const d = r ? r.delta : 0;
      const left = ((v.progress && v.progress.total) || 25) - ((v.round && v.round.n) || 0);
      const line = !r ? "דילגת הפעם, המטבעות שלך נשארו כמו שהיו" : d > 0 ? "יצאת ברווח מההפסקה" : d < 0 ? "הקזינו לקח הפעם" : "יצאת באפס";
      mid = `<div class="brksum ${d > 0 ? "up" : d < 0 ? "down" : ""}"><div class="giart">${tileArt(ro.kind)}</div><small>${line}</small><b class="mx bs-d">${r ? sgn(d) : "0"}</b>
        ${r ? `<span class="small muted">${fmt(r.stake)} → <span class="mx">${esc(r.label)}</span></span>` : ""}
        <div class="bs-row"><span>${ic("coin")} יתרה <b class="mx">${fmt(me.coins)}</b></span><span>${ic("star")} ניקוד <b class="mx">${fmt(me.score || 0)}</b></span></div>
        ${left > 0 ? `<p class="small" style="margin:4px 0 0">עוד ${left} שאלות לסיום${left > 5 ? " · ועוד הפסקת קזינו בדרך" : " · זו הייתה ההפסקה האחרונה"}</p>` : ""}</div>`;
    }
    const body = `<div class="brkres"><div class="brkkicker">${ic("chips")} ${breakTitle(v)} · תוצאות</div>${mid}</div>`;
    return { head: headHTML(v, { title: GAMES[ro.kind].name, noStrip: true, info: ro.kind }), body, foot: breakWaitFoot(v) };
  }

  // ───────── EXAMPLE SLIDES: one clear worked example per game ─────────
  function exampleSlide(k) {
    const g = GAMES[k]; const O = TGG.CONST.OWN_MULT;
    const steps = (a) => `<ol class="exsteps">${a.map(([ic, t]) => `<li><span class="exic">${ic}</span><span>${t}</span></li>`).join("")}</ol>`;
    const ex = (t) => `<div class="exbox"><b>דוגמה</b>${t}</div>`;
    const mock = {
      quiz: `<div class="mk-q"><div class="mk-qt"><span class="lvl l3">רמה 3</span> מי מהחבר׳ה אמר “אני כבר בדרך”? <b class="mx" style="color:#e8b84a">⏱ 21</b></div><div class="mk-opts">${["A פולצ׳ק", "B טגו", "C מוצרלה", "D יוני"].map((x, i) => `<span class="${i === 1 ? "on" : ""}">${x}</span>`).join("")}</div><div class="mk-chip">${ic("chips")} הימור 1,000 · <span class="mx">×${TGG.SOLO.MULT[3]}</span></div></div>`,
      crash: `<div class="mk-crash"><svg viewBox="0 0 200 90"><path d="M6 84 Q110 80 150 30" fill="none" stroke="#e8b84a" stroke-width="4" stroke-linecap="round"/></svg><span class="mk-rk">${gi("rocket")}</span><b class="mx">2.40×</b><span class="mk-btn">CASH OUT · 1,200</span></div>`,
      wheel: `<div class="mk-art">${tileArt("wheel")}</div>`,
      slots: `<div class="mk-slots">${["tego", "tego", "tego"].map((x) => `<span>${AVIMG[x] ? `<img src="${AVIMG[x].face}" alt="">` : gi("salad")}</span>`).join("")}</div>`,
      plinko: `<div class="mk-plinko"><svg viewBox="0 0 200 110">${Array.from({ length: 5 }, (_, r) => Array.from({ length: r + 3 }, (_, j) => `<circle cx="${100 + (j - (r + 2) / 2) * 22}" cy="${12 + r * 17}" r="2.6" fill="#efe6d4"/>`).join("")).join("")}<path d="M100 2 L89 20 L100 37 L111 54 L122 71 L133 92" fill="none" stroke="#d94a55" stroke-width="2" stroke-dasharray="3 3"/><circle cx="133" cy="92" r="5" fill="#d94a55"/>${[5.6, 2, 1.1, 0.5, 1.1, 2, 5.6].map((m, i) => `<rect x="${100 + (i - 3) * 22 - 10}" y="96" width="20" height="13" rx="3" fill="${m >= 5 ? "#ed4163" : m >= 2 ? "#e8b84a" : m >= 1 ? "#e8b84a" : "#2e9b4f"}"/><text x="${100 + (i - 3) * 22}" y="106" text-anchor="middle" font-size="7" font-weight="900" fill="#05080a">${m}×</text>`).join("")}</svg></div>`,
      mines: `<div class="mk-mines">${Array.from({ length: 25 }, (_, i) => `<span class="${[6, 12, 13].includes(i) ? "gem" : i === 18 ? "bomb" : ""}">${[6, 12, 13].includes(i) ? gi("gem") : i === 18 ? gi("bomb") : ""}</span>`).join("")}</div>`,
      bj: `<div class="mk-bj"><div>${pcard({ r: 10, s: 0 }, "mini")}${pcard(null, "mini")}<small>דילר</small></div><div>${pcard({ r: 9, s: 1 }, "mini")}${pcard({ r: 13, s: 3 }, "mini")}<small>אתה: 19</small></div></div>`,
      hilo: `<div class="mk-hilo">${pcard({ r: 4, s: 2 }, "mini")}<span class="pos">${ic("up")}</span>${pcard({ r: 9, s: 0 }, "mini")}<span class="pos">⬇</span>${pcard({ r: 2, s: 1 }, "mini")}<b class="mx">${Math.floor(96 / ((10 / 13) * (9 / 13))) / 100}×</b></div>`,
      dice: `<div class="mk-dice"><b class="mx pos">72.15</b><div class="dtrack"><div class="dwin" style="left:50%;width:50%"></div><div class="dmark" style="left:72%"><span>${gi("dice")}</span></div></div></div>`,
    }[k];
    const hm1 = Math.floor(96 / (10 / 13)) / 100, hm2 = Math.floor(96 / ((10 / 13) * (9 / 13))) / 100;
    const body = {
      quiz: steps([[ic("timer"), "לכל שאלה <b>30–35 שניות</b>, והן כוללות גם את ההימור. <b>השעון לא עוצר</b> כשפותחים את חלון ההימור"], [ic("chips"), "שורת <b>ההימור</b> למטה פותחת חלונית: כמה להמר שתצדק. ברמה גבוהה יותר (1–4) אפשר להמר יותר והתשלום גבוה יותר: ×" + TGG.SOLO.MULT[1] + " · ×" + TGG.SOLO.MULT[2] + " · ×" + TGG.SOLO.MULT[3] + " · ×" + TGG.SOLO.MULT[4]], [ic("lock"), "<b>נועלים</b> תשובה והימור יחד ורואים מיד. בשאלת מספר בוחרים טווח על סרגל: טווח צר = מכפיל גבוה (עד ×6). נגמר הזמן = ננעל מה שבחרת"]]) + ex(`שאלה ברמה 3 (×${TGG.SOLO.MULT[3]}, עד ${fmt(TGG.SOLO.CAP[3])} ועד רבע מהיתרה). שמת 1,000 וצדקת → קיבלת ${fmt(1000 * TGG.SOLO.MULT[3])} (+${fmt(1000 * (TGG.SOLO.MULT[3] - 1))}). טעית → הפסדת 1,000.`),
      crash: steps([[ic("coin"), "בוחרים סכום (אפשר גם יציאה אוטומטית)"], [ic("up"), "הרקטה ממריאה והמכפיל עולה"], [ic("check"), "לוחצים <b>CASH OUT</b> לפני שהיא מתפוצצת"]]) + ex("שמת 500 ויצאת ב-×2.40 → קיבלת 1,200. אם היא מתפוצצת לפני שלחצת → ה-500 הלכו."),
      wheel: steps([[ic("coin"), "בוחרים סכום ונועלים"], [ic("refresh"), "הגלגל מסתובב לכולם יחד"], [ic("target"), "מקבלים את הסכום כפול המכפיל שיצא"]]) + ex("שמת 1,000 והגלגל עצר על ×2 → קיבלת 2,000. עצר על “הפסד” → הלכו ה-1,000."),
      slots: steps([[ic("coin"), "בוחרים סכום ומושכים"], [ic("chips"), "שלוש גלגלות עוצרות אחת אחרי השנייה"], [ic("star"), "שלושה זהים = זכייה גדולה"]]) + ex(`שמת 500 ויצאו שלושה אווטרים של אותו חבר → ×${TGG.SLOT_PAYS[1].mult} = ${fmt(500 * TGG.SLOT_PAYS[1].mult)}.`),
      plinko: steps([[ic("chart"), "בוחרים סיכון: נמוך או גבוה"], [ic("coin"), "בוחרים סכום ומשחררים כדור"], [ic("target"), "הכדור נוחת בקופסה, ומקבלים את המכפיל שעליה"]]) + ex("שמת 500 בסיכון נמוך והכדור נחת על ×2 → קיבלת 1,000. נחת על ×0.5 → קיבלת 250."),
      mines: steps([[ic("x"), "בוחרים כמה מוקשים מוחבאים בלוח"], [ic("star"), "פותחים משבצות. כל יהלום מעלה את המכפיל"], [ic("check"), "<b>CASH OUT</b> מתי שרוצים. מוקש = הפסדת"]]) + ex(`3 מוקשים, שמת 500 ופתחת 3 יהלומים → ×${TGG.minesMult(3, 3)}. לחצת CASH OUT → קיבלת ${fmt(Math.floor(500 * TGG.minesMult(3, 3)))}.`),
      bj: steps([["🃏", "מקבלים 2 קלפים. המטרה: הכי קרוב ל-21"], [ic("up"), "<b>HIT</b> עוד קלף · <b>STAND</b> עוצרים · <b>DOUBLE</b> כפול וקלף אחד"], [ic("user"), "הדילר מושך עד 17. מי שקרוב יותר מנצח"]]) + ex("קיבלת 9 ו-K, ביחד 19. לחצת STAND.<br>לדילר יצא 18, אז ניצחת: 500 הפכו ל-1,000."),
      hilo: steps([["🃏", "יוצא קלף. A הכי נמוך, K הכי גבוה"], [ic("chart"), "מנחשים: הבא <b>גבוה</b> או <b>נמוך</b> ממנו"], [ic("check"), "כל ניחוש נכון מעלה את המכפיל. <b>CASH OUT</b> מתי שרוצים"]]) + ex(`שמת 500. יצא 4, בחרת “גבוה” ויצא 9 ✓ (מכפיל ${mx(hm1)}).<br>על ה-9 בחרת “נמוך” ויצא 2 ✓ (מכפיל ${mx(hm2)}).<br>לחצת CASH OUT וקיבלת ${fmt(Math.floor(500 * hm2))}.`),
      dice: steps([[ic("chart"), "גוררים: בוחרים סיכוי לזכות (2%–95%)"], [ic("chart"), "בוחרים אם המספר יצא <b>גבוה מ-</b> או <b>נמוך מ-</b>"], [ic("play"), "זורקים 0–100. נפל בירוק = זכית"]]) + ex(`סיכוי 50%, “גבוה מ-50”, שמת 500. יצא 72.15 → ×${TGG.diceMult(50).toFixed(2)} = ${fmt(Math.floor(500 * TGG.diceMult(50)))}.`),
    }[k];
    return `<div class="exslide"><div class="exhead"><div class="exart">${tileArt(k)}</div><div><h2 class="en">${g.name}</h2><div class="tiny muted">${gameRules(k).when}</div></div></div><div class="exmock">${mock}</div>${body}</div>`;
  }

  // ───────── THE ROUTE: questions are the road, casino breaks are the stops ─────────
  function routeMap(v, compact) {
    const R = v.route; if (!R) return ""; const n = v.progress ? v.progress.n : 0; const segs = []; let from = 1;
    for (const st of R.stops) { segs.push({ q: [from, st.at] }); segs.push({ stop: st }); from = st.at + 1; }
    segs.push({ q: [from, R.total], final: true });
    const html = segs.map((sg) => {
      if (sg.q) { const [a, b] = sg.q; const state = n > b ? "past" : n >= a ? "now" : ""; return `<div class="rt-q ${state}"><b class="mx">${a === b ? a : `${a}–${b}`}</b><small>${sg.final ? "+ שאלת הגמר" : "שאלות"}</small></div>`; }
      const k = sg.stop.kind; const state = n > sg.stop.at || (n === sg.stop.at && v.phase !== "roulette" && v.phase !== "reveal" && v.phase !== "answering" && v.phase !== "betting") ? "past" : n === sg.stop.at && v.phase === "roulette" ? "now" : "";
      return `<button class="rt-stop ${state}" ${k ? `data-a="gameInfo" data-v="${k}"` : ""}><span class="rt-art">${k ? tileArt(k) : ic("chips")}</span><small class="en">${k ? ({ slots: "SLOTS", wheel: "WHEEL", bj: "BLACKJACK", hilo: "HI-LO" }[k] || GAMES[k].name) : "קזינו"}</small></button>`;
    }).join(`<span class="rt-ln"></span>`);
    return `<div class="route ${compact ? "compact" : ""}">${html}</div>`;
  }

  // ───────── THE GUIDE: before the game, step by step ─────────
  // ═════ THE GUIDE: short, visual, with a real demo question to try ═════
  const DEMO_Q = { prompt: "של מי הכינוי “מוצרלה” בחבורה?", answer: "mozzarella", opts: ["polchak", "tego", "mozzarella", "yoni"], names: { polchak: "פולצ׳ק", tego: "טגו", mozzarella: "דוד", yoni: "יוני" } };
  function demoQuestion() {
    const g = A.guide || {}; const pick = g.demoPick; const bet = g.demoBet || 0; const L = 2, mult = TGG.SOLO.MULT[L];
    const opts = DEMO_Q.opts.map((id, k) => { const st = pick ? (id === DEMO_Q.answer ? "ok" : id === pick ? "bad" : "dim") : "";
      return `<button class="opt ${st}" data-gd="demoPick" data-v="${id}" ${pick ? "disabled" : ""}>${avatar({ id, avatar: "•", color: CH[id].color }, "xs")}<span class="grow">${DEMO_Q.names[id]}</span>${pick && id === DEMO_Q.answer ? `<span class="omark ok">${ic("check")}</span>` : pick && id === pick ? `<span class="omark bad">${ic("x")}</span>` : ""}</button>`; }).join("");
    const chips = [0, 500, 1000].map((b) => `<button class="dchip ${bet === b ? "on" : ""}" data-gd="demoBet" data-v="${b}" ${pick ? "disabled" : ""}>${b ? fmt(b) : "בלי הימור"}</button>`).join("");
    const win = pick === DEMO_Q.answer;
    const res = pick ? `<div class="reshero ${win ? "ok" : "bad"}"><span class="rh-ic">${ic(win ? "check" : "x")}</span><div class="rh-t"><b>${win ? "צדקת!" : "טעית"}</b><span class="${bet ? (win ? "pos" : "neg") : "muted"}">${bet ? (win ? `הרווחת ${fmt(bet * (mult - 1))} מטבעות` : `הפסדת ${fmt(bet)} מטבעות`) : "בלי הימור: רק ניקוד"}</span></div></div>
      <p class="gd-p small">${win ? "" : "התשובה: דוד הוא “מוצרלה”. "}${bet ? `שמת ${fmt(bet)} על שאלה ברמה 2 (×${mult}), אז ${win ? `קיבלת בחזרה ${fmt(bet * mult)}` : "ההימור הלך"}.` : "בפעם הבאה נסה לשים הימור, אם אתה בטוח."}</p><button class="linkbtn" data-gd="demoReset">${ic("refresh")} לנסות שוב</button>` : "";
    return `<div class="demoq"><div class="row" style="gap:6px;margin-bottom:6px"><span class="lvl l2">רמה 2 · בינונית</span><span class="tiny muted">שאלת אימון, לא נספרת</span></div>
      <div class="prompt">${DEMO_Q.prompt}</div><div class="opts">${opts}</div>
      ${pick ? res : `<div class="tiny muted" style="margin:6px 0 4px">כמה להמר שאתה צודק? (ההימור כאן לא אמיתי)</div><div class="dchips">${chips}</div><p class="tiny muted" style="margin:6px 0 0">בחר סכום ואז תשובה</p>`}</div>`;
  }
  function guideSteps(v) {
    const R = v.route; const M = TGG.SOLO.MULT;
    return [
      { t: "ברוכים הבאים", h: "איך זה עובד?", b: `<div class="gd-hero gd-chip"></div>
          <ol class="exsteps big"><li><span class="exic">${ic("user")}</span><span>משחקים <b>לבד</b>, כל אחד בטלפון שלו</span></li>
          <li><span class="exic">${ic("book")}</span><span><b>${R ? R.total : 25} שאלות</b> על החבורה, מהוואטסאפ שלכם</span></li>
          <li><span class="exic">${ic("coin")}</span><span>מתחילים עם <b>10,000 מטבעות</b> ומהמרים כמה אתם בטוחים</span></li>
          <li><span class="exic">${ic("share")}</span><span>בסוף <b>משתפים בקבוצה</b> ורואים מי ניצח</span></li></ol>` },
      { t: "הרקע", h: "שתי קבוצות, חבורה אחת", b: `<ol class="exsteps"><li><span class="exic">${ic("clock")}</span><span><b>הקבוצה הישנה</b> (2023–2024): הבית הראשון. היה בה גם <b>חמיאל</b>, ויוני עוד לא</span></li>
          <li><span class="exic">${ic("home")}</span><span><b>קבוצת סלט</b> (מאוקטובר 2024): התעוררה כשיוני הצטרף, ומאז היא הבית</span></li>
          <li><span class="exic">${ic("info")}</span><span>שאלה על סיפור פנימי? יש מתחתיה כפתור <b>“מה זה?”</b></span></li></ol>` },
      { t: "נסה בעצמך", h: "שאלת אימון", b: demoQuestion() },
      { t: "כמה מרוויחים", h: "ככל שהשאלה קשה יותר, ההימור משתלם יותר", b: `<p class="gd-p small">דוגמה: שמת <b>1,000</b> וצדקת</p>
          <div class="paytable">${[1, 2, 3, 4].map((l) => `<div><span class="lvl l${l}">רמה ${l}</span><b class="mx">×${M[l]}</b><span class="pos mx">+${fmt(1000 * (M[l] - 1))}</span><small>עד ${fmt(TGG.SOLO.CAP[l])}</small></div>`).join("")}</div>
          <ol class="exsteps"><li><span class="exic">${ic("x")}</span><span>טעית? <b>ההימור הולך</b>. בלי הימור לא מפסידים כלום</span></li>
          <li><span class="exic">${ic("target")}</span><span>שאלת מספר: בוחרים <b>טווח</b> על סרגל. טווח צר = מכפיל גבוה, עד <b>×6</b> על המספר המדויק</span></li>
          <li><span class="exic">${ic("chips")}</span><span>אפשר להמר עד <b>רבע מהיתרה</b>. בשאלת הגמר עד 40%</span></li>
          <li><span class="exic">${ic("timer")}</span><span><b>30–35 שניות</b> לכל שאלה, כולל ההימור. השעון לא עוצר</span></li></ol>` },
      { t: "המסלול שלך", h: "כל 5 שאלות: הפסקת קזינו", b: `<p class="gd-p small">לכל שחקן יוצא מסלול אחר. בכל הפסקה משחקים סיבוב אחד, ולפניו יש הסבר קצר עם דוגמה.</p>${routeMap(v)}` },
      { t: "בסוף", h: "ניקוד, מטבעות ושיתוף", b: `<ol class="exsteps big"><li><span class="exic">${ic("star")}</span><span><b>ניקוד</b>: על תשובות נכונות, רצפים ומהירות</span></li>
          <li><span class="exic">${ic("coin")}</span><span><b>מטבעות</b>: מה שהרווחת או הפסדת בהימורים ובקזינו</span></li>
          <li><span class="exic">${ic("share")}</span><span>מסך סיום עם רגעי השיא שלך, ושיתוף לקבוצה בלחיצה</span></li></ol>` },
    ];
  }
  // a short "get ready" before the first question, so the clock doesn't start the moment you tap
  function startCountdown(go, title, still) {
    if ($(".cdwrap")) return; const w = document.createElement("div"); w.className = "cdwrap";
    w.innerHTML = `<div class="cdbox"><p class="cd-t">${title || "מתכוננים לשאלה הראשונה"}</p>
      <div class="cd-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="cd-track" cx="100" cy="100" r="92"/><circle class="cd-arc" id="cdArc" cx="100" cy="100" r="92" pathLength="100"/></svg><div class="cd-n" id="cdN"></div></div>
      <p class="cd-s">30–35 שניות לכל שאלה, כולל ההימור</p><button class="btn ghost sm" data-cd="skip">דלג</button></div>`;
    document.body.appendChild(w); let n = 3; let done = false; const red = M.reduced();
    const finish = (open) => {
      if (done) return; done = true; clearInterval(iv); go();
      const ring = $(".cd-ring", w);
      if (open && ring && !red) { // the ring widens to the whole screen and uncovers the question
        ring.animate([{ transform: "scale(1)" }, { transform: "scale(9)" }], { duration: M.T.scene(), easing: M.ease("in"), fill: "forwards" });
        w.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: M.T.scene(), fill: "forwards" });
        setTimeout(() => w.remove(), M.T.scene());
      } else { w.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }); setTimeout(() => w.remove(), 200); }
    };
    const show = () => {
      const el = $("#cdN", w), arc = $("#cdArc", w); if (!el) return;
      el.innerHTML = `<span>${n > 0 ? n : "יאללה!"}</span>`; el.classList.toggle("go", n <= 0);
      if (!red) el.firstChild.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: M.T.ui(), easing: M.ease("out") });
      if (arc && n > 0 && arc.animate) arc.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }], { duration: 1000, easing: "linear", fill: "forwards" });
      SND.play(n > 0 ? "tick" : "fanfare");
    };
    if (still) { const el = $("#cdN", w); el.innerHTML = "<span>3</span>"; const arc = $("#cdArc", w); if (arc) arc.style.strokeDashoffset = 40; return; }
    show(); const iv = setInterval(() => { n--; show(); if (n === 0) setTimeout(() => finish(true), 600); }, 1000);
    w.onclick = (e) => { if (e.target.closest("[data-cd=skip]")) finish(false); };
  }
  function openGuide(auto) {
    const v = A.view; if (!v) return; closeKeypad(); A.guide = { i: 0, auto: !!auto }; renderGuide(); SND.play("whoosh");
  }
  function renderGuide() {
    const v = A.view; const steps = guideSteps(v); const g = A.guide; const st = steps[g.i]; let w = $(".gdwrap");
    if (!w) { w = document.createElement("div"); w.className = "gdwrap"; document.body.appendChild(w); }
    const last = g.i === steps.length - 1;
    w.innerHTML = `<div class="gdsheet"><div class="gdtop"><span class="tiny muted">${g.i + 1}/${steps.length} · ${st.t}</span>${g.auto ? "" : `<button class="pill" data-gd="close">${ic("x")}</button>`}</div>
      <h2>${st.h}</h2><div class="gdbody">${st.b}</div>
      <div class="gddots">${steps.map((_, i) => `<i class="${i === g.i ? "on" : ""}"></i>`).join("")}</div>
      <div class="row" style="gap:8px">${g.i ? `<button class="btn sm" style="flex:none" data-gd="prev">→ הקודם</button>` : ""}<button class="btn ${last ? "gold" : "pri"} big" style="flex:1" data-gd="${last ? "done" : "next"}">${last ? "הבנתי, אני מוכן" : "הבא"}</button></div></div>`;
    w.onclick = (e) => {
      const b = e.target.closest("[data-gd]"); if (!b) return; const a = b.dataset.gd;
      if (a === "demoPick") { g.demoPick = b.dataset.v; SND.play(b.dataset.v === DEMO_Q.answer ? "correct" : "wrong"); renderGuide(); return; }
      if (a === "demoBet") { g.demoBet = Number(b.dataset.v); SND.play("chip"); renderGuide(); return; }
      if (a === "demoReset") { g.demoPick = null; g.demoBet = 0; SND.play("tap"); renderGuide(); return; }
      SND.play("tap");
      if (a === "next") { g.i++; renderGuide(); } else if (a === "prev") { g.i--; renderGuide(); }
      else { w.remove(); A.guide = null; if (A.view && A.view.room !== "demo" && HOST.state && !A.free) { LS.set("tgg_guide_" + A.view.room, true); LS.set("tgg_guide_seen", true); send("ready", { on: true }); } if (a === "done") { SND.play("correct"); if (A.view && A.view.solo && A.view.phase === "lobby" && A.view.isHost) { render(); startCountdown(() => send("host", { action: "start" })); return; } } render(); }
    };
    if (g.lastI !== g.i) { $(".gdbody", w).scrollTop = 0; g.lastI = g.i; }
  }

  // ───────── CASINO LOBBY (Stake-style) ─────────
  const GAMES = {
    quiz: { name: "THE GROUP QUIZ", sub: "SALAD ORIGINALS", c1: "#2e9b4f", c2: "#0b2418" },
    crash: { name: "CRASH", sub: "הפסקת קזינו", c1: "#c62f3b", c2: "#250a0d" },
    plinko: { name: "PLINKO", sub: "הפסקת קזינו", c1: "#e8b84a", c2: "#2e220a" },
    mines: { name: "MINES", sub: "הפסקת קזינו", c1: "#2e9b4f", c2: "#0b2418" },
    bj: { name: "BLACKJACK", sub: "הפסקת קזינו", c1: "#1f6f38", c2: "#0b2418" },
    hilo: { name: "HIGH-LOW", sub: "הפסקת קזינו", c1: "#c62f3b", c2: "#250a0d" },
    dice: { name: "DICE", sub: "הפסקת קזינו", c1: "#c9952f", c2: "#2e220a" },
    slots: { name: "SALAD SLOTS", sub: "הפסקת קזינו", c1: "#c62f3b", c2: "#250a0d" },
    wheel: { name: "WHEEL OF DESTINY", sub: "הפסקת קזינו", c1: "#e8b84a", c2: "#123b2b" },
  };
  const SIDE_TABS = ["plinko", "mines", "dice", "hilo", "bj"];
  function tileArt(k) {
    const g = GAMES[k]; const id = "tg_" + k;
    const bg = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.c1}"/><stop offset="1" stop-color="${g.c2}"/></linearGradient><radialGradient id="${id}r" cx="50%" cy="35%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="150" height="200" fill="url(#${id})"/><rect width="150" height="200" fill="url(#${id}r)"/>`;
    const art = {
      quiz: `<g transform="translate(75 82)"><rect x="-46" y="-40" width="70" height="46" rx="12" fill="#fff"/><path d="M-30 6 l-6 16 20-16z" fill="#fff"/><text x="-11" y="-6" text-anchor="middle" font-size="34" font-weight="900" fill="#c62f3b" font-family="Rubik,Arial">?</text><rect x="-6" y="-8" width="58" height="40" rx="11" fill="#e8b84a"/><path d="M38 32 l8 13 -20-13z" fill="#e8b84a"/><text x="23" y="21" text-anchor="middle" font-size="26" font-weight="900" fill="#0b2418" font-family="Rubik,Arial">!</text></g>`,
      slots: `<g transform="translate(75 84)"><rect x="-56" y="-34" width="112" height="62" rx="10" fill="#250a0d" stroke="#e8b84a" stroke-width="4"/>${[-36, 0, 36].map((x) => `<rect x="${x - 15}" y="-26" width="30" height="46" rx="5" fill="#fff"/>${TGG_ICONS.at("salad", x, -2, 22)}`).join("")}<rect x="-62" y="34" width="124" height="10" rx="4" fill="#e8b84a"/></g>`,
      wheel: `<g transform="translate(75 84)">${[["#8fe0a6", 0], ["#c62f3b", 60], ["#d94a55", 120], ["#2b6249", 180], ["#e8b84a", 240], ["#2e9b4f", 300]].map(([c, a]) => `<path d="M0 0 L${(52 * Math.cos((a - 90) * Math.PI / 180)).toFixed(1)} ${(52 * Math.sin((a - 90) * Math.PI / 180)).toFixed(1)} A52 52 0 0 1 ${(52 * Math.cos((a - 30) * Math.PI / 180)).toFixed(1)} ${(52 * Math.sin((a - 30) * Math.PI / 180)).toFixed(1)}Z" fill="${c}"/>`).join("")}<circle r="20" fill="#123b2b"/><circle r="52" fill="none" stroke="#fff" stroke-width="4"/><path d="M-8 -62 h16 l-8 14z" fill="#fff"/></g>`,
      crash: `<g><path d="M18 150 Q70 140 95 100 T132 30" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><g transform="rotate(35 120 30)">${TGG_ICONS.at("rocket", 135, 28, 30)}</g><text x="22" y="62" font-size="28" font-weight="900" fill="#fff" font-family="Rubik,Arial">2.47×</text></g>`,
      plinko: `<g>${[0, 1, 2, 3, 4].map((r) => Array.from({ length: r + 2 }, (_, i) => `<circle cx="${75 + (i - (r + 1) / 2) * 20}" cy="${50 + r * 20}" r="3.5" fill="#fff"/>`).join("")).join("")}<circle cx="80" cy="38" r="7" fill="#e8b84a"/>${["#2e9b4f", "#e8b84a", "#f0c766", "#e8b84a", "#2e9b4f"].map((c, i) => `<rect x="${27 + i * 20}" y="150" width="17" height="12" rx="3" fill="${c}"/>`).join("")}</g>`,
      mines: `<g>${Array.from({ length: 9 }, (_, i) => `<rect x="${33 + (i % 3) * 30}" y="${45 + Math.floor(i / 3) * 30}" width="25" height="25" rx="5" fill="${i === 4 ? "#0b2418" : "#1f6f38"}" stroke="#fff8ec" stroke-width="1.5"/>`).join("")}${TGG_ICONS.at("bomb", 75, 105, 18)}${TGG_ICONS.at("gem", 45, 135, 18)}${TGG_ICONS.at("gem", 105, 75, 18)}</g>`,
      bj: `<g><g transform="translate(62 96) rotate(-12)"><rect x="-26" y="-38" width="52" height="74" rx="7" fill="#fff"/><text x="-17" y="-16" font-size="20" font-weight="900" fill="#111" font-family="Rubik,Arial">A</text><path d="M12 3C9 7.5 4 10 4 14a4 4 0 0 0 7 2.6L10 21h4l-1-4.4A4 4 0 0 0 20 14c0-4-5-6.5-8-11z" fill="#111" transform="translate(-13.5 -8.0) scale(1.125)"/></g><g transform="translate(92 100) rotate(10)"><rect x="-26" y="-38" width="52" height="74" rx="7" fill="#fff"/><text x="-18" y="-16" font-size="20" font-weight="900" fill="#c62f3b" font-family="Rubik,Arial">K</text><path d="M12 20.5S3.5 15 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2C20.5 15 12 20.5 12 20.5z" fill="#c62f3b" transform="translate(-13.5 -8.0) scale(1.125)"/></g><text x="75" y="168" text-anchor="middle" font-size="26" font-weight="900" fill="#e8b84a" font-family="Rubik,Arial">21</text></g>`,
      hilo: `<g><g transform="translate(75 98)"><rect x="-30" y="-42" width="60" height="84" rx="8" fill="#fff"/><text x="0" y="12" text-anchor="middle" font-size="40" font-weight="900" fill="#111" font-family="Rubik,Arial">7</text></g><path d="M75 30 l14 16 h-28z" fill="#2e9b4f"/><path d="M75 168 l14 -16 h-28z" fill="#c62f3b"/></g>`,
      dice: `<g><g transform="translate(60 92) rotate(-14)"><rect x="-26" y="-26" width="52" height="52" rx="10" fill="#fff"/>${[[-12, -12], [12, 12], [0, 0]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#1f6f38"/>`).join("")}</g><g transform="translate(96 118) rotate(12)"><rect x="-22" y="-22" width="44" height="44" rx="9" fill="#fff8ec"/>${[[-10, -10], [10, -10], [-10, 10], [10, 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#1f6f38"/>`).join("")}</g><text x="75" y="172" text-anchor="middle" font-size="20" font-weight="900" fill="#fff" font-family="Rubik,Arial">50.00</text></g>`,
    }[k];
    return `<svg viewBox="0 0 150 200" class="tileart" aria-hidden="true">${bg}${art}</svg>`;
  }

  // ───────── CASINO GRAPHICS KIT (pure SVG: nothing to download) ─────────
  // bet chips are drawn like the logo chip, small, coloured by value: 100 white · 250 red · 500 green · 1K black · 2K gold
  const CHIP_STYLE = { 100: ["ivory", "chip", "ink"], 250: ["chip", "ivory", "ivory"], 500: ["leaf", "ivory", "ivory"], 1000: ["ink", "gold", "gold"], 2000: ["gold", "ink", "ink"], 3000: ["ink", "gold", "gold"] };
  function chipLabel(x) { return x >= 1000 ? (x % 1000 === 0 ? x / 1000 : (x / 1000).toFixed(1)) + "K" : String(x); }
  function chipSVG(x, kind, label) {
    const c = kind === "max" ? ["felt-deep", "gold", "gold"] : kind === "don" ? ["chip", "ivory", "ivory"] : kind === "zero" ? ["card", "dim", "dim"] : CHIP_STYLE[x] || ["leaf", "ivory", "ivory"];
    const v = (k) => `var(--${k})`; const t = label != null ? label : kind === "zero" ? "0" : chipLabel(x); let ins = "";
    for (let i = 0; i < 8; i++) ins += `<rect x="28.6" y="1.8" width="6.8" height="10" rx="1.6" style="fill:${v(c[1])}" transform="rotate(${i * 45} 32 32)"/>`;
    return `<svg viewBox="0 0 64 64" class="chipsvg" aria-hidden="true"><circle cx="32" cy="33.5" r="30" style="fill:rgba(0,0,0,.3)"/><circle cx="32" cy="32" r="30" style="fill:${v(c[0])}"/>${ins}<circle cx="32" cy="32" r="20.5" style="fill:none;stroke:var(--gold);stroke-width:1.6"/><circle cx="32" cy="32" r="19" style="fill:${v(c[0])}"/><path d="M14 26a19 19 0 0 1 26-12" style="fill:none;stroke:rgba(255,255,255,.28);stroke-width:2.4;stroke-linecap:round"/><text x="32" y="${t.length > 3 ? 36.5 : 38}" text-anchor="middle" style="fill:${v(c[2])};font-family:var(--f-brand);font-size:${t.length > 3 ? 13 : 17}px">${t}</text></svg>`;
  }
  // the chips that make up an amount (largest first), for the stack on the bet bar
  function chipsOf(n) { const out = []; for (const d of [2000, 1000, 500, 250, 100]) while (n >= d && out.length < 7) { out.push(d); n -= d; } return out; }
  function chipStack(n) { const l = chipsOf(n); return l.length ? `<span class="cstack" style="--n:${l.length}">${l.reverse().map((d, i) => `<i style="--i:${i}">${chipSVG(d)}</i>`).join("")}</span>` : ""; }
  function chipBtn({ field, value, sel, kind, label, action = "betChip", sub }) {
    return `<button class="chipbtn ${sel ? "sel" : ""} ${kind || ""}" data-a="${action}" ${field ? `data-f="${field}"` : ""} data-v="${value}" aria-label="${fmt(value)}">${chipSVG(value, kind, label)}${sub ? `<span class="chipsub">${sub}</span>` : ""}</button>`;
  }
  // betting-site amount field: input + ½ / 2× / MAX + presets
  function betField(field, val, max, opts = {}) {
    const C = A.view ? A.view.rules : TGG.CONST;
    const pre = [100, 250, 500, 1000, 2000].filter((x) => x <= max);
    return `<div class="flabel"><span>סכום הימור</span><span class="muted">מקס׳ ${fmt(max)}</span></div>
      <div class="betfield">${COIN_ICON}<button class="bfinput" id="bf_${field}" data-a="kp" data-f="${field}" data-max="${max}" aria-label="הקש סכום">${val ? fmt(val) : `<span class="muted">0</span>`}<span class="caret"></span></button>
        <button data-a="bfOp" data-f="${field}" data-v="half">½</button><button data-a="bfOp" data-f="${field}" data-v="double">2×</button><button data-a="bfOp" data-f="${field}" data-v="max">MAX</button></div>
      ${max >= C.BET_MIN ? `<div class="presets">${pre.map((x) => `<button class="pchip ${val === x ? "sel" : ""}" data-a="bfSet" data-f="${field}" data-v="${x}" aria-label="${fmt(x)}">${chipSVG(x)}</button>`).join("")}${opts.don ? `<button class="don ${val === opts.don ? "sel" : ""}" data-a="bfSet" data-f="${field}" data-v="${opts.don}">2X OR 0</button>` : ""}<button class="pzero ${!val ? "sel" : ""}" data-a="bfSet" data-f="${field}" data-v="0">${ic("x")}</button></div>` : `<p class="tiny muted">אין מספיק מטבעות להימור</p>`}`;
  }
  function getAmt(f) { return f === "wheel" ? A.ui.wheel || 0 : f === "side" ? A.sideAmt || 0 : f === "solo" ? A.ui.soloBet || 0 : (A.ui.bet || {})[f] || 0; }
  function setAmt(f, v) { if (f === "wheel") A.ui.wheel = v; else if (f === "side") A.sideAmt = v; else if (f === "solo") A.ui.soloBet = v; else A.ui.bet[f] = v; }
  function lockLabel(used) { return used ? `${ic("lock")} נעל ${fmt(used)} וחזור לשאלה` : "בלי הימור · חזרה לשאלה"; }
  function wheelLabel(w, slots) { return w ? (slots ? `${ic("play")} משוך ב-${fmt(w)}` : `${ic("play")} סובב ב-${fmt(w)}`) : "לוותר הפעם"; }
  // live update while typing, without re-rendering (keeps the keyboard open)
  function updateBetUI() {
    const b = A.ui.bet; if (!b) return;
    const used = (b.own || 0) + (b.friendTarget ? b.friendAmt || 0 : 0) + (b.ouSide ? b.ouAmt || 0 : 0);
    const r = $("[data-risk]"); if (r) r.textContent = fmt(used);
    const p = $("[data-profit]"); if (p) { const m = Number(p.dataset.mult); p.textContent = fmt(Math.round((b.own || 0) * m) - (b.own || 0)); }
    const lb = $("#lockBtn"); if (lb) lb.textContent = lb.dataset.a === "wheelLock" ? wheelLabel(A.ui.wheel, lb.dataset.kind === "slots") : lockLabel(used);
  }
  function chipStack(amount, empty = "שים צ׳יפ") {
    if (!amount) return `<div class="stack empty"><span>${empty}</span></div>`;
    const list = []; let left = amount; for (const d of [2000, 1000, 500, 250, 100]) while (left >= d && list.length < 9) { list.push(d); left -= d; }
    if (!list.length) list.push(100);
    return `<div class="stack">${list.map((d, i) => `<span class="sc" style="bottom:${i * 5}px;z-index:${i}">${chipSVG(d)}</span>`).join("")}<b class="stackamt money">${fmt(amount)}</b></div>`;
  }
  const COIN_ICON = `<svg viewBox="0 0 32 32" class="coinico" aria-hidden="true"><defs><radialGradient id="cg" cx="35%" cy="30%"><stop offset="0" stop-color="#fff6c2"/><stop offset=".5" stop-color="#e8b84a"/><stop offset="1" stop-color="#b07a00"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#cg)" stroke="#7a5200" stroke-width="1.5"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#a87400" stroke-width="1.2"/><path d="M16 9.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L16 19.3l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#a87400"/></svg>`;
  const SALAD_ICON = `<svg viewBox="0 0 64 64" class="symsvg" aria-hidden="true"><ellipse cx="32" cy="40" rx="26" ry="8" fill="#5a2d0c"/><path d="M6 38c2 14 13 20 26 20s24-6 26-20z" fill="#b5651d"/><path d="M6 38c2 14 13 20 26 20s24-6 26-20z" fill="url(#bowl)" opacity=".5"/><circle cx="20" cy="32" r="10" fill="#2fbf4a"/><circle cx="33" cy="27" r="11" fill="#4fdc5c"/><circle cx="45" cy="32" r="9" fill="#27a53e"/><circle cx="27" cy="34" r="4.5" fill="#c62f3b"/><circle cx="40" cy="36" r="4" fill="#c62f3b"/><circle cx="35" cy="22" r="2.5" fill="#fff6c2"/><defs><linearGradient id="bowl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs></svg>`;
  const GOLDCOIN_SYM = `<svg viewBox="0 0 64 64" class="symsvg" aria-hidden="true"><defs><radialGradient id="gc2" cx="35%" cy="30%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd23d"/><stop offset="1" stop-color="#a66f00"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="url(#gc2)" stroke="#7a5200" stroke-width="3"/><circle cx="32" cy="32" r="19" fill="none" stroke="#a87400" stroke-width="2"/><path d="M32 18l4 8.2 9 1.3-6.5 6.3 1.5 9L32 38.6l-8 4.2 1.5-9-6.5-6.3 9-1.3z" fill="#b8860b" stroke="#fff3b0" stroke-width=".8"/></svg>`;

  // ── GAME tab ──
  const CONF_ICON = { low: "🤔", mid: "👍", high: "🔥" };
  function renderGame(v) {
    if (v.phase === "lobby") return renderLobby(v);
    if (v.phase === "game_over") return renderSoloFinal(v);
    if (!v.round) return `<div class="locked"><div class="spinner"></div></div>`;
    if (v.phase === "answering") return stage(v, v.solo && v.myAnswer == null ? soloQuestionScreen(v) : answerScreen(v));
    if (v.phase === "reveal") return stage(v, revealScreen(v));
    if (v.phase === "roulette") return stage(v, casinoScreen(v));
    return "";
  }
  // every in-round screen = head / body / foot inside one viewport-high stage: no page scrolling
  function stage(v, parts) {
    const paused = v.paused ? `<div class="pausebar">${ic("pause")} המשחק מושהה</div>` : "";
    if (v.paused) return `<div class="stage ph-pause"><div class="pausescr"><div class="pz-chip"></div><h2>המשחק מושהה</h2><p class="muted small">השאלה מוסתרת עד שממשיכים</p>${v.isHost ? `<button class="btn gold big" data-a="hostDo" data-v="resume">${ic("play")} המשך משחק</button>` : ""}</div></div>`;
    const intro = !prefs.reduce && A.ui && A.ui.introKey !== v.phase + ":" + (v.round ? v.round.n : "") + ":" + (A.ui.sub || "") ? " intro" : "";
    const slide = !prefs.reduce && A.ui && A.ui.slide ? " " + A.ui.slide : "";
    return `<div class="stage ph-${v.phase}">${parts.head || ""}${paused}<div class="st-body${slide || intro}">${parts.body || ""}</div><div class="st-foot">${parts.foot || ""}</div></div>`;
  }
  // one header for every casino game: what it is, the rule in one line, and "how to play"
  const RULE1 = { crash: "שמים סכום ויוצאים לפני שהרקטה מתפוצצת", wheel: "שמים סכום ומסובבים: המכפיל שנעצר עליו קובע", slots: "שמים סכום ומושכים: שלושה זהים בשורה משלמים",
    plinko: "שמים סכום ומשחררים כדור: התא שבו הוא נוחת קובע", mines: "פותחים משבצות בלי מוקשים, ויוצאים מתי שרוצים", bj: "מתקרבים ל-21 בלי לעבור, ומנצחים את הדילר",
    hilo: "מנחשים אם הקלף הבא גבוה או נמוך, ויוצאים מתי שרוצים", dice: "בוחרים סיכוי: סיכוי קטן יותר = מכפיל גדול יותר" };
  function casinoHead(v, k, title) {
    const ms = remaining(v);
    return `<div class="st-head cghead"><div class="cg-thumb" aria-hidden="true">${tileArt(k)}</div><div class="cg-t"><b class="en">${esc(title || (GAMES[k] || {}).name || k)}</b><small>${RULE1[k] || ""}</small></div>
      <button class="infobtn" data-a="gameInfo" data-v="${k}" aria-label="איך משחקים">${ic("info")}<span class="ib-t"> איך משחקים</span></button>${ms != null ? `<span class="tclock en ${ms < 5000 ? "low" : ""}" data-timer>${Math.ceil(ms / 1000)}</span>` : ""}</div>`;
  }
  function headHTML(v, opts = {}) {
    if (opts.info && RULE1[opts.info]) return casinoHead(v, opts.info, opts.title);
    const r = v.round, q = r && r.q; const ms = remaining(v);
    const tot = (v.phase === "answering" ? (q ? q.time_limit : 20) : v.phase === "betting" ? 20 : 15) * 1000;
    const field = v.phase === "betting" ? "betLocked" : v.phase === "answering" ? "answered" : null;
    const mode = opts.title || (q ? (MODES[q.mode] || [q.mode, q.mode])[v.solo ? 1 : 0] : "");
    return `<div class="st-head"><div class="row" style="gap:6px"><span class="mode ${v.solo && !opts.title ? "" : "en"}" style="font-size:20px">${mode}</span>${opts.info ? `<button class="infobtn" data-a="gameInfo" data-v="${opts.info}" aria-label="איך משחקים">${ic("info")} איך משחקים</button>` : ""}
        ${q && !opts.title ? (v.solo && r.level ? `<span class="lvl l${r.level}">רמה ${r.level} · ${LEVEL_NAME[r.level]}</span>` : `<span class="diff d-${q.difficulty}">${q.difficulty}</span>`) : ""}${r ? `<span class="badge">${r.n}/${r.total}</span>` : ""}
        ${r && r.isFinal && !opts.title ? `<span class="badge gold">${v.solo ? "שאלת הגמר" : "FINAL"}</span>` : ""}${q && q.interpretive && !opts.title ? `<span class="badge pink">פרשנות</span>` : ""}
        <span class="sp" style="flex:1"></span>${ms != null ? `<span class="tclock en ${ms < 5000 ? "low" : ""}" data-timer>${Math.ceil(ms / 1000)}</span>` : v.noTimer && field ? `<span class="badge">בלי טיימר</span>` : ""}</div>
      ${ms != null ? `<div class="timer thin"><i data-timer-bar data-tot="${tot}" style="transform:scaleX(${Math.max(0, ms / tot)})"></i></div>` : ""}
      ${opts.noStrip ? "" : `<div class="strip">${v.players.map((p) => `<div class="sp-p ${field && p[field] ? "done" : ""}">${avatar(p, "xs")}<span class="tiny">${esc(p.name)}</span><span class="tiny">${field ? (p[field] ? "🔒" : p.connected ? "…" : "📴") : ""}${v.phase !== "lobby" && p.conf && p.id !== v.me && (v.phase === "betting" || v.phase === "answering") ? CONF_ICON[p.conf] : ""}</span></div>`).join("")}</div>`}</div>`;
  }
  // a stable shuffle per question and round, so order/ranking options never show the answer's order
  function shuffledOpts(q, r) {
    const key = (q.id || "") + ":" + (r && r.n || 0); let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
    const o = q.options.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    if (o.length > 1 && JSON.stringify(o.map((x) => x.id)) === JSON.stringify(q.correct_answer || q.options.map((x) => x.id))) o.push(o.shift());
    return o;
  }
  function optList(q, { sel, interactive, correct, mine } = {}) {
    if (!q.options) return "";
    return `<div class="opts ${q.options.length > 4 ? "dense" : ""}">${q.options.map((o, oi) => {
      const cls = correct !== undefined ? (o.id === correct ? "ok" : o.id === mine ? "bad" : "dim") : sel === o.id ? "sel" : "";
      const face = CH[o.id] ? avatar({ id: o.id, avatar: "•", color: CH[o.id].color }, "xs") : `<span class="k">${"ABCDEFGH"[oi]}</span>`;
      const mark = correct !== undefined ? (o.id === correct ? `<span class="omark ok">${ic("check")}</span>` : o.id === mine ? `<span class="omark bad">${ic("x")}</span>` : "") : sel === o.id ? `<span class="omark sel">${ic("check")}</span>` : "";
      return `<button class="opt ${cls} ${interactive ? "" : "ro"}" ${interactive ? `data-a="sel" data-v="${o.id}" aria-pressed="${sel === o.id}"` : ""}>${face}<span class="grow">${esc(o.text)}</span>${mark}</button>`; }).join("")}</div>`;
  }
  // 1) QUESTION screen during the betting window
  // 2) BETS screen: one panel at a time, everything fits
  // 3) back to the QUESTION to answer
  function answerScreen(v) {
    const r = v.round, q = r.q, a = A.ui.ans; const t = q.answer_type; const locked = v.myAnswer != null;
    let ui = "", ready = false;
    if (locked) ui = t === "choice" || t === "vote" ? optList(q, { sel: v.myAnswer }) : `<div class="opt ro sel" style="display:block">${fmtAnswer(q, v.myAnswer)}</div>`;
    else if (t === "choice" || t === "vote") { ui = optList(q, { sel: a.sel, interactive: true }); ready = !!a.sel; }
    else if (t === "number" && q.nscale) { ui = rangePicker(q, a); ready = a.num !== "" && !isNaN(Number(a.num)); }
    else if (t === "number") { ui = `<button class="numin kpans" id="numIn" data-a="kpAns">${a.num !== "" ? fmt(Number(a.num)) : `<span class="muted">הקש מספר</span>`}<span class="caret"></span></button><p class="small muted center" style="margin:4px 0">${esc(q.numeric.unit)} · ${q.mode === "CLOSEST_GUESS" ? "הכי קרוב מנצח" : "ניקוד לפי קרבה"}</p>`; ready = a.num !== "" && !isNaN(Number(a.num)); }
    else if (t === "ranking" || t === "order") {
      ui = `<p class="tiny muted" style="margin:0 0 4px">${t === "ranking" ? "הקישו לפי הסדר, מהמקום הראשון" : "הקישו לפי הסדר, מהמוקדם למאוחר"} · <button class="linkbtn" data-a="ordReset">${ic("refresh")} איפוס</button></p><div class="opts">` + shuffledOpts(q, v.round).map((o) => { const i = a.order.indexOf(o.id); return `<button class="opt ${i >= 0 ? "sel" : ""}" data-a="ord" data-v="${o.id}" aria-pressed="${i >= 0}">${CH[o.id] ? avatar({ id: o.id, avatar: "•", color: CH[o.id].color }, "xs") : ""}<span class="grow">${esc(o.text)}</span>${i >= 0 ? `<span class="n">${i + 1}</span>` : ""}</button>`; }).join("") + `</div>`;
      ready = a.order.length === q.options.length;
    } else if (t === "matching") {
      ui = q.options.map((o) => `<div class="mrow"><div class="mtxt">${esc(o.text)}</div><div class="mwho">${q.match_targets.map((tg) => `<button class="${a.match[o.id] === tg.id ? "sel" : ""}" data-a="mt" data-k="${o.id}" data-v="${tg.id}" aria-label="${esc(tg.text)}">${avatar({ id: tg.id, avatar: "•", color: CH[tg.id] ? CH[tg.id].color : "#888" }, "xs")}<small>${esc(CH[tg.id] ? CH[tg.id].name : tg.text)}</small></button>`).join("")}</div></div>`).join("");
      ready = q.options.every((o) => a.match[o.id]);
    }
    const body = `<div class="prompt ${t === "matching" ? "sm" : ""}">${esc(q.prompt)}</div>${termsIn(q).length ? `<div class="terms">${termsIn(q).map((k2) => `<button class="termbtn" data-a="term" data-v="${esc(k2)}">${ic("info")} מה זה “${esc(k2)}”?</button>`).join("")}</div>` : ""}${ui}`;
    const foot = locked ? `<div class="waitbox">${ic("check")} התשובה ננעלה · מחכים לחשיפה</div>` : `<button class="btn pri big" data-a="submit" ${ready ? "" : "disabled"}>${ic("lock")} נעל תשובה</button>`;
    return { head: headHTML(v), body, foot };
  }
  function prevRanks(v) {
    const W = v.rules.COIN_WEIGHT, S = v.rules.START_COINS;
    const tot = (h) => h.score + Math.round((h.coins - S) / W);
    const prev = v.players.map((p) => [p.id, p.history.length > 1 ? tot(p.history[p.history.length - 2]) : 0]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const now = v.players.slice().sort((a, b) => b.total - a.total).map((p) => p.id);
    return Object.fromEntries(now.map((id, i) => [id, prev.indexOf(id) - i]));
  }
  // 4) REVEAL
  function revealScreen(v) {
    const r = v.round, q = r.q, res = r.results || {}; const t = q.answer_type; const delta = prevRanks(v);
    const correct = t === "choice" || t === "vote" ? optList({ ...q, options: q.options.filter((o) => o.id === q.correct_answer || o.id === v.myAnswer) }, { correct: q.correct_answer, mine: v.myAnswer })
      : t === "matching" ? `<div class="opt ro ok mgrid">${Object.entries(q.correct_answer).map(([k, w]) => `<span><b>${esc(optText(q, k))}</b> ← ${esc(targetName(q, w))}</span>`).join("")}</div>`
      : t === "number" && q.nscale ? numLine(q, (res[v.me] || {}).range, r.n)
      : `<div class="opt ro ok" style="display:block">${fmtAnswer(q, q.correct_answer)}</div>`;
    const rows = v.players.slice().sort((a, b) => b.total - a.total).map((p, ri) => {
      const x = res[p.id] || {}; const d = delta[p.id] || 0; const coins = (x.bets || []).reduce((s2, bb) => s2 + bb.delta, 0);
      return `<div class="rrow ${p.id === v.me ? "me" : ""}" style="--d:${ri}">${avatar(p, "xs")}<b class="nm">${esc(p.name)}</b><span class="mk">${x.win ? "✅" : x.answered ? (x.ratio > 0 ? "🟡" : "❌") : "—"}</span>
        <span class="pts">+${fmt(x.points || 0)}</span><span class="cn ${coins > 0 ? "pos" : coins < 0 ? "neg" : "muted"}">${coins ? sgn(coins) + "🪙" : ""}</span><span class="rk ${d > 0 ? "pos" : d < 0 ? "neg" : "muted"}">${d > 0 ? "▲" + d : d < 0 ? "▼" + -d : ""}</span>
        ${(x.events || []).length ? `<span class="evs"><span class="ev ${x.events[0]}">${EVENTS[x.events[0]] || x.events[0]}</span>${x.events.length > 1 ? `<span class="ev">+${x.events.length - 1}</span>` : ""}</span>` : ""}</div>`;
    }).join("");
    let mine = "";
    if (v.solo) { const x = res[v.me] || {}; const coins = (x.bets || []).reduce((s2, bb) => s2 + bb.delta, 0); const bet = (x.bets || [])[0];
      const ok = x.win || x.exact; const me = playerById(v, v.me) || {}; const st = v.myStats || {};
      const head = x.exact ? "בול! המספר המדויק" : x.range && ok ? `בתוך הטווח! ×${x.range.mult}` : x.range ? "מחוץ לטווח" : x.near ? "קרוב!" : ok ? "צדקת!" : x.answered ? (x.ratio > 0 ? "חלקית" : "טעית") : "נגמר הזמן";
      const money = bet ? (bet.result === "push" ? `ההימור (${fmt(bet.amount)}) חזר אליך` : coins > 0 ? `הרווחת ${fmt(coins)} מטבעות` : `הפסדת ${fmt(-coins)} מטבעות`) : "בלי הימור";
      const tone = ok ? "ok" : x.near || (x.ratio > 0 && x.answered) ? "mid" : "bad";
      mine = `<div class="reshero ${tone} ${q.answer_type === "number" && q.nscale && A.nrDone !== r.n ? "pending" : ""}"><span class="rh-ic">${ic(ok ? (x.exact ? "target" : "check") : tone === "mid" ? "refresh" : x.answered ? "x" : "clock")}</span><div class="rh-t"><b>${head}</b><span class="muted">${money} · ${st.correct || 0}/${r.n} נכונות</span></div>
        <div class="rh-row"><span><small>${ic("star")} ניקוד</small><b class="mx">+${fmt(x.points || 0)}</b></span><span><small>${ic("coin")} מטבעות</small><b class="mx ${coins > 0 ? "pos" : coins < 0 ? "neg" : ""}">${coins ? sgn(coins) : "0"}</b></span><span><small>${ic("bolt")} רצף</small><b class="mx">${fmt(me.streak || 0)}</b></span></div></div>`; }
    const body = `${v.solo ? mine : ""}<div class="prompt sm clamp2">${esc(q.prompt)}</div>${v.solo ? "" : mine}<div class="flipcard">${correct}</div>
      <p class="expl clamp3">${esc(q.explanation)}</p>${q.original_quote ? `<figure class="quote qsrc"><blockquote class="clamp2">${esc(q.original_quote)}</blockquote>${q.source_date ? `<figcaption>${esc(q.source_date)}</figcaption>` : ""}</figure>` : ""}
      ${v.solo ? "" : `<div class="rtable">${rows}</div>`}`;
    const foot = `<div class="row" style="gap:8px"><button class="btn sm" style="flex:none" data-a="revealMore">${ic("book")} מקור</button>${v.isHost ? `<button class="btn gold big" style="flex:1" data-a="host" data-v="continue">${nextLabel(v)}</button>` : `<div class="waitbox" style="flex:1">ממתינים למארח...</div>`}</div>`;
    return { head: headHTML(v, { noStrip: true }), body, foot };
  }
  function nextLabel(v) {
    if (v.phase === "chapter_summary") return "לפרק הבא ▶";
    if (v.phase === "roulette") return v.round.roulette.results ? "לשאלה הבאה ▶" : v.round.roulette.solo ? "לסגור את ההפסקה ▶" : (v.round.roulette.kind === "slots" ? "משוך עכשיו" : "סובב עכשיו");
    if (v.round && v.round.isFinal) return "לסיכום ▶";
    if (v.round && v.round.n % v.rules.ROULETTE_EVERY === 0) return v.round.n % (v.rules.ROULETTE_EVERY * 2) === 0 ? "למכונת המזל" : "לגלגל המזל";
    return "לשאלה הבאה ▶";
  }
  function revealMore() {
    const q = A.view.round.q;
    modal(`<h2>${esc((MODES[q.mode] || [q.mode])[0])}</h2><p>${esc(q.explanation)}</p>${q.original_quote ? `<div class="quote">“${esc(q.original_quote)}”<div class="tiny muted">${esc(q.source_date || "")}</div></div>` : ""}
      ${q.interpretive ? `<p class="tiny muted">פרשנות המבוססת על השיחה, לא עובדה פסיכולוגית.</p>` : ""}<p class="small muted">${ic("book")} ${esc(q.source_reference)}<br>תאריך: ${esc(q.source_date)} · ודאות: ${esc(q.confidence)}${q.sensitivity && q.sensitivity.note ? `<br>${esc(q.sensitivity.note)}` : ""}</p>
      ${A.view.round.allBets ? `<h3>מה כל אחד הצהיר</h3><p class="small">${A.view.players.map((p) => `${p.avatar} ${esc(p.name)}: ${A.view.round.allBets[p.id] ? CONF_ICON[A.view.round.allBets[p.id].conf] + " " + CONF[A.view.round.allBets[p.id].conf] : "—"}`).join("<br>")}</p>` : ""}
      <button class="btn pri" data-close>סגור</button>`);
  }
  // 5) CASINO round: wheel or slots
  const SLOT_FACE = { coin: "🪙", salad: "🥗" };
  function slotFace(id) {
    if (id === "coin") return GOLDCOIN_SYM; if (id === "salad") return SALAD_ICON;
    if (AVIMG[id]) return `<span class="gem hasimg" style="--c:${CH[id] ? CH[id].color : "#888"}">${faceImg(id)}</span>`;
    const p = playerById(A.view, id); const em = p ? p.avatar : "?";
    return `<span class="gem" style="--c:${CH[id] ? CH[id].color : "#888"}">${em}</span>`;
  }
  function slotMachine(reels, id) {
    let bulbs = ""; for (let i = 0; i < 11; i++) bulbs += `<i class="bulb" style="--i:${i};left:${4 + i * 9.2}%;top:-5px"></i><i class="bulb" style="--i:${i + 11};left:${4 + i * 9.2}%;bottom:-5px"></i>`;
    return `<div class="slots" id="${id || "slots"}">${bulbs}<div class="cabtitle en">SALAD SLOTS</div>${[0, 1, 2].map((i) => `<div class="reel"><div class="strip" data-reel="${i}">${(reels ? reels[i] : ["salad", "coin", "polchak"][i]) ? `<div class="sym">${slotFace(reels ? reels[i] : ["salad", "coin", "polchak"][i])}</div>` : ""}</div></div>`).join("")}<div class="payline"></div></div>`;
  }
  function casinoScreen(v) {
    const ro0 = v.round.roulette;
    if (!A.breakIntro || A.breakIntro.n !== ro0.breakNo) A.breakIntro = { n: ro0.breakNo, seen: false };
    const untouched = ro0.solo ? ro0.done[v.me] === undefined && !(v.side && v.side[ro0.kind]) : ro0.stakes[v.me] == null && !ro0.crash;
    if (!A.breakIntro.seen && untouched && !ro0.results) return breakIntroScreen(v);
    if (ro0.solo) return soloBreakScreen(v);
    if (v.round.roulette.kind === "crash") return crashScreen(v);
    const ro = v.round.roulette; const me = playerById(v, v.me); const isSlots = ro.kind === "slots"; const mineStake = ro.stakes[v.me];
    const title = isSlots ? "SALAD SLOTS" : "ROULETTE OF DESTINY";
    const machine = isSlots ? slotMachine(ro.results && ro.results[v.me] ? ro.results[v.me].reels : null) : `<div class="ctable"><div class="wheelwrap sm"><div class="pointer"></div>${wheelSVG(v.rules).svg}</div></div>`;
    let body, foot;
    if (ro.results) {
      const list = v.players.map((p) => { const x = ro.results[p.id]; return `<div class="rrow ${p.id === v.me ? "me" : ""}">${avatar(p, "xs")}<b class="nm">${esc(p.name)}</b>${x ? `<span class="badge ${x.delta > 0 ? "green" : x.delta < 0 ? "red" : ""}">${esc(x.label)}</span><span class="cn ${x.delta > 0 ? "pos" : x.delta < 0 ? "neg" : "muted"}">${sgn(x.delta)}</span>` : `<span class="muted small">לא השתתף</span>`}</div>`; }).join("");
      body = `${machine}<div data-after-spin class="rtable" style="opacity:${prefs.reduce || A.ui.spun === v.round.n ? 1 : 0};transition:opacity .4s">${list}</div>`;
      foot = v.isHost ? `<button class="btn gold big" data-a="host" data-v="continue">${nextLabel(v)}</button>` : `<div class="waitbox">ממתינים למארח...</div>`;
    } else if (mineStake != null) {
      body = `${machine}<div class="waitbox" style="margin-top:8px">${ic("lock")} ${mineStake ? `שמת <b class="money">${fmt(mineStake)}</b>` : "ויתרת הפעם"} · מחכים לשאר</div>`;
      foot = v.isHost ? `<button class="btn gold big" data-a="host" data-v="continue">${nextLabel(v)}</button>` : "";
    } else {
      const max = v.caps.wheel; const w = A.ui.wheel || 0;
      body = `${machine}<p class="tiny muted center" style="margin:6px 0">${isSlots ? "3 חברים זהים ×12 · 🥗🥗🥗 ×50 · פרטים ב־(i)" : "X2 · X3 · X5 · החזר · JACKPOT ×10"} · החזר צפוי ~96% · <button class="linkbtn" data-a="casinoInfo">(i)</button></p>
        <div class="betpanel">${betField("wheel", w, max)}</div>`;
      foot = `<button class="btn gold big" id="lockBtn" data-a="wheelLock" data-kind="${isSlots ? "slots" : "wheel"}">${wheelLabel(w, isSlots)}</button>`;
    }
    return { head: headHTML(v, { title, noStrip: !!ro.results, info: isSlots ? "slots" : "wheel" }), body, foot };
  }
  function casinoInfo() {
    const W = A.view ? A.view.rules.WHEEL : TGG.WHEEL; const tw = W.reduce((a, x) => a + x.w, 0);
    modal(`<h2 class="en" style="color:var(--gold)">CASINO INFO (i)</h2><p class="small">כמו בקזינו אמיתי, הנה המתמטיקה. נבדקה בהדמיה של מיליון סיבובים.</p>
      <h3>ROULETTE OF DESTINY · החזר צפוי ~96%</h3><table class="rules">${W.map((w) => `<tr><td>${{ lose: "הפסד", refund: "החזר" }[w.id] || w.label}</td><td>×${w.mult} · ${Math.round((w.w / tw) * 100)}%</td></tr>`).join("")}</table>
      <h3 style="margin-top:10px">SALAD SLOTS · החזר צפוי ~96% · זכייה ב-32% מהמשיכות</h3><table class="rules">${TGG.SLOT_PAYS.map((p) => `<tr><td>${esc(p.label)}</td><td>×${p.mult}</td></tr>`).join("")}</table>
      <h3 style="margin-top:10px">CRASH · החזר צפוי ~96%</h3><p class="small">הרקטה עולה והמכפיל גדל. צריך לצאת לפני שהיא מתרסקת. הסיכוי להגיע למכפיל m הוא 96%÷m (למשל ל-2× סיכוי 48%, ל-10× סיכוי 9.6%). ב-4% מהסבבים היא מתרסקת מיד.</p>
      <h3 style="margin-top:10px">PLINKO · החזר צפוי ~96%</h3><table class="rules"><tr><td>סיכון נמוך</td><td class="mx">${TGG.PLINKO.low.join(" · ")}</td></tr><tr><td>סיכון גבוה</td><td class="mx">${TGG.PLINKO.high.join(" · ")}</td></tr></table>
      <h3 style="margin-top:10px">MINES · החזר צפוי ~96%</h3><p class="small">25 משבצות. כל יהלום מעלה את המכפיל, מוקש מפסיד את כל ההימור. אפשר לצאת מתי שרוצים. יותר מוקשים = מכפיל קופץ מהר יותר.</p>
      <h3 style="margin-top:10px">BLACKJACK · החזר ~99% במשחק מושלם</h3><p class="small">חפיסה אינסופית, הדילר עוצר על 17, בלאק ג׳ק משלם 3:2, דאבל על כל שני קלפים, בלי פיצול. מי שמשחק "עוצר על 12 ומעלה" יורד לבערך 92%.</p>
      <h3 style="margin-top:10px">HIGH-LOW · החזר צפוי ~96%</h3><p class="small">מכפיל = 0.96 ÷ הסיכוי של כל הניחושים יחד. דילוג על קלף בחינם.</p>
      <h3 style="margin-top:10px">DICE · החזר צפוי ~96%</h3><p class="small">מכפיל = 96 ÷ אחוז הסיכוי. מספר אקראי 0.00–99.99.</p>
      <p class="tiny muted">סמלים בכל גלגלת: כל חבר 4, 🪙 7, 🥗 1 (מתוך 24). הימורים על שאלות הם משחק ידע: מי שמכיר את החבר׳ה מרוויח יותר מ-100%.</p>
      <p class="tiny muted">מטבעות וירטואליים בלבד, בשביל הכיף.</p><button class="btn pri" data-close>סגור</button>`);
  }
  // 6) CHAPTER SUMMARY (compact)
  // host & editor tools live in sheets (opened from the top bar), not on the screen
  function hostSheet() {
    const v = A.view; if (!v || !v.isHost) return;
    const active = ["betting", "answering"].includes(v.phase);
    modal(`<h2>הגדרות משחק</h2><p class="tiny muted">המארח לא רואה תשובות.</p><div class="col">
      ${active ? (v.paused ? `<button class="btn" data-a="hostDo" data-v="resume">${ic("play")} המשך</button>` : `<button class="btn" data-a="hostDo" data-v="pause">${ic("pause")} השהיה</button>`) : ""}
      ${active ? `<button class="btn" data-a="hostConfirm" data-v="skip">${ic("next")} דלג על השאלה (ההימור חוזר)</button>` : ""}
      <button class="btn red" data-a="hostEnd">${ic("flag")} סיום משחק</button><button class="btn ghost" data-close>סגור</button></div>`, null, true);
  }
  function edSheet() {
    const v = A.view; if (!v || !v.round) return; const q = v.round.q; const E = getEdits(); const st = E.status[q.id]; const revealed = v.phase === "reveal" || v.phase === "roulette";
    modal(`<h2>🛠️ עורך · <span class="en">${q.id}</span></h2><p class="small muted">${esc((MODES[q.mode] || [""])[0])} · ${st ? `${ST[st][0]} ${ST[st][1]}` : "לא נבדק"}${E.over[q.id] ? " · נערך" : ""}</p>
      <div class="grid4" style="grid-template-columns:repeat(3,1fr)">${Object.entries(ST).map(([k, x]) => `<button class="btn sm ${st === k ? (k === "ok" ? "cyan" : k === "out" ? "red" : "gold") : ""}" style="width:100%" data-a="edSt" data-k="${q.id}" data-v="${k}">${x[0]} ${x[1]}</button>`).join("")}</div>
      <textarea id="note_${q.id}" data-note="${q.id}" rows="3" placeholder="הערה על השאלה הזו" style="width:100%;margin-top:8px;padding:8px;border-radius:10px;background:var(--bg);border:1px solid var(--line);color:var(--txt);font:inherit">${esc(E.notes[q.id] || "")}</textarea>
      <div class="col" style="margin-top:8px">${revealed ? `<button class="btn" data-a="edEditModal" data-v="${q.id}">✎ עריכת השאלה והתשובה</button>${E.over[q.id] ? `<button class="btn ghost" data-a="edRevert" data-v="${q.id}">↺ חזרה למקור</button>` : ""}` : `<p class="tiny muted">עריכה נפתחת אחרי החשיפה, כדי לא לגלות לך את התשובה.</p>`}
      <button class="btn ghost" data-close>סגור</button></div>`, () => edBind(), true);
  }
  function wheelSVG(rules) {
    const segs = rules.WHEEL; const tot = segs.reduce((a, x) => a + x.w, 0); let a0 = -90;
    const cols = { x2: ["#f2cf73", "#e8b84a"], x3: ["#a77bff", "#7c4dff"], x5: ["#d94a55", "#a8242f"], lose: ["#2b6249", "#1d5139"], refund: ["#5f8a73", "#3f6b55"], jackpot: ["#ffe066", "#e8b84a"] };
    const R = 112, C = 130; const centers = {}; const rad = (d) => (d * Math.PI) / 180; let pegs = "";
    const defs = Object.entries(cols).map(([id, [a, b]]) => `<radialGradient id="wg_${id}" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient>`).join("");
    const paths = segs.map((sg) => {
      const sweep = (sg.w / tot) * 360; const a1 = a0 + sweep;
      const x0 = C + R * Math.cos(rad(a0)), y0 = C + R * Math.sin(rad(a0)), x1 = C + R * Math.cos(rad(a1)), y1 = C + R * Math.sin(rad(a1));
      const mid = a0 + sweep / 2; centers[sg.id] = mid + 90; const tx = C + R * 0.66 * Math.cos(rad(mid)), ty = C + R * 0.66 * Math.sin(rad(mid));
      pegs += `<circle cx="${(C + (R + 1) * Math.cos(rad(a0))).toFixed(1)}" cy="${(C + (R + 1) * Math.sin(rad(a0))).toFixed(1)}" r="4" fill="#fff3b0" stroke="#8a5a00" stroke-width="1.2"/>`;
      const d = `M${C},${C} L${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`; a0 = a1;
      return `<path d="${d}" fill="url(#wg_${sg.id})" stroke="#2a1800" stroke-width="1.5"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${sg.id === "jackpot" ? "#3a2400" : "#fff"}" font-size="${sweep < 20 ? 11 : 15}" font-weight="900" font-family="Heebo,Arial" text-anchor="middle" dominant-baseline="middle" style="paint-order:stroke" stroke="rgba(0,0,0,.35)" stroke-width="${sg.id === "jackpot" ? 0 : 2}" transform="rotate(${mid + 90} ${tx.toFixed(1)} ${ty.toFixed(1)})">${{ lose: "LOSE", refund: "REFUND" }[sg.id] || sg.label}</text>`;
    }).join("");
    let bulbs = ""; for (let i = 0; i < 24; i++) { const a = rad(i * 15); bulbs += `<circle class="wb" style="--i:${i}" cx="${(C + 124 * Math.cos(a)).toFixed(1)}" cy="${(C + 124 * Math.sin(a)).toFixed(1)}" r="3.2"/>`; }
    return { svg: `<svg viewBox="0 0 260 260" class="wheel" id="wheel"><defs>${defs}<linearGradient id="rimg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f6b55"/><stop offset="1" stop-color="#1d5139"/></linearGradient><radialGradient id="hubg" cx="40%" cy="35%"><stop offset="0" stop-color="#2b6249"/><stop offset="1" stop-color="#0d2c20"/></radialGradient></defs>
      <circle cx="130" cy="130" r="129" fill="#0d2c20"/><circle cx="130" cy="130" r="124" fill="none" stroke="url(#rimg)" stroke-width="11"/>${bulbs}${paths}${pegs}
      <circle cx="130" cy="130" r="${R}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="3"/><circle cx="130" cy="130" r="24" fill="url(#hubg)" stroke="#8a5a00" stroke-width="3"/>${TGG_ICONS.at("salad", 130, 129, 22)}</svg>`, centers };
  }
  function renderLobby(v) {
    const me = playerById(v, v.me);
    return `<div class="card center solohi">${me ? avatar(me, "lg") : ""}<h2 style="margin:8px 0 2px">${me ? `יאללה ${esc(me.name)}` : "מוכנים?"}</h2><p class="small muted">25 שאלות אקראיות על הקבוצה, 4 הפסקות קזינו, 10,000 מטבעות להתחלה. בסוף משתפים בקבוצה.</p></div>
      <div class="card"><h3 class="row" style="gap:6px">${ic("flag")} המסלול שלך</h3>${routeMap(v)}</div>
      <button class="btn gold big" data-a="start">${ic("play")} התחל</button><button class="btn ghost" style="margin-top:8px" data-a="openGuide">${ic("book")} ההסבר על המשחק</button>`;
  }
  // ── CASINO tab ──
  // ── LEADERBOARD tab ──
  // ── PROFILE tab ──
  function renderProfile(v) {
    const me = playerById(v, v.me); const st = v.myStats || {}; const h = history();
    return `${me ? `<div class="card center">${avatar(me, "lg")}<h2 style="margin-top:8px">${esc(me.name)}</h2>
      <div class="sgrid sm" style="margin-top:10px"><div><b class="mx">${fmt(me.score)}</b><small>ניקוד</small></div><div><b class="mx">${st.correct || 0}/${st.answered || 0}</b><small>נכונות</small></div><div><b class="mx">${fmt(me.coins)}</b><small>מטבעות</small></div></div></div>` : ""}
      <div class="card"><h3 class="row" style="gap:6px">${ic("chart")} המשחקים שלי</h3>${h.length ? `<div class="hlist">${histRows(h, 10)}</div>` : `<p class="small muted">ההיסטוריה תופיע כאן אחרי המשחק הראשון.</p>`}</div>
      ${settingsCard()}
      <div class="card"><button class="btn gold" style="margin-bottom:8px" data-a="openGuide">${ic("book")} הסבר על המשחק והמסלול</button><button class="btn" data-a="rulesHub">${ic("info")} איך משחקים בכל משחק קזינו</button>
      <button class="btn ghost" style="margin-top:8px" data-a="leave">${ic("home")} יציאה למסך הבית</button>
      <p class="tiny muted">המשחק נשמר במכשיר. אם תסגור את הדף, אפשר להמשיך מאותה נקודה ממסך הבית.</p></div>`;
  }
  function settingsCard() {
    return `<div class="card"><h3>הגדרות</h3>
      <div class="res"><span class="grow">צלילים</span><button class="btn sm" data-a="pref" data-v="sound">${prefs.sound ? "פועל" : "כבוי"}</button></div>
      <div class="res"><span class="grow">מוזיקה (בלובי ובסיכומים)</span><button class="btn sm" data-a="pref" data-v="music">${prefs.music ? "פועלת" : "כבויה"}</button></div>
      <div class="res"><span class="grow">עוצמה</span><input type="range" id="volIn" min="0" max="1" step="0.05" value="${prefs.vol}"></div>
      <div class="res"><span class="grow">הפחתת אנימציות, רעידות והבהובים</span><button class="btn sm" data-a="pref" data-v="reduce">${prefs.reduce ? "פועל" : "כבוי"}</button></div></div>`;
  }



  // ───────── EDITOR MODE ─────────
  const ED = { f: { ch: "all", mode: "all", diff: "all", st: "all", q: "" }, open: null, editing: null, review: false, idx: 0, onlyNew: true };
  const ST = { ok: ["✅", "תקינה", "green"], fix: ["🛠", "דורשת תיקון", "gold"], out: ["🗑", "להסיר", "red"] };
  function edList() {
    const E = getEdits(); const f = ED.f; const term = f.q.trim();
    return rawBank().filter((q) => (f.ch === "all" || q.chapter === Number(f.ch)) && (f.mode === "all" || q.mode === f.mode) && (f.diff === "all" || q.difficulty === f.diff)
      && (f.st === "all" || (f.st === "new" ? !E.status[q.id] : f.st === "edited" ? !!E.over[q.id] : f.st === "notes" ? edNoteCount(E, q.id) > 0 : E.status[q.id] === f.st))
      && (!term || JSON.stringify([q.id, q.prompt, q.options, q.explanation, q.original_quote]).includes(term)));
  }
  function edStats() {
    const E = getEdits(); const all = rawBank().length; const c = { ok: 0, fix: 0, out: 0 };
    for (const v of Object.values(E.status)) if (c[v] != null) c[v]++;
    return { all, ...c, done: c.ok + c.fix + c.out, edited: Object.keys(E.over).length, notes: Object.values(E.notes).filter(Boolean).length };
  }
  function edCorrect(q) {
    const t = q.answer_type;
    if (t === "matching") return Object.entries(q.correct_answer).map(([k, v]) => `${esc(optText(q, k))} ← ${esc(targetName(q, v))}`).join("<br>");
    return fmtAnswer(q, q.correct_answer);
  }
  function edCard(q0, full) {
    const E = getEdits(); const q = applyEdit(q0, E.over[q0.id]); const st = E.status[q.id]; const m = MODES[q.mode] || [q.mode, ""];
    const head = `<div class="row wrap" style="gap:6px"><b class="en" style="color:var(--cyan)">${q.id}</b><span class="diff d-${q.difficulty}">${q.difficulty}</span><span class="badge">פרק ${q.chapter}</span><span class="badge">${esc(m[1])}</span>
      ${q.interpretive ? `<span class="badge pink">פרשנות</span>` : ""}${q.confidence !== "high" ? `<span class="badge">ודאות: ${esc(q.confidence)}</span>` : ""}${q._edited ? `<span class="badge gold">נערך</span>` : ""}${st ? `<span class="badge ${ST[st][2]}">${ST[st][0]} ${ST[st][1]}</span>` : `<span class="badge">לא נבדק</span>`}</div>`;
    if (!full) return `<button class="card" style="display:block;width:100%;text-align:right;padding:12px" data-a="edOpen" data-v="${q.id}">${head}<div style="margin-top:6px;font-weight:600">${esc(q.prompt)}</div></button>`;
    if (ED.editing === q.id) return edForm(q0, q);
    const opts = q.options && (q.answer_type === "choice" || q.answer_type === "vote") ? q.options.map((o, oi) => `<div class="opt ro ${o.id === q.correct_answer ? "ok" : ""}"><span class="k">${"ABCDEFGH"[oi]}</span>${esc(o.text)}${o.id === q.correct_answer ? `<span class="n" style="background:var(--green)">✓</span>` : ""}</div>`).join("")
      : q.options ? q.options.map((o) => `<div class="small">• ${esc(o.text)}</div>`).join("") : "";
    return `<div class="card glow">${head}
      <p class="small muted" style="margin:8px 0 0">${esc(m[0])} · ${q.answer_type} · ${q.score_value} נק׳ · ${q.time_limit} שנ׳</p>
      <div class="prompt" style="font-size:19px">${esc(q.prompt)}</div>${q.instructions ? `<p class="small muted">${esc(q.instructions)}</p>` : ""}${opts}
      <div class="betbox" style="background:rgba(46,155,79,.06);border-color:var(--green)"><h4 style="color:var(--green)">התשובה הנכונה</h4><div>${edCorrect(q)}</div></div>
      <p>${esc(q.explanation)}</p>
      ${q.original_quote ? `<div class="quote">“${esc(q.original_quote)}”</div>` : ""}
      <table class="rules"><tr><td>מקור</td><td style="white-space:normal;text-align:left">${esc(q.source_reference.split(" — ")[1] || q.source_reference)}</td></tr><tr><td>תאריך</td><td>${esc(q.source_date)}</td></tr>
      ${q.challenge_reason ? `<tr><td>למה זה מאתגר</td><td style="white-space:normal;text-align:left">${esc(q.challenge_reason)}</td></tr>` : ""}${q.sensitivity && q.sensitivity.note ? `<tr><td>הערת רגישות</td><td style="white-space:normal;text-align:left">${esc(q.sensitivity.note)}</td></tr>` : ""}
      ${q.numeric ? `<tr><td>קו OVER/UNDER</td><td>${fmt(q.numeric.over_under_line)}</td></tr>` : ""}</table>
      <div class="grid4" style="grid-template-columns:repeat(3,1fr);margin-top:12px">${Object.entries(ST).map(([k, v]) => `<button class="btn sm ${st === k ? (k === "ok" ? "cyan" : k === "out" ? "red" : "gold") : ""}" style="width:100%" data-a="edSt" data-k="${q.id}" data-v="${k}">${v[0]} ${v[1]}</button>`).join("")}</div>
      <div class="ednotes">${Object.entries(NOTE_CATS).map(([c, l]) => `<label><span>${l}</span><textarea rows="1" data-note2="${q.id}:${c}" placeholder="הערה על ה${l}">${esc(((E.notes2 || {})[q.id] || {})[c] || "")}</textarea></label>`).join("")}</div>
      <textarea id="note_${q.id}" data-note="${q.id}" rows="2" placeholder="הערה כללית לעצמך או אליי" style="width:100%;margin-top:8px;padding:10px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--txt);font:inherit">${esc(E.notes[q.id] || "")}</textarea>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-a="edEdit" data-v="${q.id}">✎ עריכת טקסט ותשובה</button>${q._edited ? `<button class="btn sm ghost" data-a="edRevert" data-v="${q.id}">↺ חזרה למקור</button>` : ""}<button class="btn sm ghost" data-a="edPreview" data-v="${q.id}">👁 איך זה נראה לשחקן</button></div></div>`;
  }
  function edForm(q0, q) {
    const inp = (id, val, rows = 2) => `<textarea id="${id}" rows="${rows}" style="width:100%;padding:10px;border-radius:12px;background:var(--bg);border:1px solid var(--cyan);color:var(--txt);font:inherit">${esc(val)}</textarea>`;
    const t = q.answer_type;
    let correct = "";
    if (t === "choice" || t === "vote") correct = `<h3>התשובה הנכונה</h3><div class="chips">${q.options.map((o, oi) => `<label class="chip" style="direction:rtl"><input type="radio" name="edCorr" value="${o.id}" ${o.id === q.correct_answer ? "checked" : ""}> ${"ABCDEFGH"[oi]}</label>`).join("")}</div>`;
    else if (t === "number") correct = `<h3>התשובה הנכונה (מספר)</h3><input id="edNum" class="numin" style="font-size:24px" inputmode="numeric" value="${esc(q.correct_answer)}">`;
    else correct = `<p class="small muted">בשאלות דירוג/סדר/התאמה אפשר לערוך את הטקסטים. לשינוי התשובה עצמה, כתבו הערה ואני אעדכן.</p>`;
    return `<div class="card glow"><h2>עריכת ${q.id}</h2><h3>השאלה</h3>${inp("edPrompt", q.prompt, 3)}
      ${q.options ? `<h3 style="margin-top:10px">אפשרויות</h3>${q.options.map((o, oi) => `<div class="row" style="margin-bottom:6px"><span class="k" style="width:26px;text-align:center;font-weight:800">${"ABCDEFGH"[oi]}</span>${inp("edOpt_" + o.id, o.text, 1)}</div>`).join("")}` : ""}
      <div style="margin-top:10px">${correct}</div>
      <h3 style="margin-top:10px">רמת קושי</h3><div class="seg">${["EASY", "MEDIUM", "HARD", "INSANE"].map((d) => `<button class="${q.difficulty === d ? "sel" : ""}" data-a="edDiff" data-v="${d}">${d}</button>`).join("")}</div>
      <h3 style="margin-top:10px">הסבר אחרי החשיפה</h3>${inp("edExpl", q.explanation, 3)}
      <div class="grid2" style="margin-top:12px"><button class="btn pri" data-a="edSave" data-v="${q.id}">💾 שמירה</button><button class="btn ghost" data-a="edCancel">ביטול</button></div></div>`;
  }
  function renderEditor() {
    const s = edStats(); const list = edList(); const f = ED.f;
    const sel = (key, opts) => `<select data-edf="${key}" style="flex:1;min-width:0;padding:9px;border-radius:10px;background:var(--card2);color:var(--txt);border:1px solid var(--line);font:inherit">${opts.map(([v, l]) => `<option value="${v}" ${String(f[key]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const top = `${topbar()}<main><div class="row between"><h2 style="margin:0">🛠️ מצב עורך</h2><button class="btn sm ghost" data-a="home">יציאה</button></div>
      <p class="tiny" style="color:var(--gold)">⚠️ כאן רואים את כל התשובות. אל תפתח את זה מול החבר׳ה. השינויים נשמרים בטלפון הזה ונכנסים לכל משחק שאתה מארח ממנו.</p>
      <div class="card"><div class="row between small"><span>נבדקו ${s.done}/${s.all}</span><span>✅ ${s.ok} · 🛠 ${s.fix} · 🗑 ${s.out} · ✎ ${s.edited}</span></div>
        <div class="timer" style="margin-top:6px"><i style="transform:scaleX(${s.done / s.all});background:linear-gradient(90deg,var(--cyan),var(--green))"></i></div>
        <div class="grid2" style="margin-top:10px"><button class="btn sm ${ED.review ? "" : "pri"}" style="width:100%" data-a="edMode" data-v="list">📋 רשימה</button><button class="btn sm ${ED.review ? "pri" : ""}" style="width:100%" data-a="edMode" data-v="review">▶️ מעבר אחת-אחת</button></div></div>
      <div class="card"><input id="edSearch" placeholder="🔍 חיפוש מילה, ציטוט או מספר שאלה" value="${esc(f.q)}" style="width:100%;padding:10px;border-radius:10px;background:var(--bg);border:1px solid var(--line);color:var(--txt);font:inherit">
        <div class="row" style="margin-top:8px">${sel("ch", [["all", "כל הפרקים"], ...[1, 2, 3, 4, 5].map((n) => [n, "פרק " + n])])}${sel("st", [["all", "כל הסטטוסים"], ["new", "לא נבדקו"], ["ok", "✅ טוב"], ["fix", "🛠 לתקן"], ["out", "🗑 להוריד"]])}</div>
        <div class="row" style="margin-top:8px">${sel("mode", [["all", "כל סוגי המשחק"], ...Object.entries(MODES).map(([k, v]) => [k, v[1]])])}${sel("diff", [["all", "כל הרמות"], ["EASY", "EASY"], ["MEDIUM", "MEDIUM"], ["HARD", "HARD"], ["INSANE", "INSANE"]])}</div>
        <p class="tiny muted" style="margin:6px 0 0">${list.length} שאלות בסינון הנוכחי</p></div>`;
    let body;
    if (ED.review) {
      if (!list.length) body = `<div class="card center"><h2>🎉</h2><p>אין שאלות בסינון הזה.</p></div>`;
      else { ED.idx = Math.max(0, Math.min(ED.idx, list.length - 1)); const q = list[ED.idx];
        body = `<div class="row between" style="margin-bottom:8px"><button class="btn sm" data-a="edNav" data-v="-1" ${ED.idx ? "" : "disabled"}>→ הקודמת</button><span class="small">${ED.idx + 1} / ${list.length}</span><button class="btn sm" data-a="edNav" data-v="1" ${ED.idx < list.length - 1 ? "" : "disabled"}>הבאה ←</button></div>${edCard(q, true)}
          <p class="tiny muted center">טיפ: סננו “לא נבדקו”. אחרי כל סימון עוברים אוטומטית לשאלה הבאה.</p>`; }
    } else body = list.map((q) => edCard(q, ED.open === q.id)).join("") || `<div class="card center muted">אין תוצאות</div>`;
    const tail = `<div class="card"><h3>שליחת השינויים אליי</h3><p class="small muted">כדי שהשינויים ייכנסו לגרסה הבאה של הקובץ (ולכל טלפון), שלח לי את הדוח.</p>
      <div class="col"><button class="btn cyan" data-a="edCopy">📋 העתק דוח שינויים</button><button class="btn" data-a="edDownload">⬇️ הורד קובץ שינויים</button><button class="btn ghost" data-a="edImport">📥 טען שינויים מטלפון אחר</button><button class="btn ghost small" data-a="edReset">איפוס כל הסימונים</button></div></div></main>`;
    return top + body + tail;
  }
  function edReport() {
    const E = getEdits(); const bank = rawBank(); const lines = ["THE GROUP GAMES — דוח עורך", ""];
    for (const [k, l] of [["out", "🗑 להוריד"], ["fix", "🛠 לתקן"], ["ok", "✅ טוב"]]) {
      const ids = bank.filter((q) => E.status[q.id] === k); if (!ids.length) continue;
      lines.push(`${l} (${ids.length}):`); for (const q of ids) lines.push(`- ${q.id}: ${q.prompt.slice(0, 70)}${E.notes[q.id] ? `\n  הערה: ${E.notes[q.id]}` : ""}${Object.entries((E.notes2 || {})[q.id] || {}).map(([c, t]) => `\n  ${NOTE_CATS[c]}: ${t}`).join("")}`); lines.push("");
    }
    const noteOnly = bank.filter((q) => !E.status[q.id] && E.notes[q.id]); if (noteOnly.length) { lines.push("הערות:"); for (const q of noteOnly) lines.push(`- ${q.id}: ${E.notes[q.id]}`); lines.push(""); }
    if (Object.keys(E.over).length) { lines.push(`✎ נערכו: ${Object.keys(E.over).join(", ")}`); lines.push(""); }
    lines.push("---DATA---"); lines.push(JSON.stringify(E));
    return lines.join("\n");
  }
  function edSet(fn) { const E = getEdits(); fn(E); E.savedAt = Date.now(); LS.set(EDITS_KEY, E); }
  const NOTE_CATS = { wording: "ניסוח", difficulty: "קושי", answer: "תשובה", source: "מקור" };
  function edClick(a, el) {
    const val = el.dataset.v;
    switch (a) {
      case "goEditor": editorHub(); return true;
      case "goEditorQ": openDev("questions"); return true;
      case "edLock": A.edUnlocked = false; try { sessionStorage.removeItem("tgg_ed_ok"); } catch (e) {} closeModals(); A.screen = "home"; toast("כלי העורך ננעלו"); render(); return true;
      case "edEditModal": { const q0 = rawBank().find((x) => x.id === val); ED.diff = null; modal(edForm(q0, applyEdit(q0, getEdits().over[val])), null, true); return true; }
      case "edOpen": ED.open = ED.open === val ? null : val; ED.editing = null; render(); return true;
      case "edMode": ED.review = val === "review"; ED.idx = 0; ED.editing = null; render(); window.scrollTo(0, 0); return true;
      case "edNav": ED.idx += Number(val); ED.editing = null; render(); return true;
      case "edSt": {
        const id = el.dataset.k; let cleared = false; edSet((E) => { if (E.status[id] === val) { delete E.status[id]; cleared = true; } else E.status[id] = val; edHist(E, id, cleared ? "הסימון בוטל" : `סומנה: ${ST[val][1]}`); }); SND.play(val === "out" ? "wrong" : "select");
        devLog(`${id}: ${cleared ? "הסימון בוטל" : ST[val][1]}`);
        if (A.screen === "dev") { if (!cleared) { const list = edList(); const all = rawBank(); const order = list.length ? list : all; const i = order.findIndex((q) => q.id === id); const nx = (i >= 0 ? order.slice(i + 1) : order).concat(order.slice(0, Math.max(0, i))).find((q) => q.id !== id && !getEdits().status[q.id]) || (i >= 0 && order[i + 1]) || null; if (nx) DEV.cur = nx.id; devSave(); } render(); return true; }
        if (el.closest(".modal")) { closeModals(); toast(`${ST[val][0]} סומן: ${ST[val][1]}`); render(); return true; }
        if (ED.review && ED.f.st !== "new") ED.idx++;
        render(); if (ED.review) window.scrollTo(0, 0); return true;
      }
      case "edEdit": ED.editing = val; ED.open = val; ED.diff = null; render(); return true;
      case "edCancel": ED.editing = null; closeModals(); render(); return true;
      case "edDiff": ED.diff = val; document.querySelectorAll("[data-a=edDiff]").forEach((b) => b.classList.toggle("sel", b.dataset.v === val)); return true;
      case "edSave": {
        const id = val; const q = rawBank().find((x) => x.id === id); const o = {};
        const pr = $("#edPrompt").value.trim(); if (pr && pr !== q.prompt) o.prompt = pr;
        const ex = $("#edExpl").value.trim(); if (ex && ex !== q.explanation) o.explanation = ex;
        if (q.options) { const ot = {}; for (const op of q.options) { const v = $("#edOpt_" + op.id).value.trim(); if (v && v !== op.text) ot[op.id] = v; } if (Object.keys(ot).length) o.options = ot; }
        const r = document.querySelector("input[name=edCorr]:checked"); if (r && r.value !== q.correct_answer) o.correct = r.value;
        const n = $("#edNum"); if (n && n.value !== "" && Number(n.value) !== q.correct_answer && Number.isFinite(Number(n.value))) o.correct = Number(n.value);
        if (ED.diff && ED.diff !== q.difficulty) o.difficulty = ED.diff;
        edSet((E) => { if (Object.keys(o).length) E.over[id] = o; else delete E.over[id]; edHist(E, id, Object.keys(o).length ? `נערכה: ${Object.keys(o).map((k) => ({ prompt: "ניסוח", explanation: "הסבר", options: "אפשרויות", correct: "תשובה", difficulty: "קושי" }[k] || k)).join(", ")}` : "עריכה בוטלה"); });
        devLog(`${id}: נערכה`);
        ED.editing = null; closeModals(); toast(Object.keys(o).length ? "נשמר ✔" : "לא היו שינויים");
        if (HOST.state && HOST.state.bank[id]) { HOST.state.bank[id] = applyEdit(q, getEdits().over[id]); hostChanged(); } else render();
        return true;
      }
      case "edRevert": confirmBox("להחזיר את השאלה לנוסח המקורי?", "שחזור", () => { edSet((E) => { delete E.over[val]; edHist(E, val, "הוחזרה לנוסח המקורי"); }); devLog(`${val}: הוחזרה למקור`); if (HOST.state && HOST.state.bank[val]) { HOST.state.bank[val] = rawBank().find((x) => x.id === val); hostChanged(); } else render(); }); return true;
      case "edPreview": {
        const q = loadBank(true).find((x) => x.id === val);
        modal(`<div class="card glow" style="margin:0">${modeHead(q, null)}<div class="prompt">${esc(q.prompt)}</div>${q.instructions ? `<p class="small muted">${esc(q.instructions)}</p>` : ""}${optionsPreview(q)}</div><p class="tiny muted">ככה השחקנים רואים את השאלה לפני שהם עונים.</p><button class="btn pri" data-close>סגור</button>`);
        return true;
      }
      case "edCopy": { edSet((E) => { E.exportedAt = Date.now() + 1; }); devLog("ייצוא דוח (העתקה)"); const t = edReport(); try { navigator.clipboard.writeText(t).then(() => toast("הדוח הועתק. הדבק אותו בצ׳אט איתי"), () => edShowText(t)); } catch (e) { edShowText(t); } return true; }
      case "edDownload": { edSet((E) => { E.exportedAt = Date.now() + 1; }); devLog("ייצוא דוח (קובץ)"); const blob = new Blob([edReport()], { type: "text/plain;charset=utf-8" }); const u = URL.createObjectURL(blob); const l = document.createElement("a"); l.href = u; l.download = "group-games-edits.txt"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); return true; }
      case "edImport": modal(`<h2>טעינת שינויים</h2><p class="small muted">הדבק כאן דוח שהועתק ממצב עורך בטלפון אחר.</p><textarea id="edImp" rows="6" style="width:100%;padding:10px;border-radius:12px;background:var(--bg);color:var(--txt);border:1px solid var(--line)"></textarea><div class="col" style="margin-top:10px"><button class="btn pri" id="edImpGo">טען</button><button class="btn ghost" data-close>ביטול</button></div>`,
        (m) => { $("#edImpGo", m).onclick = () => { try { const txt = $("#edImp", m).value; const j = JSON.parse(txt.includes("---DATA---") ? txt.split("---DATA---")[1] : txt); LS.set(EDITS_KEY, Object.assign({ status: {}, notes: {}, over: {} }, j)); m.remove(); toast("נטען ✔"); render(); } catch (e) { toast("הטקסט לא תקין"); } }; }); return true;
      case "edReset": confirmBox("למחוק את כל הסימונים, ההערות והעריכות בטלפון הזה?", "איפוס", () => { LS.del(EDITS_KEY); render(); }, true); return true;
    }
    return false;
  }
  function edShowText(t) { modal(`<h2>העתק ידנית</h2><textarea rows="10" style="width:100%;padding:10px;border-radius:12px;background:var(--bg);color:var(--txt);border:1px solid var(--line)" readonly>${esc(t)}</textarea><button class="btn pri" style="margin-top:8px" data-close>סגור</button>`); }
  function edBind() {
    document.querySelectorAll("[data-edf]").forEach((el) => el.addEventListener("change", () => { ED.f[el.dataset.edf] = el.value; ED.idx = 0; ED.open = null; if (A.screen === "dev") devSave(); render(); }));
    document.querySelectorAll("[data-note2]").forEach((el) => {
      const [id, cat] = el.dataset.note2.split(":");
      el.addEventListener("input", () => edSet((E) => { E.notes2 = E.notes2 || {}; const n = (E.notes2[id] = E.notes2[id] || {}); if (el.value.trim()) n[cat] = el.value; else delete n[cat]; }));
      el.addEventListener("change", () => edSet((E) => edHist(E, id, `הערת ${NOTE_CATS[cat]}: ${el.value.trim() ? el.value.trim().slice(0, 60) : "נמחקה"}`)));
    });
    document.querySelectorAll("[data-note]").forEach((el) => el.addEventListener("change", () => edSet((E) => edHist(E, el.dataset.note, `הערה כללית: ${el.value.trim() ? el.value.trim().slice(0, 60) : "נמחקה"}`))));
    const s = $("#edSearch"); if (s) s.addEventListener("input", () => { ED.f.q = s.value; ED.idx = 0; clearTimeout(ED.t); ED.t = setTimeout(render, 350); });
    document.querySelectorAll("[data-note]").forEach((el) => el.addEventListener("input", () => { const id = el.dataset.note; edSet((E) => { if (el.value.trim()) E.notes[id] = el.value; else delete E.notes[id]; }); }));
  }

  // ═════════════════ DEV CONSOLE: one dashboard, six areas ═════════════════
  const DEV_AREAS = [
    ["overview", "▦", "OVERVIEW", "תמונת מצב"], ["control", "▶", "GAME CONTROL", "שליטה במשחק"], ["questions", "☰", "QUESTION MANAGER", "ניהול שאלות"],
    ["systems", "⚙", "GAME SYSTEMS", "מערכות המשחק"], ["casino", "◆", "CASINO LAB", "מעבדת קזינו"], ["tests", "✓", "TEST CENTER", "מרכז בדיקות"],
  ];
  const DEV = Object.assign({ area: "overview", cur: null }, LS.get("tgg_dev_ui", {}));
  if (DEV.f) Object.assign(ED.f, DEV.f);
  function devSave() { LS.set("tgg_dev_ui", { area: DEV.area, cur: DEV.cur, f: ED.f }); }
  function devLog(a) { const L = LS.get("tgg_dev_log", []); L.unshift({ t: Date.now(), a }); LS.set("tgg_dev_log", L.slice(0, 40)); }
  function devTime(t) { const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; }
  function openDev(area) { editorGate(() => { closeModals(); if (area) DEV.area = area; A.screen = "dev"; devSave(); devLog("כניסה לסביבת הפיתוח"); render(); window.scrollTo(0, 0); }); }
  function storageUse() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || "").length; } } catch (e) { return null; } return n * 2; }
  function devStatus(ok, txt, sub) { const c = ok === true ? "ok" : ok === false ? "bad" : "warn"; return `<div class="dv-st"><i class="dv-dot ${c}"></i><span><b>${txt}</b>${sub ? `<small>${sub}</small>` : ""}</span></div>`; }
  function devCard(title, body, extra = "") { return `<section class="dv-card ${extra}"><h3>${title}</h3>${body}</section>`; }
  function renderDev() {
    if (!edOK()) { A.screen = "home"; return renderHome(); }
    const area = DEV_AREAS.find((x) => x[0] === DEV.area) || DEV_AREAS[0]; const s = edStats();
    const nav = DEV_AREAS.map(([k, ic, en, he]) => `<button class="dv-nav ${k === area[0] ? "on" : ""}" data-a="devArea" data-v="${k}"><span class="dv-ic">${ic}</span><span><b>${en}</b><small>${he}</small></span>${k === "questions" && s.all - s.done ? `<em>${s.all - s.done}</em>` : ""}</button>`).join("");
    const body = { overview: devOverview, control: devControl, questions: devQuestions, systems: devSystems, casino: devCasino, tests: devTests }[area[0]]();
    return `<div class="dv"><aside class="dv-side"><div class="dv-brand"><b>THE GROUP GAMES</b><small>סביבת פיתוח</small></div><nav>${nav}</nav>
        <div class="dv-sidefoot"><button class="dv-mini" data-a="home">← חזרה למשחק</button><button class="dv-mini" data-a="edLock">🔒 נעילה ויציאה</button></div></aside>
      <main class="dv-main"><header class="dv-head"><div><small>${area[3]}</small><h1>${area[2]}</h1></div><div class="dv-headact"><span class="dv-pill">🔒 מצב פיתוח · תשובות גלויות</span></div></header>${body}</main></div>`;
  }
  // ── A. OVERVIEW
  function devOverview() {
    const s = edStats(); const bank = rawBank(); const E = getEdits();
    const types = new Set(bank.map((q) => q.answer_type)), modes = new Set(bank.map((q) => q.mode));
    const pct = Math.round((s.done / s.all) * 100); const active = s.all - s.out;
    const stat = (n, l, c = "", a) => `<button class="dv-stat ${c}" ${a ? `data-a="devGo" data-v="${a}"` : "disabled"}><b>${n}</b><small>${l}</small></button>`;
    const testState = LS.get("tgg_test_host_state", null), realState = LS.get("tgg_host_state", null);
    const used = storageUse(); const log = LS.get("tgg_dev_log", []);
    let peer = typeof window.Peer === "function", qr = typeof window.QRCode === "function", audio = !!(window.AudioContext || window.webkitAudioContext);
    const todo = [];
    if (s.all - s.done) todo.push([`${s.all - s.done} שאלות עוד לא נבדקו`, "new"]);
    if (s.fix) todo.push([`${s.fix} שאלות מסומנות “דורשת תיקון”`, "fix"]);
    if (E.exportedAt == null || (E.savedAt || 0) > E.exportedAt) if (s.done || s.edited || s.notes) todo.push(["יש שינויים שעוד לא נשלחו אליי (ייצוא דוח)", null]);
    return `<div class="dv-grid stats">
        ${stat(s.all, "שאלות במאגר")}${stat(active, "פעילות (בלי “להסיר”)")}${stat(s.done, "נבדקו", "ok", "all")}${stat(s.fix, "דורשות תיקון", "warn", "fix")}${stat(s.out, "סומנו להסרה", "bad", "out")}${stat(s.edited, "נערכו", "", "edited")}${stat(types.size + " · " + modes.size, "סוגי תשובה · סוגי שאלה")}${stat(TGG.CASINO_KINDS.length, "משחקי קזינו")}</div>
      ${devCard("התקדמות הבדיקות", `<div class="dv-prog"><i style="width:${pct}%"></i></div><div class="dv-row"><span>${pct}% מהשאלות נבדקו</span><span class="dv-muted">✅ ${s.ok} · 🛠 ${s.fix} · 🗑 ${s.out} · נותרו ${s.all - s.done}</span></div>
        <div class="dv-chips">${[1, 2, 3, 4, 5].map((ch) => { const qs = bank.filter((q) => q.chapter === ch); const d = qs.filter((q) => E.status[q.id]).length; return `<span>פרק ${ch}: <b>${d}/${qs.length}</b></span>`; }).join("")}</div>`)}
      ${todo.length ? devCard("דורש טיפול", `<ul class="dv-list">${todo.map(([t, f]) => `<li>${f ? `<button class="dv-link" data-a="devGo" data-v="${f}">${t} ←</button>` : t}</li>`).join("")}</ul>`, "attn") : ""}
      <div class="dv-grid two">
      ${devCard("מצב מערכות", [
        devStatus(!!window.TGG && typeof TGG.view === "function", "מנוע המשחק", "נטען"),
        devStatus(bank.length > 0, "מאגר השאלות", `${bank.length} שאלות פוענחו`),
        devStatus(peer ? true : null, "תקשורת בין מכשירים (PeerJS)", peer ? "הספרייה נטענה" : "לא נטענה (אין אינטרנט?)"),
        devStatus(qr ? true : null, "QR להזמנה", qr ? "נטען" : "לא נטען"),
        devStatus(audio, "צלילים (Web Audio)", audio ? "נתמך" : "לא נתמך בדפדפן"),
        devStatus(used != null, "אחסון מקומי", used != null ? `${Math.round(used / 1024)}KB בשימוש` : "חסום"),
      ].join(""))}
      ${devCard("שמירת נתונים", [
        devStatus(true, "סימונים, הערות ועריכות", E.savedAt ? `נשמר אוטומטית · ${devTime(E.savedAt)}` : "עוד לא נשמר כלום"),
        devStatus(E.exportedAt ? ((E.savedAt || 0) > E.exportedAt ? null : true) : null, "ייצוא אחרון", E.exportedAt ? devTime(E.exportedAt) + ((E.savedAt || 0) > E.exportedAt ? " · יש שינויים חדשים מאז" : "") : "עוד לא יוצא"),
        devStatus(realState ? null : true, "משחק אמיתי שמור במכשיר", realState ? `חדר ${LS.get("tgg_host", {}).room || "?"} · נשמר בנפרד` : "אין"),
        devStatus(testState ? null : true, "משחק בדיקה שמור", testState ? "יש · נשמר בנפרד מהמשחק האמיתי" : "אין"),
      ].join(""))}
      </div>
      ${devCard("פעולות אחרונות", log.length ? `<table class="dv-table"><tbody>${log.slice(0, 10).map((l) => `<tr><td class="dv-muted">${devTime(l.t)}</td><td>${esc(l.a)}</td></tr>`).join("")}</tbody></table>` : `<p class="dv-muted">עוד אין פעולות.</p>`)}`;
  }
  // ── B. GAME CONTROL (batch 1: the existing tools, organised; scenarios + inspector arrive next)
  function devControl() {
    const testState = LS.get("tgg_test_host_state", null);
    const tool = (a, ic, t, d) => `<button class="dv-tool" data-a="${a}"><span>${ic}</span><b>${t}</b><small>${d}</small></button>`;
    const live = HOST.state && HOST.state.playtest && HOST.state.phase !== "game_over" ? HOST.state : null;
    const liveCard = live ? devCard("משחק בדיקה פעיל עכשיו", `<div class="in-grid">${[["שלב", PHASE_HE[live.phase]], ["שאלה", live.round ? `${live.round.n} / ${live.order.length}` : "—"], ["תרחיש", SCENARIOS[live.devScenario || "none"].t], ["שינויי פיתוח", live.devChanges || 0]].map(([k, v]) => `<div class="in-kv"><small>${k}</small><b>${v}</b></div>`).join("")}</div>
        <p class="dv-muted small">${nextEventText(live)}</p><div class="dv-actions"><button class="dv-btn pri" data-a="devBackToGame">↩ חזרה למשחק + INSPECTOR</button></div>`, "attn") : "";
    const scen = Object.entries(SCENARIOS).filter(([k]) => !["loser", "streak", "flaky"].includes(k)).map(([k, x]) => `<button class="dv-tool ${(A.scenario || "none") === k ? "sel" : ""}" data-a="devScenario" data-v="${k}"><span>${x.ic}</span><b>${x.t}</b><small>${x.d}</small></button>`).join("");
    return `${liveCard}${devCard("משחק בדיקה עם תרחיש", `<p class="dv-muted">בחר תרחיש ולחץ “משחק בדיקה חדש”. התרחיש משנה רק את משחק הבדיקה (יתרות, ניקוד או התנהגות בוט), וכל שינוי מסומן ביומן כ“שינוי פיתוח”. חוקי המשחק האמיתי לא משתנים. (תרחישי הבוטים הוסרו: המשחק עכשיו לשחקן אחד.)</p><div class="dv-tools">${scen}</div>`)}
      ${devCard("משחק בדיקה", `<p class="dv-muted">משחק מלא מול 3 בוטים, עם עורך בתוך המשחק. אורך, טיימר ו“רק שאלות שלא נבדקו” בוחרים במסך הבא. משחקי בדיקה נשמרים <b>בנפרד</b> ממשחק אמיתי ולא דורסים אותו.</p>
        <div class="dv-actions"><button class="dv-btn pri" data-a="goPlaytest">▶ משחק בדיקה חדש${A.scenario && A.scenario !== "none" ? ` · ${SCENARIOS[A.scenario].t}` : ""}</button>${testState ? `<button class="dv-btn" data-a="devResumeTest">↻ להמשיך את משחק הבדיקה השמור</button><button class="dv-btn danger" data-a="devDelTest">מחיקת משחק הבדיקה השמור</button>` : ""}</div>`)}
      ${devCard("עוד כלים", `<div class="dv-tools">${tool("devGuide", "📖", "המדריך לפני המשחק", "השלבים שכל שחקן רואה")}${tool("devSplash", "✨", "מסך פתיחה", "אנימציית הלוגו")}${tool("devSounds", "🔊", "בדיקת צלילים", "כל הצלילים ברצף")}${tool("devReset", "🧹", "איפוס המכשיר", "מוחק משחקים ושמירות; לא את הטוקן")}</div>`)}
      ${devCard("איפה השליטה בזמן משחק", `<ul class="dv-list"><li>GAME INSPECTOR נפתח אוטומטית בכל משחק בדיקה (כפתור 🔍 למעלה). בו: מעבר ידני בין שלבים, השהיה והמשך, דילוג, פרק הבא, התחלה מחדש וסיום, ואת כל המצב הפנימי ויומן האירועים.</li></ul>`, "soon")}`;
  }
  // ── C. QUESTION MANAGER
  function edFilters() {
    const f = ED.f; const sel = (key, opts) => `<select data-edf="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[key]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<div class="dv-filters"><input id="edSearch" placeholder="חיפוש: מילה, ציטוט או מספר שאלה" value="${esc(f.q)}">
      ${sel("st", [["all", "כל הסטטוסים"], ["new", "⏳ לא נבדקו"], ["ok", "✅ תקינה"], ["fix", "🛠 דורשת תיקון"], ["out", "🗑 להסיר"], ["edited", "✎ נערכו"], ["notes", "💬 עם הערות"]])}
      ${sel("ch", [["all", "כל הפרקים"], ...[1, 2, 3, 4, 5].map((n) => [n, "פרק " + n])])}
      ${sel("mode", [["all", "כל סוגי השאלה"], ...Object.entries(MODES).map(([k, v]) => [k, v[1]])])}
      ${sel("diff", [["all", "כל הרמות"], ["EASY", "EASY"], ["MEDIUM", "MEDIUM"], ["HARD", "HARD"], ["INSANE", "INSANE"]])}</div>`;
  }
  function devQuestions() {
    const s = edStats(); const list = edList(); const E = getEdits();
    if (DEV.cur && !rawBank().some((q) => q.id === DEV.cur)) DEV.cur = null;
    const idx = DEV.cur ? list.findIndex((q) => q.id === DEV.cur) : -1;
    const rows = list.map((q) => { const st = E.status[q.id]; const n = edNoteCount(E, q.id);
      return `<button class="dv-qrow ${q.id === DEV.cur ? "on" : ""}" data-a="dvQ" data-v="${q.id}"><i class="dv-dot ${st === "ok" ? "ok" : st === "fix" ? "warn" : st === "out" ? "bad" : "none"}"></i><b class="en">${q.id}</b><span>${esc(applyEdit(q, E.over[q.id]).prompt)}</span>${E.over[q.id] ? `<em>✎</em>` : ""}${n ? `<em>💬${n}</em>` : ""}</button>`; }).join("") || `<p class="dv-muted" style="padding:12px">אין שאלות בסינון הזה.</p>`;
    let detail;
    if (!DEV.cur) detail = `<div class="dv-empty"><b>בחר שאלה מהרשימה</b><p>או התחל מעבר רציף על השאלות שלא נבדקו.</p><button class="dv-btn pri" data-a="dvNextNew">▶ להתחיל מהשאלה הראשונה שלא נבדקה</button>
        <p class="dv-muted small">קיצורים: ← הבאה · → הקודמת · 1 תקינה · 2 דורשת תיקון · 3 להסיר · N הבאה שלא נבדקה · E עריכה · P תצוגה כמו לשחקן</p></div>`;
    else {
      const q0 = rawBank().find((q) => q.id === DEV.cur); const hist = (E.hist && E.hist[q0.id]) || [];
      detail = `<div class="dv-qnav"><button class="dv-mini only-m" data-a="dvQ" data-v="">☰ לרשימה</button><button class="dv-mini" data-a="dvStep" data-v="-1" ${idx > 0 ? "" : "disabled"}>→ הקודמת</button><span>${idx >= 0 ? `${idx + 1} / ${list.length}` : "מחוץ לסינון"}</span><button class="dv-mini" data-a="dvStep" data-v="1" ${idx >= 0 && idx < list.length - 1 ? "" : "disabled"}>הבאה ←</button><button class="dv-mini" data-a="dvNextNew">⏭ הבאה שלא נבדקה</button></div>
        ${edCard(q0, true)}
        ${devCard(`היסטוריית שינויים <small class="dv-muted">(${hist.length})</small>`, hist.length ? `<table class="dv-table"><tbody>${hist.slice().reverse().map((h) => `<tr><td class="dv-muted">${devTime(h.t)}</td><td>${esc(h.a)}</td></tr>`).join("")}</tbody></table>` : `<p class="dv-muted">אין עדיין שינויים בשאלה הזו.</p>`)}`;
    }
    return `<div class="dv-qtop"><div class="dv-prog sm"><i style="width:${Math.round((s.done / s.all) * 100)}%"></i></div><span class="dv-muted small">נבדקו ${s.done}/${s.all} · ✅ ${s.ok} · 🛠 ${s.fix} · 🗑 ${s.out} · ✎ ${s.edited} · ${list.length} בסינון</span></div>
      ${edFilters()}
      <div class="dv-qwrap ${DEV.cur ? "has-cur" : ""}"><div class="dv-qlist">${rows}</div><div class="dv-qdetail">${detail}</div></div>
      ${devCard("ייצוא וייבוא", `<p class="dv-muted">השינויים נשמרים במכשיר הזה. כדי שייכנסו לקובץ ולכל הטלפונים, שלח לי את הדוח.</p><div class="dv-actions"><button class="dv-btn pri" data-a="edCopy">📋 העתקת דוח</button><button class="dv-btn" data-a="edDownload">⬇ הורדת קובץ</button><button class="dv-btn" data-a="edImport">⬆ טעינת שינויים</button><button class="dv-btn danger" data-a="edReset">איפוס כל הסימונים</button></div>`)}`;
  }
  // ── D. GAME SYSTEMS (read only in batch 1)
  function devSystems() {
    const C = TGG.CONST; const row = (k, v) => `<tr><td>${k}</td><td class="mx">${v}</td></tr>`;
    return `${devCard("ערכי המשחק <span class=\"dv-ro\">קריאה בלבד</span>", `<p class="dv-muted">הערכים קבועים במנוע המשחק ואי אפשר לשנות אותם מכאן. מפרט מלא של 10 המערכות (תפקיד, פרמטרים, קלט, פלט, תלויות ובדיקות) מגיע במנה 3.</p>
        <table class="dv-table"><tbody>${row("יתרת פתיחה", fmt(C.START_COINS || 10000))}${row("הימור מינימלי", fmt(C.BET_MIN))}${row("מכפיל לפי רמה", Object.entries(TGG.SOLO.MULT).map(([k, v]) => `${k}: ×${v}`).join(" · "))}${row("תקרת הימור לפי רמה", Object.entries(TGG.SOLO.CAP).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · "))}${row("תקרה מהיתרה", Math.round(TGG.SOLO.BAL_PCT * 100) + "% · שאלת הגמר " + Math.round(TGG.SOLO.FINAL_PCT * 100) + "%")}${row("שאלת מספר", "טווח על סרגל: בול ×6 · צר (עד 10% מהסרגל) ×2.5 · רחב (עד 30%) ×1.4")}${row("זמן לפי רמה", Object.entries(TGG.SOLO.TIME).map(([k, v]) => `${k}: ${v} ש׳`).join(" · "))}${row("אורך משחק", TGG.SOLO.LENGTH + " שאלות אקראיות")}${row("הפסקת קזינו", "כל " + C.ROULETTE_EVERY + " שאלות")}</tbody></table>`)}`;
  }
  // ── E. CASINO LAB (batch 1: rules + example slides; simulations arrive in batch 3)
  function devCasino() {
    return `${devCard("8 משחקי הקזינו", `<div class="dv-tools">${TGG.CASINO_KINDS.map((k) => `<button class="dv-tool" data-a="gameInfo" data-v="${k}"><span class="dv-art">${tileArt(k)}</span><b class="en">${GAMES[k].name}</b><small>${gameRules(k).when} · החזר תאורטי ${gameRules(k).rtp}</small></button>`).join("")}</div>`)}
      ${devCard("בדרך (מנה 3)", `<ul class="dv-list"><li>מסך בדיקה לכל משחק עם הדגמה אינטראקטיבית</li><li>סימולציה של אלפי סיבובים בטלפון, עם השוואה בין התוצאה בפועל לערך התאורטי</li><li>היסטוריית ריצות</li></ul>`, "soon")}`;
  }
  // ── F. TEST CENTER (honest: nothing runs in-app yet)
  function devTests() {
    return `${devCard("מרכז הבדיקות", `<p>עדיין לא רצות בדיקות בתוך המשחק, ולכן אין כאן אף PASS.</p><p class="dv-muted">במנה 3 ייכנסו כאן כ-30 בדיקות אמיתיות (פונקציונליות, כלכלת משחק, Multiplayer מדומה ומקרי קצה), שרצות על אותו מנוע של המשחק. כל בדיקה תציג מה היא בודקת, תוצאה צפויה, תוצאה בפועל ו-PASS או FAIL.</p>`, "soon")}`;
  }
  function edNoteCount(E, id) { const n2 = (E.notes2 && E.notes2[id]) || {}; return (E.notes[id] ? 1 : 0) + Object.values(n2).filter(Boolean).length; }
  function edHist(E, id, a) { E.hist = E.hist || {}; const h = (E.hist[id] = E.hist[id] || []); h.push({ t: Date.now(), a }); if (h.length > 30) h.splice(0, h.length - 30); }
  function devClick(a, el) {
    const val = el.dataset.v;
    switch (a) {
      case "devArea": DEV.area = val; devSave(); render(); window.scrollTo(0, 0); return true;
      case "devGo": DEV.area = "questions"; ED.f = { ch: "all", mode: "all", diff: "all", st: val === "all" ? "all" : val, q: "" }; DEV.cur = null; devSave(); render(); return true;
      case "dvQ": DEV.cur = val || null; ED.editing = null; devSave(); render(); if (val) { const d = $(".dv-qdetail"); if (d) d.scrollTop = 0; if (innerWidth < 900) window.scrollTo(0, 0); } return true;
      case "dvStep": { const list = edList(); const i = list.findIndex((q) => q.id === DEV.cur); const n = list[i + Number(val)]; if (n) { DEV.cur = n.id; ED.editing = null; devSave(); render(); } return true; }
      case "dvNextNew": { const E = getEdits(); const list = edList(); const i = Math.max(0, list.findIndex((q) => q.id === DEV.cur)); const n = list.slice(i + (DEV.cur ? 1 : 0)).find((q) => !E.status[q.id]) || list.find((q) => !E.status[q.id]);
        if (!n) { toast("אין שאלות שלא נבדקו בסינון הזה 🎉"); return true; } DEV.cur = n.id; ED.editing = null; devSave(); render(); return true; }
      case "devScenario": A.scenario = val; devSave(); render(); return true;
      case "devBackToGame": A.screen = "game"; A.inspector = true; render(); window.scrollTo(0, 0); return true;
      case "devResumeTest": { const h = LS.get("tgg_test_host", null); const st = LS.get("tgg_test_host_state", null); if (!h || !st) return true;
        const bank = {}; for (const q of loadBank(true)) bank[q.id] = q; HOST.state = Object.assign(st, { bank });
        if (HOST.state.phaseEndsAt && !HOST.state.paused) { HOST.state.paused = { remaining: Math.max(15000, HOST.state.phaseEndsAt - Date.now()) }; HOST.state.phaseEndsAt = null; }
        A.practice = true; A.playtest = !!st.playtest; A.inspector = !!st.playtest; A.screen = "game"; devLog("המשך משחק בדיקה שמור"); hostStart(h.room, true, true); return true; }
      case "devDelTest": confirmBox("למחוק את משחק הבדיקה השמור? משחק אמיתי לא יושפע.", "מחיקה", () => { LS.del("tgg_test_host"); LS.del("tgg_test_host_state"); devLog("נמחק משחק בדיקה שמור"); render(); }, true); return true;
    }
    return false;
  }
  function devKeys(e) {
    if (A.screen !== "dev" || DEV.area !== "questions" || !DEV.cur || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return; if ($(".modal")) return;
    const click = (sel) => { const b = $(sel); if (b) { b.click(); e.preventDefault(); } };
    const k = e.key;
    if (k === "ArrowLeft") click('[data-a=dvStep][data-v="1"]'); else if (k === "ArrowRight") click('[data-a=dvStep][data-v="-1"]');
    else if (k === "1") click(`.dv-qdetail [data-a=edSt][data-v=ok]`); else if (k === "2") click(`.dv-qdetail [data-a=edSt][data-v=fix]`); else if (k === "3") click(`.dv-qdetail [data-a=edSt][data-v=out]`);
    else if (k === "n" || k === "N") click("[data-a=dvNextNew]"); else if (k === "e" || k === "E") click(".dv-qdetail [data-a=edEdit]"); else if (k === "p" || k === "P") click(".dv-qdetail [data-a=edPreview]");
  }
  document.addEventListener("keydown", devKeys);

  // ═════════════════ TEST GAME: scenarios + GAME INSPECTOR (playtest only) ═════════════════
  const SCENARIOS = {
    none: { ic: "▶", t: "רגיל", d: "משחק בדיקה רגיל, בלי שינויים" },
    rich: { ic: "💰", t: "יתרה גבוהה מאוד", d: "אתה מתחיל עם 60,000 מטבעות" },
    broke: { ic: "🪫", t: "כמעט פשיטת רגל", d: "אתה מתחיל עם 150 מטבעות, ממש מעל ההימור המינימלי" },
    leader: { ic: "🥇", t: "מוביל בניקוד", d: "אתה מתחיל עם 3,000 נקודות, הבוטים עם מעט" },
    behind: { ic: "🐢", t: "בפיגור", d: "הבוטים מתחילים עם 2,500–3,500 נקודות, אתה מ-0" },
    loser: { ic: "📉", t: "מפסיד בכל ההימורים", d: "הבוט טגו תמיד טועה ומהמר גבוה על עצמו" },
    streak: { ic: "🔥", t: "מנצח ברצף", d: "הבוטית מוצרלה תמיד צודקת ומהמרת גבוה" },
    flaky: { ic: "📶", t: "מתנתק וחוזר", d: "הבוט יוני מתנתק כל 3 שאלות וחוזר בשאלה שאחרי" },
  };
  function applyScenario(s, t) {
    const key = s.devScenario; if (!key || key === "none" || s.devScenarioApplied) return false; s.devScenarioApplied = true;
    const me = Object.values(s.players).find((p) => p.token === token); const bots = Object.values(s.players).filter((p) => p.bot); const L = "תרחיש " + SCENARIOS[key].t;
    s.devBots = s.devBots || {};
    if (key === "rich" && me) TGG.devAdjust(s, t, me.id, { coins: 60000 }, L);
    if (key === "broke" && me) TGG.devAdjust(s, t, me.id, { coins: 150 }, L);
    if (key === "leader") { if (me) TGG.devAdjust(s, t, me.id, { score: 3000 }, L); bots.forEach((b, i) => TGG.devAdjust(s, t, b.id, { score: 200 * i }, L)); }
    if (key === "behind") { if (me) TGG.devAdjust(s, t, me.id, { score: 0 }, L); bots.forEach((b, i) => TGG.devAdjust(s, t, b.id, { score: 2500 + 500 * i }, L)); }
    const pick = (id) => bots.find((b) => b.id === id) || bots[0];
    if (key === "loser" && bots.length) s.devBots[pick("tego").id] = "lose";
    if (key === "streak" && bots.length) s.devBots[pick("mozzarella").id] = "win";
    if (key === "flaky" && bots.length) s.devBots[pick("yoni").id] = "flaky";
    return true;
  }
  const PHASE_HE = { lobby: "לובי", betting: "הימורים", answering: "תשובות", reveal: "חשיפה", roulette: "הפסקת קזינו", chapter_summary: "סיכום פרק", game_over: "סוף המשחק" };
  const EV_HE = { start: "המשחק התחיל", phase: "מעבר שלב", bet: "הימור ננעל", answer: "תשובה ננעלה", reveal: "התשובות נחשפו", skip: "דילוג על שאלה", nextChapter: "מעבר לפרק הבא", pause: "השהיה", resume: "המשך",
    join: "שחקן הצטרף", rejoin: "שחקן חזר", spin: "תוצאת קזינו", crash_start: "הרקטה המריאה", crash: "הרקטה התפוצצה", solo_done: "הפסקת קזינו נסגרה", bankrupt: "פשיטת רגל", end: "המשחק נגמר",
    dev_advance: "⚙ מעבר שלב ידני", connect: "שחקן התחבר", dev_adjust: "⚙ שינוי פיתוח", disconnect: "שחקן התנתק" };
  function evText(s, e) {
    const nm = (id) => (s.players[id] ? s.players[id].name : id);
    const bits = [];
    if (e.pid) bits.push(nm(e.pid)); if (e.phase) bits.push(PHASE_HE[e.phase] || e.phase); if (e.from) bits.push("מ" + (PHASE_HE[e.from] || e.from));
    if (e.total != null) bits.push(fmt(e.total) + " מטבעות"); if (e.label) bits.push(e.label); if (e.kind) bits.push(String(e.kind).toUpperCase()); if (e.qid) bits.push(e.qid);
    return `${EV_HE[e.type] || e.type}${bits.length ? " · " + esc(bits.join(" · ")) : ""}`;
  }
  function nextEventText(s) {
    const r = s.round; const R = s.order.length;
    if (s.phase === "lobby") return "מחכים שהמארח ילחץ “התחל”";
    if (s.paused) return "המשחק מושהה";
    const left = s.phaseEndsAt ? Math.max(0, Math.ceil((s.phaseEndsAt - Date.now()) / 1000)) + " שנ׳" : "בלי טיימר: ⏭ או כשכולם מסיימים";
    if (s.phase === "betting") return `→ שלב התשובות (${left})`;
    if (s.phase === "answering") return `→ חשיפת התשובות (${left})`;
    if (s.phase === "reveal") { if (r.n % 5 === 0 && r.n < R) { const plan = s.casinoPlan || []; const k = plan[(r.n / 5 - 1) % plan.length]; return `→ הפסקת קזינו: ${k ? GAMES[k].name : "?"}`; } return r.n >= R ? "→ סוף המשחק" : `→ שאלה ${r.n + 1}`; }
    if (s.phase === "roulette") return r.roulette && r.roulette.results ? `→ שאלה ${r.n + 1}` : `מחכים שכולם יסיימו את ההפסקה (${left})`;
    if (s.phase === "chapter_summary") return "→ הפרק הבא";
    return "—";
  }
  function inspectorHTML() {
    const s = HOST.state; if (!s) return "";
    const r = s.round; const q = r ? s.bank[r.qid] : null; const pl = Object.values(s.players);
    const timer = s.paused ? `מושהה (${Math.ceil(s.paused.remaining / 1000)} שנ׳ נשארו)` : s.phaseEndsAt ? `${Math.max(0, Math.ceil((s.phaseEndsAt - Date.now()) / 1000))} שנ׳` : s.noTimer ? "בלי טיימר" : "—";
    const kv = (k, v) => `<div class="in-kv"><small>${k}</small><b>${v}</b></div>`;
    const betTxt = (pid) => { const b = r && r.bets[pid]; if (!b) return `<span class="dv-muted">—</span>`; const parts = []; if (b.own) parts.push(`עצמי ${fmt(b.own.amount)}`); if (b.friend) parts.push(`על ${esc(s.players[b.friend.target] ? s.players[b.friend.target].name : "")} ${fmt(b.friend.amount)}`); if (b.ou) parts.push(`${b.ou.side === "over" ? "מעל" : "מתחת"} ${fmt(b.ou.amount)}`); return parts.join(" · ") || "בלי הימור"; };
    const ansTxt = (pid) => { const a = r && r.answers[pid]; if (!a) return `<span class="dv-muted">—</span>`; const res = r.results && r.results[pid]; return `${esc(fmtAnswer(q, a.value)).slice(0, 40)}${res ? (res.win ? " ✓" : " ✗") : ""}`; };
    const rows = pl.map((p) => { const pol = s.devBots && s.devBots[p.id]; const bon = []; if (p.streak >= 2) bon.push(`רצף ${p.streak}`); if (p.comebackUsed) bon.push("COMEBACK נוצל"); if (p.bankrupt) bon.push("פשט רגל");
      return `<tr><td><b>${esc(p.name)}</b>${p.bot ? ` <small class="dv-muted">בוט${pol ? " · " + { lose: "תמיד טועה", win: "תמיד צודק", flaky: "מתנתק" }[pol] : ""}</small>` : " <small class=\"dv-muted\">אתה</small>"}</td>
        <td><i class="dv-dot ${p.connected ? "ok" : "bad"}" title="${p.connected ? "מחובר" : "מנותק"}"></i></td><td><span class="mx">${fmt(p.coins)}</span></td><td><span class="mx">${fmt(p.score)}</span></td><td>${betTxt(p.id)}</td><td>${ansTxt(p.id)}</td><td>${bon.join(" · ") || "—"}</td></tr>`; }).join("");
    const log = s.log.slice(-40).reverse();
    const ro = r && r.roulette;
    return `<div class="in-head"><div><b>GAME INSPECTOR</b>${s.devScenario && s.devScenario !== "none" ? `<span class="in-tag">תרחיש: ${SCENARIOS[s.devScenario].t}</span>` : ""}${s.devChanges ? `<span class="in-tag warn">${s.devChanges} שינויי פיתוח</span>` : ""}</div><button class="dv-mini" data-in="close">✕</button></div>
      <div class="in-ctrl"><button class="dv-mini" data-in="adv" title="מעבר לשלב הבא">⏭ שלב הבא</button>${s.noTimer ? `<button class="dv-mini" disabled title="המשחק הזה בלי טיימר">⏸ אין טיימר</button>` : s.paused ? `<button class="dv-mini" data-in="resume">▶ המשך</button>` : `<button class="dv-mini" data-in="pause">⏸ השהיה</button>`}
        <button class="dv-mini" data-in="skip">⤼ דלג על השאלה</button><button class="dv-mini" data-in="nextChapter">⏩ פרק הבא</button><button class="dv-mini" data-in="restart">↺ התחלה מחדש</button><button class="dv-mini danger" data-in="end">⏹ סיום</button></div>
      <div class="in-err" id="inErr"></div>
      <div class="in-grid">${kv("שלב", PHASE_HE[s.phase] || s.phase)}${kv("שאלה", r ? `${r.n} / ${s.order.length}` : "—")}${kv("פרק", r ? r.chapter : "—")}${kv("טיימר", `<span id="inTimer">${timer}</span>`)}</div>
      <div class="in-next"><small>האירוע הבא</small><b id="inNext">${nextEventText(s)}</b></div>
      ${q ? `<div class="in-q"><small class="en">${q.id} · ${q.difficulty} · ${q.answer_type}</small><div>${esc(q.prompt)}</div><div class="in-ans">✔ ${edCorrect(q)}</div></div>` : ""}
      ${ro ? `<div class="in-q"><small>הפסקת קזינו</small><div class="en">${GAMES[ro.kind].name} ${ro.solo ? "· כל אחד סיבוב אחד" : "· כולם יחד"} ${ro.results ? "· הסתיימה" : ""}</div></div>` : ""}
      <table class="dv-table in-pl"><thead><tr><td>שחקן</td><td></td><td>מטבעות</td><td>ניקוד</td><td>הימור</td><td>תשובה</td><td>בונוסים</td></tr></thead><tbody>${rows}</tbody></table>
      <div class="in-last"><small>הפעולה האחרונה</small> ${log[0] ? `${evText(s, log[0])} · <span class="dv-muted">${new Date(log[0].at).toLocaleTimeString("he-IL")}</span>` : "—"}</div>
      <h4>יומן אירועים <small class="dv-muted">(לחיצה פותחת פרטים)</small></h4>
      <ol class="in-log">${log.map((e, i) => `<li data-in="ev" data-i="${i}"><span class="dv-muted">${new Date(e.at).toLocaleTimeString("he-IL")}</span> ${evText(s, e)}${A.inOpen === e.at + e.type ? `<pre>${esc(JSON.stringify(e, null, 1))}</pre>` : ""}</li>`).join("")}</ol>`;
  }
  function updateInspector() {
    let w = $("#insp");
    if (!A.inspector || !HOST.state || !HOST.state.playtest || A.screen !== "game") { if (w) w.remove(); document.body.classList.remove("has-insp"); return; }
    if (!w) { w = document.createElement("aside"); w.id = "insp"; document.body.appendChild(w); w.addEventListener("click", inspClick);
      clearInterval(A.inTimer); A.inTimer = setInterval(() => { const s = HOST.state; if (!s || !$("#insp")) return clearInterval(A.inTimer); const tm = $("#inTimer"); if (tm && s.phaseEndsAt && !s.paused) tm.textContent = Math.max(0, Math.ceil((s.phaseEndsAt - Date.now()) / 1000)) + " שנ׳"; const nx = $("#inNext"); if (nx) nx.textContent = nextEventText(s); }, 500); }
    document.body.classList.add("has-insp");
    const sc = w.scrollTop; w.innerHTML = inspectorHTML(); w.scrollTop = sc;
  }
  function inspClick(e) {
    const b = e.target.closest("[data-in]"); if (!b) return; const a = b.dataset.in; const s = HOST.state; const t = Date.now(); let r = { ok: true };
    if (a === "close") { A.inspector = false; updateInspector(); render(); return; }
    if (a === "ev") { const ev = s.log.slice(-40).reverse()[Number(b.dataset.i)]; A.inOpen = A.inOpen === ev.at + ev.type ? null : ev.at + ev.type; updateInspector(); return; }
    if (a === "restart") { confirmBox("להתחיל את משחק הבדיקה מחדש עם אותן הגדרות?", "מחדש", () => { LS.set("tgg_dev_restart", { length: s.length, noTimer: s.noTimer, onlyNew: !!s.onlyIds, scenario: s.devScenario || "none" }); LS.del("tgg_test_host"); LS.del("tgg_test_host_state"); devLog("משחק בדיקה הותחל מחדש"); location.reload(); }); return; }
    if (a === "end") { confirmBox("לסיים את משחק הבדיקה?", "סיום", () => { TGG.hostAction(s, Date.now(), "end"); hostChanged(); }); return; }
    if (a === "adv") r = TGG.devAdvance(s, t); else r = TGG.hostAction(s, t, a);
    const err = $("#inErr"); if (r && r.error) { if (err) { err.textContent = "⚠ " + r.error; err.classList.add("on"); } } else { devLog(`Inspector: ${b.textContent.trim()}`); hostChanged(); }
  }

  // ═════════════════ SOLO: question + floating bet panel on one shared clock ═════════════════
  const LEVEL_NAME = { 1: "קלה", 2: "בינונית", 3: "קשה", 4: "הכי קשה" };
  // ═════ NUMBER QUESTIONS: pick a range on a slider. Narrow range = bigger multiplier ═════
  const NR_NAME = { 6: "בול", 2.5: "צר", 1.4: "רחב" };
  function nrChip(q, a) { const ch = q.nscale.chips; if (a.h == null || !ch.some((c) => c.h === a.h)) a.h = ch[ch.length - 1].h; return ch.find((c) => c.h === a.h); }
  function nrLabel(q, c, h) { const ns = q.nscale; const lo = Math.max(ns.min, c - h), hi = Math.min(ns.max, c + h); return h === 0 ? `בדיוק <b class="mx">${fmt(c)}</b>` : `בין <b class="mx">${fmt(lo)}</b> ל-<b class="mx">${fmt(hi)}</b>`; }
  function nrPos(ns, x) { return ((x - ns.min) / (ns.max - ns.min)) * 100; }
  function rangePicker(q, a) {
    const ns = q.nscale; const chip = nrChip(q, a); const has = a.num !== "" && a.num != null; const c = has ? Number(a.num) : Math.round((ns.min + ns.max) / 2 / ns.step) * ns.step;
    const lo = Math.max(ns.min, c - chip.h), hi = Math.min(ns.max, c + chip.h);
    return `<div class="nrange ${has ? "set" : ""}" data-min="${ns.min}" data-max="${ns.max}" data-step="${ns.step}">
      <div class="nr-read"><span class="nr-txt" id="nrTxt">${has ? nrLabel(q, c, chip.h) : `<span class="muted">גרור את הסמן אל התשובה שלך</span>`}</span><span class="nr-mult mx" id="nrMult">×${chip.mult}</span></div>
      <div class="nr-track" dir="ltr"><div class="nr-rail"></div><div class="nr-win" id="nrWin" style="left:${nrPos(ns, lo)}%;width:${Math.max(0.8, nrPos(ns, hi) - nrPos(ns, lo))}%"></div>
        <input class="nr-in" id="nrIn" type="range" min="${ns.min}" max="${ns.max}" step="${ns.step}" value="${c}" aria-label="התשובה שלך"></div>
      <div class="nr-ends" dir="ltr"><span class="mx">${fmt(ns.min)}</span><span class="tiny muted">${esc((q.numeric && q.numeric.unit) || "")}</span><span class="mx">${fmt(ns.max)}</span></div>
      <div class="nr-fine"><button class="pill" data-a="nrStep" data-v="-1" aria-label="פחות">−</button><button class="pill" data-a="kpAns">${ic("chart")} הקלד מספר</button><button class="pill" data-a="nrStep" data-v="1" aria-label="יותר">+</button></div>
      <div class="nr-chips">${ns.chips.map((x) => `<button class="${x.h === chip.h ? "on" : ""}" data-a="nrChip" data-v="${x.h}" aria-pressed="${x.h === chip.h}"><b>${NR_NAME[x.mult] || ""}</b><span class="mx">×${x.mult}</span><small>${x.h ? `±${fmt(x.h)}` : "מספר אחד"}</small></button>`).join("")}</div></div>`;
  }
  // the reveal: a marker runs along the number line and slows down onto the real answer
  function numLine(q, R, n) {
    const ns = q.nscale; const c = Number(q.correct_answer); const done = A.nrDone === n;
    const win = R ? `<div class="nl-win ${R && c >= R.lo && c <= R.hi ? "hit" : ""}" style="left:${nrPos(ns, R.lo)}%;width:${Math.max(0.8, nrPos(ns, R.hi) - nrPos(ns, R.lo))}%"></div>` : "";
    return `<div class="nreveal ${done ? "done" : ""}" data-n="${n}" data-c="${c}" data-min="${ns.min}" data-max="${ns.max}" data-hit="${R && c >= R.lo && c <= R.hi ? 1 : 0}">
      <div class="nl-top"><span class="tiny muted">${R ? (R.lo === R.hi ? `ניחשת ${fmt(R.lo)}` : `הטווח שלך: ${fmt(R.lo)}–${fmt(R.hi)}`) : "לא בחרת טווח"}</span><b class="nl-val mx" id="nlVal">${fmt(done ? c : ns.min)}</b></div>
      <div class="nl-track" dir="ltr"><div class="nr-rail"></div>${win}<div class="nl-mark" id="nlMark" style="left:${done ? nrPos(ns, c) : 0}%"></div></div>
      <div class="nr-ends" dir="ltr"><span class="mx">${fmt(ns.min)}</span><span class="tiny muted">${esc((q.numeric && q.numeric.unit) || "")}</span><span class="mx">${fmt(ns.max)}</span></div></div>`;
  }
  function numRevealAfterRender() {
    const el = $(".nreveal"); const hero = $(".reshero");
    if (!el) return; const n = Number(el.dataset.n);
    if (A.nrDone === n || el.classList.contains("done")) { if (hero) hero.classList.remove("pending"); return; }
    if (el._run) return; el._run = true; if (hero) hero.classList.add("pending");
    const min = Number(el.dataset.min), max = Number(el.dataset.max), c = Number(el.dataset.c); const hit = el.dataset.hit === "1";
    const mark = $("#nlMark"), val = $("#nlVal"); const T = 2400; const t0 = performance.now(); let lastTick = 0;
    const ease = (x) => 1 - Math.pow(1 - x, 4);
    const step = (now) => {
      if (!document.body.contains(el)) return;
      const x = Math.min(1, (now - t0) / T); const cur = min + (c - min) * ease(x);
      if (mark) mark.style.left = ((cur - min) / (max - min)) * 100 + "%"; if (val) val.textContent = fmt(Math.round(cur));
      if (now - lastTick > 60 + 260 * ease(x)) { lastTick = now; SND.play("tick"); }
      if (x < 1) requestAnimationFrame(step);
      else { A.nrDone = n; el.classList.add("done", hit ? "hit" : "miss"); SND.play(hit ? "correct" : "wrong"); if (hero) hero.classList.remove("pending");
        const v2 = A.view; const mr = v2 && v2.round && v2.round.results && v2.round.results[v2.me]; if (mr) { if (mr.coins > 0) setTimeout(() => SND.play("coins"), 300); setTimeout(() => { render(); revealJuice(v2, mr); }, 120); } if (hit && navigator.vibrate) try { navigator.vibrate(30); } catch (e) {} }
    };
    requestAnimationFrame(step);
  }
  function rangeAfterRender() { // live slider feedback without re-rendering while the thumb is dragged
    const inp = $("#nrIn"); if (!inp || inp._bound) return; inp._bound = true;
    const v = A.view; const q = v && v.round && v.round.q; if (!q || !q.nscale) return; const ns = q.nscale;
    const upd = (commit) => { const a = A.ui.ans; a.num = String(inp.value); const ch = nrChip(q, a); const c = Number(inp.value); const lo = Math.max(ns.min, c - ch.h), hi = Math.min(ns.max, c + ch.h);
      const w = $("#nrWin"); if (w) { w.style.left = nrPos(ns, lo) + "%"; w.style.width = Math.max(0.8, nrPos(ns, hi) - nrPos(ns, lo)) + "%"; }
      const t = $("#nrTxt"); if (t) t.innerHTML = nrLabel(q, c, ch.h); const box = $(".nrange"); if (box) box.classList.add("set");
      if (commit) render(); };
    inp.addEventListener("input", () => { upd(false); if (!inp._tick || Date.now() - inp._tick > 70) { inp._tick = Date.now(); SND.play("tick"); } });
    inp.addEventListener("change", () => upd(true));
  }
  function soloReady(q, a) {
    const t = q.answer_type;
    if (t === "choice" || t === "vote") return !!a.sel; if (t === "number") return a.num !== "" && a.num != null;
    if (t === "ranking" || t === "order") return a.order.length === q.options.length; if (t === "matching") return q.options.every((o) => a.match[o.id]); return false;
  }
  function soloValue(q, a) { const t = q.answer_type; if (!soloReady(q, a)) return null; return t === "choice" || t === "vote" ? a.sel : t === "number" ? (q.nscale ? { c: Number(a.num), h: nrChip(q, a).h } : Number(a.num)) : t === "matching" ? a.match : a.order; }
  function soloQuestionScreen(v) {
    const r = v.round, q = r.q; const lvl = r.level; const max = v.maxOwnBet; const bet = Math.min(A.ui.soloBet || 0, max);
    const isNum = q.answer_type === "number" && !!q.nscale; const nchip = isNum ? nrChip(q, A.ui.ans) : null; const mult = isNum ? nchip.mult : TGG.SOLO.MULT[lvl] || 2; const ex = mult;
    const base = answerScreen(v); // reuse the answer UI; replace head and foot
    const left = Math.max(0, Math.ceil(((r.deadline || 0) - now()) / 1000));
    const ready = soloReady(q, A.ui.ans);
    if (ready && !A.ui.readyAt) A.ui.readyAt = now(); if (!ready) A.ui.readyAt = 0;
    const head = `<div class="st-head solohead"><div class="row" style="gap:6px;align-items:center"><span class="lvl l${lvl}">רמה ${lvl} · ${LEVEL_NAME[lvl]}</span><span class="badge">${r.n}/${r.total}</span>${r.isFinal ? `<span class="badge gold">שאלת הגמר · תקרה מוגדלת</span>` : ""}<span class="sp"></span><b class="solosecs mx ${left <= 10 ? "show" : ""}" id="soloSecs">${left}</b></div>
      <div class="solobar ${left <= 5 ? "hot" : ""}"><i id="soloBar"></i></div><div class="tiny muted soloclk">${ic("clock")} השעון אחד לתשובה ולהימור, והוא לא עוצר כשפותחים את חלון ההימור</div></div>`;
    const lines = (b) => !b ? `<div class="oddsrow"><span class="muted">בחר סכום כדי לראות כמה תרוויח או תפסיד</span><b></b></div>` : isNum
      ? `<div class="oddsrow"><span>${ic("check")} בתוך הטווח (×${mult})</span><b class="pos mx">+${fmt(Math.round(b * (mult - 1)))}</b></div><div class="oddsrow"><span>${ic("x")} מחוץ לטווח</span><b class="neg mx">−${fmt(b)}</b></div>`
      : `<div class="oddsrow"><span>${ic("check")} צדקת</span><b class="pos mx">+${fmt(b * (mult - 1))}</b></div><div class="oddsrow"><span>${ic("x")} טעית</span><b class="neg mx">−${fmt(b)}</b></div>`;
    const pop = A.ui.betOpen ? `<div class="betpop"><div class="row" style="justify-content:space-between;align-items:center"><b class="row" style="gap:6px">${ic("chips")} הימור על התשובה שלך</b><button class="pill icbtn" data-a="betClose" aria-label="סגירה">${ic("x")}</button></div>
        <p class="small muted" style="margin:4px 0 8px">${isNum ? `שאלת מספר: אם המספר הנכון בתוך הטווח שבחרת, מקבלים <b>×${mult}</b>. טווח צר יותר = מכפיל גבוה יותר.` : `רמה ${lvl}: צודק = <b class="mx">×${mult}</b> מההימור, טועה = מפסיד אותו.`} אפשר להמר עד <b class="mx">${fmt(max)}</b>${r.isFinal ? " (שאלת הגמר: עד 40% מהיתרה)" : ` (רמה ${lvl}, ועד רבע מהיתרה)`}.</p>
        ${betField("solo", bet, max)}${lines(bet)}
        <button class="btn pri" style="width:100%;margin-top:6px" data-a="betClose">${ic("check")} אישור · חזרה לשאלה</button></div>` : "";
    if (!max) return { head, body: base.body, foot: `<div class="betbar off"><span class="bb-ic">${ic("info")}</span><span class="bb-t"><b>${q.kind === "opinion" ? "שאלת דעה: בלי הימור" : "אין מספיק מטבעות להימור"}</b><small>${q.kind === "opinion" ? "עונים בשביל הניקוד בלבד" : "עונים בשביל הניקוד"}</small></span></div>
      <button class="btn gold big" data-a="soloLock" ${ready ? "" : "disabled"}>${ic("lock")} נעל תשובה</button>` };
    const foot = `${pop}<button class="betbar ${bet ? "on" : ""}" data-a="betOpen"><span class="bb-ic">${bet ? chipStack(bet) : ic("chips")}</span><span class="bb-t"><b>${bet ? `הימור ${fmt(bet)}` : "בחר סכום הימור"}</b><small>${bet ? (isNum ? `בטווח = +${fmt(Math.round(bet * (mult - 1)))} · מחוץ = −${fmt(bet)}` : `צודק = +${fmt(bet * (mult - 1))} · טועה = −${fmt(bet)}`) : `עד ${fmt(max)} · ${isNum ? `בטווח ×${mult}` : `×${mult}`}`}</small></span><span class="bb-go">${bet ? "שינוי" : "הימור"}</span></button>
      <button class="btn gold big" data-a="soloLock" ${ready ? "" : "disabled"}>${ic("lock")} ${bet ? `נעל תשובה + הימור ${fmt(bet)}` : "נעל בלי הימור"}</button>`;
    return { head, body: base.body, foot };
  }
  function soloClock() {
    clearInterval(A.soloTimer); const v = A.view; if (!v || !v.solo || v.phase !== "answering" || !v.round || v.myAnswer != null) return;
    A.soloTimer = setInterval(() => {
      const w = A.view; if (!w || w.phase !== "answering" || !w.round) return clearInterval(A.soloTimer);
      if (w.paused) return;
      const ms = (w.round.deadline || 0) - now(); const sec = Math.max(0, Math.ceil(ms / 1000));
      const e = $("#soloSecs"); if (e && e.textContent !== String(sec)) { e.textContent = sec; if (sec <= 5 && sec > 0) { SND.play("tickLow"); e.classList.add("hot"); } }
      const bar = $(".solobar"); if (bar) bar.classList.toggle("hot", sec <= 5); const sw = $(".solosecs"); if (sw) sw.classList.toggle("show", sec <= 10);
      if (ms <= 120 && A.soloSent !== w.round.n) { A.soloSent = w.round.n; soloSubmit(true); }
    }, 100);
  }
  function soloSubmit(auto) {
    const v = A.view; if (!v || !v.round) return; const q = v.round.q;
    const bet = Math.min(A.ui.soloBet || 0, v.maxOwnBet); const value = soloValue(q, A.ui.ans);
    A.soloSent = v.round.n; clearInterval(A.soloTimer); A.ui.betOpen = false;
    const r0 = (v.round.deadline || now()) - (v.round.secs || 30) * 1000; let bm = A.ui.betMs || 0; if (A.ui.betT0 && !A.ui.readyAt) bm += now() - A.ui.betT0;
    const think = Math.max(0, (A.ui.readyAt || now()) - r0 - bm);
    send("solo", { value, bet: value == null ? 0 : bet, think });
    if (auto) toast(value == null ? "נגמר הזמן, בלי תשובה" : "נגמר הזמן, התשובה ננעלה"); else { SND.play("lock"); vib(18); }
  }

  // ═════════════════ SOLO: results + share ═════════════════
  function soloStats(v) {
    const me = playerById(v, v.me); const st = v.myStats || {}; const profit = me.coins - v.rules.START_COINS;
    return { me, profit, correct: st.correct || 0, total: (v.progress && v.progress.total) || 25, best: st.bestBet || 0, wagered: st.wagered || 0, score: me.score, totalPts: me.total };
  }
  // story of the game, from the host state on this phone
  function soloMoments(v) {
    const START = v.rules.START_COINS; const s = HOST.state; const pid = v.me; if (!s || !s.rounds) return null;
    const R = s.rounds.map((r) => ({ r, x: r.results[pid] || {}, q: s.bank[r.qid] })).filter((o) => o.q);
    const best = R.filter((o) => o.x.coins > 0).sort((a, b) => b.x.coins - a.x.coins)[0];
    const worst = R.filter((o) => o.x.coins < 0).sort((a, b) => a.x.coins - b.x.coins)[0];
    let run = 0, maxRun = 0; for (const o of R) { run = o.x.win ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
    const byL = {}; for (const o of R) { const L = TGG.levelOf(o.q); (byL[L] = byL[L] || { a: 0, c: 0 }).a++; if (o.x.win) byL[L].c++; }
    const strong = Object.entries(byL).filter(([, x]) => x.a >= 2).sort((a, b) => b[1].c / b[1].a - a[1].c / a[1].a || b[0] - a[0])[0];
    const pl = s.players[pid]; const ev = (pl.tx || []).filter((t) => t.kind === "event" || t.kind === "dev").reduce((a, t) => a + t.amount, 0);
    const casino = (pl.coins - START) - R.reduce((a, o) => a + (o.x.coins || 0), 0) - ev;
    const short = (t) => { t = String(t || ""); return t.length > 46 ? t.slice(0, 44) + "…" : t; };
    return { best: best && { amt: best.x.coins, q: short(best.q.prompt) }, worst: worst && { amt: worst.x.coins, q: short(worst.q.prompt) }, maxRun,
      strong: strong && { lvl: Number(strong[0]), c: strong[1].c, a: strong[1].a }, casino };
  }
  function storyLine(S) {
    const bal = S.profit === 0 ? `${fmt(S.me.coins)} (ללא שינוי)` : `${fmt(S.me.coins)} (${sgn(S.profit)})`;
    return `ענית נכון על ${S.correct} מתוך ${S.total} · המאזן שלך: ${bal}`;
  }
  function renderSoloFinal(v) {
    const S = soloStats(v); const M = soloMoments(v) || {}; const up = S.profit > 0, down = S.profit < 0; const B = bestOf(history().filter((x) => !(HOST.state && x.key === HOST.state.room + ":" + (HOST.state.startedAt || 0))));
    const RV = !v.playtest && rivalry(S); const rec = RV ? RV.score.isPB : B && S.score > B.score;
    const mo = [
      M.best && `<div class="mo"><span class="mo-ic pos">${ic("up")}</span><div><b>ההימור הכי טוב: <span class="pos mx">+${fmt(M.best.amt)}</span></b><small>${esc(M.best.q)}</small></div></div>`,
      M.worst && `<div class="mo"><span class="mo-ic neg">${ic("down")}</span><div><b>הנפילה הכי כואבת: <span class="neg mx">−${fmt(-M.worst.amt)}</span></b><small>${esc(M.worst.q)}</small></div></div>`,
      M.maxRun >= 2 && `<div class="mo"><span class="mo-ic">${ic("bolt")}</span><div><b>רצף של ${M.maxRun} תשובות נכונות ברציפות</b></div></div>`,
      M.strong && `<div class="mo"><span class="mo-ic">${ic("target")}</span><div><b>הכי חזק ברמה ${M.strong.lvl} · ${LEVEL_NAME[M.strong.lvl]}</b><small>${M.strong.c} מתוך ${M.strong.a} נכונות</small></div></div>`,
      M.casino ? `<div class="mo"><span class="mo-ic">${ic("chips")}</span><div><b>הפסקות הקזינו: <span class="${M.casino > 0 ? "pos" : "neg"} mx">${sgn(M.casino)}</span></b></div></div>` : "",
    ].filter(Boolean).join("");
    return `<div class="card center sfinal ${up ? "up" : down ? "down" : ""}" data-pb="${rec ? 1 : 0}" data-score="${S.score}" data-profit="${S.profit}">${avatar(S.me, "lg")}<div class="tiny muted" style="margin-top:6px">${esc(S.me.name)} סיים את המשחק${rec ? ` · <b class="pos">שיא אישי חדש!</b>` : ""}</div>
        <div class="fin2"><div><span class="row" style="gap:5px;justify-content:center">${ic("star")} ניקוד</span><b class="mx fin-s">${fmt(S.score)}</b></div><div><span class="row" style="gap:5px;justify-content:center">${ic("coin")} מאזן</span><b class="mx fin-p ${up ? "pos" : down ? "neg" : ""}">${S.profit ? sgn(S.profit) : "0"}</b></div></div>
        <p class="small" style="margin:8px 0 0">${storyLine(S)}</p></div>
      ${RV ? `<div class="card rivals"><h3>איפה אתה בטבלה</h3>${ovtTable(RV.score.passed.length ? RV.score : RV.coins.passed.length ? RV.coins : null, RV.score.passed.length ? "score" : "coins", S.me.id)}${rivalLine(RV.score, "score")}${rivalLine(RV.coins, "coins")}</div>` : ""}
      ${mo ? `<div class="card moments"><h3>רגעי השיא שלך</h3>${mo}</div>` : ""}
      ${boardCard(S.me.id)}
      <button class="btn gold big" data-a="soloShare">${ic("share")} שתף את התוצאה בקבוצה</button>
      <a class="btn wabtn" href="${waLink(shareText(v))}" target="_blank" rel="noopener" style="margin-top:8px">${ic("share")} שלח טקסט ישר לווטסאפ</a>
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn" style="flex:1" data-a="soloCopy">${ic("copy")} העתק טקסט</button><button class="btn" style="flex:1" data-a="soloImg">${ic("download")} הורד תמונה</button></div>
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn" style="flex:1" data-a="goSolo">${ic("refresh")} משחק חדש</button><button class="btn" style="flex:1" data-a="openFree">${ic("chips")} קזינו חופשי</button></div>`;
  }
  function shareText(v) {
    const S = soloStats(v); const M = soloMoments(v) || {}; const url = location.protocol.startsWith("http") ? location.href.split("#")[0].split("?")[0] : "";
    const lines = [`סלט · THE GROUP GAMES`, `${S.me.name} סיים משחק:`, `ניקוד ${fmt(S.score)} · ${S.correct}/${S.total} נכונות`, `מאזן: ${S.profit ? sgn(S.profit) : "0"} מטבעות (יתרה ${fmt(S.me.coins)})`];
    if (M.best) lines.push(`ההימור הכי טוב: +${fmt(M.best.amt)} על "${M.best.q}"`);
    if (M.worst) lines.push(`הנפילה הכי כואבת: −${fmt(-M.worst.amt)}`);
    if (M.maxRun >= 3) lines.push(`רצף של ${M.maxRun} נכונות ברציפות`);
    const RV = !v.playtest && rivalry(S);
    if (RV) for (const [k, T] of [["score", "מלך הידע"], ["coins", "מלך הקזינו"]]) { const x = RV[k];
      if (x.rank === 1) lines.push(`👑 ${T} של הקבוצה${x.passed.length ? ` (עקפתי את ${x.passed.map((id) => CH[id].name).join(" ו")})` : ""}`);
      else if (x.passed.length) lines.push(`עקפתי את ${x.passed.map((id) => CH[id].name).join(" ו")} ב${T}, מקום ${x.rank}`); }
    return lines.join("\n") + (url ? `\n\nנסו לנצח אותי: ${url}` : "");
  }
  // the share picture: a square 1080 game card in the language of the film's end screen —
  // chip, "סלט", portrait, the score in Suez One, an overtake line if there is one, and the site address
  function shareImage(v) {
    const tok = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    const C = { felt: tok("--felt"), deep: tok("--felt-deep"), card: tok("--card"), ivory: tok("--ivory"), dim: tok("--dim"), gold: tok("--gold"), win: tok("--win"), loss: tok("--loss") };
    const load = (src) => new Promise((ok) => { if (!src) return ok(null); const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
    const S = soloStats(v); const av = AVIMG[S.me.id]; const RV = !v.playtest && rivalry(S);
    const chipURL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(SalatChip.svg("share"));
    const fonts = Promise.all(['400 90px "Suez One"', '500 40px "Rubik"', '700 40px "Rubik"'].map((f) => document.fonts.load(f, "סלט 0123"))).catch(() => {});
    return Promise.all([load(av && av.full), load(chipURL), fonts]).then(([pic, chip]) => new Promise((res) => {
      const W = 1080, c = document.createElement("canvas"); c.width = W; c.height = W; const g = c.getContext("2d");
      // felt with one light from above, a dark edge, and a thin gold frame like a playing card
      let grd = g.createRadialGradient(540, 120, 60, 540, 520, 900); grd.addColorStop(0, C.card); grd.addColorStop(0.45, C.felt); grd.addColorStop(1, C.deep);
      g.fillStyle = grd; g.fillRect(0, 0, W, W);
      g.strokeStyle = C.gold; g.globalAlpha = 0.6; g.lineWidth = 3; g.beginPath(); g.roundRect(40, 40, W - 80, W - 80, 44); g.stroke(); g.globalAlpha = 1;
      // header: the chip and the word
      if (chip) g.drawImage(chip, 540 + 30, 86, 118, 120);
      g.direction = "rtl"; g.textAlign = "right"; g.fillStyle = C.ivory; g.font = '400 96px "Suez One", serif'; g.fillText("סלט", 540 + 10, 182);
      // portrait
      if (pic) { g.save(); g.beginPath(); g.arc(540, 400, 150, 0, Math.PI * 2); g.fillStyle = "rgba(0,0,0,.25)"; g.fill(); g.clip(); g.drawImage(pic, 540 - 170, 230, 340, 340); g.restore();
        g.beginPath(); g.arc(540, 400, 150, 0, Math.PI * 2); g.lineWidth = 6; g.strokeStyle = C.gold; g.stroke(); }
      g.textAlign = "center"; g.fillStyle = C.dim; g.font = '500 38px "Rubik", sans-serif'; g.fillText(`${S.me.name} סיים את THE GROUP GAMES`, 540, 610);
      // the score, big
      g.direction = "ltr"; g.fillStyle = C.gold; g.font = '400 170px "Suez One", serif'; g.fillText(fmt(S.score), 540, 790);
      g.direction = "rtl"; g.font = '500 40px "Rubik", sans-serif'; g.fillStyle = C.ivory;
      g.fillText(`נקודות · ${S.correct}/${S.total} נכונות · מאזן ${S.profit ? sgn(S.profit) : "0"}`, 540, 856);
      // overtake line
      const pass = RV && (RV.score.passed.length ? RV.score : RV.coins.passed.length ? RV.coins : null);
      if (pass) { g.fillStyle = C.win; g.font = '700 42px "Rubik", sans-serif'; g.fillText(`עקף את ${pass.passed.map((id) => CH[id].name).join(" ו")} בטבלה`, 540, 930); }
      else if (RV && RV.score.isPB) { g.fillStyle = C.win; g.font = '700 42px "Rubik", sans-serif'; g.fillText("שיא אישי חדש", 540, 930); }
      g.direction = "ltr"; g.fillStyle = C.dim; g.font = '500 30px "Rubik", sans-serif'; g.fillText("elipoli100.github.io/the-group-games", 540, 1000);
      c.toBlob((b) => res(b), "image/png");
    }));
  }
  // Sharing has to work on an iPhone too. Safari only allows navigator.share() straight from the tap,
  // so the picture is prepared in advance (when the final screen opens) and nothing is awaited before sharing.
  // Where sharing isn't available (file opened from WhatsApp, in-app viewers), we fall back to a WhatsApp link,
  // a picture you can long-press to save, and text you can copy.
  const SHARE = { key: null, blob: null, url: null, dl: null };
  // inside the Claude app/site the page runs in a frame where the phone's share sheet is blocked;
  // there the platform's "downloads" hands the picture to the native share sheet (WhatsApp included)
  const IN_FRAME = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
  setTimeout(() => { try { if (window.claude && window.claude.use) window.claude.use("downloads").then((d) => { SHARE.dl = d || null; }).catch(() => {}); } catch (e) {} }, 0);
  function saveViaClaude(onFail) {
    if (!SHARE.dl || !SHARE.blob) return false;
    SHARE.dl.save({ filename: "the-group-games.png", data: SHARE.blob }).then(() => {}, (e) => { const c = e && e.code; if (c !== "declined" && c !== "rate_limited") onFail(); });
    return true;
  }
  function shareKey(v) { return (HOST.state ? HOST.state.room + ":" + (HOST.state.startedAt || 0) : "x") + ":" + (v.me || ""); }
  function prepShare(v) {
    const k = shareKey(v); if (SHARE.key === k) return; SHARE.key = k; SHARE.blob = null; SHARE.url = null;
    shareImage(v).then((b) => { if (SHARE.key !== k || !b) return; SHARE.blob = b; const r = new FileReader(); r.onload = () => { SHARE.url = r.result; }; r.readAsDataURL(b); }).catch(() => {});
  }
  const waLink = (text) => "https://wa.me/?text=" + encodeURIComponent(text);
  function copyFallback(text) {
    try { const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:0;left:0;opacity:0"; document.body.appendChild(t);
      t.select(); t.setSelectionRange(0, text.length); const ok = document.execCommand("copy"); t.remove(); return ok; } catch (e) { return false; }
  }
  function soloShare(kind) {
    const v = A.view; const text = shareText(v);
    if (kind === "copy") {
      const done = () => toast("הטקסט הועתק, אפשר להדביק בקבוצה");
      const manual = () => modal(`<h2>העתקת התוצאה</h2><p class="small muted">סמן את הטקסט והעתק:</p><textarea class="sharetext" readonly>${esc(text)}</textarea><button class="btn pri" data-close>סגירה</button>`);
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => (copyFallback(text) ? done() : manual()));
      else if (copyFallback(text)) done(); else manual();
      return;
    }
    const file = SHARE.blob ? new File([SHARE.blob], "the-group-games.png", { type: "image/png" }) : null;
    const canFile = !!(file && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })());
    if (kind === "img") {
      if (saveViaClaude(showShareImage)) return;
      if (canFile) { navigator.share({ files: [file] }).catch((e) => { if (!e || e.name !== "AbortError") showShareImage(); }); return; }
      showShareImage(); return;
    }
    // share to the group: picture + text when the phone allows it, otherwise text, otherwise straight to WhatsApp
    if (IN_FRAME) { if (saveViaClaude(() => shareFallback(text))) return; shareFallback(text); return; }
    if (navigator.share) {
      const p = canFile ? navigator.share({ files: [file], text }) : navigator.share({ title: "THE GROUP GAMES", text });
      p.catch((e) => { if (!e || e.name !== "AbortError") openWhatsApp(text); }); return;
    }
    openWhatsApp(text);
  }
  function openWhatsApp(text) {
    const url = waLink(text); let w = null; try { w = window.open(url, "_blank"); } catch (e) {}
    if (!w) { if (IN_FRAME) shareFallback(text); else location.href = url; }
  }
  // last resort that always works: a WhatsApp link to tap, the picture to long-press, and the text to copy
  function shareFallback(text) {
    const src = SHARE.url || "";
    modal(`<h2>שיתוף התוצאה</h2>${src ? `<img class="shareimg" src="${src}" alt="תוצאת המשחק"><p class="small muted">לחיצה ארוכה על התמונה ← שמור או שתף</p>` : ""}
      <a class="btn wabtn" href="${waLink(text)}" target="_blank" rel="noopener">${ic("share")} פתח את ווטסאפ עם הטקסט</a>
      <textarea class="sharetext" readonly>${esc(text)}</textarea><button class="btn pri" data-close>סגירה</button>`);
  }
  function showShareImage() {
    const src = SHARE.url || (SHARE.blob ? URL.createObjectURL(SHARE.blob) : null);
    if (!src) { toast("התמונה עוד מוכנה, נסה שוב בעוד שנייה"); prepShare(A.view); return; }
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    modal(`<h2>התמונה שלך</h2><img class="shareimg" src="${src}" alt="תוצאת המשחק">
      <p class="small">${ios || "ontouchstart" in window ? `<b>לחיצה ארוכה על התמונה</b> ואז “שמור בתמונות” או “שתף”.` : "לחיצה ימנית על התמונה ← שמור תמונה בשם, או הכפתור למטה."}</p>
      ${ios ? "" : `<a class="btn" href="${src}" download="the-group-games.png">${ic("download")} הורדה</a>`}<button class="btn pri" style="margin-top:8px" data-close>סגירה</button>`);
  }

  // ───────── BETTING DEMO (interactive walkthrough) ─────────



  // ───────── IN-GAME NUMBER KEYPAD: digits only, the phone keyboard never opens ─────────
  function closeKeypad() { const k = $(".kpwrap"); if (k) k.remove(); }
  function openKeypad({ title, value, max, maxLen = 7, onInput, onDone, quick }) {
    closeKeypad(); let str = value ? String(value) : "";
    const w = document.createElement("div"); w.className = "kpwrap";
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"];
    w.innerHTML = `<div class="kpback" data-kpclose></div><div class="kpsheet"><div class="kphead"><span class="small muted">${esc(title)}</span>${max ? `<span class="small muted">מקס׳ ${fmt(max)}</span>` : ""}</div>
      <div class="kpval" id="kpVal"></div>${quick ? `<div class="presets kpq">${quick.map((q) => `<button data-kpq="${q.v}">${q.l}</button>`).join("")}</div>` : ""}
      <div class="kpgrid">${keys.map((k) => `<button class="kpk ${k === "ok" ? "ok" : k === "del" ? "del" : ""}" data-kp="${k}">${k === "del" ? "⌫" : k === "ok" ? ic("check") : k}</button>`).join("")}</div></div>`;
    document.body.appendChild(w);
    const show = () => { const n = Number(str || 0); $("#kpVal", w).innerHTML = str ? (maxLen === 6 && !max ? esc(str) : fmt(n)) : `<span class="muted">0</span>`; };
    const push = () => { if (onInput) onInput(str); show(); };
    w.addEventListener("click", (e) => {
      const b = e.target.closest("[data-kp],[data-kpq],[data-kpclose]"); if (!b) return; SND.play("tap"); vib(6);
      if (b.dataset.kpclose != null) { closeKeypad(); if (onDone) onDone(str); return; }
      if (b.dataset.kpq != null) { str = String(b.dataset.kpq); push(); pop($("#kpVal", w)); return; }
      const k = b.dataset.kp;
      if (k === "ok") { closeKeypad(); if (onDone) onDone(str); return; }
      if (k === "del") str = str.slice(0, -1);
      else if (str.length < maxLen) { str = (str === "0" ? "" : str) + k; if (max && Number(str) > max) { str = String(max); pop($("#kpVal", w)); SND.play("wrong"); } }
      push();
    });
    show(); requestAnimationFrame(() => w.classList.add("open"));
  }
  function kpForBet(field, max) {
    openKeypad({ title: "סכום הימור", value: getAmt(field) || "", max,
      quick: [{ v: Math.floor(max / 4), l: "¼" }, { v: Math.floor(max / 2), l: "½" }, { v: max, l: "MAX" }].filter((q) => q.v >= TGG.CONST.BET_MIN),
      onInput: (str) => { setAmt(field, Number(str || 0)); render(); },
      onDone: () => { const n = getAmt(field); if (n && n < TGG.CONST.BET_MIN) setAmt(field, TGG.CONST.BET_MIN); render(); } });
  }

  // ───────── GAME FEEL ("juice"): tiered feedback, never blocks input ─────────
  const FX = { trauma: 0, raf: null, layer: null };
  function fxLayer() { if (!FX.layer) { FX.layer = document.createElement("div"); FX.layer.className = "fx"; document.body.appendChild(FX.layer); } return FX.layer; }
  function vib(p) { try { if (navigator.vibrate && !prefs.reduce) navigator.vibrate(p); } catch (e) {} }
  function pop(el) { if (!el || prefs.reduce || !el.animate) return; el.animate([{ transform: "scale(1.25,0.8)" }, { transform: "scale(0.95,1.06)", offset: 0.55 }, { transform: "scale(1)" }], { duration: 220, easing: "cubic-bezier(.34,1.56,.64,1)" }); }
  function addTrauma(x) { if (prefs.reduce) return; FX.trauma = Math.min(1, FX.trauma + x); if (!FX.raf) FX.raf = requestAnimationFrame(shake); }
  function shake(t) { // smooth sine shake on the stage container only; amount = trauma²
    const m = $("main"); FX.trauma = Math.max(0, FX.trauma - 1.2 / 60); const k = FX.trauma * FX.trauma; const s = t / 1000;
    if (m) m.style.transform = k ? `translate(${(Math.sin(s * 47) * 14 * k).toFixed(2)}px,${(Math.sin(s * 39 + 1.3) * 9 * k).toFixed(2)}px) rotate(${(Math.sin(s * 31 + 0.7) * 1.4 * k).toFixed(2)}deg)` : "";
    if (FX.trauma > 0) FX.raf = requestAnimationFrame(shake); else { FX.raf = null; if (m) m.style.transform = ""; }
  }
  function burst(n, origin) {
    if (prefs.reduce) return; const L = fxLayer(); const r = origin && origin.getBoundingClientRect ? origin.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight / 2, width: 40, height: 0 };
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2; const coinEl = $("#coinPill"); const cr = coinEl ? coinEl.getBoundingClientRect() : null;
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span"); c.className = "coinfx"; c.innerHTML = gi(i % 7 === 3 ? "sparkle" : "coin"); c.style.left = x0 + "px"; c.style.top = y0 + "px"; L.appendChild(c);
      const ang = Math.random() * Math.PI * 2, sp = 60 + Math.random() * (n > 15 ? 190 : 110);
      const mx = Math.cos(ang) * sp, my = Math.sin(ang) * sp - 60;
      const tx = cr && i % 2 === 0 ? cr.left + cr.width / 2 - x0 : mx * 1.4, ty = cr && i % 2 === 0 ? cr.top + cr.height / 2 - y0 : my + 160;
      const d = 650 + Math.random() * 450;
      c.animate([{ transform: "translate(0,0) scale(.4)", opacity: 1 }, { transform: `translate(${mx}px,${my}px) scale(1.15)`, opacity: 1, offset: 0.45 }, { transform: `translate(${tx}px,${ty}px) scale(.5)`, opacity: 0 }], { duration: d, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => c.remove();
    }
  }
  function flash() { if (prefs.reduce) return; const f = document.createElement("div"); f.className = "flashfx"; fxLayer().appendChild(f); f.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 260, easing: "ease-out" }).onfinish = () => f.remove(); }
  function banner(text, color, small) {
    const b = document.createElement("div"); b.className = "bannerfx en" + (small ? " small" : ""); b.textContent = text; if (color) b.style.color = color; fxLayer().appendChild(b);
    b.animate(prefs.reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "translate(-50%,-50%) scale(.3) rotate(-8deg)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.15) rotate(2deg)", opacity: 1, offset: 0.25 }, { transform: "translate(-50%,-50%) scale(1) rotate(0)", opacity: 1, offset: 0.75 }, { transform: "translate(-50%,-60%) scale(.9)", opacity: 0 }], { duration: small ? 1200 : 1600, easing: "cubic-bezier(.34,1.56,.64,1)" }).onfinish = () => b.remove();
  }
  // a chip flies in an arc from where you tapped to the bet spot, then the stack pops
  function flyChip(svg, from, target, keep) {
    if (prefs.reduce || !target || !from) { if (target) pop(target); return; }
    const to = target.getBoundingClientRect(); const c = document.createElement("div"); c.className = "flychip"; c.innerHTML = svg;
    c.style.left = from.left + "px"; c.style.top = from.top + "px"; c.style.width = from.width + "px"; c.style.height = from.width + "px"; fxLayer().appendChild(c);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.width / 2);
    c.animate([{ transform: "translate(0,0) scale(1) rotate(0)" }, { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 70}px) scale(1.1) rotate(200deg)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(${keep ? 0.5 : 0.62}) rotate(360deg)`, opacity: keep ? 0 : 1 }],
      { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => { c.remove(); const t2 = $(".betspot .stack") || target; pop(t2); SND.play("chip"); };
  }
  // when bets lock, the whole stack slides up onto the table
  function flyStackAway(html, r) {
    if (prefs.reduce) return; const c = document.createElement("div"); c.className = "flychip stackfly"; c.innerHTML = html;
    c.style.left = r.left + "px"; c.style.top = r.top + "px"; c.style.width = r.width + "px"; c.style.height = r.height + "px"; fxLayer().appendChild(c);
    c.animate([{ transform: "translateY(0) scale(1)", opacity: 1 }, { transform: "translateY(-30px) scale(1.12)", opacity: 1, offset: 0.25 }, { transform: `translateY(-${r.top + 40}px) scale(.4)`, opacity: 0 }], { duration: 650, easing: "cubic-bezier(.5,0,.75,0)" }).onfinish = () => c.remove();
    setTimeout(() => SND.play("chip"), 120);
  }
  // one feedback function, three tiers (small / medium / big)
  function juice(tier, origin, label) {
    const num = label && /\d/.test(label) ? label.replace(/!$/, "") : label && /[\u0590-\u05FF]/.test(label) ? label.replace(/!$/, "") : "";
    if (tier === "big") { vib([40, 60, 40, 60, 140]); M.celebrate("big", { origin, label: num || "זכייה גדולה" }); return; }
    if (tier === "medium") { vib([20, 40, 20]); M.celebrate("medium", { origin }); return; }
    M.celebrate("small", { origin });
  }

  // the coin and score counters roll like an odometer; a rise flashes green once, a drop red
  function countUpCoins() {
    for (const [sel, key, pill] of [["[data-coins]", "shownCoins", "#coinPill"], ["[data-score]", "shownScore", ".scorepill"]]) {
      const el = $(sel); if (!el) continue; const target = Number(el.getAttribute(sel.slice(1, -1)));
      if (A[key] == null || A[key] === target) { A[key] = target; el.textContent = fmt(target); continue; }
      const from = A[key]; A[key] = target; const p = $(pill);
      if (p && !M.reduced()) { p.classList.remove("up", "down"); void p.offsetWidth; p.classList.add(target > from ? "up" : "down"); }
      M.odometer(el, from, target, { fmt });
    }
  }
  // after the reveal timeline lets the coins land: point the counters at the real numbers and roll them
  function syncCounters() {
    const v = A.view; const me = v && playerById(v, v.me); if (!me) return;
    const c = $("[data-coins]"), sc = $("[data-score]"); if (c) c.setAttribute("data-coins", me.coins); if (sc) sc.setAttribute("data-score", me.score || 0); countUpCoins();
  }
  // ── the reveal of one question, on the motion system's timeline (ms from the lock) ──
  //   0–420 cards settle, the one you picked in focus · 420–1100 suspense, light grows on the right card
  //   1100–1500 your card turns over to ✓ or ✗, the right one gets a gold frame · 1500–2400 coins fly, counters roll, the result card rises
  //   2400+ explanation and quote, and only then "לשאלה הבאה" wakes up
  // the question clock: one thin line that shortens continuously (not in one-second jumps)
  function soloBarRun() {
    const b = $("#soloBar"); const v = A.view; if (!b || !v || !v.round || v.phase !== "answering") return;
    const total = (v.round.secs || 30) * 1000; const left = Math.max(0, (v.round.deadline || 0) - now()); const k = left / total;
    b.style.transform = `scaleX(${k})`; if (!b.animate || v.paused || v.myAnswer != null) return;
    b.animate([{ transform: `scaleX(${k})` }, { transform: "scaleX(0)" }], { duration: left, easing: "linear", fill: "forwards" });
  }
  // screen changes: the new screen opens out of the button you tapped; lists enter in 40ms steps
  document.addEventListener("pointerdown", (e) => { const b = e.target.closest && e.target.closest("button,[data-a]"); if (b) A.lastTap = { r: b.getBoundingClientRect(), t: Date.now() }; }, true);
  function sceneEnter() {
    const v = A.view; const key = A.screen + "|" + (A.screen === "game" ? A.tab : "");
    if (key === A.sceneKey) return; const first = A.sceneKey == null; A.sceneKey = key; if (first) return;
    const tap = A.lastTap && Date.now() - A.lastTap.t < 900 ? A.lastTap.r : null; A.lastTap = null;
    const app = $("#app");
    if (tap) M.scene({ getBoundingClientRect: () => tap }); else if (app) M.anim(app, [{ opacity: 0 }, { opacity: 1 }], M.reduced() ? 200 : M.T.scene(), "inOut");
    if (!(v && A.screen === "game" && A.tab === "game")) M.enter(document.querySelectorAll("main > .card, main > section, .charpick > *, .board .brow"));
  }
  // ═════ POSE (tests only, ?dev=2828): puts the game in a fixed state — no clocks, no randomness, no animation —
  //   so a screen can be photographed identically before and after a change. Nothing is saved to history or the leaderboard.
  //   __TGG_APP.pose("gate"|"home"|"claim"|"countdown"|"question"|"reveal"|"casino"|"break-sum"|"final"|"share"); pose(null) returns to the normal game.
  const POSE = { saved: null, T0: Date.UTC(2026, 10, 22, 10, 0, 0) };
  const POSES = ["gate", "home", "claim", "countdown", "question", "reveal", "casino", "break-sum", "final", "share"];
  function pose(name) {
    if (!/[?&]dev=2828(&|$)/.test(location.search)) return Promise.resolve("pose is available only with ?dev=2828");
    if (name == null) { // back to normal: put the device's saved data back exactly as it was, and reload
      if (POSE.saved) { localStorage.clear(); for (const [k, val] of Object.entries(POSE.saved)) localStorage.setItem(k, val); }
      location.reload(); return Promise.resolve("restored");
    }
    if (!POSES.includes(name)) return Promise.resolve("unknown pose: " + name + " · " + POSES.join(", "));
    if (!POSE.saved) {
      POSE.saved = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); POSE.saved[k] = localStorage.getItem(k); }
      Date.now = () => POSE.T0 + POSE.dt; // a frozen clock: question timers stand still (the driver below may step it on, the same way every time)
      Element.prototype.animate = function () { const a = { finished: Promise.resolve(), cancel() {}, finish() {}, pause() {}, play() {}, playState: "finished" }; Object.defineProperty(a, "onfinish", { set(f) { if (f) f(); } }); return a; };
      const st = document.createElement("style"); st.textContent = ".posing *,.posing *::before,.posing *::after{animation:none!important;transition:none!important;caret-color:transparent!important}"; document.head.appendChild(st);
    }
    POSE.dt = 0; let seed = 2828; Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // the engine draws with crypto randomness; in a pose it gets the same seeded numbers every time
    try { Object.defineProperty(window.crypto, "getRandomValues", { configurable: true, value: (arr) => { const bits = arr.BYTES_PER_ELEMENT * 8; for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * Math.pow(2, Math.min(bits, 32))); return arr; } }); } catch (e) {}
    // a clean device and a clean app
    localStorage.clear(); LS.set("tgg_guide_seen", true); LS.set("tgg_prefs", { sound: false, music: false, vol: 0, reduce: true });
    Object.assign(prefs, { sound: false, music: false, reduce: true });
    A.posing = true; document.body.classList.add("posing", "reduce");
    clearInterval(A.soloTimer); if (HOST.loop) clearInterval(HOST.loop); HOST.loop = null; HOST.state = null; HOST.bank = null; BOARD.games = []; BOARD.at = POSE.T0; BOARD.err = false;
    for (const k of Object.keys(A)) if (!["posing"].includes(k)) delete A[k];
    Object.assign(A, { screen: "home", role: null, room: null, view: null, lobby: null, tab: "game", offset: 0, conn: "ok", ui: {}, lastPhaseKey: null, err: null, length: "solo" });
    document.querySelectorAll(".salat-gate,.salat-splash,.cdwrap,.gdwrap,.modal,.overlay,.mfx,.fx,canvas.confetti,.posing-share,.toast").forEach((e) => e.remove());
    // drive the real engine with actions, the way a player would
    const v = () => A.view; let guard = 0;
    const solo = () => { A.solo = true; A.practice = false; A.playtest = false; A.length = "solo"; hostStart("282828", false, false); A.screen = "claim"; A.ui = { claim: { char: "polchak", avatar: AVATARS[0] } }; };
    const claim = () => { send("claim", { char: "polchak", avatar: AVATARS[0] }); A.screen = "game"; A.tab = "game"; };
    const start = () => send("host", { action: "start" });
    const answer = (right) => { const q = HOST.state.bank[v().round.q.id] || v().round.q; send("solo", { value: right ? q.correct_answer : null, bet: right ? Math.min(500, v().maxOwnBet || 0) : 0, think: 6000 }); };
    const step = () => { // one move forward, whatever the phase is
      const w = v(); if (!w) return;
      if (w.phase === "answering") answer(w.round.n % 3 !== 2);
      else if (w.phase === "roulette") { const ro = w.round.roulette; const r = ro && ro.done && ro.done[w.me] === undefined ? send("soloSkip") : { error: 1 };
        if (r && r.error) { const key = w.round.n + ":" + w.phase; send("host", { action: "continue" }); if (v() && v().round && v().round.n + ":" + v().phase === key) { POSE.dt += 60000; hostTick(); } } } // a live game (crash) needs the clock to move on
      else send("host", { action: "continue" });
    };
    const until = (ok) => { while (!ok(v()) && guard++ < 400) step(); };
    if (name === "gate") { render(); window.SALAT_SPLASH && window.SALAT_SPLASH.gate && window.SALAT_SPLASH.gate(); }
    else if (name === "home") render();
    else { solo();
      if (name === "claim") render();
      else { claim(); render();
        if (name === "countdown") startCountdown(() => {}, null, true);
        else { start();
          if (name === "reveal") { answer(true); }
          else if (name === "casino") { until((w) => w.phase === "roulette"); A.breakIntro = { n: v().round.roulette.breakNo, seen: true }; }
          else if (name === "break-sum") { until((w) => w.phase === "roulette"); send("soloSkip"); }
          else if (name === "final" || name === "share") until((w) => w.phase === "game_over");
          A.tlDone = v().round ? v().round.n : null; A.finSeq = null; render();
        } } }
    document.querySelectorAll(".toast").forEach((e) => e.remove()); // messages raised while driving the engine
    window.scrollTo(0, 0);
    const ready = document.fonts ? document.fonts.ready : Promise.resolve();
    if (name !== "share") return ready.then(() => name);
    return ready.then(() => shareImage(v())).then((b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => {
      const o = document.createElement("div"); o.className = "posing-share"; o.style.cssText = "position:fixed;inset:0;z-index:99999;background:var(--felt-deep);display:grid;place-items:center;padding:16px";
      o.innerHTML = `<img src="${r.result}" alt="" style="width:100%;max-width:540px;border-radius:12px">`; document.body.appendChild(o); const im = o.querySelector("img"); (im.complete ? Promise.resolve() : new Promise((d) => (im.onload = d))).then(() => ok(name)); }; r.readAsDataURL(b); }));
  }
  // the casino break opens with a light curtain: the screen goes dark and one lamp comes on over the table
  function breakCurtain() {
    const v = A.view; const ro = v && v.round && v.round.roulette; if (!ro || v.phase !== "roulette" || A.tab !== "game") return;
    const key = v.round.n; if (A.curtain === key) return; A.curtain = key; if (M.reduced()) return;
    const c = document.createElement("div"); c.className = "mcurtain"; c.innerHTML = `<i class="lamp"></i>`; document.body.appendChild(c);
    const d = M.T.reveal();
    c.animate([{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: d + 300, easing: M.ease("inOut"), fill: "forwards" }).onfinish = () => c.remove();
    c.firstChild.animate([{ opacity: 0, transform: "translateX(-50%) scale(.6)" }, { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.4 }, { opacity: 1, transform: "translateX(-50%) scale(1.05)" }], { duration: d + 300, easing: M.ease("out"), fill: "forwards" });
  }
  function claimLabel() {
    const t = $(".claimbtn .cb-t"); if (!t) { A.claimTxt = null; return; } const txt = t.textContent;
    if (A.claimTxt != null && A.claimTxt !== txt) M.anim(t, [{ opacity: 0, transform: "translateY(60%)" }, { opacity: 1, transform: "none" }], M.T.ui(), "out");
    A.claimTxt = txt;
  }
  function revealTimeline() {
    const v = A.view; if (!v || !v.solo || v.phase !== "reveal" || !v.round || A.tab !== "game") return;
    const q = v.round.q, n = v.round.n; if (q.answer_type === "number" && q.nscale) return;
    if (A.tlRun === n) return; A.tlRun = n;
    const body = $(".st-body"), hero = $(".reshero"), fc = $(".flipcard"), next = $(".st-foot [data-a=host]");
    const later = [...document.querySelectorAll(".st-body .expl, .st-body .quote")];
    const res = (v.round.results || {})[v.me] || {}; const bet = (res.bets || [])[0]; const coins = (res.bets || []).reduce((a, b) => a + b.delta, 0);
    if (M.reduced() || !fc || !body) { A.tlDone = n; syncCounters(); return; }
    body.classList.add("tl"); if (next) next.disabled = true;
    const opts = [...fc.querySelectorAll(".opt")]; const right = fc.querySelector(".opt.ok"); const mine = fc.querySelector(".opt.bad") || (res.answered ? right : null);
    const marks = opts.map((o) => [o, o.className]); opts.forEach((o) => o.classList.remove("ok", "bad")); fc.querySelectorAll(".omark").forEach((m) => (m.style.opacity = 0));
    if (hero) hero.style.opacity = 0; later.forEach((e) => (e.style.opacity = 0));
    M.enter(opts); if (mine) mine.classList.add("tl-focus");
    setTimeout(() => right && right.classList.add("tl-glow"), 420);
    setTimeout(() => {
      const card = mine || right; const half = 200;
      if (card) card.animate([{ transform: "perspective(700px) rotateY(0)" }, { transform: "perspective(700px) rotateY(90deg)" }], { duration: half, easing: M.ease("in") });
      setTimeout(() => {
        marks.forEach(([o, c]) => (o.className = c + (o === mine ? " tl-focus" : ""))); fc.querySelectorAll(".omark").forEach((m) => (m.style.opacity = ""));
        if (right) right.classList.add("tl-gold");
        if (card) card.animate([{ transform: "perspective(700px) rotateY(-90deg)" }, { transform: "none" }], { duration: half, easing: M.ease("out") });
      }, half);
    }, 1100);
    setTimeout(() => {
      if (hero) { hero.style.opacity = ""; M.anim(hero, [{ opacity: 0, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }], M.T.ui(), "out"); }
      A.tlDone = n;
      const big = bet && coins >= bet.amount * 2;
      const tier = coins > 0 ? (big ? "big" : "medium") : res.win ? "small" : null;
      const go = () => syncCounters();
      if (tier === "big") { M.celebrate("big", { origin: mine || right, label: "+" + fmt(coins) }); setTimeout(go, M.T.reveal() * 0.7); }
      else if (tier === "medium") { M.celebrate("medium", { origin: mine || right }).then(go); }
      else { if (tier === "small") M.pop(mine || right); go(); }
    }, 1500);
    setTimeout(() => { later.forEach((e) => (e.style.opacity = "")); M.enter(later); if (next) next.disabled = false; }, 2400);
  }

  // slots: reels stop one by one; if the first two match, the last reel slows down (anticipation)
  function slotsAfterRender() {
    const v = A.view; const box = $(".slots"); if (!v || !box || v.phase !== "roulette" || !v.round.roulette.results) return;
    const mine = v.round.roulette.results[v.me]; const after = $("[data-after-spin]");
    if (!mine || !mine.reels) { if (after) after.style.opacity = 1; return; }
    // three of a kind: the winning line stretches across all three reels
    const three = mine.reels[0] === mine.reels[1] && mine.reels[1] === mine.reels[2];
    const line = (anim) => { if (!three || box.querySelector(".winline")) return; const l = document.createElement("i"); l.className = "winline"; box.appendChild(l); if (anim && !M.reduced()) l.animate([{ transform: "translateY(-50%) scaleX(0)" }, { transform: "translateY(-50%) scaleX(1)" }], { duration: M.T.scene(), easing: M.ease("out") }); };
    if (A.ui.spun === v.round.n || prefs.reduce) { if (after) after.style.opacity = 1; line(false); return; }
    A.ui.spun = v.round.n; animateReels(box, mine.reels, v.round.n, () => { const a2 = $("[data-after-spin]"); if (a2) a2.style.opacity = 1; line(true); });
  }
  function animateReels(box, reels, seed, done) {
    const syms = ["polchak", "tego", "mozzarella", "yoni", "coin", "coin", "salad"]; const H = 76; const tease = reels[0] === reels[1];
    if (prefs.reduce) { box.querySelectorAll("[data-reel]").forEach((strip, i) => { strip.innerHTML = `<div class="sym">${slotFace(reels[i])}</div>`; }); done(); return; }
    box.querySelectorAll("[data-reel]").forEach((strip, i) => {
      const n = 14 + i * 5 + (tease && i === 2 ? 8 : 0); const list = [];
      for (let k = 0; k < n; k++) list.push(syms[(k * 3 + i * 5 + seed) % syms.length]); list.push(reels[i]);
      strip.innerHTML = list.map((x) => `<div class="sym">${slotFace(x)}</div>`).join("");
      const dur = 900 + i * 650 + (tease && i === 2 ? 900 : 0);
      if (tease && i === 2) setTimeout(() => { box.classList.add("tease"); }, 900 + 650);
      const end = (list.length - 1) * H;
      const anim = strip.animate([{ transform: "translateY(0)", easing: "cubic-bezier(.3,0,.2,1)" }, { transform: `translateY(-${end + 9}px)`, offset: 0.92, easing: M.ease("back") }, { transform: `translateY(-${end}px)` }], { duration: dur, fill: "forwards" });
      strip.classList.add("spin"); setTimeout(() => strip.classList.remove("spin"), dur * 0.72);
      anim.onfinish = () => { SND.play("reelStop"); pop(strip.parentElement); if (i === 2) { box.classList.remove("tease"); done(); } };
    });
  }
  document.addEventListener("visibilitychange", () => { try { if (!SND.ctx) return; if (document.hidden) SND.ctx.suspend(); else SND.ctx.resume().catch(() => {}); } catch (e) {} }); // if the phone refuses here, the next tap wakes it (SND.init)

  // ───────── events ─────────
  function bind() {
    document.querySelectorAll("[data-a]").forEach((el) => el.addEventListener("click", onClick));
    const vi = $("#volIn"); if (vi) vi.addEventListener("change", (e) => { prefs.vol = Number(e.target.value); LS.set("tgg_prefs", prefs); SND.play("tap"); });
    if (A.screen === "editor" || A.screen === "dev" || (A.view && A.view.playtest && A.screen === "game")) edBind();
  }
  function onClick(e) {
    const el = e.currentTarget; const a = el.dataset.a; const val = el.dataset.v; SND.init();
    const v = A.view; const ui = A.ui;
    if (a.startsWith("dev") || a === "dvQ" || a === "dvStep" || a === "dvNextNew") { if (!edOK()) { editorHub(); return; } if (devClick(a, el)) return; }
    if (a.startsWith("ed") || a.startsWith("goEditor")) { if (a !== "goEditor" && a !== "edLock" && !edOK()) { editorHub(); return; } if (edClick(a, el)) return; }
    switch (a) {
      case "mute": prefs.sound = !prefs.sound; LS.set("tgg_prefs", prefs); SND.music(prefs.sound && v && v.phase === "lobby"); render(); break;
      case "pref": prefs[val] = !prefs[val]; LS.set("tgg_prefs", prefs); if (val !== "reduce") SND.music(v && v.phase === "lobby"); render(); break;
      case "home": A.screen = "home"; A.err = null; render(); break;
      case "goCreate": A.practice = false; A.playtest = false; A.screen = "create"; SND.play("tap"); render(); break;
      case "goSolo": { // one player, one phone: no room, no networking
        const st0 = LS.get("tgg_host_state", null);
        const go = () => { A.solo = true; A.practice = false; A.playtest = false; A.length = "solo"; LS.del("tgg_host_state"); const room = String(100000 + Math.floor(Math.random() * 900000)); hostStart(room, false, false); A.screen = "claim"; A.ui = {}; SND.play("whoosh"); render(); };
        if (st0 && st0.phase !== "game_over") confirmBox("יש משחק שנקטע במכשיר הזה. להתחיל משחק חדש במקומו?", "משחק חדש", go, true); else go(); break;
      }
      case "devGuide": closeModals(); { const fake = { room: "demo", route: { total: 28, every: 5, stops: [5, 10, 15, 20, 25].map((at, i) => ({ at, kind: ["plinko", "crash", "bj", "wheel", "mines"][i] })) }, progress: null, phase: "lobby", players: [] }; const real = A.view; A.view = real && real.route ? real : fake; openGuide(false); if (A.view === fake) { const w = $(".gdwrap"); const restore = () => { if (!$(".gdwrap")) { A.view = real; clearInterval(iv); } }; const iv = setInterval(restore, 300); } } break;
      case "devSounds": { closeModals(); const L = "tap select chip lock card flip dice gem peg correct wrong coins cashout reels reelStop spin boom jackpot fanfare".split(" "); L.forEach((n, i) => setTimeout(() => { SND.play(n); toast("🔊 " + n); }, i * 1100)); break; }
      case "inspToggle": A.inspector = !A.inspector; updateInspector(); render(); break;
      case "devSplash": closeModals(); if (window.SALAT_SPLASH) window.SALAT_SPLASH.play(); break;
      case "devReset": closeModals(); confirmBox("למחוק את כל הנתונים השמורים במכשיר?", "מחק", () => { try { const keep = localStorage.getItem("tgg_token"); localStorage.clear(); if (keep) localStorage.setItem("tgg_token", keep); } catch (e) {} location.reload(); }, true); break;
      case "goPlaytest": closeModals(); editorGate(() => { A.practice = true; A.playtest = true; A.bots = A.bots == null ? 3 : A.bots; A.noTimer = A.noTimer == null ? true : A.noTimer; A.onlyNew = !!A.onlyNew; A.length = A.length || "medium"; A.screen = "create"; render(); window.scrollTo(0, 0); }); break;
      case "ptSet": { const k = el.dataset.k; A[k] = k === "bots" ? Number(val) : val === "true"; SND.play("select"); render(); break; }
      case "settings": modal(settingsCard() + `<button class="btn pri" data-close>סגור</button>`, (m) => { m.querySelectorAll("[data-a=pref]").forEach((b) => b.addEventListener("click", () => { prefs[b.dataset.v] = !prefs[b.dataset.v]; LS.set("tgg_prefs", prefs); b.textContent = prefs[b.dataset.v] ? "פועל" : "כבוי"; })); const vi = $("#volIn", m); if (vi) vi.onchange = (ev) => { prefs.vol = Number(ev.target.value); LS.set("tgg_prefs", prefs); SND.play("tap"); }; }); break;
      case "len": A.length = val; SND.play("select"); render(); break;
      case "create": {
        if (A.playtest && A.onlyNew && !loadBank().some((q) => !getEdits().status[q.id])) { toast("כבר בדקת את כל השאלות 🎉"); break; }
        LS.del(A.practice ? "tgg_test_host_state" : "tgg_host_state"); if (A.playtest) devLog("התחלת משחק בדיקה" + (A.scenario && A.scenario !== "none" ? ` · תרחיש ${SCENARIOS[A.scenario].t}` : "")); const room = String(100000 + Math.floor(Math.random() * 900000));
        hostStart(room, !!A.practice, false); if (A.playtest && HOST.state) { HOST.state.devScenario = A.scenario || "none"; A.inspector = true; } A.screen = "claim"; A.ui = {}; render(); break;
      }
      case "resumeHost": {
        const h = LS.get("tgg_host", null); const st = LS.get("tgg_host_state", null); if (!h || !st) break;
        const bank = {}; for (const q of loadBank(true)) bank[q.id] = q; HOST.state = Object.assign(st, { bank });
        for (const p of Object.values(HOST.state.players)) if (p.token !== token && !p.bot) p.connected = false;
        if (HOST.state.phaseEndsAt && !HOST.state.paused && !HOST.state.solo) { HOST.state.paused = { remaining: Math.max(15000, HOST.state.phaseEndsAt - Date.now()) }; HOST.state.phaseEndsAt = null; }
        A.screen = "game"; hostStart(h.room, h.practice, true); break;
      }
      case "pickChar": ui.claim = Object.assign(ui.claim || {}, { char: val, avatar: ui.claim && ui.claim.avatar || AVATARS[["polchak", "tego", "mozzarella", "yoni"].indexOf(val)] || AVATARS[0] }); SND.play("select"); render(); break;
      case "pickAv": ui.claim = Object.assign(ui.claim || {}, { avatar: val }); SND.play("select"); render(); break;
      case "claim": { const c = ui.claim; if (c && c.char) LS.set("tgg_last_char", c.char); const r = send("claim", { char: c.char, avatar: c.avatar }); if (A.role !== "guest") { if (r && r.pid) { A.screen = "game"; SND.play("lock"); setTimeout(() => { const w = A.view; if (w && !w.playtest && w.phase === "lobby" && !$(".gdwrap") && !LS.get("tgg_guide_seen", false)) openGuide(true); }, 300); } render(); } break; }
      case "tab": A.tab = val; SND.play("tap"); render(); window.scrollTo(0, 0); break;
      case "start": {
        startCountdown(() => send("host", { action: "start" }));
        break;
      }
      case "host": {
        const w = A.view; const back = val === "continue" && w && w.solo && !w.playtest && w.phase === "roulette" && w.round && w.round.roulette && w.round.roulette.results;
        if (back) { startCountdown(() => send("host", { action: "continue" }), "חוזרים לשאלות"); break; }
        send("host", { action: val }); juice("small", el); break;
      }
      case "hostDo": closeModals(); send("host", { action: val }); break;
      case "hostSheet": hostSheet(); break;
      case "edSheet": editorGate(edSheet); break;
      case "sub": ui.sub = val; ui.slide = val === "b" ? "slide-l" : "slide-r"; SND.play(val === "b" ? "whoosh" : "tap"); render(); break;
      case "btab": ui.btab = val; SND.play("tap"); render(); break;
      case "revealMore": revealMore(); break;
      case "bfSet": { const from = el.getBoundingClientRect(); const sv = el.classList.contains("pchip") ? chipSVG(Number(val)) : null; setAmt(el.dataset.f, Number(val)); vib(8); render(); const t = $(`#bf_${el.dataset.f}`); if (t && sv) flyChip(sv, from, t.parentElement); else { SND.play("chip"); if (t) pop(t.parentElement); } break; }
      case "bfOp": {
        const f = el.dataset.f; const inp = $(`#bf_${f}`); const max = inp ? Number(inp.dataset.max) : 0; const cur = getAmt(f); const MIN = TGG.CONST.BET_MIN;
        const nv = val === "half" ? Math.floor(cur / 2) : val === "double" ? Math.min(max, Math.max(MIN, cur * 2)) : max;
        setAmt(f, nv < MIN ? 0 : nv); SND.play(val === "max" ? "allin" : "chip"); vib(8); render(); const t = $(`#bf_${f}`); if (t) pop(t.parentElement); break;
      }
      case "tileHome": if (val === "quiz") { A.practice = false; A.playtest = false; A.screen = "create"; render(); } else gameInfo(val); break;
      case "tileIn": if (val === "quiz") { A.tab = "game"; render(); window.scrollTo(0, 0); }
        else if (GAMES[val] && val !== "quiz") { gameInfo(val); }
        else if (false) { if (!A.view || ["lobby", "game_over"].includes(A.view.phase)) { toast("נפתח כשהמשחק מתחיל"); break; } A.tab = val; SND.play("whoosh"); render(); window.scrollTo(0, 0); }
        else toast(`${GAMES[val].name} עולה אוטומטית בתוך המשחק: גלגל, סלוטים וקראש לסירוגין, כל 5 שאלות`); break;
      case "casinoInfo": casinoInfo(); break;
      case "logoHome": {
        closeKeypad(); document.querySelectorAll(".modal").forEach((m) => m.remove());
        if (A.screen === "demo") LS.set("tgg_demo_seen", true);
        if (A.screen === "game" || (A.screen === "demo" && A.view && A.role)) { A.screen = "game"; A.tab = "lobby"; } else A.screen = "home";
        render(); window.scrollTo(0, 0); if (window.SALAT_SPLASH) window.SALAT_SPLASH.play(); break;
      }
      case "hostConfirm": closeModals(); confirmBox(val === "skip" ? "לדלג על השאלה? ההימורים יוחזרו." : "לעבור לפרק הבא? ההימורים הפתוחים יוחזרו.", "כן", () => send("host", { action: val })); break;
      case "hostEnd": closeModals(); confirmBox("לסיים את המשחק עכשיו?", "סיום משחק", () => send("host", { action: "end" }), true); break;
      case "conf": ui.bet.conf = val; SND.play("select"); render(); break;
      case "betChip": {
        const from = el.getBoundingClientRect(); const svg = (el.querySelector("svg") || {}).outerHTML; const was = ui.bet[el.dataset.f];
        ui.bet[el.dataset.f] = Number(val); SND.play("chip"); vib(8); if (el.classList.contains("max")) SND.play("allin"); render();
        const c = document.querySelector(`[data-a=betChip][data-f="${el.dataset.f}"][data-v="${val}"]`); if (c) pop(c);
        if (svg && Number(val) && Number(val) !== was) flyChip(svg, from, $(".betspot .stack") || $(".btabs .sel"));
        break;
      }
      case "wheelChip": { const from = el.getBoundingClientRect(); const svg = (el.querySelector("svg") || {}).outerHTML; ui.wheel = Number(val); SND.play("chip"); render(); if (svg && Number(val)) flyChip(svg, from, $(".slots") || $("#wheel"), true); break; }
      case "friend": ui.bet.friendTarget = ui.bet.friendTarget === val ? null : val; SND.play("select"); render(); break;
      case "fOut": ui.bet.friendOutcome = val; render(); break;
      case "ou": ui.bet.ouSide = ui.bet.ouSide === val ? null : val; render(); break;
      case "lockBets": {
        const b = ui.bet; const bet = { conf: b.conf, own: b.own || 0 };
        if (b.friendTarget && b.friendAmt) bet.friend = { target: b.friendTarget, outcome: b.friendOutcome, amount: b.friendAmt };
        if (b.ouSide && b.ouAmt) bet.ou = { side: b.ouSide, amount: b.ouAmt };
        const spot = $(".betspot .stack"); const sr = spot && !spot.classList.contains("empty") ? spot.getBoundingClientRect() : null; const sh = sr ? spot.outerHTML : null;
        send("bets", { bet }); SND.play("lock"); vib(18); ui.sub = "q"; ui.slide = "slide-r"; render();
        if (sh) flyStackAway(sh, sr); break;
      }
      case "sel": ui.ans.sel = val; SND.play("select"); render(); break;
      case "ord": { const o = ui.ans.order; const i = o.indexOf(val); if (i >= 0) o.splice(i, 1); else o.push(val); SND.play("select"); render(); break; }
      case "ordReset": ui.ans.order = []; render(); break;
      case "mt": ui.ans.match[el.dataset.k] = val; SND.play("select"); render(); break;
      case "submit": {
        const q = v.round.q; const t = q.answer_type; let value;
        if (t === "choice" || t === "vote") value = ui.ans.sel; else if (t === "number") value = Number(ui.ans.num); else if (t === "matching") value = ui.ans.match; else value = ui.ans.order;
        send("answer", { value }); SND.play("lock"); juice("small", el); vib(18); break;
      }

      case "betOpen": A.ui.betOpen = true; A.ui.betT0 = now(); SND.play("chip"); render(); break;
      case "betClose": A.ui.betOpen = false; if (A.ui.betT0 && !A.ui.readyAt) A.ui.betMs = (A.ui.betMs || 0) + (now() - A.ui.betT0); A.ui.betT0 = 0; SND.play("tap"); render(); break;
      case "soloLock": if (A.soloSent === v.round.n) break; soloSubmit(false); break;
      case "soloShare": soloShare("share"); break;
      case "soloCopy": soloShare("copy"); break;
      case "soloImg": soloShare("img"); break;
      case "wheelLock": send("wheel", { amount: ui.wheel || 0, auto: ui.auto || null }); SND.play("lock"); juice("small", el); vib(18); break;
      case "kp": kpForBet(el.dataset.f, Number(el.dataset.max)); break;
      case "nrChip": { const q = A.view.round.q; ui.ans.h = Number(val); SND.play("select"); render(); break; }
      case "nrStep": { const q = A.view.round.q; const ns = q.nscale; const cur = ui.ans.num !== "" ? Number(ui.ans.num) : Math.round((ns.min + ns.max) / 2); ui.ans.num = String(Math.max(ns.min, Math.min(ns.max, cur + Number(val) * ns.step))); SND.play("tick"); render(); break; }
      case "kpAns": openKeypad({ title: "התשובה שלך", value: ui.ans.num, maxLen: 9, onInput: (str) => { const ns = A.view && A.view.round && A.view.round.q.nscale; ui.ans.num = ns && str !== "" ? String(Math.min(ns.max, Math.max(ns.min, Number(str)))) : str; render(); } }); break;
      case "autoSet": ui.auto = val === "0" ? null : Number(val); SND.play("select"); render(); break;
      case "cashout": { if (el.disabled) break; el.disabled = true; el.textContent = "יוצא..."; send("cashout"); SND.play("lock"); vib(20); break; }
      case "plinkoDrop": {
        const amt = A.sideAmt || 0; if (amt < TGG.CONST.BET_MIN) { toast("בחר סכום הימור"); break; }
        if (A.plinkoBusy) break; A.plinkoBusy = true; send("side", { act: { game: "plinko", stake: amt, risk: A.plinkoRisk || "low" } }); SND.play("chip"); setTimeout(() => { A.plinkoBusy = false; }, 1900); break;
      }
      case "plRisk": A.plinkoRisk = val; SND.play("select"); render(); break;
      case "mnCount": A.minesCount = Number(val); SND.play("select"); render(); break;
      case "mnStart": { const amt = A.sideAmt || 0; if (amt < TGG.CONST.BET_MIN) { toast("בחר סכום הימור"); break; } send("side", { act: { game: "mines", op: "start", stake: amt, mines: A.minesCount || 3 } }); SND.play("chip"); break; }
      case "mnPick": send("side", { act: { game: "mines", op: "pick", i: Number(val) } }); SND.play("tap"); break;
      case "mnCash": send("side", { act: { game: "mines", op: "cash" } }); SND.play("lock"); break;
      case "dDir": A.diceDir = val; SND.play("select"); render(); break;
      case "diceRoll": { const amt = A.sideAmt || 0; if (amt < TGG.CONST.BET_MIN) { toast("בחר סכום הימור"); break; } if (A.diceBusy) break; A.diceBusy = true; setTimeout(() => { A.diceBusy = false; }, 700);
        send("side", { act: { game: "dice", stake: amt, chance: A.diceChance || 49.5, dir: A.diceDir || "over" } }); SND.play("chip"); break; }
      case "hlStart": { const amt = A.sideAmt || 0; if (amt < TGG.CONST.BET_MIN) { toast("בחר סכום הימור"); break; } send("side", { act: { game: "hilo", op: "start", stake: amt } }); SND.play("chip"); break; }
      case "hlGuess": send("side", { act: { game: "hilo", op: "guess", dir: val } }); SND.play("tap"); break;
      case "hlSkip": send("side", { act: { game: "hilo", op: "skip" } }); SND.play("tap"); break;
      case "hlCash": send("side", { act: { game: "hilo", op: "cash" } }); SND.play("lock"); break;
      case "bjDeal": { const amt = A.sideAmt || 0; if (amt < TGG.CONST.BET_MIN) { toast("בחר סכום הימור"); break; } send("side", { act: { game: "bj", op: "deal", stake: amt } }); SND.play("chip"); break; }
      case "bjAct": if (A.bjBusy) break; A.bjBusy = true; setTimeout(() => { A.bjBusy = false; }, 450); send("side", { act: { game: "bj", op: val } }); if (val === "double") SND.play("chip"); else SND.play("tap"); break;
      case "gameInfo": document.querySelectorAll(".modal").forEach((m) => m.remove()); gameInfo(val); break;
      case "breakGo": if (A.breakIntro) A.breakIntro.seen = true; SND.play("chip"); render(); break;
      case "soloSkip": send("soloSkip"); if (A.breakIntro) A.breakIntro.seen = true; SND.play("tap"); break;
      case "openGuide": openGuide(false); break;
      case "boardTab": A.boardTab = val; SND.play("tap"); render(); break;
      case "boardReload": loadBoard(true); SND.play("tap"); toast("מרענן את הטבלה…"); break;
      case "term": if (TERMS[val]) modal(`<h2>${esc(val)}</h2><p>${esc(TERMS[val])}</p><button class="btn pri" data-close>חזרה לשאלה</button>`); SND.play("tap"); break;
      case "openGuideHome": { const fake = { room: "demo", route: { total: 25, every: 5, stops: (() => { const k = TGG.CASINO_KINDS.slice().sort(() => Math.random() - 0.5); return [5, 10, 15, 20].map((at, i) => ({ at, kind: k[i] })); })() }, progress: null, phase: "lobby", players: [] }; const real = A.view; A.view = fake; openGuide(false); const iv = setInterval(() => { if (!$(".gdwrap")) { A.view = real; clearInterval(iv); } }, 300); break; }
      case "openFree": closeModals(); openFree(); break;
      case "freeLocked": toast("הקזינו החופשי נפתח אחרי שמסיימים משחק אחד"); SND.play("tap"); break;
      case "freeClose": closeFree(); break;
      case "freePlay": A.freeGame = val; if (FREE.state) { FREE.state.side = FREE.state.side || {}; delete (FREE.state.side[FREE.pid] || {})[val]; } SND.play("tap"); render(); window.scrollTo(0, 0); break;
      case "freeBack": A.freeGame = null; SND.play("tap"); render(); break;
      case "freeRefill": LS.set(FREE_KEY, { coins: 10000 }); if (FREE.state) FREE.state.players[FREE.pid].coins = 10000; toast("הארנק מולא ל-10,000"); render(); break;
      case "rulesHub": document.querySelectorAll(".modal").forEach((m) => m.remove()); rulesHub(); break;
      case "newGame": confirmBox("להתחיל משחק חדש? המשחק הנוכחי יישמר רק בהיסטוריה של המכשיר.", "משחק חדש", () => { LS.del(A.view && A.view.practice ? "tgg_test_host_state" : "tgg_host_state"); location.href = location.pathname; }); break;
      case "leave": confirmBox("לצאת למסך הבית? המשחק נשמר ואפשר להמשיך אותו משם.", "יציאה", () => { location.href = location.pathname; }); break;
    }
  }
  function afterRender() {
    const tb = $(".topbar"), nav = $(".tabs");
    if (tb) document.documentElement.style.setProperty("--tbh", tb.offsetHeight + "px");
    document.documentElement.style.setProperty("--navh", (nav ? nav.offsetHeight : 0) + "px");
    if (A.view && A.ui) { A.ui.introKey = A.view.phase + ":" + (A.view.round ? A.view.round.n : "") + ":" + (A.ui.sub || ""); A.ui.slide = null; }
    claimLabel(); revealTimeline(); finalSequence(); breakCurtain(); countUpCoins(); soloClock(); soloBarRun(); rangeAfterRender(); numRevealAfterRender();
    if (CLOUD && $(".board")) loadBoard(false);
    if (A.view && A.view.phase === "game_over" && A.view.solo && !A.free) prepShare(A.view);
    slotsAfterRender(); plinkoAfterRender(); minesAfterRender(); diceAfterRender(); hiloAfterRender(); bjAfterRender();
    const ds = $("#dSlider"); if (ds) { ds.addEventListener("input", () => diceLive(ds)); ds.addEventListener("change", () => { A.diceChance = Number(ds.value); SND.play("tick"); render(); }); }
    if ($("#crashSvg") && !A.crashRaf) crashLoop();
    const v = A.view;
    if (v && v.phase === "roulette" && v.round.roulette.results && v.round.roulette.kind !== "slots") {
      const mine = v.round.roulette.results[v.me]; const wheel = $("#wheel"); const after = $("[data-after-spin]");
      const { centers } = wheelSVG(v.rules); const target = mine ? centers[mine.seg] : centers.refund;
      const final = 360 * 6 + (360 - target);
      if (A.ui.spun === v.round.n || prefs.reduce) { if (wheel) { wheel.style.transition = "none"; wheel.style.transform = `rotate(${final}deg)`; } if (after) after.style.opacity = 1; }
      else if (wheel) { A.ui.spun = v.round.n; const ptr = $(".pointer"); if (ptr) { ptr.classList.add("spinning"); setTimeout(() => ptr.classList.remove("spinning"), 3900); }
        requestAnimationFrame(() => requestAnimationFrame(() => { wheel.style.transform = `rotate(${final}deg)`; })); setTimeout(() => { const a2 = $("[data-after-spin]"); if (a2) a2.style.opacity = 1; }, 4100); }
    }
  }
  // timer refresh without full re-render
  let lastSec = null;
  setInterval(() => {
    const v = A.view; if (!v || A.screen !== "game") return;
    const ms = remaining(v); if (ms == null) return;
    const bar = $("[data-timer-bar]"); if (bar) bar.style.transform = `scaleX(${Math.max(0, ms / Number(bar.dataset.tot))})`;
    const num = $("[data-timer]"); const s = Math.ceil(ms / 1000);
    if (num) { num.textContent = s; num.classList.toggle("low", ms < 5000); }
    if (s !== lastSec) { lastSec = s; if (s <= 5 && s > 0 && !v.paused && ((v.phase === "answering" && v.myAnswer == null) || (v.phase === "betting" && !v.myBets))) SND.play(s <= 3 ? "tickLow" : "tick"); }
  }, 200);

  // ───────── boot ─────────
  function boot() {
    if (/[?&]edit\b/.test(location.search)) { render(); editorHub(); return; }
    const m = /[?&]room=(\d{6})/.exec(location.search);
    const h = LS.get("tgg_host", null);
    if (m && h && h.room === m[1] && LS.get("tgg_host_state", null)) { A.screen = "home"; render(); toast("זה החדר שלך. לחץ “המשך משחק שנקטע”."); return; }
    const rs = LS.get("tgg_dev_restart", null);
    if (rs && edOK()) { LS.del("tgg_dev_restart"); Object.assign(A, { practice: true, playtest: true, bots: 3, length: rs.length, noTimer: rs.noTimer, onlyNew: rs.onlyNew, scenario: rs.scenario, screen: "create" }); render(); setTimeout(() => { const b = $("[data-a=create]"); if (b) b.click(); }, 60); return; }
    render();
  }
  window.addEventListener("beforeunload", (e) => { if (A.role === "host" && HOST.state && HOST.state.phase !== "game_over") { e.preventDefault(); e.returnValue = ""; } });
  window.__TGG_APP = { A, HOST, send, render, hostLocal, SND, shareImage, pose };
  boot();
  setTimeout(cloudFlush, 1500);
})();
 });
