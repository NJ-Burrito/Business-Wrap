# 11 · Trust: profile, provenance, lock and the bwlog v1 ledger (EN) — pair: 11-trust-ledger.ar.md

**Verdict:** every document carries its own history. Each open, edit (the exact diff), save, Save-HTML, export, signature, share, lock and unlock is an entry in a signed hash chain, encrypted with the `bwlog` v1 format, embedded in every Save-HTML and mirrored on this machine. Opening a file checks the chain and shows what was tampered with. The format is frozen: every later version reads v1.

## Pieces
| Piece | File | Job |
|---|---|---|
| Format + checks | `engine/ledger-v1.mjs` (`BWLOG1`) | one file for Node and the browser (WebCrypto only), concatenated into the editor like `edits.mjs` |
| Profile + metrics + report card | `editor/ext/30-profile.*` | first-launch profile (name, picture), the recording notice and its off switch, Settings cards (Profile, Performance report, Limits of the protection) |
| Provenance | `editor/ext/31-provenance.*` | the log per document, the «المصدر / Provenance» drawer (the «المصدر / Provenance» tool in the Document section, the Settings trust card, the tamper banner; Sign, Lock and Share are buttons in the drawer), signatures, the tamper banner |
| Lock + share | `editor/ext/32-lock.*` | Lock blocks every edit; Unlock asks once; Share writes the HTML to the workspace |
| Server | `engine/routes/history.mjs`, `engine/routes/report.mjs`, `engine/report.mjs` | HISTORY mirror, share folder, the performance report PDF |

## Envelope (one line of UTF-8 JSON)
`{"fmt":"bwlog","v":1,"alg":"A256GCM","kdf":"HKDF-SHA256","salt":"<b64 16>","iv":"<b64 12>","ct":"<b64>"}`

- Key = HKDF-SHA256(ikm = `APP_KEY_V1`, salt, info = `business-wrap/bwlog/v1`) → AES-256-GCM, 128-bit tag, AAD = `bwlog/v1/<doc>`. A fresh salt and iv on every write.
- Plaintext = `{"fmt":"bwlog-plain","v":1,"doc":"<document id>","entries":[…]}`.
- In a Save-HTML: `bw-data.prov = { <service>: { doc, log: <envelope> } }`, `bw-data.lock`, and `bw-data.contrib` (the contributor mark: actor id + key id). The mark lives in the editor HTML only — never in a PDF or DOCX (bible 04 rule 6; `tests/provenance.test.mjs` checks both exports).
- Mirror: served → `<workspace>/HISTORY/<doc>.bwlog` + `<doc>.heads.json` (`/api/history`); `file://` → IndexedDB `bw-history`. The head (highest seq + hash seen here) never moves back; the first key seen for an actor id stays pinned.

## Entry v1 (field set frozen)
| Field | Value |
|---|---|
| `seq` | 0-based, +1 per entry |
| `prev` | hash of entry `seq-1`, `""` for 0 |
| `at` | ISO-8601 UTC with ms |
| `actor` | `{id: uuid, name ≤ 80, kid: first 8 bytes of SHA-256(raw P-256 public key), hex}` |
| `kind` | `open op save saveHtml export checkpoint share lock unlock sign import merge actor-key x-<ext>` (here also `x-active`: activity pings) |
| `data` | `op`: `{ed, op:{op, path, old, value, id, at…}}` (typing re-logs the same op id with `typed: true`); undo/redo: `{ed, undo or redo: [ids]}`; `merge`: changes made outside a logged edit (import, a recovered draft); `actor-key`: `{jwk}` |
| `docHash` | `sha256:` of the canonical `{eds: {<ed>: {base: <base hash>, ops}}}` after this entry |
| `hash` | SHA-256 of the RFC 8785 (JCS) canonical entry without `hash` and `sig` |
| `sig` | base64 raw r‖s ECDSA P-256 / SHA-256 over the 32 hash bytes |

Keys: one per install, WebCrypto ECDSA P-256, non-extractable in IndexedDB `bw-keys` (where IndexedDB is unavailable: an exportable key in localStorage). The public key is logged once per document as `actor-key`.

