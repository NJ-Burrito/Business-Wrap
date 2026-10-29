# RECEIPT lane B (layout / writing) — branch feat/layout

Governance: nj-governance-v4 · delegations: 0 · no push, no merge.

| # | Request | Result |
|---|---|---|
| 1 | Enter = new line | Enter in a paragraph / acceptance point splits the leaf at the caret into a NEW paragraph (AR/EN pair keeps its shape: placeholder in the other edition); Enter in a cell or list item and Shift+Enter anywhere type "\n", printed as `<br>` (render.mjs makeBidi, so editor, PDF and DOCX agree; editor shows it at once via `white-space: pre-line`). Titles keep Enter = commit. |
| 2 | Insert "User story" | `addStory` command (Insert): new `stories` block, the SRS card layout, placeholders "…", next US-NN id, columns of actions/dictionary cloned from the document's own first story. |
| 3 | More points | `storyPoint` (acceptance point after the selected one / end of list), `storyCard` (another story in the block), Enter inside a criterion. |
| 4 | Empty space | `pgBreakAdd`, `pgBreakDel`, `pgPullUp` (next section loses its break), `secDel` (delete section + undo toast; page size passes to next block so the gap closes without turning later pages), `pgEmpty` (blank prose/sub-heading blocks removed, break dropped on sections left empty). Same hand-over when a single block holding the page size is deleted. |
| 5 | Toast / share dialog clipped | CSS in 27-writing.css: toast wraps (path breaks anywhere, buttons whole on their own row), bottom inset, max-height = viewport; dialog max-height = viewport, scrolls inside. Viewport shots: `share-toast-1920x1080.png`, `share-toast-1366x768.png`, `share-toast-1024x640.png` (worktree root). Test asserts the toast and each button lie inside the viewport at all three sizes. |
| 6 | Selection-targeted | Bullet / number / shape lists apply to every text leaf the highlighted range touches (several paragraphs, a run of cells) and toggle off together; the range is restored after the re-render. Insert text box anchors to the caret's block at the caret's offset (mm), not the top. |

## Files
- New: `editor/ext/27-writing.js`, `27-writing.css`, `27-writing.i18n.json`, `tests/writing.test.mjs` (24 checks, one+ per item).
- SHARED CORE (minimal): `editor/editor.js` (1 line: the `input` handler kept a typed "\n" instead of flattening it), `engine/render.mjs` (makeBidi wraps new makeBidi0: "\n" -> `<br>`), `editor/ext/21-format.js` (w2multi/W2F.targets/w2caretSpot, `list()` over many leaves, render restores a multi-leaf range, `w2formatAction` accepts a multi range), `editor/ext/23-objects.js` (textBox uses w2caretSpot), `package.json` (writing test appended).
- Save format version untouched; no schema change; all new commands are additive.
- Local only: `node_modules` is a junction to the main repo's (untracked, not committed).

## Risk
- A range over several leaves makes the first leaf the toolbar's "current text": Bold/Italic then act on that whole first leaf (before: toolbar hidden). Lists are the multi-leaf tool.
- Enter in rich/list leaves outside paragraphs/acceptance is a line break, not a new item.
- "Pull up" / "empty pages" work on layout flags and blank blocks only; a visually empty page caused by content height is not detected.
- Lane A overlap: only if it also edits `21-format.js` list(); cell behaviour untouched.

## Targeted suites (run singly, machine loaded)
- writing 24/24 PASS · format 34/34 · objects 35/35 · toast 7/7 · chrome 25/25 · layout 46/46 · editable 43/43 · ext: no failures.
- ux: after adding explainers/icons/section the A5-explainer, menu and icon checks pass; 143-144/146 with 2-3 DIFFERENT failures per run, all drag / card-timing (A5 "leaving hides the card", "move single/spread ar" diagram-node drags), unrelated to these files, flaky under load.
- editor.test: only "60-page responsive <300ms" (300/315 ms, load noise). a11y.test: axe-core module missing in this checkout (pre-existing). field.test result not captured. Full `npm test` NOT run (per coordinator).
