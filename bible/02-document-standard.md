# 02 · The document standard (EN) — pair: 02-document-standard.ar.md

**Verdict:** a requirements document reads as a specification, not a survey. Seven chapters, numbered sections, one source per section, tables for anything with rows, one workflow figure on one landscape sheet.

## Default template (generic service requirements document)
| Ch. | Chapter | Sections (block kind) |
|---|---|---|
| 1 | Introduction | 1.1 Purpose (prose) · 1.2 Scope (prose) |
| 2 | Service card | 2.1 Description (prose) · 2.2 Identifier and coding (table) · 2.3 Recipient category (table) · 2.4 Assumptions, constraints, conditions (table) · 2.5 Fees (prose) · 2.6 Service documents / attachments (table) · 2.7 Administrative reference (table) · 2.8 Where it is delivered (prose) · 2.9 Outputs (prose) · 2.10 Governing legislation (table) · 2.11 Users and roles (table) · 2.12 Internal system integrations (table) · 2.13 Platform service integrations (prose) · 2.14 Internal data sources (prose) · 2.15 Partner integrations (table) · 2.16 Supported languages (prose) |
| 3 | Functional requirements | 3.1 Requirements table, codes `FR-01…` gap-free |
| 4 | Service path and workflow | 4.1 Workflow figure (one figure) |
| 5 | Business rules | 5.1 Rules table, codes `BR-01…`, back-office rules only; a service with no back office prints "none" |
| 6 | User stories and acceptance criteria | 6.n one story card set per stage/desk (stories: id, name, as, want, so, acceptance[]) |
| 7 | Annexes / open questions | only when a question is genuinely open, with its owner |

Front matter: a control table (document id, title, prepared by, type, classification, owner, issued on, version, status, review cycle), revisions (at most 3 rows; the last row is the issue date), approvals. The document id comes from a lookup table, never from a slug.

## Blocks
| Kind | Shape in document JSON | Rules |
|---|---|---|
| `prose` | `{kind, paragraphs[]}` | no reporting voice ("was observed", "we saw"); state the requirement |
| `table` | `{kind, columns[], rows[][]}` | header repeats on every page (`thead`); an empty column is dropped by the renderer; long cells (>200 chars) justify |
| `figure` | `{kind, caption, sheet, svg}` | caption in the table size, primary colour; the workflow figure is ONE figure on ONE landscape sheet, fitted by carrying less, never by shrinking type |
| `diagram` | `{kind, caption, model}` | 0.9.0: the workflow figure as an editable model (`contracts/diagram.schema.json`), drawn in the house look — applicant band, sage staff stages, «إجراء» diamonds, ✓/⊗ stadium ends, solid / dashed brown / red lines, legend; real text in the PDF, native Word shapes in the DOCX; printed «Figure N: caption» above a framed sheet; 0.9.1: arrows may carry hand-set bend points (`via`), and the legend is one centred row whenever it fits (it wraps only when the kinds truly do not fit) |
| `stories` | `{kind, number, lead, items[]}` | one card per story; acceptance criteria as a numbered list; a payment step is a stage, not a desk (no role, no card) |
| `shots` | `{kind, caption, images[], width}` | images as data URIs; width 10–100 % of the 150 mm measure |
| any block | `layout: {breakBefore, keepNext}` | editor page-break controls; never used to hide a fill problem |

## Numbering
Chapters `1…7`; sections `n.m`; requirements `FR-01…`, rules `BR-01…`, stories `US-01…`, each gap-free and renumbered on insert/delete (the editor renumbers; a gate checks gaps). Cross-references cite numbers that exist.

## Arabic and English rules
- Arabic edition: `dir="rtl"`, `lang="ar"`; English edition: `dir="ltr"`, `lang="en"`; one stylesheet with logical properties.
- No tashkeel in visible Arabic text (PDF, DOCX, HTML, captions).
- Latin and numeric runs inside Arabic sit inside `<bdi>`; wrap the whole phrase ("jpeg, jpg, png"), not each token, or the commas reorder; a lone bracket takes the paragraph direction.
- A word is never broken across lines (no `word-break`/`overflow-wrap: anywhere` on Arabic); only Latin/numeric runs may break.
- No `letter-spacing` on Arabic; kerning off.
- Characters outside the face (☐, ←) are mapped to characters it has before printing; the font-coverage gate reads the printed PDF.
- Digits: one digit script per document edition.
- Typography hygiene: no lone `"`, no `::`, no `،،`, balanced «», no `??`/`؟؟`.
- Wording comes from the system's own captions (a button says what it says), and a client's correction is quoted verbatim.

## Pagination
- A4 portrait; exactly one landscape page (the workflow sheet).
- No heading, caption or table lead-in stranded at a page foot (keep-with-next).
- No page mostly empty: report under 80% fill, hard floor 40% (cover, fold-out, the page before it and the last page excepted).
- `break-inside: avoid` never on a box taller than a page (it strands what precedes it); release the run instead.
- Running head and footer in the micro size and muted role, on every body page; none on the cover.
