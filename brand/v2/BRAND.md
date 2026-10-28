# Business-Wrap brand v2: Ledger & Highlighter

**Concept:** evidence, highlighted and bound: one fact marked once, carried into both editions, Arabic on the right page and English on the left, on one spine.

Version 2.0.0, 2026-10-28. Replaces the navy and gold identity in `brand/`, `palette/` and `brand/logo/` (v1) for the tool itself: the editor UI, README, site, store and posts. It never enters a document output (PDF, DOCX, print, edits JSON, design pack, Save-HTML export): documents keep their own design pack.

Arabic name: «بزنس راب» (the transliteration already used in `README.ar.md`). Family name in Latin text: **Business-Wrap**.

## The idea

The tool reads evidence (a process model, a walk through a live service) and binds it into one requirements document in two directions. The mark says that in one picture:

- **Two pages on one spine.** The left page's lines start on the left (English, LTR); the right page's lines start on the right (Arabic, RTL). Same width, same weight: both languages are first-class.
- **One highlighter stroke crosses the spine.** The fact that was found is marked once and lands in both editions. The bilingual pair is the unit.
- **The highlighter is the hero colour.** Lime (`#C8F04A`) is used the way a real highlighter is: a band behind ink, a sweep, a stamp. Never as thin text on paper.

## Personality

| Is | Is not |
|---|---|
| Exact: says what the tool does and stops | Salesy, vague, "AI-powered" |
| Bold and scannable: one idea per visual | Dense, decorative, many accents at once |
| Calm ink, one loud mark | Gradients, glow, neon everywhere |
| Bilingual by default: the pair is the unit | English first, Arabic as an afterthought |
| Paper and ledger: printed, governed work | Sci-fi dashboards |

## Colour

Three roles carry the brand. Everything else is neutral or status.

| Role | Light | Dark | Use |
|---|---|---|---|
| Ink (ledger green-black) | `#0F231E` on paper `#F5F3EC` | `#EEF2EA` on `#0B1A16` | text, the mark's pages |
| Ledger green (primary) | `#0B6B50` | `#4FD1A1` | buttons, links, selection, focus (light) |
| Highlighter lime (accent) | `#C8F04A` behind ink | `#C8F04A` | the one hot mark per view: highlight bands, the active state, focus (dark) |

Full table and the AA check: `contrast.md` (every pair passes in light and dark). Tokens: `tokens.json` (source), `tokens.css` (generated; `--bw-*` custom properties, dark via system or `[data-theme="dark"]`).

## Type

Thmanyah only. Cairo is banned, also as a fallback.

| Token | Family | Use |
|---|---|---|
| `--bw-font-display` | Thmanyah Serif Display 700 / 900 | headlines, hero, wordmark (outlined in the logo files) |
| `--bw-font-text` | Thmanyah Serif Text 400 / 500 | long reading: docs, README-style pages |
| `--bw-font-ui` | Thmanyah Sans 400 / 500 / 700 | editor interface, buttons, labels, chips |
| `--bw-font-mono` | `ui-monospace, Consolas, monospace` | commands and code (what the repo already uses) |

Scale: major third on 16 px (`--bw-size-2xs` 12 px to `--bw-size-5xl` 76 px). Body line height 1.6 (Arabic needs it); display 1.1. Font files never ship in this repo: pages name the OS-installed faces with `local()` (see `fonts.css`) or a gitignored local copy.

## Shape, depth, motion

- Radius: 4 / 8 / 12 / 20 / 28 / pill. Controls 8, cards 12, panels 20.
- Shadow: three soft, green-tinted levels and a focus ring (`--bw-shadow-1..3`, `--bw-shadow-ring`). No glow.
- Motion: `--bw-dur-fast` 160 ms, `base` 240, `slow` 360, `page` 520, `story` 900; `--bw-ease-out` for entrances, `in-out` for moves, `spring` only for a small confirm (a stamp, a check). Open slower than close; hover-in fast, hover-out base; stagger 40 ms, at most 6 items. Reduced motion: durations become 1 ms and loops stop.
- The brand's signature move is **the sweep**: a highlighter band grows across a line from its reading start (left in English, right in Arabic), then the ink darkens. Use it for a highlight, a selection, a "found" moment. Once per view.

