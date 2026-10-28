"""Business-Wrap brand v3 icons (DESIGN d): the 22 v2 geometries, 24 grid, 1.75 stroke, round caps and joins,
currentColor; one gold part (.hl) and one moving part (.mv) per icon. Writes icons/<name>.svg, icons/sprite.svg,
icons/icons.json and icons/icons.css.

    python brand/v3/tools/build_icons.py

v3 changes from v2: the .hl part is gold (accent.500 in the files, var(--bw-marker-icon) in CSS). Where v2 put a
marker block behind a line (evidence, bilingual, harvest, explainer) v3 draws The Rule instead: a 1.75 gold stroke
under the line (class "hl rl", var(--bw-accent-rule) in CSS). Seals and tabs stay fills. Every micro-animation keeps
its kind and plays once, in the page token (520 ms) with the ease-out token; reduced motion stops them.
"""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
GOLD = "#be9a41"       # accent.500: the gold fill part
GOLD_RULE = "#9c7e36"  # accent.600: The Rule (a graphic on light grounds, never text)
H = f'class="hl" fill="{GOLD}" stroke="none"'
R = f'class="hl rl" stroke="{GOLD_RULE}" fill="none"'
F = 'fill="currentColor" stroke="none"'

# name: (EN label, AR label, what it stands for in the tool, animation, body)
ICONS = {
    "harvest": ("Harvest", "الحصاد", "start a document from evidence", "drop",
                f'<path {R} d="M7.4 9.9h9.2"/><path d="M3 7h18l-7 7.5V20l-4 1.6v-7.1Z"/>'
                f'<g class="mv"><circle {F} cx="9" cy="3.3" r="1.2"/><circle {F} cx="15" cy="3.3" r="1.2"/></g>'),
    "process-model": ("Process model", "نموذج الإجراء", "BPMN, draw.io or YAML in", "draw",
                      f'<rect {H} x="9" y="9.5" width="6" height="5" rx="1.2"/><circle cx="4.5" cy="12" r="2"/>'
                      '<rect x="9" y="9.5" width="6" height="5" rx="1.2"/><path d="M19.5 9 22.5 12 19.5 15 16.5 12Z"/>'
                      '<path class="mv" pathLength="1" d="M6.5 12H9M15 12h1.5"/>'),
    "e-service": ("Live e-service", "الخدمة الحية", "the form, attachments and messages", "blink",
                  f'<rect {H} x="13.5" y="15" width="4.5" height="2.8" rx="1"/><rect x="3" y="4" width="18" height="16" rx="2.2"/>'
                  '<path d="M3 8h18"/><circle cx="6" cy="6" r=".4"/><circle cx="8" cy="6" r=".4"/>'
                  '<rect class="mv" x="6" y="10.8" width="12" height="2.6" rx="1"/><rect x="13.5" y="15" width="4.5" height="2.8" rx="1"/>'
                  '<path d="M6 16.4h4.5"/>'),
    "walk": ("Walk the service", "المرور على الخدمة", "a crawl that reads every step", "slide",
             f'<circle {H} cx="20" cy="5" r="2.2"/><path d="M4 19.5c3-.5 3.5-4 6.5-5.5s4.5-.5 6.5-3.5" stroke-dasharray="1.5 2.6"/>'
             '<circle cx="4" cy="19.5" r="1.4"/><circle cx="20" cy="5" r="2.2"/>'
             '<path class="mv" d="M12.2 12.4 17 14l-2 .9-.9 2Z" fill="currentColor"/>'),
    "dry-run": ("Stops before submit", "يتوقف قبل الإرسال", "a crawl never files a request unless asked twice", "pulse",
                f'<rect x="3" y="13.5" width="13" height="6.5" rx="3.25"/><path d="M6.5 16.75h6"/>'
                f'<g class="mv"><path {H} d="M15.6 2.8h3.8l2.7 2.7v3.8l-2.7 2.7h-3.8l-2.7-2.7V5.5Z"/>'
                '<path d="M15.6 2.8h3.8l2.7 2.7v3.8l-2.7 2.7h-3.8l-2.7-2.7V5.5Z"/><path d="M15.5 7.4h4"/></g>'),
    "merge": ("Merge", "الدمج", "the union of a crawl and a model", "draw",
              f'<circle {H} cx="12" cy="15" r="2.4"/><path class="mv" pathLength="1" d="M6 3v3.5c0 3.5 6 4 6 8.5M18 3v3.5c0 3.5-6 4-6 8.5"/>'
              '<circle cx="12" cy="15" r="2.4"/><path d="M12 17.4V21"/>'),
    "editor": ("Editor", "المحرر", "the HTML editor that is the print layout", "blink",
               f'<rect {H} x="7.5" y="10" width="7.5" height="3.2" rx=".6"/><rect x="4.5" y="3" width="15" height="18" rx="2.2"/>'
               '<path d="M7.5 7h9M7.5 16.5h6"/><path class="mv" d="M16.8 9.2v4.8"/>'),
    "print-layout": ("Print layout", "تخطيط الطباعة", "the page you edit is the page that prints", "pulse",
                     f'<rect {H} x="8" y="8" width="8" height="2.6" rx=".5"/><rect x="7" y="7" width="10" height="10" rx="1"/>'
                     '<path d="M10 13.5h4"/><path class="mv" d="M3 7h2M7 3v2M21 7h-2M17 3v2M3 17h2M7 21v-2M21 17h-2M17 21v-2"/>'),
    "pdf": ("PDF", "PDF", "real, selectable text with embedded fonts", "lift",
            f'<g class="mv"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>'
            f'<rect {H} x="3" y="12" width="15" height="7" rx="1.5"/>'
            '<path stroke-width="1.4" d="M5.4 17.6v-4h1.5a1.1 1.1 0 0 1 0 2.2H5.4M9.4 13.6v4h.9a2 2 0 0 0 0-4ZM13.6 17.6v-4h2.3M13.6 15.6h1.8"/></g>'),
    "docx": ("DOCX", "DOCX", "a Word file with real text", "lift",
             f'<g class="mv"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>'
             f'<rect {H} x="3" y="12" width="15" height="7" rx="1.5"/>'
             '<path stroke-width="1.4" d="M5.2 13.6v4h.9a2 2 0 0 0 0-4ZM15.8 14.3a1.9 1.9 0 1 0 0 2.6"/><ellipse stroke-width="1.4" cx="10.4" cy="15.6" rx="1.6" ry="2"/></g>'),
    "edits-file": ("Edits file", "ملف التعديلات", "every change recorded as JSON", "slide",
                   f'<rect {H} x="10.2" y="10.2" width="3.6" height="3.6" rx=".8"/>'
                   '<path d="M8 4c-2 0-2.5 1-2.5 2.6v2.6c0 1.4-.8 2.3-2.3 2.8 1.5.5 2.3 1.4 2.3 2.8v2.6C5.5 19 6 20 8 20"/>'
                   '<path d="M16 4c2 0 2.5 1 2.5 2.6v2.6c0 1.4.8 2.3 2.3 2.8-1.5.5-2.3 1.4-2.3 2.8v2.6c0 1.6-.5 2.6-2.5 2.6"/>'
                   '<rect class="mv" x="10.2" y="10.2" width="3.6" height="3.6" rx=".8"/>'),
    "bilingual": ("Arabic and English", "العربية والإنجليزية", "both editions are first-class", "swap",
                  f'<path {R} d="M5.2 17.2h4.4M14.4 17.2h4.4"/><rect x="2.5" y="4" width="19" height="16" rx="2.2"/><path d="M12 4v16"/>'
                  '<path class="mv a" d="M5 14.5l2.25-6.5 2.25 6.5M5.8 12.4h2.9"/>'
                  '<path class="mv b" d="M18.4 9.2a1.6 1.6 0 1 0-1.7 1.9c-1.3.3-2.1 1.1-2.1 2.2 0 1.1.9 1.7 2.2 1.7h1.6"/>'),
    "direction": ("RTL and LTR", "اتجاه الكتابة", "the words change direction, the layout never flips", "slide",
                  f'<rect {H} x="9" y="10.6" width="6" height="2.8" rx=".6"/><g class="mv"><path d="M4 7.5h15M16 4.5l3 3-3 3"/>'
                  '<path d="M20 16.5H5M8 13.5l-3 3 3 3"/></g>'),
    "design-pack": ("Design pack", "حزمة التصميم", "colours, sizes, fonts and template parts", "fan",
                    '<rect x="4" y="5" width="7" height="15" rx="1.6" transform="rotate(-14 7.5 20)"/>'
                    '<rect x="8.5" y="4" width="7" height="15" rx="1.6"/>'
                    f'<g class="mv"><rect {H} x="13" y="5" width="7" height="15" rx="1.6" transform="rotate(14 16.5 20)"/>'
                    '<rect x="13" y="5" width="7" height="15" rx="1.6" transform="rotate(14 16.5 20)"/></g><circle cx="12" cy="16" r=".9"/>'),
    "diagram": ("Workflow diagram", "مخطط سير العمل", "editable shapes and arrows, Mermaid in and out", "draw",
                f'<rect {H} x="14" y="15" width="7" height="5" rx="1.2"/><rect x="3" y="4" width="7" height="5" rx="1.2"/>'
                '<rect x="14" y="15" width="7" height="5" rx="1.2"/>'
                '<path class="mv" pathLength="1" d="M6.5 9v4.5a2 2 0 0 0 2 2H13.5"/><path d="m11.5 13.5 2 2-2 2"/>'),
    "security-gate": ("Security gate", "فحص الأمان", "client content, credentials and paths stay out", "draw",
                      f'<path {H} d="M12 6.2 16.5 8v3.4c0 3-1.9 5.4-4.5 6.7-2.6-1.3-4.5-3.7-4.5-6.7V8Z"/>'
                      '<path d="M12 3 19 6v5.2c0 4.5-3 8.1-7 9.8-4-1.7-7-5.3-7-9.8V6Z"/>'
                      '<path class="mv" pathLength="1" d="m9.4 12 1.9 1.9 3.4-3.6"/>'),
    "evidence": ("Evidence", "الأدلة", "every chapter traces to its source", "slide",
                 f'<path d="M3 5h9M3 9h6M3 17h7"/><g class="mv"><path {R} d="M11.2 10.6h4.6"/>'
                 '<circle cx="13.5" cy="10" r="5"/><path d="M17.2 13.7 21 17.5"/></g>'),
    "mcp-server": ("MCP server", "خادم MCP", "the tool's functions for agents", "pulse",
                   f'<g class="mv"><circle {H} cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="3.2"/></g>'
                   '<path d="M12 3.5v5.3M4.6 16.2l4.6-2.6M19.4 16.2l-4.6-2.6"/>'
                   '<circle cx="12" cy="3.2" r="1.6"/><circle cx="4" cy="16.8" r="1.6"/><circle cx="20" cy="16.8" r="1.6"/>'),
    "plugin": ("Claude Code plugin", "إضافة Claude Code", "skill and MCP server together", "snap",
               '<path d="M4 9.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3.5"/>'
               f'<g class="mv"><path {H} d="M2 10.2h4.2a1.8 1.8 0 1 1 0 3.6H2Z"/><path d="M2 10.2h4.2a1.8 1.8 0 1 1 0 3.6H2"/></g>'
               '<path d="M10.5 9h6M10.5 12h6M10.5 15h4"/>'),
    "update": ("Update", "التحديث", "one click, documents untouched", "spin",
               f'<circle {H} cx="12" cy="12" r="3"/><g class="mv"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4.5v4h-4"/></g>'
               '<path d="M12 10.3v3.4M10.6 12.5 12 13.9l1.4-1.4"/>'),
    "export": ("Export", "التصدير", "PDF, DOCX, edits, design pack, HTML", "rise",
               f'<path {H} d="M4.9 15.9h14.2v2a1.4 1.4 0 0 1-1.4 1.4H6.3a1.4 1.4 0 0 1-1.4-1.4Z"/>'
               '<path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><g class="mv"><path d="M12 15V4"/><path d="m8 8 4-4 4 4"/></g>'),
    "explainer": ("Explainer card", "البطاقة الشارحة", "rest on a tool: name, shortcut, one sentence, a small animation", "pulse",
                  '<rect x="3" y="4" width="18" height="13" rx="2.2"/><path d="M8 17l-1.5 3.5L11 17"/>'
                  f'<path {R} d="M8.6 14.1h6.8"/><g class="mv"><path d="M10.6 6.9v4.8l4-2.4Z"/></g>'),
}

