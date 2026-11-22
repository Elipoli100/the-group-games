"""THE GROUP GAMES — packs the sources into one self-contained file: dist/index.html.
Usage: python3 build.py            (new design: tokens + embedded fonts + icons)
       python3 build.py --legacy   (byte-identical rebuild of the pre-upgrade site)
"""
import os, sys, base64
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
LEGACY = "--legacy" in sys.argv

def r(p):
    return open(p, encoding="utf-8").read()

def strip_nl(s):
    return s[:-1] if s.endswith("\n") else s

def script(p, tight=False):
    # splash/engine end with a newline before </script>; app.js closes on the same line
    return "<script>" + (strip_nl(r(p)) if tight else r(p)) + "</script>"

def fontface():
    faces = [("Rubik", "rubik", "400 700"), ("Suez One", "suez", "400"), ("Frank Ruhl Libre", "frank", "300 400")]
    out = []
    for fam, f, wt in faces:
        p = f"fonts/{f}.woff2" if os.path.exists(f"fonts/{f}.woff2") else f"fonts/{f}.woff"
        mime = "font/woff2" if p.endswith("woff2") else "font/woff"
        b = base64.b64encode(open(p, "rb").read()).decode()
        out.append(f'@font-face{{font-family:"{fam}";src:url(data:{mime};base64,{b}) format("{p.rsplit(".",1)[1]}");font-weight:{wt};font-display:block}}')
    return "<style>" + "".join(out) + "</style>"

parts = [strip_nl(r("assets/head.html"))]
if LEGACY:
    parts.append(strip_nl(r("assets/gfonts.html")))
    parts.append("<style>" + strip_nl(r("style.css")) + "\n</style>")
else:
    parts.append(fontface())
    parts.append("<style>" + strip_nl(r("tokens.css")) + "\n" + strip_nl(r("style.css")) + "\n</style>")
parts += [strip_nl(r("assets/logo_style.html")), "</head>", "<body>",
          strip_nl(r("assets/logo_data.html")), strip_nl(r("assets/cloud.html")), strip_nl(r("assets/avatars.html"))]
if not LEGACY:
    parts += [script("icons.js"), script("chip.js"), script("motion.js")]
parts += [script("splash.js"), strip_nl(r("assets/appdiv.html")), strip_nl(r("assets/qbank.html")),
          script("engine.js"), script("table.js"), script("app.js", tight=True), "</body>", "</html>"]
html = "\n".join(parts) + ("\n" if LEGACY else "\n")
os.makedirs("dist", exist_ok=True)
name = "dist/legacy.html" if LEGACY else "dist/index.html"
open(name, "w", encoding="utf-8").write(html)
print(f"{name}: {len(html.encode()) / 1024:.0f} KB")