## What opening a file checks
| Check | Reason shown | Detects |
|---|---|---|
| each `seq` and `prev` link | `seq`, `link` | a deleted or reordered entry |
| recompute each `hash` | `hash` | an edited entry |
| verify each `sig` with the logged key of `actor.kid` | `sig`, `nokey` | an entry forged or re-hashed without the key |
| TOFU pin per actor id (mirror) | `tofu` | a chain re-signed with fresh keys under the same id |
| the file's chain must reach this machine's head | `truncated`, `fork` | a cut log, an older copy, a rewritten history |
| last `docHash` = the file's base + ops (the base hash recomputed from its text) | `unlogged` | an edit in the data block, or in the base text, that is not in the log |
| a Save-HTML's log ends with its own `saveHtml` entry | `truncated` | a cut tail, on any machine (no mirror needed) |
| a file or document with ops and no log | `stripped` | a removed log, a document that was never logged |

**Every open path attaches the log** (0.13.1, review line 20): the `open` event (boot, the documents list, New, import, duplicate, a resumed tab; a render of a document nobody opened counts as its open). A library document's log id is its `doc-` id. Sources, in order: the file's own log; this machine's mirror; the log its library entry carries (`entry.prov`, from an imported file); the prefix of an open document's chain whose `docHash` equals this state (Save of a template, a copy). An edit made while the log loads waits in the queue and is logged; a document whose log is never on its way refuses edits. Each entry is mirrored before the queue moves on.

`business-wrap verify-history <file> [--history dir]` runs the same checks without a browser (chain, state, tail, stripped, this machine's HISTORY head) and exits 1 on any finding.

## Lock, share, signatures
- Lock: every change is refused (the seam's guards: commit, setText, undo, redo, drag), editing tools are greyed, typing does nothing; a banner names who locked it and when, and the last signer from the log (extras #7). The state travels in the HTML. Unlock: one warning dialog, no password; logged `unlock` with the name. A guard against accidental edits, not access control.
- Share: logs `share` (optional recipient), writes the Save-HTML to `<workspace>/HTML/`, offers show-the-file, copy-the-path and an e-mail draft (a browser cannot attach). On `file://` it downloads.
- «وقّع / Sign»: an approval signature over the current `docHash`, recorded in the log. Not a legal e-signature.

## Metrics and the report (A12)
- From the log only: edits by kind (a typed op re-logged after each pause counts once), words added/removed, sessions (`open`), saves, exports, signatures, active time = the sum of gaps of ≤ 5 min between one person's entries and activity pings (one per 30-s bucket with input or pointer activity while the tab is visible). The off switch stops the pings; edits and their times stay — they are the provenance itself.
- Settings → Performance report → `POST /api/report {from, to, people, lang}` → PDF in `<workspace>/PDF/`: cover, KPI tiles, three SVG charts (active hours per week, edits per document, document status), a per-person table and a story written by templates (no AI). Thmanyah only, TrueType, no Type 3. Across documents each entry counts once (a document saved from a template starts with a copy of that log); a document only opened (a template at launch) is not counted as work. Chart labels sit in a fixed 210-unit column, cut with an ellipsis; the SVG states its direction, so RTL labels grow leftwards.
- Privacy: the picture stays on this machine (`PF_PICTURE_IN_SHARED_HTML = false`); the name travels in shared provenance.

## Frozen-format rule
`engine/ledger-v1.mjs` is append-only: `APP_KEY_V1`, `KDF_INFO`, the envelope and entry fields, `canonical()` and the signature input never change. The golden vectors in `tests/fixtures/bwlog-v1/` are checked by `tests/ledger.test.mjs` in every later version. A v2 is a new module and a new `v`; v1 readers are never removed; a v1 log is never rewritten as v2 (a v2 segment starts with `prev` = the v1 head).

## Honest limit
Business-Wrap is MIT and open source, so `APP_KEY_V1` is public in the code. The encryption keeps the log unreadable to a person who opens the file by hand; it does **not** protect against someone who reads the source. Tamper-evidence comes from the hash chain, the signatures and the mirror, not from the encryption. Someone with the source can rebuild a whole chain with new keys; it is detected only where a mirror or a pinned key from the real author exists (another machine, the HISTORY store, an earlier shared copy). There is no trusted timestamp. Removing both the log and the `bwlog` mark by hand makes a file look "made before 0.13"; the local `HISTORY` mirror still knows the document and flags it «stripped» on this machine.

## Tests
`tests/ledger.test.mjs` (format, golden vectors, tamper cases, Node = browser hashes) · `tests/provenance.test.mjs` (two people, lock/unlock, tampered files, exports clean, share + HISTORY) · `tests/profile.test.mjs` (first launch, metrics, report PDF fonts).
