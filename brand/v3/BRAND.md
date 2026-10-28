# Business-Wrap brand v3: Cover and Rule (EN) · pair: [BRAND.ar.md](BRAND.ar.md)

⚡ **In 10 seconds**
- 📄 The tool dresses like the documents it makes: paper ground, a navy spine with a gold cap, navy headings, one gold rule.
- 🎨 Every colour is a step of the documents' own palette (`palette/tokens.json`). Nothing is retuned.
- 🌗 Light and dark come from the same ramps; all 50 contrast pairs pass in both.
- 🔤 Thmanyah only: Serif Display, Serif Text, Sans.
- 🎬 One motion system for the site, the editor and the media.
- 🖼️ Brand board: [index.html](index.html).

## 🟦 The two moves

| Move | What it is |
|---|---|
| **The Spine** | A navy band (`--bw-band`) on the inline-start edge with a gold cap (`--bw-accent`) at its top. It grows top to bottom when a page or panel opens and changes sides with the language: English left, Arabic right. |
| **The Rule** | A short gold rule (`--bw-accent-rule`) that draws under one phrase from its reading start. Once per view. It marks words; it never fills behind them. |

## 🎨 Colour

Files: [tokens-v3.css](tokens-v3.css) (`--bw-*` custom properties), [tokens-v3.json](tokens-v3.json) (light), [dark/tokens-v3.dark.json](dark/tokens-v3.dark.json) (dark), [contrast-v3.md](contrast-v3.md) (every pair). Generator: `python brand/v3/tools/build_tokens_v3.py palette/tokens.json brand/v3`. Gate: `python palette/check.py brand/v3/tokens-v3.json` and the dark file.

| Role | Light | Dark | Use |
|---|---|---|---|
| `bg` | neutral.50 `#fafaf9` | primary.950 `#001e3d` | page ground |
| `surface` | white `#ffffff` | primary.900 `#002d5c` | cards, panels, inputs |
| `surface-2` | accent.100 `#efede6` | primary.800 `#003c7a` | story card, raised panel |
| `ink` | neutral.900 `#1b1813` | neutral.50 `#fafaf9` | body text |
| `ink-muted` | neutral.700 `#544c3b` | neutral.300 `#d5cfc3` | secondary text |
| `primary` | primary.800 `#003c7a` | primary.200 `#bfd6ee` | headings, links, primary button |
| `accent` | accent.500 `#be9a41` | accent.500 | gold fill: the cap, one primary on glass |
| `accent-rule` | accent.600 `#9c7e36` | accent.500 | The Rule (a graphic, never text) |
| `accent-strong` | accent.800 `#5f4d21` | accent.400 `#c6af76` | gold words: kickers, section numbers |
| `band` | primary.950 `#001e3d` | primary.950 | the spine |
| `focus` | primary.600 `#005fc2` | accent.500 | focus ring |
| `signal` / `success` | signal.600 / success.700 | signal.300 / success.300 | gaps and errors / ready (always worded) |

The full list (43 roles) is in [contrast-v3.md](contrast-v3.md) and on the [brand board](index.html).

Rules
- Gold `accent.500` and `accent.600` are never text on light grounds (2.55:1 and 3.69:1). Gold words use `accent-strong`.
- Every coloured status carries a word and an icon.
- Text never changes colour during an animation.

## ✍️ Type

| Face | Use |
|---|---|
| Thmanyah Serif Display 700 | headings, the wordmark (outlined in the logo files) |
| Thmanyah Serif Text | long reading |
| Thmanyah Sans 400, 500, 700 | the interface |

Body leading 1.7 (Arabic 1.8). Display tracking -0.015em, never on Arabic.

## 🔖 Logo

The mark is a document cover on a 64 grid: sheet, navy spine, gold cap, two ink lines (the second ends at the end: the other edition reads the other way) and The Rule.

