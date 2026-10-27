# In-browser document editing (contenteditable, move/duplicate/delete, undo, keyboard)

Retrieved 2026-10-27.

## Verdict
Use `contenteditable` only on leaf text (a paragraph, a cell, a title). Structure changes (move, duplicate, delete, insert) are buttons and keys that emit ops into the edits JSON. Own the undo stack: it is the list of ops.

| Claim | Grade | Source |
|---|---|---|
| `beforeinput` fires before a change in `contenteditable`; Baseline "widely available" since March 2021 | V | https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event |
| `beforeinput` may be non-cancelable for IME, spell-check, autocomplete, autofill; to fully override, also handle `input` and revert | V | https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event |
| The browser undo stack is page-global and is lost once JavaScript edits the DOM, so editors keep their own | V (editing task force thread) | https://lists.w3.org/Archives/Public/public-editing-tf/2017Jan/0000.html , https://lists.w3.org/Archives/Public/public-webapps-github/2016Sep/1414.html |
| A `beforeinput` does not guarantee a DOM change follows | V | https://lists.w3.org/Archives/Public/public-webapps-github/2016Apr/0598.html |
| `aria-grabbed` / `aria-dropeffect` are deprecated since ARIA 1.1; use buttons or key combos plus a live-region announcement | V (secondary) | https://www.smashingmagazine.com/2018/01/dragon-drop-accessible-list-reordering/ |
| Keyboard alternatives to drag: move up/down buttons, modifier+arrow, a position field; announce "moved to position n of m" in `aria-live="polite"` | V (secondary) | https://medium.com/salesforce-ux/4-major-patterns-for-accessible-drag-and-drop-1d43f64ebf09 |

## Rules adopted
- Paste is plain text only (`insertFromPaste` → strip HTML). Rich paste is how foreign styles enter a governed document.
- Every structural action has a keyboard path and a visible button; drag is an extra, never the only way.
- Undo/redo walks the ops list; each op stores `old` so it can be inverted (`bible/contracts/edits.schema.json`).
- Arabic IME composition is never interrupted: commit the op on `input` / `compositionend`, not on each key.