# kind: keyframes. Every kind plays once in the page token with the ease-out token (DESIGN d.5), except blink
# (a cursor: stepped) and spin (a full turn needs the in-out curve to start and land softly).
D, E = "var(--bw-dur-page, 520ms)", "var(--bw-ease-out, cubic-bezier(0.22, 1, 0.36, 1))"
EIO = "var(--bw-ease-in-out, cubic-bezier(0.65, 0, 0.35, 1))"
ANIM = {
    "drop": ("@keyframes bwi-drop{0%{transform:translateY(-3px);opacity:0}45%{opacity:1}100%{transform:translateY(0);opacity:1}}",
             f"bwi-drop {D} {E} 1 backwards"),
    "draw": ("@keyframes bwi-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}", f"bwi-draw {D} {E} 1 backwards"),
    "blink": ("@keyframes bwi-blink{0%,100%{opacity:1}25%,60%{opacity:.15}}", f"bwi-blink {D} steps(1, end) 1"),
    "slide": ("@keyframes bwi-slide{0%,100%{transform:translateX(0)}50%{transform:translateX(var(--bwi-dx,2.5px))}}",
              f"bwi-slide {D} {E} 1"),
    "pulse": ("@keyframes bwi-pulse{0%,100%{transform:scale(1)}40%{transform:scale(1.14)}70%{transform:scale(.97)}}",
              f"bwi-pulse {D} {E} 1"),
    "lift": ("@keyframes bwi-lift{0%,100%{transform:translateY(0)}45%{transform:translateY(-2px) rotate(-3deg)}}",
             f"bwi-lift {D} {E} 1"),
    "swap": ("@keyframes bwi-swap-a{0%,100%{transform:translateX(0)}50%{transform:translateX(9.5px);opacity:.2}}\n"
             "@keyframes bwi-swap-b{0%,100%{transform:translateX(0)}50%{transform:translateX(-9.5px);opacity:.2}}", None),
    "fan": ("@keyframes bwi-fan{0%,100%{transform:rotate(0)}50%{transform:rotate(9deg)}}", f"bwi-fan {D} {E} 1"),
    "snap": ("@keyframes bwi-snap{0%{transform:translateX(-3px)}60%{transform:translateX(.6px)}100%{transform:translateX(0)}}",
             f"bwi-snap {D} {E} 1"),
    "spin": ("@keyframes bwi-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}", f"bwi-spin {D} {EIO} 1"),
    "rise": ("@keyframes bwi-rise{0%{transform:translateY(0)}45%{transform:translateY(-3px);opacity:0}46%{transform:translateY(3px);opacity:0}100%{transform:translateY(0);opacity:1}}",
             f"bwi-rise {D} {E} 1"),
}

