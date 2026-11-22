/* סלט · the chip as an SVG made of parts, so it can assemble itself.
   Parts: #cDisc · eight .ins · #cRing · #cFace · #bowl · #leaf1 · #leaf2 · #tom
   SalatChip.svg()          → markup (also window.SALAT_CHIP_SVG, used by the app's logo and icons)
   SalatChip.assemble(root) → Promise, the 2.2s build: disc, segments, gold ring, bowl line then fill, leaves, tomato */
(function () {
  "use strict";
  const ins = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<g transform="rotate(${a} 300 300)"><rect class="ins" x="279" y="12" width="42" height="74" rx="8" fill="#FFF8EC"/></g>`).join("");
  const BOWL = "M160 300 H440 A140 140 0 0 1 160 300 Z";
  const LEAF = "M0 0 C40 -40 40 -110 0 -150 C-40 -110 -40 -40 0 0 Z";
  function svg(id) {
    const k = id || "c" + Math.random().toString(36).slice(2, 7);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 612" role="img" aria-label="סלט" class="salat-chipsvg">
<defs><clipPath id="${k}clip"><circle cx="300" cy="300" r="290"/></clipPath>
<linearGradient id="${k}sw" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<circle cx="300" cy="306" r="290" fill="#000" opacity=".25" class="cShadow"/>
<g id="cDisc"><circle cx="300" cy="300" r="290" fill="#C62F3B"/><circle cx="300" cy="300" r="281" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="5"/></g>
<g class="cIns">${ins}</g>
<circle id="cRing" cx="300" cy="300" r="198" fill="none" stroke="#E8B84A" stroke-width="12" pathLength="100"/>
<g id="cFace"><circle cx="300" cy="300" r="192" fill="#FFF8EC"/><circle cx="300" cy="303" r="189" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="6"/><ellipse cx="300" cy="452" rx="104" ry="10" fill="#000" opacity=".12"/></g>
<g transform="translate(262 300) rotate(-32)"><g id="leaf1"><path d="${LEAF}" fill="#2E9B4F"/></g></g>
<g transform="translate(338 300) rotate(32)"><g id="leaf2"><path d="${LEAF}" fill="#7CCB4E"/></g></g>
<g id="tom"><circle cx="300" cy="262" r="40" fill="#FF6A3D"/></g>
<path id="bowl" d="${BOWL}" fill="#1A1A1A" stroke="#1A1A1A" stroke-width="6" stroke-linejoin="round" pathLength="100"/>
<g clip-path="url(#${k}clip)"><rect class="cSweep" x="-200" y="0" width="160" height="612" fill="url(#${k}sw)" opacity="0"/></g>
</svg>`;
  }
  const reduced = () => window.M ? M.reduced() : false;
  const e = (n) => (window.M ? M.ease(n) : "ease-out");
  const wait = (t) => new Promise((r) => setTimeout(r, t));
  function a(el, frames, dur, delay, curve, origin) {
    if (!el) return; if (origin) { el.style.transformBox = "view-box"; el.style.transformOrigin = origin; }
    el.animate(frames, { duration: dur, delay, easing: e(curve || "out"), fill: "both" });
  }
  // total 2200ms; the timings follow the promo film's chip build
  function assemble(root, { onStep } = {}) {
    const s = root.querySelector("svg") || root; const q = (x) => s.querySelector(x); const qa = (x) => s.querySelectorAll(x);
    if (reduced()) { s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return wait(200); }
    const step = (t, name) => setTimeout(() => onStep && onStep(name), t);
    a(q(".cShadow"), [{ opacity: 0 }, { opacity: 0.25 }], 300, 0);
    a(q("#cDisc"), [{ transform: "scale(.55)", opacity: 0 }, { transform: "none", opacity: 1 }], 380, 0, "back", "300px 300px"); step(0, "disc");
    qa(".ins").forEach((r, i) => a(r, [{ transform: "translateY(150px)", opacity: 0 }, { transform: "none", opacity: 1 }], 300, 260 + i * 45, "back")); step(260, "ins");
    a(q("#cRing"), [{ strokeDasharray: "0 100", opacity: 1 }, { strokeDasharray: "100 0", opacity: 1 }], 380, 700, "inOut"); step(700, "ring");
    a(q("#cFace"), [{ transform: "scale(.2)", opacity: 0 }, { transform: "none", opacity: 1 }], 320, 720, "out", "300px 300px");
    a(q("#bowl"), [{ strokeDasharray: "0 100", fillOpacity: 0 }, { strokeDasharray: "100 0", fillOpacity: 0, offset: 0.6 }, { strokeDasharray: "100 0", fillOpacity: 1 }], 520, 1020, "inOut"); step(1020, "bowl");
    a(q("#leaf1"), [{ transform: "scale(0)" }, { transform: "none" }], 360, 1440, "back", "0px 0px");
    a(q("#leaf2"), [{ transform: "scale(0)" }, { transform: "none" }], 360, 1520, "back", "0px 0px"); step(1440, "leaves");
    a(q("#tom"), [{ transform: "translateY(-260px)", opacity: 0 }, { transform: "translateY(-260px)", opacity: 1, offset: 0.05 }, { transform: "none", opacity: 1 }], 340, 1700, "back"); step(1960, "tom");
    a(q(".cSweep"), [{ transform: "translateX(0)", opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "translateX(1000px)", opacity: 0 }], 420, 1780, "inOut");
    return wait(2200);
  }
  window.SalatChip = { svg, assemble };
  window.SALAT_CHIP_SVG = svg("logo");
})();
