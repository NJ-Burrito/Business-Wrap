"""Business-Wrap brand v3 tokens, generated from the SRS palette (palette/tokens.json, unchanged).

Every UI colour is a ramp step of the SRS palette or color.white. Nothing is invented, nothing is retuned.

  python build_tokens_v3.py <palette/tokens.json> <out-dir>

Writes into <out-dir>:
  tokens-v3.json       DTCG, light roles (aliases into the copied ramps) + contrast pairs: gate with palette/check.py as is
  dark/tokens-v3.dark.json  DTCG, the same role names for dark: gate with palette/check.py as is
                       (its own folder, because check.py writes swatches.html beside each token file)
  tokens-v3.css        --bw-* custom properties (names kept from brand v2), light default, dark by system or [data-theme]
  contrast-v3.md       every pair, light and dark, with the ratio computed by palette/check.py's formula
Exit 1 when any pair fails.
"""
import copy
import json
import sys
from pathlib import Path

# role: (light step, dark step, description). A step is "ramp.step" or "white".
ROLES = {
    "bg":              ("neutral.50",  "primary.950", "Page ground. Light: the documents' paper. Dark: the cover band's navy."),
    "surface":         ("white",       "primary.900", "Cards, panels, inputs"),
    "surface-2":       ("accent.100",  "primary.800", "Raised panel, story-card ground (the documents' card)"),
    "surface-sunk":    ("neutral.100", "neutral.900", "Command wells and code blocks"),
    "ink":             ("neutral.900", "neutral.50",  "Body text (7:1)"),
    "ink-muted":       ("neutral.700", "neutral.300", "Secondary text, captions, labels (4.5:1)"),
    "ink-faint":       ("neutral.600", "neutral.400", "Placeholders and fine print (4.5:1)"),
    "line":            ("neutral.200", "primary.800", "Hairline rules (decorative, never the only boundary of a control)"),
    "rule-strong":     ("neutral.300", "primary.700", "Section and card rules (decorative)"),
    "line-strong":     ("neutral.500", "neutral.500", "Input and control borders (3:1)"),
    "primary":         ("primary.800", "primary.200", "Headings, links, primary buttons"),
    "primary-hover":   ("primary.900", "primary.100", "Hover of primary"),
    "on-primary":      ("white",       "primary.950", "Label on a primary button"),
    "primary-soft":    ("primary.100", "primary.800", "Table header fill, selected row"),
    "primary-wash":    ("primary.50",  "primary.900", "Zebra rows, quiet wash"),
    "accent":          ("accent.500",  "accent.500",  "Gold as a FILL: the spine cap, pressed state, the one hot mark"),
    "accent-hover":    ("accent.400",  "accent.400",  "Hover of a gold fill"),
    "on-accent":       ("primary.950", "primary.950", "Label on a gold fill"),
    "accent-rule":     ("accent.600",  "accent.500",  "Gold rules and marks, never text (3:1 graphic)"),
    "accent-strong":   ("accent.800",  "accent.400",  "Gold that carries words: kickers, section numbers (4.5:1)"),
    "marker":          ("accent.200",  "accent.400",  "The gold wash behind marked words"),
    "on-marker":       ("neutral.900", "primary.950", "Ink on the gold wash (7:1)"),
    "marker-icon":     ("accent.500",  "accent.800",  "Icon highlight part"),
    "focus":           ("primary.600", "accent.500",  "Focus ring"),
    "band":            ("primary.950", "primary.950", "The spine band (the logo and the cover object; always on paper)"),
    "on-band":         ("accent.500",  "accent.500",  "Spine code and cap on the band"),
    "signal":          ("signal.600",  "signal.300",  "Gap / error text and rules"),
    "on-signal":       ("white",       "primary.950", "Label on a signal tag"),
    "signal-wash":     ("signal.100",  "signal.800",  "Gap / error callout ground"),
    "on-signal-wash":  ("neutral.900", "neutral.50",  "Text on the signal wash"),
    "success":         ("success.700", "success.300", "Ready / success text"),
    "success-wash":    ("success.100", "success.700", "Ready / success chip ground"),
    "on-success-wash": ("success.700", "neutral.50",  "Text on the success chip"),
    "warning":         ("accent.800",  "accent.400",  "Warning text (worded, gold)"),
    "info":            ("primary.600", "primary.200", "Info text"),
    "danger":          ("signal.600",  "signal.300",  "Alias of signal (v2 name kept)"),
    "glass":           ("primary.950", "primary.950", "Editor toolbar glass, used at 94 % alpha over the page"),
    "on-glass":        ("neutral.50",  "neutral.50",  "Toolbar text"),
    "on-glass-soft":   ("neutral.300", "neutral.300", "Toolbar secondary text"),
    "sec-file":        ("accent.400",  "accent.400",  "Toolbar section name: File"),
    "sec-insert":      ("primary.300", "primary.300", "Toolbar section name: Insert"),
    "sec-edit":        ("success.300", "success.300", "Toolbar section name: Edit"),
    "sec-design":      ("signal.300",  "signal.300",  "Toolbar section name: Design"),
}

