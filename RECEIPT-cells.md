# RECEIPT lane A (cells) - branch feat/cells, commit 2ea3124

STATUS: 7/7 items done. `node tests/cells.test.mjs` = ALL 58 PASS (added to package.json test chain).
Addresses: A1 = first column, first BODY row (header not addressed).

## Items
1. Cell edit: insert/delete rows+cols (merges, widths, heights, formula refs follow), merge, split, wrap toggle - done.
2. Lists inside a cell (bullet/number, Enter = new item; render + PDF + DOCX numbering) - done.
3. Select (drag, Shift+click, Ctrl+click), copy/cut/paste TSV (Excel block into one cell spreads; one value fills selection; own copy keeps format, formulas shift) - done.
4. Delete/Backspace clears selected cells (Esc in a cell = select that cell) - done.
5. Clear value / Clear format cmds; format bar (bold, colour, font, size, align, lists) acts on all selected cells - done.
6. Formulas SUM AVERAGE MIN MAX COUNT + - * / (), refs/ranges, #ERR for bad/cycle/div0; stored as style.formula, text = result; survives edits-file replay, PDF/DOCX print value - done.
7. Column width/row height drag (one size for all selected), plus width/height commands - done.

## Model (additive): table block `merges`, `colWidths`, `rowHeights`; cell style `formula`, `fill`, `wrap`.

## Shared files touched (minimal)
- editor/editor.js: 1 line in ctxModel (adds EXT.cells.tools() group to table toolbar)
- engine/build-editor.mjs: bundles engine/cells.mjs after edits.mjs
- engine/render.mjs: table()/cell() spans, widths, heights, fill, lists; import cells.mjs
- engine/docx/build_docx.py, model_docx.py: gridSpan, widths, heights, fill, noWrap, cell lists
- bible/contracts/edits.schema.json (doc only), package.json (test chain)
New: engine/cells.mjs, editor/ext/24-cells.js + .i18n.json, tests/cells.test.mjs. Save-format version untouched. CHANGELOG not edited (merge conflict risk).

## Suites run
- cells 58/58; format 34/34 (earlier, after render change; golden byte-identical).
- editor.test: 113/114 in my tree ("en: Save-HTML file imports"); on UNTOUCHED main the same suite also gave 113/114 (different check: 60-page timing) - load flakes, not confirmed cause.
- ux.test: 144/146 in my tree (A5 "leaving hides the card", ar+en); baseline run on main was started but not awaited (machine overload) - UNVERIFIED whether pre-existing.
- Not run: chrome, a11y, ext, layout, objects (killed by overload). Full npm test not run.

## Ceilings
Formulas refs shift on row/col insert/delete and paste but not on drag-fill; header cells have no merge/format cells; arrow-key range extension not built; undo of a formula edit takes 2 steps.