ATTR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'


def svg_file(name: str, label: str, body: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" {ATTR} width="24" height="24" class="bw-i bw-i--{name}" '
            f'role="img" aria-label="{label}"><title>{label}</title>{body}</svg>\n')


def css() -> str:
    trig = lambda n: (f".bw-i--{n}:hover .mv, :hover > .bw-i--{n} .mv, :focus-visible > .bw-i--{n} .mv, "  # noqa: E731
                      f".is-inview .bw-i--{n} .mv, .bw-i--{n}.is-inview .mv, .bw-i--{n}.is-playing .mv")
    out = ["/* Business-Wrap brand v3 icons: colour parts and micro-animations. GENERATED by brand/v3/tools/build_icons.py. */",
           "/* Timings come from the v3 tokens (brand/v3/tokens-v3.css); the fallbacks are the same values. One move, once:",
           "   on hover of the icon or its parent, on keyboard focus of the parent, when the icon or an ancestor gets .is-inview",
           "   (an IntersectionObserver adds it) or the icon gets .is-playing. Nothing moves under reduced motion. */",
           ".bw-i { width: 1.5em; height: 1.5em; vertical-align: middle; overflow: visible; }",
           "/* the gold part: a fill (seals, tabs) in --bw-marker-icon; The Rule (a stroke under a line) in --bw-accent-rule */",
           ".bw-i .hl { fill: var(--bw-marker-icon, #be9a41); }",
           ".bw-i .hl.rl { fill: none; stroke: var(--bw-accent-rule, #9c7e36); }",
           "/* toolbar weight (DESIGN d.4): 2 at 18 px on the navy glass */",
           ".bw-i.bw-i-bold { stroke-width: 2; }",
           ".bw-i .mv { transform-box: fill-box; transform-origin: 50% 50%; }",
           ".bw-i [pathLength='1'].mv { stroke-dasharray: 1; stroke-dashoffset: 0; }"]
    out += sorted({v[0] for v in ANIM.values()})
    for n, (_, _, _, kind, _) in ICONS.items():
        if kind == "swap":
            for k in ("a", "b"):
                out.append(f"{trig(n).replace('.mv', '.mv.' + k)} {{ animation: bwi-swap-{k} {D} {E} 1; }}")
        else:
            out.append(f"{trig(n)} {{ animation: {ANIM[kind][1]}; }}")
    out += [".bw-i--update .mv { transform-origin: 50% 50%; }",
            ".bw-i--design-pack .mv { transform-origin: 30% 100%; }",
            ".bw-i--pdf .mv, .bw-i--docx .mv { transform-origin: 50% 100%; }",
            ".bw-i--evidence { --bwi-dx: -4px; }",
            "/* Arabic: directional moves start from the reading start */",
            "[dir='rtl'] .bw-i--walk, [dir='rtl'] .bw-i--edits-file, [dir='rtl'] .bw-i--direction { --bwi-dx: -2.5px; }",
            "[dir='rtl'] .bw-i--evidence { --bwi-dx: 4px; }",
            "@media (prefers-reduced-motion: reduce) { .bw-i .mv { animation: none !important; } }",
            "@media (forced-colors: active) { .bw-i .hl { fill: CanvasText; } .bw-i .hl.rl { fill: none; stroke: Highlight; } }"]
    return "\n".join(out) + "\n"