## Logo

| File | Use |
|---|---|
| `logo/mark.svg`, `mark-dark.svg`, `mark-mono.svg` | the mark; mono is `currentColor` with the highlighter as `var(--bw-accent)` |
| `logo/lockup-en.svg`, `-dark`, `-mono` | horizontal lockup, mark then "Business-Wrap" |
| `logo/lockup-ar.svg`, `-dark`, `-mono` | Arabic lockup, mark on the right, «بزنس راب» |
| `logo/wordmark-en.svg`, `wordmark-ar.svg` (+ `-dark`, `-mono`) | the name alone, for places that already show the mark |
| `logo/mark-animated.svg` | looping CSS animation (lines write, highlighter sweeps); stops under reduced motion |
| `logo/app-icon.svg` | the mark on its tile (dark ground) for app and favicon sizes |
| `favicon/` | `favicon.svg` (follows the system scheme), `favicon.ico` (16, 32, 48), PNG 16 to 512, `apple-touch-icon.png` (180) |
| `social/social-card.png` (1280x640), `social/og.png` (1200x630) | link previews (og, Twitter/X, LinkedIn) |
| `motion/logo-loop.gif`, `logo-loop.mp4` (512x512, 5 s) | the animated mark as media |

## Banners

| File | Use |
|---|---|
| `banner/hero.gif` (1280x640, 9 s, 17 fps), `hero.mp4` (25 fps) | README top and site hero: evidence in, the highlighter finds a fact, the spread opens English left and Arabic right, PDF and DOCX stamp out. The GIF runs at 17 fps so it stays under the repository's 5 MB file limit |
| `banner/hero-site-1920.mp4` + `hero-site-poster.png` (1920x960) | site hero as a `<video autoplay muted loop playsinline poster>` |
| `banner/github-banner.gif` (1280x640, 6 s, 25 fps) | the separate animated GitHub banner: paper ground, the mark writes itself, the highlighter steps along the tool chain |
| `banner/github-banner-still.png` (1280x640, under 1 MB) | the GitHub social preview (Settings, Social preview) |

Sources: `motion/banner`, `motion/banner-site`, `motion/github-banner`, `motion/logo-loop` (HyperFrames 0.8.144; fonts are copied in locally and gitignored). Render: `npx --yes hyperframes@0.8.144 render . -q delivery --crf 10 --browser-gpu --gpu`, then a GIF from a 256-colour palette with no dithering.

Rules: clear space = the width of one page of the mark on every side. Minimum: mark 16 px, lockup 24 px high. The mark is never mirrored for RTL: only the lockup order changes. The highlighter stays lime in colour versions; in mono versions it is the only filled part.

## Icons

24 px grid, 1.75 stroke, round caps and joins, `currentColor`. Each icon carries at most one highlighter part (`class="hl"`, filled with `var(--bw-accent)`), and one moving part for its micro-animation (`icons/icons.css`: on hover, focus and when a parent gets `.is-inview`). Demo: `icons/index.html`. Sprite: `icons/sprite.svg`.

## Do and don't

| Do | Don't |
|---|---|
| One highlighter moment per view | Lime text on paper, lime hairlines on light grounds |
| Ink on paper, or paper on ledger dark | Navy and gold (v1), or QA-Wrap's corn and sandstone |
| Arabic and English side by side at the same size | Arabic smaller, lighter or in a second colour |
| Real words from the tool (harvest, editor, PDF, DOCX) | Invented numbers, features or claims |
| Bold headline, short lines, an icon per idea | Paragraph walls, three accents, gradients |
| Use the outlined logo files as they are | Retype the wordmark, stretch, mirror, add shadows |

## Family

Business-Wrap shares the "-Wrap" naming and the maker's family footer with QA-Wrap, Profile-Wrap and Story-Wrap, and nothing visual: QA-Wrap is basalt, corn and a ring with a check; Business-Wrap is ledger green, highlighter lime and an open spread.
