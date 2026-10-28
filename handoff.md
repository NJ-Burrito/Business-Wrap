# goals
Business-Wrap 0.9.0 (branch `diagram`, worktree `Business-Wrap-wt-diagram`): the workflow diagram replicates the house SRS figure and is editable shapes + text (editor, PDF, DOCX), with a Mermaid path; the editor toolbar is docked, categorised and follows the selection (owner AMEND 2026-10-28).

## current state
- Committed on `diagram`, not merged, not pushed, not tagged (the Lead merges/pushes/releases).
- New: `engine/diagram.mjs` (model → layout → orthogonal routing → primitives → SVG), `engine/docx/diagram_docx.py` (primitives → native DrawingML group), `editor/diagram-ui.js` (in-place editing), `engine/diagram-cli.mjs` + MCP `diagram_mermaid`, `bible/contracts/diagram.schema.json`, `tests/diagram.test.mjs`.
- Harvest writes `{kind:'diagram', model}`; the sample's model lives in `samples/event-permit/workflow.json` (make_sample.py reads it).
- Visual compare: `out/diagram-compare/` (gitignored): compare-ar.png, compare-en.png, docx-ar-5.png, toolbar-*.png, notes.md.

## files in flight
- none open.

## changed
- engine: diagram.mjs, diagram-cli.mjs, render.mjs (diagram block, «الشكل N:» caption), build-editor.mjs (concatenates diagram.mjs + diagram-ui.js), export.mjs (resolved primitives for the DOCX), edits.mjs (diagram labels in textLeaves), harvest/model.mjs, i18n.json, vendor-icons.mjs; docx/build_docx.py + diagram_docx.py.
- editor: editor.js (docked categorised toolbar, selection section with «More», Esc/background → general tools, palette categories), diagram-ui.js, ui.css, editor.css, icons.json.
- mcp/server.mjs (+ test), tests/harvest.test.mjs, package.json (test + `diagram:mermaid`), bible 02/04 AR+EN, contracts, CHANGELOG 0.9.0, version 0.9.0 everywhere, assets/editor/business-wrap.html.

## failed attempts
- None blocking. Mermaid's own layout engine was not vendored: the native layout handled every graph tried (sample, harvest fixtures, hand-written Mermaid), and mermaid.min.js (~3 MB) would crowd the 5 MB file gate.

## next step
1. Lead: review, merge `diagram` into `main`, push, watch CI, tag `v0.9.0`.
2. Owner eye on out/diagram-compare/compare-ar.png and toolbar-*.png (run-once rule: not re-verified by a person here).
3. Known gaps: legend wraps to two lines (reference: one); no manual waypoints on arrows (routing is always automatic); DOCX keeps Word's own text metrics, so labels can sit a few px off the SVG positions.

<div dir="rtl">

## خلاصة بالعربية
الفرع `diagram` يحمل الإصدار 0.9.0: مخطط سير العمل بتصميم وثائق المتطلبات المعتمد، أشكالاً ونصوصاً قابلة للتحرير في المحرر، ونصاً حقيقياً في PDF، وأشكال Word أصلية في DOCX، مع استيراد Mermaid وتصديره، وشريط أدوات مثبت في الأعلى بأقسام مصنفة يتبع ما يحدده المستخدم. الخطوة التالية: يدمج القائد ويرفع ويضع الوسم.

</div>
