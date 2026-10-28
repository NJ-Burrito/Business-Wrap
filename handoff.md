# goals
Business-Wrap 0.10.0 (branch `ux`, worktree `Business-Wrap-wt-ux`): the owner's field notes on the editor shell (A1–A7: layout never flips, AR/EN parity, whole-field toggles, sticky selection tools, hover explainers, page views, UX research) merged with worker B's Design panel and fonts (B1–B4: any font, plain wording, slider + number + unit, every font real text), plus faux bold, README pair, version 0.10.0.

## current state
- Committed on `ux` (merge of `design` included), not pushed, not tagged: the Lead pushes, watches CI and tags `v0.10.0` (task I2), and sets the GitHub description and topics (I3).
- Every suite run one by one (see `out/gates.log`; copy in `Desktop\Business-Wrap-field-test\compare-0.10.0\ux\`), version-sync 0.10.0, skill-html current, `security/check.py --all` 0 findings.
- Evidence: `Desktop\Business-Wrap-field-test\compare-0.10.0\ux\` (36 viewport shots AR/EN × 1366/1920 + gates.log), `Desktop\Business-Wrap-field-test\research-ux.md`, README screenshots in `docs/screens/`.

## files in flight
- none open.

## changed
- New: `editor/shell-ux.js` (fixed RTL layout + `data-tdir`, AR/EN width parity `uxWidest`, segmented fields `uxSegClick`/`segThumbs`, sticky selection `uxIsEmptySpace`/`uxEscape`), `editor/explainers.js` (700 ms cards, scenes per kind of tool, Design-panel controls), `editor/views.js` + `editor/views.css` (continuous / single / book, screen-only columns, `viewsUnpage` before print), `editor/ux.css`, `editor/ux-i18n.json` (ux.*, view.*, explain.*; merged into the UI table by `engine/build-editor.mjs`), `tests/ux.test.mjs` (61 checks).
- Faux bold: `engine/font_normalise.py --embolden` (synthetic Bold, outlines +1/26 em), `engine/fonts.mjs normaliseFont(…, {embolden})`, `engine/export.mjs chosenFonts` adds a Bold face for any chosen family without one; gate in `tests/design.test.mjs`.
- `editor/editor.js` hooks (LAYOUT_DIR, tAlt, render → viewsApply, beforeprint → viewsUnpage, measureBar on the layout box), `editor/editor.css` (watermark bottom right), `engine/vendor-icons.mjs` + `editor/icons.json` (5 icons), `tests/editor.test.mjs` (never-flip layout), `package.json` (0.10.0, design + ux tests), manifests, CHANGELOG 0.10.0, bible 01/04/06 AR+EN, README.md + README.ar.md rewritten, `assets/editor/business-wrap.html` rebuilt.

## failed attempts
- Faux bold with `-webkit-text-stroke` or `text-shadow`: Chrome prints the stroke/shadow as Type 3 (and the stroke doubles the extracted text) — replaced by a real synthetic Bold face.
- Toolbar parity first measured the other language with canvas metrics and then while the entry animation scaled the bar: both off by a pixel; now real renderings in each language's own lang/direction, in layout px.
- `git merge` is refused for workers by the v4 hook; the Lead started the merge and the worker finished the merge commit.

## next step
1. Lead: review, push `ux`, watch CI (CI has no Thmanyah; the new suites do not read the face), tag `v0.10.0`, set the GitHub description and topics.
2. Owner eye on `compare-0.10.0\ux\` and the README screenshots (run-once rule: not re-checked by a person here).

<div dir="rtl">

## خلاصة بالعربية
الفرع `ux` يحمل الإصدار 0.10.0: تخطيط لا ينقلب بين العربية والإنجليزية، وتطابق الأدوات في اللغتين، وحقول تُبدَّل بالنقر في أي مكان منها، وأدوات تحديد تبقى حتى النقر على مساحة فارغة أو Esc، وبطاقات شارحة متحركة، وعرض الصفحات (متصل، صفحة، كتاب)، مع لوحة التصميم وأي خط نصاً حقيقياً من الفرع `design`، والعريض المركّب للخطوط التي لا وجه عريض لها. الخطوة التالية: يرفع القائد ويضع الوسم.

</div>
