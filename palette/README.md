# Palette (EN) — pair: README.ar.md

**Verdict:** five colour ramps, nineteen roles that alias ramp steps, a diagram set, and a contrast gate. Every colour a document draws must be a role or a ramp step.

| File | What it is |
|---|---|
| `tokens.json` | DTCG 2025.10 colour tokens: `color.ramp.*`, `color.role.*` (aliases), `color.diagram.*`, `color.white`, plus the contrast pairs in `$extensions.business-wrap` |
| `check.py` | Gate: resolves aliases, checks every pair, writes `swatches.html`. `--css` prints the roles as CSS variables `--c-<role>` |
| `swatches.html` | Generated preview (open in a browser) |

## Ramps
`primary` (deep blue), `accent` (gold), `signal` (red), `success` (green), `neutral` (warm sand). Each ramp is an even lightness ladder around one anchor in HLS, keeping its hue; the pale end loses saturation so a tint reads as paper touched by the colour. Neutrals carry a trace of the accent's hue so rules belong to the page.

## Contrast rules
| Rule | Level |
|---|---|
| Body text on paper and on card | 7:1 (WCAG AAA) |
| Secondary text, section numbers, story ids, tags | 4.5:1 (AA) |
| Accent is a rule and a mark: the 600 step reads about 3:1 on paper, so accent that carries words uses the 800 step | — |
| Nothing is distinguished by colour alone: every coloured status is also worded | — |

Run: `python palette/check.py` (exit 1 on any failing pair). `design/build.py` runs it before writing a theme.

## Changing it
Edit `tokens.json` (or copy it into `design/custom/<name>/`), rerun the gate, rebuild the theme. Never sample a colour off a rendered page and never type a hex into a template: anything that cannot read the stylesheet (Chrome header/footer templates, the DOCX builder, the figure) reads the theme.
