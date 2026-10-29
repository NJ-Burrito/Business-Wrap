# 05 · Lessons learned, generalised (EN) — pair: 05-lessons.ar.md

**Verdict:** almost every defect the source pipeline shipped is one of the patterns below. Check here by symptom before reading code.

## Evidence and merging
| # | Lesson |
|---|---|
| L1 | **Union, never select-one.** A spread or "pick the better file" merge drops every field the losing source alone knew; a step vanished twice this way while every gate stayed green. |
| L2 | **One fact, one list, computed once.** Two consumers reading the same fact from different sources will disagree, and the one that disagrees is never the one you are looking at. |
| L3 | **A populated section that comes back empty is a file problem first** (a probe overwritten, a dump under a longer route name, a fixture under another id). |
| L4 | **A form harvested without answering its branch questions under-reports the form.** Fields behind a radio do not render until it is answered. A document that says a field was removed, when the harvest did not look, is worse than an outdated one. |
| L5 | **An empty read is a tool suspicion.** 0 Arabic words from a PDF usually means the extractor, not the PDF: use poppler `pdftotext -enc UTF-8`; pymupdf/pdfium drop Arabic words, and two tools agreeing can share one bidi bug. |
| L6 | **Seen-and-empty is an answer**, not a gap ("no attachments required" is a fact). A stated absence needs no confirmation. |
| L7 | **Bind by a stable key, never by a name fragment.** Names are not unique; a fragment opened another service's record. |
| L8 | **A client correcting a number may be adding one.** Two facts can collapse into one field; check before overwriting. |
| L9 | **An earlier document is a source of values, never of wording.** |

## Editing and corrections
| # | Lesson |
|---|---|
| L10 | **Map a correction list by (table, id), never by position.** |
| L11 | **"Applied" is proven per item from the printed output** (poppler text), reported as "N of M applied", never "all". Record `expect`/`stale` text so a gate keeps watching. |
| L12 | **Never hand-edit a stage checkpoint.** Fix the cause in a corrections file or the rule, then re-run that stage; or log the hand edit with path and reason the same turn. |
| L13 | **A rename or renumber is searched everywhere** (notes, rules, templates, ledger, built text) before it is called done. |
| L14 | **A one-off ruling stays per document.** Promote to the pipeline only through consolidation: root cause → adversarial review with predicted hit counts → a five-viewpoint vote (≥ 4 of 5) → proof that reproduces the predicted counts exactly. |
| L15 | **Provenance survives a cleanup:** a removed rule's why-line (date, who, ledger id) moves to the decision log. |

## Rendering and output
| # | Lesson |
|---|---|
| L16 | **Check the artefact, not the stage before it.** Font coverage, palette and sizes are audited on the printed PDF. |
| L17 | **Chrome prints CFF fonts as Type 3**, which blinds a font audit; print from TrueType. |
| L18 | **Inline every asset** (fonts as base64) and wait for `document.fonts.ready`; Chrome can refuse `file://` subresources silently. |
| L19 | **Anything that cannot read the stylesheet must read the theme** (header/footer templates, DOCX, figure); never copy hex values. |
| L20 | **Never put a backtick in a CSS comment inside a JS template literal** stylesheet: it ends the string far from the error. |
| L21 | **`break-inside: avoid` on a box taller than a page** strands what precedes it; release the run. Prove layout changes with a DOM probe across all documents in a sandbox before rendering. |
| L22 | **The DOCX is built from the document JSON**, fills both font slots, measures rules in eighths of a point, and never lets Word re-save the body. |
| L23 | **A figure is fitted by carrying less, never by shrinking type**; one figure, one landscape sheet. |

## Process
| # | Lesson |
|---|---|
| L24 | **A pipeline change is a change to every document**; roll it out or it is not a set. Rebuilds of delivered documents happen deliberately, not as a side effect. |
| L25 | **Done = gates pass and the document is delivered**; count "rebuilt N, delivered M". |
| L26 | **Every gate FAIL gets a recorded cause** before the next build. |
| L27 | **When two standing rules conflict, show both side by side and ask once**; never pick silently. |
| L28 | **Parallel work merges into one script: parse it at build time.** Two packages each declared `PT`; every file was fine alone and the merged editor never booted. `build-editor` now parses the app script and fails with the name (0.13.0). |
| L29 | **Boot after everything has loaded.** The editor booted before its extensions, so their tools needed a second build that lost the recovery question and the first-open motion; each package patched around it. Calling `boot()` after the last extension removed the patches and the cause together. A late `bwExt` call patches the bar in place. |
| L30 | **A test that waits on a moment that ends in a navigation is a race** (axe on a live update progress view that reloads the page). Hold the state (route the progress endpoint) and test that. |
| L31 | **A substring test on random ids matches inside base64.** Look for an id as a JSON value (`"id"`), never as bare text. |