| File | Use |
|---|---|
| `logo/mark.svg`, `mark-dark.svg`, `mark-mono.svg` | the mark on light, on dark, in `currentColor` |
| `logo/mark-small*.svg` | 16 to 24 px: sheet, spine, cap and one thick rule |
| `logo/mark-animated.svg` | builds once on load (classes `.sheet .spine .cap .ln.l1 .ln.l2 .rule`); still under reduced motion |
| `logo/lockup-en*.svg` | mark then wordmark, viewBox `0 0 384 64` (shown at 180 × 30) |
| `logo/lockup-ar*.svg` | wordmark then mark, viewBox `0 0 320 64` (shown at 150 × 30) |
| `logo/wordmark-{en,ar}*.svg` | the outlined wordmark alone, The Rule under «Wrap» / «راب» |
| `logo/app-icon.svg` | the navy tile |
| `favicon/` | `favicon.svg` (follows the system scheme), `favicon.ico`, `icon-{16…512}.png`, `maskable-512.png`, `apple-touch-icon.png` |
| `social/` | `social-card.png` 1280 × 640, `og.png` and `og-ar.png` 1200 × 630 |

Animated mark: add `bw-still` to the svg to stop it, `bw-reveal` to replay it; hover or focus on its link replays The Rule. Inlined, it turns dark under an ancestor with `data-theme="dark"`.

Builders: `brand/v3/tools/build_logo.py` (outlines the wordmark from the local Thmanyah Serif Display 700), `export_png.py` (PNG at 2x, downscaled, no metadata), `check_brand.py` (the gate for logo, favicons, social and icons).

| Rule | Value |
|---|---|
| Clear space | the spine width (12 units of 64) on every side |
| Minimum | mark 16 px, lockup 24 px high |
| Grounds | light files on paper or white; dark files on `#001e3d` or darker |
| Arabic | the mark is never mirrored; only the lockup order changes |

## 🧩 Icons

22 icons in `icons/`: 24 grid, 1.75 stroke, round caps and joins, `currentColor`, one gold part (`.hl`) and one moving part (`.mv`). Seals and tabs are gold fills (`--bw-marker-icon`); where a line is marked, the gold part is The Rule (`.hl.rl`, `--bw-accent-rule`). Each icon plays one move once (520 ms, ease-out) on hover, focus or `.is-inview`. Class `bw-i-bold` sets stroke 2 for the 18 px toolbar. Files: `<name>.svg`, `sprite.svg`, `icons.json`, `icons.css`. Builder: `brand/v3/tools/build_icons.py`.

## 🎬 Motion

| Token | Value | Use |
|---|---|---|
| `--bw-dur-instant` | 90 ms | press |
| `--bw-dur-fast` | 160 ms | hover-in, small close, cap drop |
| `--bw-dur-base` | 240 ms | hover-out, dialog open, theme cross-fade |
| `--bw-dur-slow` | 360 ms | panel close, scroll reveal |
| `--bw-dur-page` | 520 ms | panel open, The Spine, icon move |
| `--bw-dur-story` | 900 ms | The Rule, logo build |
| `--bw-ease-out` | cubic-bezier(0.22, 1, 0.36, 1) | every entrance and move |
| `--bw-ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) | The Spine, The Rule |
| `--bw-ease-spring` | cubic-bezier(0.34, 1.36, 0.64, 1) | small confirms only |

Open slower than close. Only `transform`, `opacity`, `filter` and `clip-path` move. Under `prefers-reduced-motion` every duration is 1 ms and every distance 0.

## ✅ Do and don't

| Do | Don't |
|---|---|
| Use the files as they are | Redraw, stretch or add effects to the mark |
| Keep one gold moment per view | Set words in gold on light grounds |
| Use the dark files on dark grounds | Put the light mark on photos or mid-tones |
| Keep the mark the same in Arabic | Mirror the mark for right-to-left |
| Use the brand for the tool (site, editor, README, store) | Place it in a document output: documents keep their own design pack |
