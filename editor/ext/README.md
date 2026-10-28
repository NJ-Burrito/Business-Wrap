# Editor extensions (`editor/ext/`)

Since 0.13.0 new editor features live here, one file set per feature, so they never edit `editor/editor.js`.

## Files and build

`engine/build-editor.mjs` picks up, sorted by file name:

| File | Goes into |
|---|---|
| `NN-name.js` | the app script, inside the editor's IIFE, after `settings.js` and before the learning layer |
| `NN-name.css` | the toolbar's shadow-root CSS (`uiCss`), after `chrome.css` |
| `NN-name.i18n.json` | `{ "ar": {…}, "en": {…} }` merged into the UI strings; a key that already exists, or that two extensions share, **fails the build** |

The two-digit prefix sets the order (WP3 `10–19`, WP4 `30–39`, WP2 `20–29`). No files here = the editor is built exactly as without the seam. Tests can point `buildEditor({ extDir })` at another folder.

An extension's code runs in the editor's own scope: `S`, `M`, `t`, `esc`, `ic`, `toast`, `commit`, `setText`, `openDrawer`, `buildUi`, `render`, `cur`, `CMDS` are all in reach. It runs **after** the editor has booted; the seam redraws the bar once (before the first paint) when an extension added a section or a status counter, then fires `boot` and `open`.

## `bwExt(def)`

Call it once per file at load time. Every key is optional.

```js
bwExt({
  cmds:     [{ id: 'myCmd', group: 'review', key: 'Ctrl+J', edit: false }], // joins CMDS (palette + toolbar); group defaults to 'document', edit to false
  sections: [{ cat: 'review' }],          // a toolbar section after «design»; its tools = CMDS with group === cat; cat joins the palette's groups
  actions:  { myCmd: async (id) => {} },  // runAction(id) asks these before diagram/export actions
  drawers:  { review: (drawerEl) => ({ title: t('reviewTitle'), html: '<p>…</p>', mount: (drawerEl) => {} }) }, // openDrawer('review')
  settings: [{ id: 'review', title: 'reviewTitle', icon: 'prefs', html: () => '…', mount: (cardEl) => {} }], // a card at the end of Settings; title is an i18n key
  guards:   [(what, info) => true],        // see Guards
  status:   { count: () => 0 },            // replaces the toolbar's change counter (last one registered wins)
  expose:   { ledger: { authorOf: (opId) => '' } }, // named services on EXT for other extensions (EXT.ledger …)
  on: {                                    // a function or an array of functions per event; an unknown event throws
    boot: () => {},                        // once, after every extension has registered
    open: (svc, ed) => {},                 // a document is shown: after boot, and on each service switch
    commit: (ops, ed, kind) => {},         // kind: 'commit' | 'type' (typing merged into the last setText op) | 'undo' | 'redo'
    render: () => {},                      // after each document render
    save: () => {},                        // Save (Ctrl+S)
    saveHtml: (data) => {},                // Save HTML: add own keys to the embedded data (e.g. data.prov, data.lock)
    export: (info) => {},                  // server export done: { pdf, docx }
    pagehide: () => {},
    keydown: (e) => false,                 // runs first in the document key handler; return true = handled, the editor does nothing more
  },
});
```

Strings for a section: `sec<Cat>` (its title; `cat: 'review'` → `secReview`), `grp_<cat>` (its palette heading) and one key per command id. Icons: `ic('sec<Cat>')` and `ic(<cmd id>)` from `editor/icons.json`; missing → no icon.

An extension's listener that throws is logged and skipped; the others still run.

## Guards

`EXT.guards` are asked before every change: `commit` (`info: { ops, ed }`), `setText` (`{ path, value, ed }`), `undo` and `redo` (`{ ed }`) and the logo/overlay `drag` (`{ i, resize }`). Return `false` or a reason string to refuse. A refusal changes nothing, toasts the reason (or `ext.refused`) and **throws** an `Error` with `refused: true`, so the calling action stops part-way through nothing. Every `CMDS` entry carries `edit: true|false` so a lock can grey out every editing tool in one place.

## From outside

`window.BW` carries `EXT`, `emit(event, ...args)`, `bwExt` and `openDrawer` for tests and probes.

## Server routes (`engine/routes/*.mjs`)

`engine/serve.mjs` loads every `engine/routes/*.mjs` (sorted) at start. Each module:

```js
export default async (req, url, send, ctx) => handled; // ctx = { OUT, editorFile, workspace }; return true when it answered
```

Routes run after the built-in ones and before the 404. A non-GET request with a foreign `Origin` is refused (403) before any route sees it. `serve(file, port, { routesDir, workspace })` overrides the folder and the workspace for tests.