# fg, bg, level, use. Levels follow the SRS rules: body 7:1, secondary 4.5:1, graphics 3:1.
PAIRS = [
    ("ink", "bg", 7.0, "body text on the page"),
    ("ink", "surface", 7.0, "body text on cards"),
    ("ink", "surface-2", 7.0, "body text on the story card"),
    ("ink", "surface-sunk", 7.0, "commands in a well"),
    ("ink", "primary-wash", 7.0, "text on a zebra row"),
    ("ink", "primary-soft", 7.0, "text on the header fill"),
    ("ink-muted", "bg", 4.5, "secondary text"),
    ("ink-muted", "surface", 4.5, "secondary text on cards"),
    ("ink-muted", "surface-2", 4.5, "secondary text on the story card"),
    ("ink-faint", "bg", 4.5, "fine print"),
    ("ink-faint", "surface", 4.5, "placeholders"),
    ("primary", "bg", 7.0, "headings and links on the page"),
    ("primary", "surface", 7.0, "headings and links on cards"),
    ("primary", "surface-2", 4.5, "links on the story card"),
    ("primary", "primary-soft", 4.5, "header text on the header fill"),
    ("primary-hover", "bg", 7.0, "link hover"),
    ("on-primary", "primary", 7.0, "primary button label"),
    ("on-primary", "primary-hover", 7.0, "primary button label, hover"),
    ("on-accent", "accent", 4.5, "label on a gold fill"),
    ("on-accent", "accent-hover", 4.5, "label on a gold fill, hover"),
    ("on-marker", "marker", 7.0, "words under the gold wash"),
    ("accent-strong", "bg", 4.5, "gold words: kicker, section number"),
    ("accent-strong", "surface", 4.5, "gold words on cards"),
    ("accent-strong", "surface-2", 4.5, "story id on the story card"),
    ("accent-rule", "bg", 3.0, "gold rule (graphic)"),
    ("accent-rule", "surface", 3.0, "gold rule on cards (graphic)"),
    ("on-band", "band", 4.5, "spine code on the band"),
    ("line-strong", "surface", 3.0, "input border"),
    ("line-strong", "bg", 3.0, "control border on the page"),
    ("focus", "bg", 3.0, "focus ring on the page"),
    ("focus", "surface", 3.0, "focus ring on cards"),
    ("primary", "marker-icon", 3.0, "icon stroke across its highlight part"),
    ("signal", "bg", 4.5, "gap / error text"),
    ("signal", "surface", 4.5, "error text on cards"),
    ("on-signal", "signal", 4.5, "label on a signal tag"),
    ("on-signal-wash", "signal-wash", 7.0, "callout text on the signal wash"),
    ("success", "bg", 4.5, "ready text"),
    ("success", "surface", 4.5, "ready text on cards"),
    ("on-success-wash", "success-wash", 4.5, "ready chip"),
    ("warning", "bg", 4.5, "warning text"),
    ("warning", "surface", 4.5, "warning text on cards"),
    ("info", "bg", 4.5, "info text"),
    ("info", "surface", 4.5, "info text on cards"),
    ("on-glass", "glass", 7.0, "toolbar text"),
    ("on-glass-soft", "glass", 4.5, "toolbar secondary text"),
    ("accent", "glass", 3.0, "toolbar focus ring and pressed fill on glass"),
    ("sec-file", "glass", 4.5, "section name File"),
    ("sec-insert", "glass", 4.5, "section name Insert"),
    ("sec-edit", "glass", 4.5, "section name Edit"),
    ("sec-design", "glass", 4.5, "section name Design"),
]


def lum(h):
    h = h.lstrip("#")
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):  # palette/check.py's formula, rounded the same way
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return round((la + 0.05) / (lb + 0.05), 2)


