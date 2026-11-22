/* סלט · THE GROUP GAMES — icon library. Replaces every emoji in the UI.
   TGG_ICONS.ic(name)  → stroke icon (1.75, currentColor), the UI set
   TGG_ICONS.gi(name)  → filled glyph in brand colors (coin, salad chip, gem, mine, rocket…), inline in text
   TGG_ICONS.raw(name) → the glyph's inner SVG (24×24 units), for drawing inside another <svg> */
(function () {
  "use strict";
  const stroke = {
    coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>', arrow: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>',
    share: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.8l6.6-4M8.7 13.2l6.6 4"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>', copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15"/>', home: '<path d="M4 11l8-6.5 8 6.5M6.5 9.5V19.5h11V9.5"/>',
    game: '<rect x="3" y="7.5" width="18" height="10" rx="5"/><path d="M8 10.5v4M6 12.5h4M15.5 11.5h.01M17.5 13.5h.01"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5"/>',
    trophy: '<path d="M8 4.5h8v4.5a4 4 0 0 1-8 0zM8 6.5H5a3 3 0 0 0 3 4M16 6.5h3a3 3 0 0 1-3 4M12 13v3.5M8.5 19.5h7M9.5 16.5h5v3h-5z"/>',
    sound: '<path d="M4.5 9.5h3.5l4.5-4v13l-4.5-4H4.5z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4.5 9.5h3.5l4.5-4v13l-4.5-4H4.5z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>', book: '<path d="M4.5 5.5A2 2 0 0 1 6.5 4H19.5v14H6.5a2 2 0 0 0-2 2zM4.5 20V5.5"/>',
    flag: '<path d="M5.5 21V4.5M5.5 5h11l-2 3.5 2 3.5h-11"/>', chart: '<path d="M4.5 19.5h15M7.5 16v-5M12 16V7.5M16.5 16v-8"/>',
    bolt: '<path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    chips: '<ellipse cx="12" cy="7" rx="7" ry="2.8"/><path d="M5 7v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V7M5 11v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    crown: '<path d="M4 17.5L3 8l5 4 4-6.5 4 6.5 5-4-1 9.5z"/><path d="M4.5 20.5h15"/>',
    gem: '<path d="M6.5 4.5h11l3.5 5-9 10.5-9-10.5z"/><path d="M3 9.5h18M9.5 4.5L8 9.5l4 10.5 4-10.5-1.5-5"/>',
    bomb: '<circle cx="11" cy="14" r="6.5"/><path d="M15.5 9.5l2-2M17.5 5v-1.5M20 7.5h1.5M19.3 5.7l1-1"/>',
    rocket: '<path d="M12 2.5c3.5 2.5 5 6.5 4 11.5H8C7 9 8.5 5 12 2.5z"/><path d="M8 14l-3 3.5h4M16 14l3 3.5h-4M10 18l2 3.5 2-3.5"/><circle cx="12" cy="9" r="1.6"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>',
    sparkle: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>', edit: '<path d="M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z"/>',
    offline: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14.5 10.4A10 10 0 0 1 19 13M12 20h.01"/>',
  };
  const ic = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${stroke[n] || ""}</svg>`;

  // filled glyphs — colors come from tokens.css through style="fill:var(--…)"
  const f = (v) => `style="fill:var(--${v})"`, s = (v, w) => `style="fill:none;stroke:var(--${v});stroke-width:${w}"`;
  const seg = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="10.9" y="1.6" width="2.2" height="3.2" rx=".4" ${f("ivory")} transform="rotate(${a} 12 12)"/>`).join("");
  const raw = {
    coin: `<circle cx="12" cy="12" r="10" ${f("gold")}/><circle cx="12" cy="12" r="10" style="fill:none;stroke:rgba(0,0,0,.25);stroke-width:1"/><circle cx="12" cy="12" r="6.6" style="fill:none;stroke:rgba(90,58,0,.45);stroke-width:1.4"/><path d="M6.5 8.2a7 7 0 0 1 5-3.2" style="fill:none;stroke:rgba(255,255,255,.6);stroke-width:1.4;stroke-linecap:round"/>`,
    salad: `<circle cx="12" cy="12" r="10.5" ${f("chip")}/>${seg}<circle cx="12" cy="12" r="6.6" ${f("ivory")}/><circle cx="12" cy="12" r="6.6" ${s("gold", .8)}/><path d="M7.6 12.4h8.8a4.4 4.4 0 0 1-8.8 0z" ${f("ink")}/><path d="M9.9 12.2c-1.6-.4-2.4-1.6-2.4-3 1.5 0 2.4.9 2.4 3z" ${f("leaf")}/><path d="M14.1 12.2c1.6-.4 2.4-1.6 2.4-3-1.5 0-2.4.9-2.4 3z" ${f("leaf")}/><circle cx="12" cy="10.6" r="1.5" ${f("chip")}/>`,
    gem: `<path d="M6.5 4.5h11l3.5 5-9 10.5-9-10.5z" ${f("win")}/><path d="M3 9.5h18L12 20z" style="fill:rgba(0,60,30,.28)"/><path d="M9.5 4.5L8 9.5h8l-1.5-5z" style="fill:rgba(255,255,255,.45)"/>`,
    bomb: `<circle cx="11" cy="14" r="7" ${f("ink")}/><path d="M8 10.5a4 4 0 0 1 3-1.8" style="fill:none;stroke:rgba(255,255,255,.35);stroke-width:1.4;stroke-linecap:round"/><path d="M15.6 9.4l2.2-2.2" ${s("dim", 2)}/><circle cx="19" cy="5.8" r="2" ${f("gold")}/><circle cx="19" cy="5.8" r=".9" ${f("ivory")}/>`,
    boom: `<path d="M12 1.5l2.3 5.2 5.4-2.1-2.1 5.4 5.2 2.3-5.2 2.3 2.1 5.4-5.4-2.1L12 22.5l-2.3-5.2-5.4 2.1 2.1-5.4L1.2 12l5.2-2.3-2.1-5.4 5.4 2.1z" ${f("chip")}/><circle cx="12" cy="12" r="4.6" ${f("gold")}/><circle cx="12" cy="12" r="2" ${f("ivory")}/>`,
    rocket: `<path d="M10 18l2 4.5 2-4.5z" ${f("gold")}/><path d="M8 13.5l-3.5 4h4.5zM16 13.5l3.5 4H15z" ${f("chip")}/><path d="M12 1.5c4 2.8 5.5 7.6 4.2 13.5H7.8C6.5 9.1 8 4.3 12 1.5z" ${f("ivory")}/><circle cx="12" cy="8.6" r="2" ${f("felt")}/><circle cx="12" cy="8.6" r="2" ${s("gold", .9)}/>`,
    dice: `<rect x="3" y="3" width="18" height="18" rx="4" ${f("ivory")}/><g ${f("ink")}><circle cx="8" cy="8" r="1.6"/><circle cx="16" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/></g>`,
    crown: `<path d="M3.5 18L2.5 7.5l5.2 4.2L12 4.5l4.3 7.2 5.2-4.2-1 10.5z" ${f("gold")}/><rect x="3.5" y="18.5" width="17" height="2.5" rx="1" ${f("gold")}/><circle cx="12" cy="13.5" r="1.4" ${f("chip")}/>`,
    sparkle: `<path d="M12 2c.7 5.3 2.7 7.3 8 8-5.3.7-7.3 2.7-8 8-.7-5.3-2.7-7.3-8-8 5.3-.7 7.3-2.7 8-8z" ${f("gold")}/>`,
  };
  const gi = (n, cls = "") => `<svg class="gi ${cls}" viewBox="0 0 24 24" aria-hidden="true">${raw[n] || ""}</svg>`;
  // a glyph placed inside another <svg>, centred on (x, y), drawn `size` units wide
  const at = (n, x, y, size) => `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})">${raw[n] || ""}</g>`;
  // engine labels still carry emoji (engine.js is frozen) — swap them for glyphs at render time
  const EMO = { "\u{1F957}": "salad", "\u{1FA99}": "coin", "\u{1F4A3}": "bomb", "\u{1F4A5}": "boom", "\u{1F48E}": "gem", "\u{1F680}": "rocket", "\u{1F3B2}": "dice", "\u{1F451}": "crown", "\u2728": "sparkle" };
  const EMO_IC = { "\u2705": "check", "\u274C": "x", "\u{1F512}": "lock", "\u{1F4F4}": "offline", "\u{1F525}": "bolt", "\u{1F44D}": "check", "\u{1F914}": "info",
    "\u23F1": "timer", "\u{1F3AE}": "game", "\u{1F50A}": "sound", "\u{1F4B8}": "down", "\u{1F4B0}": "coin", "\u{1F389}": "sparkle", "\u26A0": "info", "\u{1F441}": "eye", "\u{1F6E0}": "gear", "\u{1F5D1}": "trash" };
  const RX = new RegExp("(" + Object.keys(EMO).concat(Object.keys(EMO_IC)).join("|") + ")\uFE0F?", "gu");
  const swap = (m) => { const k = m.replace("\uFE0F", ""); return EMO[k] ? gi(EMO[k]) : EMO_IC[k] === "coin" ? gi("coin") : ic(EMO_IC[k]); };
  const deEmoji = (str) => String(str).replace(RX, swap);
  // safety net: any emoji that reaches the DOM as text (engine labels, rules copy) becomes an icon
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, text: 1, title: 1 };
  function scrub(root) {
    if (!root) return;
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const hits = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) { RX.lastIndex = 0; if (RX.test(n.nodeValue)) hits.push(n); }
    hits.forEach(fix);
  }
  function fix(n) {
    const p = n.parentNode; if (!p || SKIP[p.nodeName] || p.closest && p.closest("svg")) return;
    RX.lastIndex = 0; if (!RX.test(n.nodeValue)) return;
    const t = document.createElement("template"); t.innerHTML = deEmoji(n.nodeValue.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    p.replaceChild(t.content, n);
  }
  function watch(root) {
    scrub(root);
    new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") fix(m.target); else m.addedNodes.forEach(scrub); } })
      .observe(root, { childList: true, subtree: true, characterData: true });
  }
  window.TGG_ICONS = { stroke, ic, gi, raw, at, deEmoji, scrub, watch };
  if (typeof document !== "undefined") { if (document.body) watch(document.body); else document.addEventListener("DOMContentLoaded", () => watch(document.body)); }
})();
