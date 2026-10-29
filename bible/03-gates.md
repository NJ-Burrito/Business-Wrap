# 03 · Gates — what each proves and why it exists (EN) — pair: 03-gates.ar.md

**Verdict:** each gate was written for a defect that shipped past everything else, so none is redundant. A gate FAIL holds delivery. A green check is not proof on its own: rasterise a page and read it, and when a defect the suite called clean is reported, first ask "which test was missing?".

## Content gates (document JSON and printed PDF)
| Gate | Proves | Defect behind it |
|---|---|---|
| verify | every section says something; no untranslated keys; no banned words; codes gap-free; one figure in ch. 4; client shape corrections present; typography hygiene (`??`, lone `"`, `،،`, unbalanced «») | sections printed placeholders; the same fact stated two ways |
| service-card check | chapter 2 agrees value by value with the service's own record; refuses a service code made of Latin letters | a record opened by a name fragment gave another service's code and fees, all gates green |
| no-common-data | no value was copied across documents as if common | a sentence from one service's earlier document leaked into every document |
| old-document reflect | the rebuilt document does not say less than the one it replaces (requirements, fields, stories, stages, assumptions) | rebuilds silently dropped content |
| preparers | each document names its own author, a name not a label | one name spread to every document |
| client-fixes check | each named client correction is present in the document JSON **and** the printed PDF; a fix for a feature the service lacks prints n/a | fixes regressed on rebuild |
| ledger check | every workflow element any source knows has a disposition; nothing `drawn` is missing from the sheet; no stage missing from roles, requirements, stories | a select-one merge lost a routing step twice |
| ledger landed | each applied correction's `expect` text prints and its `stale` text is gone (poppler, spelling-exact) | "applied" was claimed from memory |

## Figure gates
| Gate | Proves | Defect behind it |
|---|---|---|
| flow-collisions | the figure is legible: no overlaps, no arrow through an unrelated node, every edge caption printed and matched exactly | a "contains" test let an unlabelled arrow through |
| flow-fidelity | the figure is complete against the process model AND the walk (every task, end, flow, desk, routing button, status) | a chart with four of nine stages collided with nothing |
| caption check | every caption is the system's own word for that action | converter Arabic differed from the button |
| figure freeze | the figure is byte-identical to the approved one; re-approval is a deliberate `--freeze` | a router fix moved boxes without failing any other gate |

## Output gates (PDF, DOCX, HTML)
| Gate | Proves | Defect behind it |
|---|---|---|
| font coverage | every character in the **printed** PDF is drawn by the chosen face (needs TrueType: Type 3 hides the face) | symbols printed in a system fallback mid-sentence |
| palette check | every colour the PDF draws is a role or ramp step | header/footer templates carried off-palette literals |
| palette contrast (`palette/check.py`) | every role pair reaches its WCAG level | pale secondary text |
| page fill / page breaks | no page under the fill floor; nothing stranded at a page foot | half-empty pages; orphan headings |
| size scale | printed sizes equal the tokens | a hard-coded pt drifted |
| DOCX check | both font slots filled, sizes and rule widths match tokens, fonts actually embedded/rendered (not just declared) | a DOCX declared a face that did not exist |
| copy fidelity | text extracted with poppler (`pdftotext -enc UTF-8`) round-trips | kerning opened gaps read as spaces |
| edition parity | AR and EN editions have the same structure | a fix made on one side only |
| editor script parses | the concatenated editor app script parses (`new Function`) at build time | two merged files declared the same name; the editor never booted (L28) |
| feature audit | `tests/audit.probe.mjs` drives every toolbar feature in headed Edge: works ≥ 95 % before a release | 0.12.0 measured 76 % (58/76) |
| watermark absent | no output (PDF, DOCX, print, edits JSON, theme pack, Save-HTML export) contains the editor watermark | — (rule from the start) |
| `security/check.py` | no client content, credentials, ID/phone shapes, emails, local paths, font binaries, metadata-bearing images, files over 5 MB, in tree **or history** | zero client content is a release condition |

## Gate discipline
- A checker that stops checking is worse than none: match tolerantly and print counts, so a silent zero is visible.
- An empty read (0 Arabic words, 0 options, 0 bytes) is a suspicion about the tool first; stop and re-read before building over it.
- Every gate FAIL gets a recorded cause (class, fixed or ruled by whom) before the next build.
- Gates are part of the single run; they are never skipped to save time. What is cut is a person re-checking a machine's output.