def main(src, out):
    pal = json.loads(Path(src).read_text(encoding="utf-8"))
    ramps = pal["color"]["ramp"]
    white = pal["color"]["white"]

    def hx(step):
        if step == "white":
            return white["$value"]["hex"]
        g, s = step.split(".")
        return ramps[g][s]["$value"]["hex"]

    def alias(step):
        return "{color.white}" if step == "white" else "{color.ramp.%s}" % step

    def dtcg(mode):
        i = 0 if mode == "light" else 1
        return {
            "$description": f"Business-Wrap brand v3 UI tokens, {mode}. Generated by build_tokens_v3.py from palette/tokens.json (the SRS palette, unchanged). Roles alias ramp steps only. Gate: python palette/check.py <this file>.",
            "color": {
                "$type": "color",
                "ramp": copy.deepcopy(ramps),
                "white": copy.deepcopy(white),
                "role": {k: {"$value": alias(v[i]), "$description": v[2]} for k, v in ROLES.items()},
            },
            "$extensions": {"business-wrap": {
                "brand": "v3", "mode": mode, "source": "palette/tokens.json",
                "contrastPairs": [[f"{use}", fg, bg, need] for fg, bg, need, use in PAIRS],
            }},
        }

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    light, dark = dtcg("light"), dtcg("dark")
    (out / "tokens-v3.json").write_text(json.dumps(light, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "dark").mkdir(exist_ok=True)
    (out / "dark" / "tokens-v3.dark.json").write_text(json.dumps(dark, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    rows, fails = [], 0
    for fg, bg, need, use in PAIRS:
        cl = contrast(hx(ROLES[fg][0]), hx(ROLES[bg][0]))
        cd = contrast(hx(ROLES[fg][1]), hx(ROLES[bg][1]))
        okl, okd = cl >= need, cd >= need
        fails += (not okl) + (not okd)
        rows.append(f"| `{fg}` | `{bg}` | {use} | {need} | {cl} {'pass' if okl else '**FAIL**'} | {cd} {'pass' if okd else '**FAIL**'} |")
        print(f"{'PASS' if okl and okd else 'FAIL'} {fg:>16} on {bg:<14} L {cl:>5}  D {cd:>5}  need {need}")

    md = ["# Brand v3 contrast (WCAG 2.x, palette/check.py formula)", "",
          "Generated by `build_tokens_v3.py`. Roles and their ramp steps:", "",
          "| Role | Light | Dark | Use |", "|---|---|---|---|"]
    md += [f"| `{k}` | {v[0]} `{hx(v[0])}` | {v[1]} `{hx(v[1])}` | {v[2]} |" for k, v in ROLES.items()]
    md += ["", "| Foreground | Background | Use | Min | Light | Dark |", "|---|---|---|---|---|---|"] + rows
    md += ["", f"Result: {'all pairs pass' if not fails else str(fails) + ' FAIL'}."]
    (out / "contrast-v3.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    def block(i, ind="  "):
        return "\n".join(f"{ind}--bw-{k}: {hx(v[i])};" for k, v in ROLES.items())

    shadow_l = ("0 1px 0 rgba(27,24,19,.05), 0 1px 3px rgba(27,24,19,.08)",
                "0 2px 4px rgba(27,24,19,.05), 0 10px 24px -6px rgba(0,30,61,.14)",
                "0 6px 12px rgba(27,24,19,.06), 0 28px 56px -12px rgba(0,30,61,.24)",
                "0 0 0 3px rgba(0,95,194,.32)")
    shadow_d = ("0 1px 0 rgba(0,0,0,.30), 0 1px 3px rgba(0,0,0,.40)",
                "0 2px 4px rgba(0,0,0,.30), 0 10px 24px -6px rgba(0,0,0,.50)",
                "0 6px 12px rgba(0,0,0,.35), 0 28px 56px -12px rgba(0,0,0,.60)",
                "0 0 0 3px rgba(190,154,65,.45)")

    def shadows(s, ind="  "):
        return "\n".join(f"{ind}--bw-shadow-{n}: {v};" for n, v in zip(("1", "2", "3", "ring"), s))

    STATIC = """  --bw-glass-alpha: 0.94;
  --bw-hair: rgba(250,250,249,.14);
  --bw-font-display: "Thmanyah Serif Display", "Thmanyah Serif Text", serif;
  --bw-font-text: "Thmanyah Serif Text", serif;
  --bw-font-ui: "Thmanyah Sans", system-ui, sans-serif;
  --bw-font-mono: ui-monospace, Consolas, monospace;
  --bw-weight-regular: 400;
  --bw-weight-medium: 500;
  --bw-weight-bold: 700;
  --bw-weight-black: 900;
  --bw-size-2xs: 0.75rem;
  --bw-size-xs: 0.875rem;
  --bw-size-sm: 1rem;
  --bw-size-md: 1.25rem;
  --bw-size-lg: 1.5625rem;
  --bw-size-xl: 1.953rem;
  --bw-size-2xl: 2.441rem;
  --bw-size-3xl: 3.052rem;
  --bw-size-4xl: 3.815rem;
  --bw-size-5xl: 4.768rem;
  --bw-leading-tight: 1.1;
  --bw-leading-snug: 1.3;
  --bw-leading-body: 1.7;
  --bw-leading-body-ar: 1.8;
  --bw-tracking-display: -0.015em;
  --bw-tracking-ui: 0;
  --bw-tracking-caps: 0.08em;
  --bw-space-0: 0;
  --bw-space-1: 4px;
  --bw-space-2: 8px;
  --bw-space-3: 12px;
  --bw-space-4: 16px;
  --bw-space-5: 24px;
  --bw-space-6: 32px;
  --bw-space-7: 48px;
  --bw-space-8: 64px;
  --bw-space-9: 96px;
  --bw-radius-xs: 2px;
  --bw-radius-sm: 4px;
  --bw-radius-md: 8px;
  --bw-radius-lg: 14px;
  --bw-radius-xl: 22px;
  --bw-radius-pill: 999px;
  --bw-spine-w: 6px;
  --bw-rule-w: 2px;
  --bw-target: 44px;
  --bw-dur-instant: 90ms;
  --bw-dur-fast: 160ms;
  --bw-dur-base: 240ms;
  --bw-dur-slow: 360ms;
  --bw-dur-page: 520ms;
  --bw-dur-story: 900ms;
  --bw-stagger: 40ms;
  --bw-stagger-max: 6;
  --bw-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --bw-ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --bw-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --bw-ease-spring: cubic-bezier(0.34, 1.36, 0.64, 1);
  --bw-ease-linear: linear;
  --bw-dist-micro: 4px;
  --bw-dist-base: 8px;
  --bw-dist-medium: 12px;
  --bw-dist-large: 24px;
  --bw-scale-press: 0.96;
  --bw-scale-pop: 0.97;
  --bw-blur-small: 2px;
  --bw-blur-medium: 4px;"""

    css = f"""/* Business-Wrap brand v3 tokens ("Cover & Rule", the SRS palette). GENERATED by build_tokens_v3.py from palette/tokens.json: do not edit by hand. */
/* Light by default; dark follows the system unless [data-theme] says otherwise. Prefix --bw- (names kept from brand v2). */
:root {{
  color-scheme: light dark;
{block(0)}
{shadows(shadow_l)}
{STATIC}
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
{block(1, "    ")}
{shadows(shadow_d, "    ")}
  }}
}}
:root[data-theme="dark"] {{
{block(1)}
{shadows(shadow_d)}
}}
@media (prefers-reduced-motion: reduce) {{
  :root {{
    --bw-dur-instant: 1ms;
    --bw-dur-fast: 1ms;
    --bw-dur-base: 1ms;
    --bw-dur-slow: 1ms;
    --bw-dur-page: 1ms;
    --bw-dur-story: 1ms;
    --bw-stagger: 0ms;
    --bw-dist-micro: 0px;
    --bw-dist-base: 0px;
    --bw-dist-medium: 0px;
    --bw-dist-large: 0px;
  }}
}}
/* Base helpers any consumer may use. */
/* .bw-highlight is the v2 name, kept so nothing breaks; new code uses .bw-mark */
.bw-mark, .bw-highlight {{ background: var(--bw-marker); color: var(--bw-on-marker); padding-inline: .12em; border-radius: var(--bw-radius-xs); -webkit-box-decoration-break: clone; box-decoration-break: clone; }}
.bw-rule {{ background-image: linear-gradient(var(--bw-accent-rule), var(--bw-accent-rule)); background-repeat: no-repeat; background-size: 100% var(--bw-rule-w); background-position: 0 100%; padding-block-end: .08em; }}
:where(a, button, input, select, textarea, [tabindex]):focus-visible {{ outline: 3px solid var(--bw-focus); outline-offset: 2px; }}
"""
    (out / "tokens-v3.css").write_text(css, encoding="utf-8")
    print(f"{'all pairs pass' if not fails else str(fails) + ' FAIL'}; wrote tokens-v3.json, dark/tokens-v3.dark.json, tokens-v3.css, contrast-v3.md")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