def main():
    OUT.mkdir(exist_ok=True)
    meta, symbols = [], []
    for n, (en, ar, why, kind, body) in ICONS.items():
        (OUT / f"{n}.svg").write_text(svg_file(n, en, body), encoding="utf-8", newline="\n")
        symbols.append(f'<symbol id="bw-i-{n}" viewBox="0 0 24 24">{body}</symbol>')
        meta.append({"name": n, "file": f"{n}.svg", "label": {"en": en, "ar": ar}, "meaning": why, "animation": kind,
                     "gold": "rule" if 'class="hl rl"' in body else "fill"})
    (OUT / "sprite.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n'
        '<!-- use: <svg class="bw-i bw-i__NAME (two hyphens)" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" '
        'stroke-linejoin="round"><use href="sprite.svg#bw-i-NAME"/></svg>. Animations need the inline SVG (a <use> shadow tree is not styled by icons.css). -->\n'
        + "\n".join(symbols) + "\n</svg>\n", encoding="utf-8", newline="\n")
    (OUT / "icons.json").write_text(json.dumps({"brand": "v3", "grid": 24, "stroke": 1.75, "caps": "round", "colour": "currentColor",
                                                "highlighter": "class hl: fill var(--bw-marker-icon); class hl rl (The Rule): stroke var(--bw-accent-rule)",
                                                "moving part": "class mv", "timing": "var(--bw-dur-page) var(--bw-ease-out), once",
                                                "icons": meta}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    (OUT / "icons.css").write_text(css(), encoding="utf-8", newline="\n")
    print(f"{len(ICONS)} icons")


if __name__ == "__main__":
    main()
