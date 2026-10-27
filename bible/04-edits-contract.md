# 04 · The edits contract (EN) — pair: 04-edits-contract.ar.md

**Verdict:** the editor never changes the document JSON. It writes `edits.json`: an ordered list of ops on RFC 6901 JSON Pointers. Replaying the ops on the base document (matched by `baseHash`) gives the edited document. Schema: `contracts/edits.schema.json` (v1), adopted by the editor engine.

## Envelope
| Field | Meaning |
|---|---|
| `version` | `1` |
| `document` | the document id |
| `baseHash` | `sha256:<hex>` of the base document JSON bytes; replay refuses on mismatch |
| `locale` | `ar` (RTL) or `en` (LTR): the edition edited |
| `createdAt`, `author` | optional; author is initials or free text, never an email or ID number |
| `theme` | optional token overrides by DTCG path (`"color.role.primary": "#1f6f5c"`) |
| `ops[]` | the edits, in order |

## Ops
| op | Fields | Use |
|---|---|---|
| `setText` | `path`, `value`, `old` | change a string leaf: paragraph, cell, title, caption |
| `replace` | `path`, `value`, `old` | replace a whole node |
| `insert` | `path` (index or `-`), `value` | add a block, row, paragraph, story |
| `delete` | `path`, `old` | remove an item; `old` keeps it for undo |
| `move` | `from`, `path` | drag or keyboard reorder (JSON Patch move semantics) |
| `duplicate` | `path`, `to` (default: right after) | copy an item |

Pointers resolve against the state after all previous ops. `old` makes every op invertible, which is the undo stack.

## Rules
1. **Only through ops.** Save = write `edits.json`; Export = replay + render. A hand edit of the document JSON is lost on the next stage rebuild.
2. **Conflict check:** a `setText` whose current value differs from `old` is a conflict; the editor shows both and asks, never overwrites silently.
3. **Renumbering** after insert/delete/move is done by the renderer from position, not stored in ops.
4. **Paste is plain text.**
5. **Recurring edits are defects upstream.** If the same op appears on several documents, fix the source rule; the edits file is for one document's human judgement.
6. **No secrets, no watermark:** the edits file is an output; it carries no credentials, no personal data beyond initials, and never the editor watermark.

## Example
```json
{ "version": 1, "document": "SAMPLE-001", "baseHash": "sha256:<64 hex>", "locale": "en",
  "ops": [
    { "op": "setText", "path": "/chapters/0/sections/0/blocks/0/paragraphs/0", "value": "New wording.", "old": "Old wording." },
    { "op": "move", "from": "/chapters/1/sections/0/blocks/2", "path": "/chapters/1/sections/0/blocks/0" },
    { "op": "duplicate", "path": "/chapters/1/sections/0/blocks/1/rows/0" },
    { "op": "delete", "path": "/chapters/2/sections/1/blocks/0/rows/4" } ] }
```
