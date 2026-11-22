/* THE GROUP GAMES — authoritative game engine.
   Pure logic: no DOM, no network. Runs only on the host device.
   Every function takes the state and mutates it; views are built per player. */
(function (root) {
  "use strict";

  const CHARS = {
    polchak: { name: "פולצ׳ק", color: "#E8B84A" },
    tego: { name: "טגו", color: "#e0555f" },
    mozzarella: { name: "מוצרלה", color: "#5cc8a8" },
    yoni: { name: "יוני", color: "#8fb4ff" },
  };
  const START_COINS = 10000;
  const DIFF_ORDER = { EASY: 0, MEDIUM: 1, HARD: 2, INSANE: 3 };
  // Game multipliers (design choices, not real probabilities)
  const OWN_MULT = { EASY: 1.5, MEDIUM: 2, HARD: 2.5, INSANE: 3 };
  const FRIEND_MULT = 2;
  const OU_MULT = 2;
  const FINAL_MULT = 3;
  // ── SOLO: one player per phone, one bet (on yourself). The payout grows with the level (harder = more),
  //    and every bet is capped both by the level and by a share of the balance, so coins can't snowball.
  //    Number questions: exact = ×EXACT, close (within the question's band) = the bet comes back, else lost.
  const SOLO = { MULT: { 1: 1.5, 2: 2, 3: 2.5, 4: 3 }, EXACT: 3, CAP: { 1: 500, 2: 1000, 3: 2000, 4: 3000 }, BAL_PCT: 0.25, FINAL_PCT: 0.4,
    TIME: { 1: 30, 2: 31, 3: 33, 4: 35 }, GRACE: 1.5, LENGTH: 25, CLOSE: 0.8 };
  const FINAL_NAME = "שאלת הגמר";
  const LEVEL_OF = { EASY: 1, MEDIUM: 2, HARD: 3, INSANE: 4 };
  function levelOf(q) { return q.level >= 1 && q.level <= 4 ? q.level : LEVEL_OF[q.difficulty] || 2; }
  const BET_MIN = 100;
  const TABLE_MAX = { own: 3000, friend: 2000, ou: 2000, wheel: 3000, side: 1000 }; // table limits keep the economy sane
  const COIN_WEIGHT = 20; // total = points + (coins - start) / COIN_WEIGHT
  const T = { betting: 20, rouletteBet: 30 };
  const RULES = {
    highRoller: { threshold: 2500, bonus: 500 },
    underdog: { bonus: 300 },
    bounty: { bonus: 500 },
    hotStreak: { wins: 3, bonus: 750 },
    comeback: { grant: 1500 },
  };
  // Roulette of destiny: weights are game design, shown in the rules screen
  // Luck games. Math verified with 1,000,000 simulated spins (casino_math.py):
  //   WHEEL  RTP ~96%, pays something 49%, profit 27%, top x10
  //   SLOTS  RTP ~96%, pays something 42%, profit 32%, top x50
  const WHEEL = [
    { id: "x2", label: "X2", mult: 2, w: 18 },
    { id: "x3", label: "X3", mult: 3, w: 6 },
    { id: "x5", label: "X5", mult: 5, w: 2 },
    { id: "lose", label: "הפסד", mult: 0, w: 51 },
    { id: "refund", label: "החזר", mult: 1, w: 22 },
    { id: "jackpot", label: "JACKPOT", mult: 10, w: 1 },
  ];
  const SLOT_SYMS = [{ id: "polchak", w: 4 }, { id: "tego", w: 4 }, { id: "mozzarella", w: 4 }, { id: "yoni", w: 4 }, { id: "coin", w: 7 }, { id: "salad", w: 1 }];
  const SLOT_PAYS = [ // checked top to bottom, first match pays
    { id: "jackpot", label: "🥗🥗🥗 JACKPOT", mult: 50 },
    { id: "friend3", label: "3 חברים זהים", mult: 12 },
    { id: "coin3", label: "🪙🪙🪙", mult: 7 },
    { id: "friend2", label: "2 חברים זהים בהתחלה", mult: 2 },
    { id: "coin2", label: "2 🪙", mult: 1.5 },
    { id: "salad1", label: "🥗 מחזיר", mult: 1 },
  ];
  const FRIEND_IDS = ["polchak", "tego", "mozzarella", "yoni"];
  function slotPay(r) {
    const [a, b, c] = r; const coins = r.filter((x) => x === "coin").length;
    if (a === "salad" && b === "salad" && c === "salad") return SLOT_PAYS[0];
    if (a === b && b === c && FRIEND_IDS.includes(a)) return SLOT_PAYS[1];
    if (coins === 3) return SLOT_PAYS[2];
    if (a === b && FRIEND_IDS.includes(a)) return SLOT_PAYS[3];
    if (coins === 2) return SLOT_PAYS[4];
    if (r.includes("salad")) return SLOT_PAYS[5];
    return { id: "none", label: "אין זכייה", mult: 0 };
  }
  const BAL_CAP = { own: 0.5, friend: 0.25, ou: 0.25, wheel: 0.3, side: 0.25 }; // max bet as a share of current balance
  // CRASH: point = 0.96/(1-U) → P(point ≥ m) = 0.96/m, so any cash-out target returns ~96% (casino_math2.py)
  const CRASH = { rate: 0.11, countdown: 3000, edge: 0.96, cap: 1000 };
  // PLINKO: 8 rows, bucket ~ Binomial(8, ½). Both tables ~96% RTP.
  const PLINKO = { rows: 8, low: [5.6, 2, 1.1, 0.95, 0.5, 0.95, 1.1, 2, 5.6], high: [28, 4, 1.4, 0.3, 0.2, 0.3, 1.4, 4, 28] };
  // MINES: 5×5, multiplier after k gems = 0.96·C(25,k)/C(25−m,k)
  const MINES = { size: 25, counts: [1, 3, 5, 10], edge: 0.96 };
  function comb(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
  const DICE = { edge: 0.96, min: 2, max: 95 };
  const HILO = { edge: 0.96, cap: 1000 };
  const BJ = { bjPays: 2.5 };
  function diceMult(chance) { return Math.floor((DICE.edge * 100 / chance) * 10000) / 10000; }
  function hiloP(c, dir) { return dir === "hi" ? (14 - c) / 13 : c / 13; }
  function bjTotal(h) { let t = 0, ace = false; for (const c of h) { t += c.r >= 10 ? 10 : c.r; if (c.r === 1) ace = true; } const soft = ace && t + 10 <= 21; return { t: soft ? t + 10 : t, soft }; }
  function minesMult(m, k) { return k ? Math.floor(MINES.edge * (comb(25, k) / comb(25 - m, k)) * 100) / 100 : 1; }
  function crashMult(ro, now) { return Math.max(1, Math.floor(Math.exp(CRASH.rate * Math.max(0, now - ro.crash.startAt) / 1000) * 100) / 100); }
  const CHAPTER_BONUS = 500;
  const LENGTHS = { short: 3, medium: 6, long: 9, all: 999 }; // questions per chapter 1-4; chapter 5 gets ceil(n/2)+1
  const ROULETTE_EVERY = 5;
  const CASINO_KINDS = ["crash", "wheel", "slots", "plinko", "mines", "bj", "hilo", "dice"];
  const SOLO_KINDS = ["plinko", "mines", "bj", "hilo", "dice"];
  const SOLO_TIME = 90; // seconds for a solo break (one round each)
  function casinoPlan(s) { // a different game every break, fixed when the game starts
    // every player gets their own random mix of the 8 games (no two breaks the same)
    if (!s.casinoPlan || !s.casinoPlan.length) s.casinoPlan = shuffle(CASINO_KINDS, () => rng(s));
    return s.casinoPlan;
  }
  function estTotal(s) { if (s.order && s.order.length) return s.order.length; if (s.solo) return s.length === "all" ? Object.keys(s.bank).length : SOLO.LENGTH; const per = LENGTHS[s.length] || 6; const bank = Object.values(s.bank).filter((q) => !s.onlyIds || s.onlyIds.includes(q.id)).length; return Math.min(bank, per * 4 + Math.ceil(per / 2) + 1); }
  function routeOf(s) { const total = estTotal(s), plan = s.casinoPlan || []; const stops = [];
    for (let at = ROULETTE_EVERY, i = 0; at < total; at += ROULETTE_EVERY, i++) stops.push({ at, kind: plan.length ? plan[i % plan.length] : null }); return { total, every: ROULETTE_EVERY, stops }; }

  // ───────────── helpers ─────────────
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  const pids = (s) => Object.keys(s.players);
  const qById = (s, id) => s.bank[id];
  const curQ = (s) => (s.round ? qById(s, s.round.qid) : null);

  function newState(opts) {
    const seed = opts.seed || Math.floor(Math.random() * 2 ** 31);
    const bank = {};
    for (const q of opts.questions) bank[q.id] = q;
    const s0 = {
      v: 1, room: opts.room, seed, rngCalls: 0, createdAt: opts.now,
      solo: !!opts.solo, practice: !!opts.practice, length: opts.length || "medium", noTimer: !!opts.noTimer, onlyIds: opts.onlyIds || null, playtest: !!opts.playtest,
      phase: "lobby", paused: null, phaseEndsAt: null,
      hostPid: null, players: {}, bank, order: [], qIndex: -1,
      round: null, rounds: [], chapterStats: {}, log: [], seenKeys: {},
      lastChapterShown: 0, final: null,
    };
    casinoPlan(s0); return s0;
  }
  function rng(s) { // cryptographic randomness when available (host browser), seeded fallback otherwise
    s.rngCalls++;
    const c = typeof globalThis !== "undefined" && globalThis.crypto;
    if (c && c.getRandomValues && !s.seededOnly) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; }
    return mulberry(s.seed + s.rngCalls * 7919)();
  }
  function pickWeighted(s, table) { const tot = table.reduce((a, x) => a + x.w, 0); let x = rng(s) * tot; for (const t of table) { if (x < t.w) return t; x -= t.w; } return table[table.length - 1]; }
  function capOf(p, kind) { return Math.min(TABLE_MAX[kind], Math.floor(p.coins * BAL_CAP[kind])); }
  function feedPush(s, now, item) { (s.feed = s.feed || []).push({ at: now, ...item }); if (s.feed.length > 60) s.feed.shift(); }
  function logEv(s, now, type, data) {
    s.log.push({ at: now, type, ...data });
    if (s.log.length > 600) s.log.shift();
  }
  function tx(s, pid, now, kind, amount, note) {
    const p = s.players[pid];
    p.coins += amount;
    p.tx.push({ at: now, q: s.round ? s.round.qid : null, kind, amount, bal: p.coins, note: note || "" });
  }

  // ───────────── lobby ─────────────
  function join(s, now, { token, char, avatar, isHost, bot }) {
    if (s.phase !== "lobby") {
      // rejoin only
      const p = Object.values(s.players).find((x) => x.token === token);
      if (!p) return { error: "המשחק כבר התחיל. אפשר רק לחזור עם אותו מכשיר." };
      p.connected = true; logEv(s, now, "rejoin", { pid: p.id });
      return { pid: p.id };
    }
    const existing = Object.values(s.players).find((x) => x.token === token);
    if (existing && existing.id !== char) delete s.players[existing.id];
    if (!CHARS[char]) return { error: "דמות לא קיימת" };
    if (s.players[char] && s.players[char].token !== token) return { error: "הדמות הזו כבר נבחרה" };
    if (Object.values(s.players).some((x) => x.avatar === avatar && x.token !== token)) return { error: "האווטר הזה כבר נבחר" };
    s.players[char] = {
      id: char, name: CHARS[char].name, color: CHARS[char].color, avatar, token, bot: !!bot,
      connected: true, joinedAt: existing ? existing.joinedAt : now,
      score: 0, coins: START_COINS, streak: 0, betStreak: 0, comebackUsed: false, bankrupt: false,
      stats: { answered: 0, correct: 0, highConfWrong: 0, highConfRight: 0, byMode: {}, byChapter: {}, hardCorrect: 0,
               wagered: 0, betWins: 0, betLosses: 0, friendWins: 0, friendBets: 0, bestBet: 0, worstBet: 0, biggestBet: 0 },
      history: [{ i: 0, coins: START_COINS, score: 0 }], tx: [],
    };
    if (isHost || (!s.hostPid && !bot)) s.hostPid = char;
    logEv(s, now, "join", { pid: char });
    return { pid: char };
  }
  function setConnected(s, pid, on, now) {
    if (s.players[pid]) { s.players[pid].connected = on; logEv(s, now, on ? "connect" : "disconnect", { pid }); }
  }

  function buildOrder(s) { // one random run from the whole bank, no chapters; the last one is the final question
    const pool = Object.values(s.bank).filter((q) => !s.onlyIds || s.onlyIds.includes(q.id));
    if (s.length === "all") return shuffle(pool, () => rng(s)).map((q) => q.id);
    const seen = new Set(s.seen || []); const sh = shuffle(pool, () => rng(s)); // questions this phone hasn't seen come first
    const pick = sh.filter((q) => !seen.has(q.id)).concat(sh.filter((q) => seen.has(q.id))).slice(0, SOLO.LENGTH);
    return shuffle(pick, () => rng(s)).map((q) => q.id);
  }

  function start(s, now, { allowFew } = {}) {
    const n = pids(s).length;
    if (s.phase !== "lobby") return { error: "המשחק כבר רץ" };
    if (n < 1) return { error: "אין שחקנים" };
    s.order = buildOrder(s); casinoPlan(s);
    s.startedAt = now;
    logEv(s, now, "start", { n });
    nextQuestion(s, now);
    return { ok: true };
  }

  // ───────────── round flow ─────────────
  function nextQuestion(s, now) {
    s.qIndex++;
    if (s.qIndex >= s.order.length) return endGame(s, now);
    const q = qById(s, s.order[s.qIndex]);
    const isFinal = s.qIndex === s.order.length - 1;
    s.round = {
      qid: q.id, n: s.qIndex + 1, total: s.order.length, chapter: q.chapter, isFinal,
      answers: {}, bets: {}, conf: {}, results: null, roulette: null,
      startCoins: Object.fromEntries(pids(s).map((p) => [p, s.players[p].coins])),
      startScore: Object.fromEntries(pids(s).map((p) => [p, s.players[p].score])),
    };
    // betting and answering share one clock
    for (const x of pids(s)) { s.round.bets[x] = { own: null, friend: null, ou: null, conf: "mid", skipped: true }; s.round.conf[x] = "mid"; }
    s.round.level = levelOf(q); s.round.secs = SOLO.TIME[s.round.level];
    setPhase(s, now, "answering", s.round.secs + SOLO.GRACE); s.round.deadline = now + s.round.secs * 1000;
  }
  // SOLO: the answer and the bet are locked together (or by the clock); the player times both
  function submitSolo(s, now, pid, value, bet, key, think) {
    if (!s.solo) return { error: "רק במשחק יחיד" };
    if (s.phase !== "answering" || s.paused) return { error: "הזמן לשאלה הזאת נגמר" };
    if (key && s.seenKeys[key]) return { dup: true };
    const r = s.round; const p = s.players[pid]; const q = curQ(s); if (!p) return { error: "שחקן לא קיים" };
    if (r.answers[pid]) return { error: "התשובה כבר ננעלה" };
    const own = clampInt(bet, 0, maxOwnBet(s, pid));
    if (own >= BET_MIN) { r.bets[pid] = { own: { amount: own, mult: SOLO.MULT[r.level] || 2 }, friend: null, ou: null, conf: "mid" }; tx(s, pid, now, "bet_own", -own, r.isFinal ? FINAL_NAME : `הימור על עצמי · רמה ${r.level}`); p.stats.wagered += own; p.stats.biggestBet = Math.max(p.stats.biggestBet, own); logEv(s, now, "bet", { pid, total: own }); }
    const v = value == null ? null : validAnswer(q, value);
    if (v === null) { logEv(s, now, "answer", { pid, n: r.n, none: true }); if (key) s.seenKeys[key] = 1; reveal(s, now); return { ok: true, noAnswer: true }; }
    r.answers[pid] = { value: v, at: Math.min(now, r.deadline || now), think: Number.isFinite(think) ? Math.max(0, Math.min(think, r.secs * 1000)) : null };
    if (key) s.seenKeys[key] = 1;
    logEv(s, now, "answer", { pid, n: r.n }); reveal(s, now); return { ok: true };
  }
  function setPhase(s, now, phase, seconds) {
    if (s.log) logEv(s, now, "phase", { phase, n: s.round ? s.round.n : 0, secs: seconds && !s.noTimer ? seconds : null });
    s.phase = phase;
    s.phaseStartedAt = now;
    s.phaseEndsAt = seconds && !s.noTimer ? now + seconds * 1000 : null;
  }
  function activePids(s) { return pids(s); }

  function maxOwnBet(s, pid) {
    const p = s.players[pid];
    if (s.solo) { const q = curQ(s); const fin = s.round && s.round.isFinal; if (q && q.kind === "opinion") return 0; // opinion questions: points only, no bet
      const cap = fin ? Math.floor(p.coins * SOLO.FINAL_PCT) : Math.min(SOLO.CAP[levelOf(q)], Math.floor(p.coins * SOLO.BAL_PCT));
      return Math.max(0, Math.min(p.coins, Math.max(cap, Math.min(p.coins, BET_MIN)))); }
    return s.round && s.round.isFinal ? Math.floor(p.coins * 0.5) : capOf(p, "own");
  }


  // ── NUMBER questions = a range bet on a slider. Narrower range → bigger multiplier.
  //    The slider's ends are fixed per question (seeded by its id) and never centred on the answer.
  const NUM_PAY = [[0, 6], [0.1, 2.5], [0.3, 1.4]]; // three choices: exact / narrow / wide (actual width ≤ x → multiplier, tuned so a range is worth about as much as a normal question)
  const NUM_PTS = { 6: 1, 2.5: 0.75, 1.4: 0.5 };
  function hashStr(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function niceUp(x) { const e = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1)))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= x) return m * e; return 10 * e; }
  function numScale(q) {
    if (q._ns) return q._ns;
    const c = Math.max(0, Number(q.correct_answer) || 0); const r = (hashStr(String(q.id)) % 1000) / 1000;
    const max = niceUp(Math.max(c * (1.7 + 1.5 * r) + 4, 12)); const min = 0;
    const step = max <= 60 ? 1 : niceUp(max / 120) <= 1 ? 1 : Math.pow(10, Math.max(0, Math.floor(Math.log10(max / 60))));
    // one chip per multiplier: the widest range that still earns it
    const span = max - min; const chips = [{ h: 0, mult: NUM_PAY[0][1] }];
    for (const [x, mult] of NUM_PAY.slice(1)) {
      const h = Math.floor(((x * (span + step)) - step) / 2 / step) * step;
      if (h >= step && !chips.some((c) => c.h === h)) chips.push({ h, mult });
    }
    return (q._ns = { min, max, step, chips });
  }
  function numMult(ns, h) { const w = h === 0 ? 0 : (2 * h + ns.step) / (ns.max - ns.min + ns.step); for (const [x, m] of NUM_PAY) if (w <= x + 1e-9) return m; return 1.1; }
  function numRange(q, v) { const ns = numScale(q); const lo = Math.max(ns.min, v.c - v.h), hi = Math.min(ns.max, v.c + v.h); return { lo, hi, mult: numMult(ns, v.h) }; }
  function validAnswer(q, v) {
    const t = q.answer_type; const ids = (q.options || []).map((o) => o.id);
    if (t === "choice" || t === "vote") return typeof v === "string" && ids.includes(v) ? v : null;
    if (t === "number") {
      const ns = numScale(q); const o = v && typeof v === "object" ? v : { c: Number(v), h: 0 };
      const c = Number(o.c), h = Number(o.h); if (!Number.isFinite(c) || !Number.isFinite(h)) return null;
      if (!ns.chips.some((x) => x.h === h)) return null; return { c: Math.max(ns.min, Math.min(ns.max, Math.round(c))), h };
    }
    if (t === "ranking" || t === "order") return Array.isArray(v) && v.length === ids.length && new Set(v).size === ids.length && v.every((x) => ids.includes(x)) ? v : null;
    if (t === "matching") {
      const tg = (q.match_targets || []).map((o) => o.id);
      return v && typeof v === "object" && ids.every((k) => tg.includes(v[k])) ? Object.fromEntries(ids.map((k) => [k, v[k]])) : null;
    }
    return null;
  }


  // ───────────── scoring ─────────────
  function grade(q, v) { // → ratio 0..1
    if (v == null) return 0;
    const c = q.correct_answer; const t = q.answer_type;
    if (t === "choice" || t === "vote") return v === c ? 1 : 0;
    if (t === "number") {
      if (typeof v !== "object") { const dev = Math.abs(v - c) / Math.max(Math.abs(c), 1) * 100; for (const b of q.numeric.scoring_bands) if (dev <= b.within_pct + 1e-9) return b.points_pct / 100; return 0; }
      const R = numRange(q, v); return c >= R.lo && c <= R.hi ? NUM_PTS[R.mult] || 0.3 : 0;
    }
    if (t === "ranking" || t === "order") return v.filter((x, i) => x === c[i]).length / c.length;
    if (t === "matching") { const ks = Object.keys(c); return ks.filter((k) => v[k] === c[k]).length / ks.length; }
    return 0;
  }
  const isWin = (q, ratio) => (q.answer_type === "number" ? ratio > 0 : ratio >= 1);

  function reveal(s, now) {
    const r = s.round; const q = curQ(s);
    if (r.results) return;
    const limit = (s.solo && r.secs ? r.secs : q.time_limit) * 1000; const t0 = s.phaseStartedAt;
    const res = {};
    for (const pid of pids(s)) {
      const p = s.players[pid]; const a = r.answers[pid];
      const ratio = a ? grade(q, a.value) : 0; const win = a ? isWin(q, ratio) : false;
      let pts = Math.round(q.score_value * ratio);
      let speed = 0, streakB = 0;
      if (win) {
        // solo: speed counts only thinking time (time spent in the bet panel before choosing is not counted)
        const used = s.solo ? (a.think != null ? a.think : a.at - t0) : a.at - t0;
        speed = Math.max(0, Math.round(50 * (1 - used / limit)));
        p.streak++; streakB = p.streak >= 2 ? Math.min(100, 25 * (p.streak - 1)) : 0;
      } else p.streak = 0;
      pts += speed + streakB;
      p.score += pts;
      if (a) {
        p.stats.answered++;
        if (win) p.stats.correct++;
        const m = (p.stats.byMode[q.mode] = p.stats.byMode[q.mode] || { a: 0, c: 0 }); m.a++; if (win) m.c++;
        const c = (p.stats.byChapter[q.chapter] = p.stats.byChapter[q.chapter] || { a: 0, c: 0, pts: 0 }); c.a++; if (win) c.c++; c.pts += pts;
        if (win && (q.difficulty === "HARD" || q.difficulty === "INSANE")) p.stats.hardCorrect++;
        if (r.conf[pid] === "high") { if (win) p.stats.highConfRight++; else p.stats.highConfWrong++; }
      }
      res[pid] = { answered: !!a, value: a ? a.value : null, ratio, win, points: pts, speed, streakBonus: streakB, coins: 0, bets: [], events: [] };
    }
    // settle bets
    for (const pid of pids(s)) {
      const b = r.bets[pid]; if (!b) continue;
      const p = s.players[pid]; const out = res[pid];
      let net = 0; let anyWin = false; let anyLoss = false;
      const settle = (label, amount, won, mult, push) => {
        if (push) { tx(s, pid, now, "refund", amount, `${label}: החזר`); out.bets.push({ label, amount, result: "push", delta: 0 }); return; }
        if (won) { const pay = Math.round(amount * mult); tx(s, pid, now, "win", pay, `${label}: זכייה x${mult}`); net += pay - amount; anyWin = true; out.bets.push({ label, amount, result: "win", delta: pay - amount }); p.stats.bestBet = Math.max(p.stats.bestBet, pay - amount); }
        else { net -= amount; anyLoss = true; out.bets.push({ label, amount, result: "lose", delta: -amount }); p.stats.worstBet = Math.min(p.stats.worstBet, -amount); }
        feedPush(s, now, { pid, game: "quiz", label, amount, mult: won ? mult : 0, payout: won ? Math.round(amount * mult) : 0, q: r.n });
      };
      // SOLO number questions: a range bet; inside the range pays the range's multiplier, outside loses
      const isNum = s.solo && q.answer_type === "number" && out.value && typeof out.value === "object";
      const R = isNum ? numRange(q, out.value) : null; if (R) { out.range = R; if (out.win && out.value.h === 0) out.exact = true; }
      if (b.own) settle(r.isFinal ? FINAL_NAME : out.exact ? "בול! מספר מדויק" : isNum ? `טווח ${R.lo}–${R.hi}` : "הימור על עצמי", b.own.amount, out.win, isNum ? R.mult : b.own.mult);
      if (anyWin && !anyLoss) { p.betStreak++; p.stats.betWins++; } else if (anyLoss && !anyWin) { p.betStreak = 0; p.stats.betLosses++; }
      out.coins = net;
      // casino events
      if (!s.solo && b.own && out.win && b.own.amount >= RULES.highRoller.threshold) { tx(s, pid, now, "event", RULES.highRoller.bonus, "HIGH ROLLER"); out.events.push("HIGH_ROLLER"); }
      if (!s.solo && p.betStreak >= RULES.hotStreak.wins) { tx(s, pid, now, "event", RULES.hotStreak.bonus, "HOT STREAK"); out.events.push("HOT_STREAK"); p.betStreak = 0; }
    }
    for (const pid of pids(s)) {
      const p = s.players[pid];
      if (p.coins <= 0 && !p.bankrupt) {
        p.bankrupt = true; res[pid].events.push("BANKRUPTCY"); logEv(s, now, "bankrupt", { pid });
        if (!p.comebackUsed) { p.comebackUsed = true; tx(s, pid, now, "event", RULES.comeback.grant, "COMEBACK (חד-פעמי)"); res[pid].events.push("COMEBACK"); }
      }
      if (p.coins > 0) p.bankrupt = false;
      p.history.push({ i: r.n, coins: p.coins, score: p.score });
    }
    r.results = res;
    s.rounds.push({ qid: q.id, chapter: q.chapter, n: r.n, results: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { win: v.win, points: v.points, coins: v.coins, answered: v.answered, bets: v.bets }])) });
    setPhase(s, now, "reveal", null);
    logEv(s, now, "reveal", { qid: q.id });
  }
  function openStake(r, pid) {
    const b = r.bets[pid]; if (!b) return 0;
    return (b.own ? b.own.amount : 0) + (b.friend ? b.friend.amount : 0) + (b.ou ? b.ou.amount : 0);
  }

  // ───────────── roulette ─────────────
  function maybeRoulette(s, now) {
    if (s.round && !s.round.isFinal && s.round.n % ROULETTE_EVERY === 0 && !s.round.roulette) {
      const plan = casinoPlan(s); const kind = plan[(s.round.n / ROULETTE_EVERY - 1) % plan.length];
      const solo = SOLO_KINDS.includes(kind);
      s.round.roulette = { kind, solo, stakes: {}, autos: {}, done: {}, results: null, breakNo: s.round.n / ROULETTE_EVERY };
      if (solo) { s.side = s.side || {}; for (const pid of pids(s)) if (s.side[pid]) s.side[pid][kind] = null; }
      setPhase(s, now, "roulette", solo ? SOLO_TIME : T.rouletteBet);
      return true;
    }
    return false;
  }
  function rouletteStake(s, now, pid, amount, key, auto) {
    if (s.phase !== "roulette" || !s.round.roulette || s.round.roulette.results) return { error: "השולחן סגור" };
    if (key && s.seenKeys[key]) return { dup: true };
    const ro = s.round.roulette; if (ro.stakes[pid] != null) return { error: "כבר בחרת" };
    const p = s.players[pid]; const a = clampInt(amount, 0, capOf(p, "wheel"));
    if (ro.crash) return { error: "הסבב כבר התחיל" };
    ro.stakes[pid] = a >= BET_MIN ? a : 0;
    if (ro.kind === "crash" && ro.stakes[pid] && auto != null) { const t = Math.floor(Number(auto) * 100) / 100; if (t >= 1.01 && t <= 1000) ro.autos[pid] = t; }
    if (ro.stakes[pid]) { tx(s, pid, now, "bet_wheel", -a, ro.kind === "slots" ? "SALAD SLOTS" : ro.kind === "crash" ? "CRASH" : "ROULETTE OF DESTINY"); p.stats.wagered += a; p.stats.biggestBet = Math.max(p.stats.biggestBet, a); }
    if (key) s.seenKeys[key] = 1;
    if (pids(s).every((x) => ro.stakes[x] != null || !s.players[x].connected)) { if (ro.kind === "crash" && !pids(s).some((x) => ro.stakes[x])) { ro.crash = { point: 1, startAt: now, cashed: {}, status: "running" }; crashTick(s, now); } else spin(s, now); }
    return { ok: true };
  }
  function startCrash(s, now) {
    const ro = s.round.roulette; if (ro.crash) return;
    for (const pid of pids(s)) if (ro.stakes[pid] == null) ro.stakes[pid] = 0;
    const u = rng(s); const point = Math.min(CRASH.cap, Math.max(1, Math.floor((CRASH.edge * 100) / (1 - u)) / 100));
    ro.crash = { point, startAt: now + CRASH.countdown, cashed: {}, status: "running" };
    s.phaseEndsAt = null; logEv(s, now, "crash_start", {});
  }
  function cashCrash(s, now, pid, m) {
    const ro = s.round.roulette; const st = ro.stakes[pid]; const pay = Math.floor(st * m);
    ro.crash.cashed[pid] = m; tx(s, pid, now, "win", pay, `CRASH ${m.toFixed(2)}×`);
    const p = s.players[pid]; p.stats.bestBet = Math.max(p.stats.bestBet, pay - st);
  }
  function crashCashout(s, now, pid, key) {
    const ro = s.round && s.round.roulette;
    if (s.phase !== "roulette" || !ro || ro.kind !== "crash" || !ro.crash || ro.results) return { error: "אין סבב פעיל" };
    if (key && s.seenKeys[key]) return { dup: true };
    if (!ro.stakes[pid] || ro.crash.cashed[pid]) return { error: "אין מה לפדות" };
    if (now < ro.crash.startAt) return { error: "עוד לא התחיל" };
    const m = crashMult(ro, now);
    if (m >= ro.crash.point) { crashTick(s, now); return { error: "מאוחר מדי: התרסק" }; }
    if (key) s.seenKeys[key] = 1;
    cashCrash(s, now, pid, m); return { ok: true, m };
  }
  function crashTick(s, now) { // returns true when something public changed
    const ro = s.round.roulette; if (!ro.crash || ro.results || now < ro.crash.startAt) return false;
    let ch = false; const m = crashMult(ro, now); const pt = ro.crash.point;
    for (const pid of pids(s)) { const a = ro.autos[pid]; if (a && ro.stakes[pid] && !ro.crash.cashed[pid] && a < pt && m >= a) { cashCrash(s, now, pid, a); ch = true; } }
    if (m >= pt) {
      ro.crash.status = "crashed"; ro.results = {};
      for (const pid of pids(s)) {
        const st = ro.stakes[pid] || 0; if (!st) { ro.results[pid] = null; continue; }
        const c = ro.crash.cashed[pid]; const pay = c ? Math.floor(st * c) : 0; const p = s.players[pid];
        if (!c) p.stats.worstBet = Math.min(p.stats.worstBet, -st);
        ro.results[pid] = { seg: c ? "cashed" : "crashed", label: c ? `${c.toFixed(2)}×` : `💥 ${pt.toFixed(2)}×`, mult: c || 0, stake: st, delta: pay - st };
        feedPush(s, now, { pid, game: "crash", label: c ? `${c}×` : "CRASH", amount: st, mult: c || 0, payout: pay, q: s.round.n });
        if (p.coins <= 0 && !p.comebackUsed) { p.comebackUsed = true; p.bankrupt = true; tx(s, pid, now, "event", RULES.comeback.grant, "COMEBACK (חד-פעמי)"); }
      }
      for (const pid of pids(s)) { const h = s.players[pid].history; h[h.length - 1] = { ...h[h.length - 1], coins: s.players[pid].coins }; }
      logEv(s, now, "crash", { at: pt }); ch = true;
    }
    return ch;
  }
  function spin(s, now) {
    const ro = s.round.roulette; if (ro.results) return;
    if (ro.kind === "crash") return startCrash(s, now);
    if (ro.solo) return finishSolo(s, now, true);
    ro.results = {};
    for (const pid of pids(s)) {
      const st = ro.stakes[pid] || 0; if (ro.stakes[pid] == null) ro.stakes[pid] = 0;
      if (!st) { ro.results[pid] = null; continue; }
      let seg, reels = null;
      if (ro.kind === "slots") { reels = [0, 1, 2].map(() => pickWeighted(s, SLOT_SYMS).id); seg = slotPay(reels); }
      else seg = pickWeighted(s, WHEEL);
      const pay = Math.round(st * seg.mult);
      const isRefund = seg.mult === 1;
      if (pay) tx(s, pid, now, isRefund ? "refund" : "win", pay, `${ro.kind === "slots" ? "SLOTS" : "ROULETTE"} ${seg.label}`);
      const p = s.players[pid];
      if (pay > st) p.stats.bestBet = Math.max(p.stats.bestBet, pay - st); else if (!pay) p.stats.worstBet = Math.min(p.stats.worstBet, -st);
      ro.results[pid] = { seg: seg.id, label: seg.label, mult: seg.mult, stake: st, delta: pay - st, reels };
      feedPush(s, now, { pid, game: ro.kind === "slots" ? "slots" : "wheel", label: seg.label, amount: st, mult: seg.mult, payout: pay, q: s.round.n });
      if (p.coins <= 0 && !p.comebackUsed) { p.comebackUsed = true; p.bankrupt = true; tx(s, pid, now, "event", RULES.comeback.grant, "COMEBACK (חד-פעמי)"); }
    }
    for (const pid of pids(s)) { const h = s.players[pid].history; h[h.length - 1] = { ...h[h.length - 1], coins: s.players[pid].coins }; }
    s.phaseEndsAt = null;
    logEv(s, now, "spin", {});
  }


  // ───────────── solo casino breaks: everyone plays ONE round of the same game at once ─────────────
  function soloResult(s, pid, kind) {
    const g = s.side && s.side[pid] && s.side[pid][kind]; if (!g) return undefined;
    if (kind === "plinko") return { stake: g.stake, payout: g.payout, label: `${g.mult}×` };
    if (kind === "dice") return { stake: g.stake, payout: g.payout, label: g.win ? `${g.mult.toFixed(2)}×` : `${g.roll.toFixed(2)}` };
    if (kind === "mines") return g.status === "playing" ? undefined : { stake: g.stake, payout: g.status === "bust" ? 0 : Math.floor(g.stake * g.mult), label: g.status === "bust" ? "💣" : `${g.mult}×` };
    if (kind === "hilo") return g.status === "playing" ? undefined : { stake: g.stake, payout: g.status === "bust" ? 0 : Math.floor(g.stake * g.mult), label: g.status === "bust" ? "✗" : `${g.mult}×` };
    if (kind === "bj") return g.status !== "done" ? undefined : { stake: g.bet, payout: g.payout, label: { bj: "BLACKJACK", win: "ניצחון", dbust: "הדילר נשרף", push: "תיקו", lose: "הפסד", bust: "נשרף" }[g.result] };
  }
  function soloCheck(s, now, pid) {
    const ro = s.round && s.round.roulette; if (!ro || !ro.solo || ro.results || ro.done[pid] !== undefined) return;
    const r = soloResult(s, pid, ro.kind); if (r === undefined) return;
    ro.stakes[pid] = r.stake; ro.done[pid] = { ...r, mult: r.stake ? Math.round((r.payout / r.stake) * 100) / 100 : 0, delta: r.payout - r.stake, seg: r.payout > r.stake ? "win" : r.payout === r.stake ? "push" : "lose" };
    if (pids(s).every((x) => ro.done[x] !== undefined || !s.players[x].connected)) finishSolo(s, now, false);
  }
  function finishSolo(s, now, force) {
    const ro = s.round.roulette; if (ro.results) return;
    if (force) for (const pid of pids(s)) { // time's up / host moved on: settle open games fairly
      if (ro.done[pid] !== undefined) continue; const g = s.side && s.side[pid] && s.side[pid][ro.kind];
      if (g && g.status === "playing") {
        if (ro.kind === "bj") sideAction(s, now, pid, { game: "bj", op: "stand" }, null, true);
        else if (ro.kind === "mines" || ro.kind === "hilo") {
          const steps = ro.kind === "mines" ? g.revealed.length : g.steps;
          if (steps) sideAction(s, now, pid, { game: ro.kind, op: "cash" }, null, true);
          else { g.status = "cashed"; g.mult = 1; tx(s, pid, now, "refund", g.stake, `${ro.kind.toUpperCase()} החזר (נגמר הזמן)`); }
        }
      }
      const r = soloResult(s, pid, ro.kind);
      ro.done[pid] = r === undefined ? null : { ...r, mult: r.stake ? Math.round((r.payout / r.stake) * 100) / 100 : 0, delta: r.payout - r.stake, seg: r.payout > r.stake ? "win" : r.payout === r.stake ? "push" : "lose" };
    }
    ro.results = {}; for (const pid of pids(s)) { ro.results[pid] = ro.done[pid] || null; if (ro.stakes[pid] == null) ro.stakes[pid] = 0;
      const p = s.players[pid]; if (p.coins <= 0 && !p.comebackUsed) { p.comebackUsed = true; p.bankrupt = true; tx(s, pid, now, "event", RULES.comeback.grant, "COMEBACK (חד-פעמי)"); } }
    for (const pid of pids(s)) { const h = s.players[pid].history; h[h.length - 1] = { ...h[h.length - 1], coins: s.players[pid].coins }; }
    s.phaseEndsAt = null; logEv(s, now, "solo_done", { kind: ro.kind });
  }
  function soloSkip(s, now, pid) {
    const ro = s.round && s.round.roulette; if (s.phase !== "roulette" || !ro || !ro.solo || ro.results) return { error: "אין הפסקת קזינו פעילה" };
    if (ro.done[pid] !== undefined) return { error: "כבר סיימת" };
    const g = s.side && s.side[pid] && s.side[pid][ro.kind]; if (g) return { error: "כבר התחלת לשחק" };
    ro.done[pid] = null; ro.stakes[pid] = 0;
    if (pids(s).every((x) => ro.done[x] !== undefined || !s.players[x].connected)) finishSolo(s, now, false);
    return { ok: true };
  }
  function setReady(s, pid, on) { const p = s.players[pid]; if (!p) return { error: "שחקן לא קיים" }; p.ready = on !== false; return { ok: true }; }

  // ───────────── solo games (played inside a casino break) ─────────────
  function sideAction(s, now, pid, act, key, internal) {
    const p = s.players[pid]; if (!p) return { error: "שחקן לא קיים" };
    const ro = s.round && s.round.roulette;
    if (!internal) {
      if (s.phase !== "roulette" || !ro || !ro.solo || ro.results) return { error: "המשחק הזה פתוח רק בהפסקת קזינו" };
      if (act.game !== ro.kind) return { error: "בהפסקה הזאת משחקים " + ro.kind.toUpperCase() };
      if (ro.done[pid] !== undefined) return { error: "כבר שיחקת את הסיבוב שלך" };
      const cur = s.side && s.side[pid] && s.side[pid][ro.kind]; const opening = ["plinko", "dice"].includes(act.game) || act.op === "start" || act.op === "deal";
      if (opening && cur) return { error: "כבר שיחקת את הסיבוב שלך" };
    }
    if (key && s.seenKeys[key]) return { dup: true };
    s.side = s.side || {}; const me = (s.side[pid] = s.side[pid] || { plinko: null, mines: null, dice: null, hilo: null, bj: null, n: 0 });
    const stakeOk = (st) => { const a = clampInt(st, 0, capOf(p, "wheel")); return a >= BET_MIN ? a : 0; };
    let res;
    if (act.game === "plinko") {
      const risk = act.risk === "high" ? "high" : "low"; const a = stakeOk(act.stake); if (!a) return { error: `הימור בין ${BET_MIN} ל-${capOf(p, "wheel")}` };
      tx(s, pid, now, "bet_side", -a, "PLINKO"); p.stats.wagered += a;
      const path = Array.from({ length: PLINKO.rows }, () => (rng(s) < 0.5 ? 0 : 1)); const k = path.reduce((x, y) => x + y, 0); const mult = PLINKO[risk][k]; const pay = Math.round(a * mult);
      if (pay) tx(s, pid, now, pay > a ? "win" : "refund", pay, `PLINKO ${mult}×`);
      if (pay > a) p.stats.bestBet = Math.max(p.stats.bestBet, pay - a); else p.stats.worstBet = Math.min(p.stats.worstBet, pay - a);
      me.n++; me.plinko = { id: me.n, path, k, mult, stake: a, payout: pay, risk };
      feedPush(s, now, { pid, game: "plinko", label: `${mult}×`, amount: a, mult, payout: pay }); res = { ok: true };
    } else if (act.game === "mines") {
      const g = me.mines;
      if (act.op === "start") {
        if (g && g.status === "playing") return { error: "יש כבר לוח פתוח" };
        const m = MINES.counts.includes(Number(act.mines)) ? Number(act.mines) : 3; const a = stakeOk(act.stake); if (!a) return { error: `הימור בין ${BET_MIN} ל-${capOf(p, "wheel")}` };
        tx(s, pid, now, "bet_side", -a, `MINES (${m} מוקשים)`); p.stats.wagered += a;
        const cells = Array.from({ length: MINES.size }, (_, i) => i); for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng(s) * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
        me.n++; me.mines = { id: me.n, stake: a, m, board: cells.slice(0, m), revealed: [], status: "playing", mult: 1 }; res = { ok: true };
      } else if (act.op === "pick") {
        if (!g || g.status !== "playing") return { error: "אין לוח פעיל" };
        const i = clampInt(act.i, 0, 24); if (g.revealed.includes(i)) return { error: "כבר נפתח" };
        if (g.board.includes(i)) { g.status = "bust"; g.boom = i; g.mult = 0; p.stats.worstBet = Math.min(p.stats.worstBet, -g.stake); feedPush(s, now, { pid, game: "mines", label: "💣", amount: g.stake, mult: 0, payout: 0 }); }
        else { g.revealed.push(i); g.mult = minesMult(g.m, g.revealed.length); if (g.revealed.length === MINES.size - g.m) return sideAction(s, now, pid, { game: "mines", op: "cash" }); }
        res = { ok: true };
      } else if (act.op === "cash") {
        if (!g || g.status !== "playing" || !g.revealed.length) return { error: "צריך לפתוח לפחות משבצת אחת" };
        const pay = Math.floor(g.stake * g.mult); g.status = "cashed"; tx(s, pid, now, pay > g.stake ? "win" : "refund", pay, `MINES ${g.mult}×`);
        if (pay > g.stake) p.stats.bestBet = Math.max(p.stats.bestBet, pay - g.stake);
        feedPush(s, now, { pid, game: "mines", label: `${g.mult}×`, amount: g.stake, mult: g.mult, payout: pay }); res = { ok: true };
      } else return { error: "פעולה לא מוכרת" };
    } else if (act.game === "dice") {
      const chance = Math.round(Math.min(DICE.max, Math.max(DICE.min, Number(act.chance) || 50)) * 100) / 100; const over = act.dir !== "under";
      const a = stakeOk(act.stake); if (!a) return { error: `הימור בין ${BET_MIN} ל-${capOf(p, "wheel")}` };
      tx(s, pid, now, "bet_side", -a, "DICE"); p.stats.wagered += a;
      const roll = Math.floor(rng(s) * 10000) / 100; const target = over ? Math.round((100 - chance) * 100) / 100 : chance;
      const win = over ? roll >= target : roll < target; const mult = diceMult(chance); const pay = win ? Math.floor(a * mult) : 0;
      if (pay) tx(s, pid, now, "win", pay, `DICE ${mult.toFixed(2)}×`);
      if (pay > a) p.stats.bestBet = Math.max(p.stats.bestBet, pay - a); else p.stats.worstBet = Math.min(p.stats.worstBet, pay - a);
      me.n++; me.dice = { id: me.n, roll, target, over, chance, mult, win, stake: a, payout: pay };
      feedPush(s, now, { pid, game: "dice", label: win ? `${mult.toFixed(2)}×` : roll.toFixed(2), amount: a, mult: win ? mult : 0, payout: pay }); res = { ok: true };
    } else if (act.game === "hilo") {
      const g = me.hilo; const draw = () => ({ r: 1 + Math.floor(rng(s) * 13), s: Math.floor(rng(s) * 4) });
      if (act.op === "start") {
        if (g && g.status === "playing") return { error: "יש כבר סבב פתוח" };
        const a = stakeOk(act.stake); if (!a) return { error: `הימור בין ${BET_MIN} ל-${capOf(p, "wheel")}` };
        tx(s, pid, now, "bet_side", -a, "HIGH-LOW"); p.stats.wagered += a;
        me.n++; me.hilo = { id: me.n, stake: a, card: draw(), trail: [], prod: 1, mult: 1, steps: 0, status: "playing" }; res = { ok: true };
      } else if (act.op === "skip") {
        if (!g || g.status !== "playing") return { error: "אין סבב פעיל" };
        g.trail.push({ c: g.card, g: "skip" }); g.card = draw(); res = { ok: true };
      } else if (act.op === "guess") {
        if (!g || g.status !== "playing") return { error: "אין סבב פעיל" };
        const dir = act.dir === "lo" ? "lo" : "hi"; const pr = hiloP(g.card.r, dir); if (pr >= 1) return { error: "אין רווח בכיוון הזה" };
        const n = draw(); const ok = dir === "hi" ? n.r >= g.card.r : n.r <= g.card.r;
        g.trail.push({ c: g.card, g: dir, ok }); g.card = n;
        if (!ok) { g.status = "bust"; g.mult = 0; p.stats.worstBet = Math.min(p.stats.worstBet, -g.stake); feedPush(s, now, { pid, game: "hilo", label: "✗", amount: g.stake, mult: 0, payout: 0 }); }
        else { g.prod /= pr; g.steps++; g.mult = Math.floor(HILO.edge * g.prod * 100) / 100; if (g.mult >= HILO.cap) { g.mult = HILO.cap; return sideAction(s, now, pid, { game: "hilo", op: "cash" }); } }
        res = { ok: true };
      } else if (act.op === "cash") {
        if (!g || g.status !== "playing" || !g.steps) return { error: "צריך לנחש לפחות פעם אחת" };
        const pay = Math.floor(g.stake * g.mult); g.status = "cashed"; tx(s, pid, now, pay > g.stake ? "win" : "refund", pay, `HIGH-LOW ${g.mult}×`);
        if (pay > g.stake) p.stats.bestBet = Math.max(p.stats.bestBet, pay - g.stake);
        feedPush(s, now, { pid, game: "hilo", label: `${g.mult}×`, amount: g.stake, mult: g.mult, payout: pay }); res = { ok: true };
      } else return { error: "פעולה לא מוכרת" };
    } else if (act.game === "bj") {
      const draw = () => ({ r: 1 + Math.floor(rng(s) * 13), s: Math.floor(rng(s) * 4) });
      const settle = (g, result) => {
        const back = result === "bj" ? Math.floor(g.stake * BJ.bjPays) : result === "win" || result === "dbust" ? g.bet * 2 : result === "push" ? g.bet : 0;
        g.status = "done"; g.result = result; g.payout = back;
        if (back) tx(s, pid, now, back > g.bet ? "win" : "refund", back, `BLACKJACK ${{ bj: "בלאק ג׳ק!", win: "ניצחון", dbust: "הדילר נשרף", push: "תיקו" }[result]}`);
        if (back > g.bet) p.stats.bestBet = Math.max(p.stats.bestBet, back - g.bet); else if (!back) p.stats.worstBet = Math.min(p.stats.worstBet, -g.bet);
        feedPush(s, now, { pid, game: "bj", label: { bj: "BJ", win: "WIN", dbust: "WIN", push: "PUSH", lose: "LOSE", bust: "BUST" }[result], amount: g.bet, mult: g.bet ? back / g.bet : 0, payout: back });
      };
      const dealerPlay = (g) => { while (bjTotal(g.d).t < 17) g.d.push(draw()); const pt = bjTotal(g.p).t, dt = bjTotal(g.d).t; settle(g, dt > 21 ? "dbust" : pt > dt ? "win" : pt === dt ? "push" : "lose"); };
      const g = me.bj;
      if (act.op === "deal") {
        if (g && g.status === "playing") return { error: "יש כבר יד פתוחה" };
        const a = stakeOk(act.stake); if (!a) return { error: `הימור בין ${BET_MIN} ל-${capOf(p, "wheel")}` };
        tx(s, pid, now, "bet_side", -a, "BLACKJACK"); p.stats.wagered += a;
        me.n++; const h = (me.bj = { id: me.n, stake: a, bet: a, p: [draw()], d: [draw()], status: "playing", doubled: false });
        h.p.push(draw()); h.d.push(draw());
        const pb = bjTotal(h.p).t === 21, db = bjTotal(h.d).t === 21;
        if (db) settle(h, pb ? "push" : "lose"); else if (pb) settle(h, "bj");
        res = { ok: true };
      } else if (act.op === "hit" || act.op === "stand" || act.op === "double") {
        if (!g || g.status !== "playing") return { error: "אין יד פעילה" };
        if (act.op === "hit") { g.p.push(draw()); const t = bjTotal(g.p).t; if (t > 21) settle(g, "bust"); else if (t === 21) dealerPlay(g); }
        else if (act.op === "stand") dealerPlay(g);
        else {
          if (g.p.length !== 2) return { error: "דאבל רק על שני קלפים" };
          if (p.coins < g.stake) return { error: "אין מספיק מטבעות לדאבל" };
          tx(s, pid, now, "bet_side", -g.stake, "BLACKJACK דאבל"); p.stats.wagered += g.stake; g.bet = g.stake * 2; g.doubled = true;
          g.p.push(draw()); if (bjTotal(g.p).t > 21) settle(g, "bust"); else dealerPlay(g);
        }
        res = { ok: true };
      } else return { error: "פעולה לא מוכרת" };
    } else return { error: "משחק לא מוכר" };
    if (key) s.seenKeys[key] = 1;
    if (p.coins <= 0 && !p.comebackUsed && !["mines", "hilo", "bj"].some((k) => me[k] && me[k].status === "playing")) { p.comebackUsed = true; p.bankrupt = true; tx(s, pid, now, "event", RULES.comeback.grant, "COMEBACK (חד-פעמי)"); }
    const h = p.history; h[h.length - 1] = { ...h[h.length - 1], coins: p.coins };
    if (!internal && res && res.ok) soloCheck(s, now, pid);
    return res;
  }
  function sideView(s, pid) {
    const me = s.side && s.side[pid]; if (!me) return { plinko: null, mines: null, dice: null, hilo: null, bj: null };
    const h = me.hilo, b = me.bj;
    const hv = h ? { id: h.id, stake: h.stake, card: h.card, trail: h.trail.slice(-8), mult: h.mult, steps: h.steps, status: h.status,
      hi: h.status === "playing" ? { p: hiloP(h.card.r, "hi"), m: Math.floor(HILO.edge * h.prod / hiloP(h.card.r, "hi") * 100) / 100 } : null,
      lo: h.status === "playing" ? { p: hiloP(h.card.r, "lo"), m: Math.floor(HILO.edge * h.prod / hiloP(h.card.r, "lo") * 100) / 100 } : null } : null;
    const bv = b ? { id: b.id, stake: b.stake, bet: b.bet, p: b.p, d: b.status === "playing" ? [b.d[0], null] : b.d, status: b.status, result: b.result, payout: b.payout, doubled: b.doubled,
      pt: bjTotal(b.p), dt: b.status === "playing" ? bjTotal([b.d[0]]) : bjTotal(b.d) } : null;
    const g = me.mines;
    return { dice: me.dice || null, hilo: hv, bj: bv, plinko: me.plinko, mines: g ? { id: g.id, stake: g.stake, m: g.m, revealed: g.revealed, status: g.status, mult: g.mult, next: g.status === "playing" ? minesMult(g.m, g.revealed.length + 1) : null, board: g.status === "playing" ? null : g.board, boom: g.boom } : null };
  }

  // ───────────── summaries & end ─────────────

  function totalOf(p) { return p.score + Math.round((p.coins - START_COINS) / COIN_WEIGHT); }

  function endGame(s, now) {
    s.round = null;
    const P = pids(s).map((id) => s.players[id]);
    const rank = P.slice().sort((a, b) => totalOf(b) - totalOf(a) || b.score - a.score).map((p) => p.id);
    const acc = (p) => (p.stats.answered ? p.stats.correct / p.stats.answered : 0);
    const titles = [];
    const best = (fn, min, label, why) => {
      const scored = P.map((p) => [p, fn(p)]).filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]);
      if (scored.length && (scored.length === 1 || scored[0][1] > scored[1][1])) titles.push({ title: label, pid: scored[0][0].id, why: why(scored[0][1]) });
    };
    const modeCorrect = (p, modes) => modes.reduce((a, m) => a + (p.stats.byMode[m] ? p.stats.byMode[m].c : 0), 0);
    if (P.length > 1) {
      best((p) => acc(p) * 100, 1, "THE GROUP HISTORIAN", (v) => `${Math.round(v)}% תשובות נכונות`);
      best((p) => modeCorrect(p, ["LOVE_DETECTIVE", "EMOTIONAL_RADAR"]) + (p.stats.byChapter[2] ? p.stats.byChapter[2].c : 0), 2, "THE LOVE EXPERT", (v) => `${v} פגיעות בפרק האהבות ובשאלות הרגש`);
      best((p) => modeCorrect(p, ["NUMBERS_GAME", "CLOSEST_GUESS", "RANK_THEM", "GUESS_THE_TIMELINE"]), 2, "THE WALKING ARCHIVE", (v) => `${v} פגיעות במספרים, דירוגים וציר זמן`);
      best((p) => p.stats.highConfWrong, 2, "THE CONFIDENT LIAR", (v) => `${v} פעמים הצהיר “בטוח” וטעה`);
      const leader = rank[0];
      best((p) => (p.id === leader ? -1 : p.stats.hardCorrect), 2, "THE UNEXPECTED GENIUS", (v) => `${v} תשובות נכונות בשאלות HARD/INSANE בלי להוביל`);
    }
    const net = (p) => p.coins - START_COINS;
    const by = (fn, dir = 1) => P.slice().sort((a, b) => dir * (fn(b) - fn(a)))[0];
    const casino = P.length ? {
      richest: by((p) => p.coins).id,
      bestNet: by(net).id,
      biggestLoser: by(net, -1).id,
      bestBet: by((p) => p.stats.bestBet).id, bestBetVal: by((p) => p.stats.bestBet).stats.bestBet,
      worstBet: by((p) => p.stats.worstBet, -1).id, worstBetVal: by((p) => p.stats.worstBet, -1).stats.worstBet,
      biggestBet: by((p) => p.stats.biggestBet).id, biggestBetVal: by((p) => p.stats.biggestBet).stats.biggestBet,
      boldest: by((p) => p.stats.wagered).id,
      friendReader: (() => { const c = P.filter((p) => p.stats.friendBets > 0).sort((a, b) => b.stats.friendWins - a.stats.friendWins)[0]; return c && c.stats.friendWins > 0 ? c.id : null; })(),
      winnerLowAcc: (() => { const w = s.players[rank[0]]; const avg = P.reduce((a, p) => a + acc(p), 0) / P.length; return acc(w) < avg ? w.id : null; })(),
      confidentLost: (() => { const c = P.slice().sort((a, b) => b.stats.highConfWrong - a.stats.highConfWrong)[0]; return c && c.stats.highConfWrong > 0 ? c.id : null; })(),
    } : null;
    const qRates = s.rounds.map((r) => { const ps = Object.values(r.results).filter((x) => x.answered); return { qid: r.qid, rate: ps.length ? ps.filter((x) => x.win).length / ps.length : null }; }).filter((x) => x.rate != null);
    qRates.sort((a, b) => a.rate - b.rate);
    const strengths = {};
    for (const p of P) {
      const ms = Object.entries(p.stats.byMode).filter(([, v]) => v.a >= 2).map(([m, v]) => [m, v.c / v.a]).sort((a, b) => b[1] - a[1]);
      strengths[p.id] = { strong: ms.length ? ms[0][0] : null, weak: ms.length > 1 ? ms[ms.length - 1][0] : null, acc: acc(p) };
    }
    s.final = { rank, totals: Object.fromEntries(P.map((p) => [p.id, totalOf(p)])), titles, casino, hardestQ: qRates[0] ? qRates[0].qid : null, easiestQ: qRates.length ? qRates[qRates.length - 1].qid : null, strengths };
    setPhase(s, now, "game_over", null);
    logEv(s, now, "end", {});
  }

  // ───────────── host controls ─────────────
  function hostAction(s, now, action) {
    if (action === "continue") {
      if (s.phase === "reveal") { if (!maybeRoulette(s, now)) nextQuestion(s, now); return { ok: true }; }
      if (s.phase === "roulette") { const ro = s.round.roulette; if (!ro.results) { if (ro.crash) return { error: "הרקטה עוד באוויר" }; spin(s, now); } else nextQuestion(s, now); return { ok: true }; }
      if (s.phase === "chapter_summary") { if (s.endAfterSummary) { s.endAfterSummary = false; endGame(s, now); } else nextQuestion(s, now); return { ok: true }; }
      return { error: "אין מה להמשיך" };
    }
    if (action === "pause") { if (s.solo && s.phase === "answering") return { error: "אי אפשר להשהות באמצע שאלה" }; if (s.paused || !s.phaseEndsAt) return { error: "אי אפשר להשהות עכשיו" }; s.paused = { remaining: Math.max(0, s.phaseEndsAt - now), at: now }; s.phaseEndsAt = null; logEv(s, now, "pause", {}); return { ok: true }; }
    if (action === "resume") { if (!s.paused) return { error: "לא מושהה" }; s.phaseEndsAt = now + s.paused.remaining; if (s.solo && s.round && s.round.deadline && s.paused.at) s.round.deadline += now - s.paused.at; s.paused = null; logEv(s, now, "resume", {}); return { ok: true }; }
    if (action === "skip") { // void the round: refund open bets, no points
      if (!s.round || !["betting", "answering"].includes(s.phase)) return { error: "אין שאלה פעילה לדלג עליה" };
      for (const pid of pids(s)) { const st = openStake(s.round, pid); if (st) tx(s, pid, now, "refund", st, "דילוג על שאלה: החזר"); }
      logEv(s, now, "skip", { qid: s.round.qid }); s.paused = null; nextQuestion(s, now); return { ok: true };
    }
    if (action === "end") {
      if (s.round && ["betting", "answering", "roulette"].includes(s.phase)) for (const pid of pids(s)) { const st = openStake(s.round, pid) + (s.round.roulette && !s.round.roulette.results ? s.round.roulette.stakes[pid] || 0 : 0); if (st) tx(s, pid, now, "refund", st, "סיום משחק: החזר"); }
      s.lastChapterShown = 99; s.qIndex = s.order.length; endGame(s, now); return { ok: true };
    }
    return { error: "פעולה לא מוכרת" };
  }


  // ───────────── DEV ONLY (playtest): manual control + scenario tweaks. Every use is logged and marked. ─────────────
  function devAdvance(s, now) {
    if (!s.playtest) return { error: "רק במשחק בדיקה" };
    logEv(s, now, "dev_advance", { from: s.phase });
    if (s.phase === "answering") { s.paused = null; reveal(s, now); return { ok: true }; }
    return hostAction(s, now, "continue");
  }
  function devAdjust(s, now, pid, ch, label) {
    if (!s.playtest) return { error: "רק במשחק בדיקה" }; const p = s.players[pid]; if (!p) return { error: "אין שחקן" };
    if (ch.coins != null && ch.coins !== p.coins) tx(s, pid, now, "dev", ch.coins - p.coins, "שינוי פיתוח: " + label);
    if (ch.score != null) p.score = ch.score;
    const h = p.history; h[h.length - 1] = { ...h[h.length - 1], coins: p.coins, score: p.score };
    s.devChanges = (s.devChanges || 0) + 1; logEv(s, now, "dev_adjust", { pid, label, coins: p.coins, score: p.score }); return { ok: true };
  }

  // Timer: called often by the host
  function tick(s, now) {
    if (!s.paused && s.phase === "roulette" && s.round && s.round.roulette && s.round.roulette.crash && !s.round.roulette.results) return crashTick(s, now);
    if (s.paused || !s.phaseEndsAt || now < s.phaseEndsAt) return false;
    if (s.phase === "answering") { reveal(s, now); return true; }
    if (s.phase === "roulette" && !s.round.roulette.results) { spin(s, now); return true; }
    return false;
  }

  // ───────────── views (privacy filter) ─────────────
  function publicQ(q, revealNow) {
    const base = { id: q.id, mode: q.mode, chapter: q.chapter, chapter_name: q.chapter_name, difficulty: q.difficulty, prompt: q.prompt,
      answer_type: q.answer_type, options: q.options, match_targets: q.match_targets || null, time_limit: q.time_limit, score_value: q.score_value,
      interpretive: q.interpretive, instructions: q.instructions || null, partial_scoring: q.partial_scoring || null,
      numeric: q.numeric ? { unit: q.numeric.unit, over_under_line: q.numeric.over_under_line, scoring_bands: q.numeric.scoring_bands } : null,
      own_mult: OWN_MULT[q.difficulty], kind: q.kind || "fact", nscale: q.answer_type === "number" ? numScale(q) : null };
    if (revealNow) Object.assign(base, { correct_answer: q.correct_answer, explanation: q.explanation, source_reference: q.source_reference, source_date: q.source_date, original_quote: q.original_quote, confidence: q.confidence, sensitivity: q.sensitivity });
    return base;
  }
  function view(s, pid, now) {
    const r = s.round; const q = curQ(s);
    const revealed = ["reveal", "roulette"].includes(s.phase) && r && r.results;
    const players = pids(s).map((id) => {
      const p = s.players[id];
      return { id, name: p.name, color: p.color, avatar: p.avatar, connected: p.connected, bot: p.bot, ready: !!p.ready, isHost: id === s.hostPid, score: p.score, coins: p.coins,
        total: totalOf(p), streak: p.streak, bankrupt: p.bankrupt,
        betLocked: !!(r && r.bets[id] && !r.bets[id].skipped), answered: !!(r && r.answers[id]),
        conf: r && r.conf[id] && s.phase !== "lobby" ? r.conf[id] : null,
        history: p.history, accuracy: p.stats.answered ? p.stats.correct / p.stats.answered : null,
        wagered: p.stats.wagered, friendWins: p.stats.friendWins, comebackUsed: p.comebackUsed };
    });
    const me = s.players[pid];
    const v = {
      room: s.room, solo: !!s.solo, practice: s.practice, playtest: s.playtest, noTimer: s.noTimer, phase: s.phase, paused: !!s.paused, pausedRemaining: s.paused ? s.paused.remaining : null,
      phaseEndsAt: s.phaseEndsAt, serverNow: now, hostPid: s.hostPid, me: pid, isHost: pid === s.hostPid, length: s.length,
      players, rules: { START_COINS, OWN_MULT, FRIEND_MULT, OU_MULT, FINAL_MULT, BET_MIN, TABLE_MAX, BAL_CAP, CHAPTER_BONUS, COIN_WEIGHT, ROULETTE_EVERY, RULES, SLOT_PAYS, SLOT_SYMS, WHEEL: WHEEL.map(({ id, label, mult, w }) => ({ id, label, mult, w })) },
      round: null, myBets: null, myAnswer: null, myTx: me ? me.tx.slice(-80) : [], myStats: me ? me.stats : null,
      maxOwnBet: me && r ? maxOwnBet(s, pid) : 0,
      caps: me ? { friend: capOf(me, "friend"), ou: capOf(me, "ou"), wheel: capOf(me, "wheel"), side: capOf(me, "side") } : null,
      side: sideView(s, pid),
      summary: s.phase === "chapter_summary" ? { ch: s.summaryChapter, ...s.chapterStats[s.summaryChapter], hardestPrompt: s.chapterStats[s.summaryChapter].hardest ? qById(s, s.chapterStats[s.summaryChapter].hardest).prompt : null } : null,
      final: s.final ? { ...s.final, hardestPrompt: s.final.hardestQ ? qById(s, s.final.hardestQ).prompt : null, easiestPrompt: s.final.easiestQ ? qById(s, s.final.easiestQ).prompt : null } : null,
      log: s.log.slice(-15), feed: (s.feed || []).slice(-25),
      route: routeOf(s),
      progress: s.order.length ? { n: s.round ? s.round.n : Math.max(0, s.qIndex + 1), total: s.order.length, chapter: s.round ? s.round.chapter : (s.summaryChapter || 1) } : null,
    };
    if (r && q) {
      v.round = { n: r.n, total: r.total, chapter: r.chapter, isFinal: r.isFinal, level: r.level || levelOf(q), secs: r.secs || null, deadline: r.deadline || null, q: publicQ(q, revealed), results: revealed ? r.results : null,
        roulette: r.roulette ? { kind: r.roulette.kind, solo: !!r.roulette.solo, breakNo: r.roulette.breakNo || 0,
          done: r.roulette.done ? Object.fromEntries(Object.entries(r.roulette.done).map(([k, d]) => [k, r.roulette.results || k === pid ? d : d ? "played" : null])) : {}, myAuto: r.roulette.autos ? r.roulette.autos[pid] || null : null,
          crash: r.roulette.crash ? { startAt: r.roulette.crash.startAt, rate: CRASH.rate, cashed: r.roulette.crash.cashed, status: r.roulette.crash.status, point: r.roulette.results ? r.roulette.crash.point : null } : null, stakes: r.roulette.results ? r.roulette.stakes : Object.fromEntries(Object.keys(r.roulette.stakes).map((k) => [k, k === pid ? r.roulette.stakes[k] : "locked"])), results: r.roulette.results } : null,
        // others' bets become visible only after reveal
        allBets: revealed ? r.bets : null };
      v.myBets = r.bets[pid] || null;
      v.myAnswer = r.answers[pid] ? r.answers[pid].value : null;
    }
    return v;
  }

  root.TGG = { numScale, numRange, submitSolo, SOLO, levelOf, devAdvance, devAdjust, soloSkip, setReady, CASINO_KINDS, SOLO_KINDS, sideAction, crashCashout, crashMult, DICE, HILO, BJ, diceMult, hiloP, bjTotal, minesMult, PLINKO, MINES, CRASH, slotPay, SLOT_SYMS, SLOT_PAYS, CONST: { OWN_MULT, FRIEND_MULT, OU_MULT, FINAL_MULT, TABLE_MAX, BAL_CAP, CHAPTER_BONUS, RULES, COIN_WEIGHT, START_COINS, ROULETTE_EVERY, BET_MIN }, validAnswer, CHARS, START_COINS, newState, join, setConnected, start, rouletteStake, hostAction, tick, view, grade, totalOf, WHEEL, OWN_MULT };
})(typeof window !== "undefined" ? window : globalThis);
