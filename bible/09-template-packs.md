# 09 · Template packs: from evidence to any kind of requirements document (EN) — pair: 09-template-packs.ar.md

**Verdict:** one neutral model of the process, many layouts. The evidence (a form crawl, a process model, a service record) becomes one bilingual model; a **template pack** says which chapters and sections a document has and in whose words; the generators fill every section from the model and say where each came from. A section the evidence cannot fill becomes a **named open question**, never a silent «none».

## The command
```
node engine/srs/cli.mjs build --pack <id|folder> --profile <profile.json>
     [--harvest harvest.json] [--model <bpmn|drawio|yaml|json|process.json>] [--roles names.json]
     [--record record.json] [--corrections corrections.json] --out <dir> [--export] [--allow-missing-code]
node engine/srs/cli.mjs packs              # the shipped packs
node engine/srs/cli.mjs validate <folder>  # a pack you wrote
```
It writes, in `--out`: `01-harvest.json` (the inputs, joined), `02-evidence.json`, `document.ar.json` + `document.en.json` (the editor's input, checkpoint 3), `fill.md`, the editor HTML, and with `--export` the PDF + DOCX of both editions.

## The inputs (all optional except the profile; more evidence, fewer questions)
| Input | Kind | What it gives | Contract |
|---|---|---|---|
| crawl | `bw-harvest` (`npm run harvest:crawl`) | the customer-facing form (fields, types, required, options, attachment lists) and the card (description, segments, prices, channels) | `contracts/harvest.schema.json` |
| process model | BPMN / Flowable / draw.io / YAML / JSON steps / monitoring graph | actors, people's stages, decisions with their routing, return paths, timers, ends, system steps | `08-harvest.md` |
| names | `roles.json`-style map | each raw key's name in both languages: actors, stages, **routing-button captions**, ends, durations | `08-harvest.md` |
| service record | `bw-service-record` | the facts a form and a model cannot show: code, fees, documents, legislation, administrative reference, outputs, integrations, data sources, partners, statuses, KPIs, SLAs, notifications, the desk walk (sections each stage shows, its buttons, auto-assignment), the earlier issue | `contracts/service-record.schema.json` |
| profile | `bw-profile` | the organisation: name, words (customer, request …), code table, code format, serial format, control-table values, caption overrides | `contracts/profile.schema.json` |
| corrections | list | per-document fixes matched **by text**, replayed after every rebuild | below |

The record is written by hand from a named document, or by the record/desk/output harvesters (a separate lane) into the same contract. Nothing organisation-, client- or country-specific lives in the code or the packs: every such string is a profile or record value.

## The neutral model (`engine/srs/model.mjs`)
Actors (customer side / staff), stages (`customer` submission, `rework`, `review`, `approval`, `payment`), each stage's **actions** (routing buttons) with their target and effect (`forward`, `back`, `rework`, `resubmit`, `pay`, `endOk`, `endStop`), ends with a neutral outcome, timers, system steps, fields, documents, fees, outputs, segments, channels, legislation, assumptions, administrative reference, integrations (internal, platform services, data sources, partners), languages, statuses, notifications, KPIs, SLAs, serial format, earlier issue. Every value is `{ar, en}` and every element carries its `source`.

Rules the model applies, each from a defect:
- **Payment is a stage, not a desk:** no role row, no story card; it shows in the fees, the requirements and the figure.
- **A customer actor's task is a rework stage** (or a task with no actor whose key says edit/amend/resubmit).
- **An approval stage** is a staff stage with an action that ends the process approved.
- **An end that is not plainly a success is a neutral close** («not renewed» is never «approved»).
- **The document code is looked up, never derived:** record → profile `codes` (by record key, crawl name, model key, either name). Absent → the build stops (`--allow-missing-code` prints «—» and asks).

## Captions: the system's word first
An action's caption comes from, in order: the desk walk (`record.facts.desks`), the model's flow names (`--roles`), the profile's `captions`, then a **clean derived word** from the action key (`send-to-x` → «إحالة إلى x» / "Send to x", `return-to-x`, `need-edit`, `re-submit`, `approve`, `reject`, `cancel`, `pay` …) with the target stage's real name. A raw key or a raw condition never prints, and a decision is never «قرار ١»: the figure's diamonds read «إجراء» / "Action". Derived captions are listed in **one open question** for the owner to confirm against the buttons. A name the evidence has in one language only prints as found, quoted, and is asked for translation.

## Packs (`templates/<id>/pack.json`)
| Pack | For | Layout |
|---|---|---|
| `e-service` | a service an applicant files online and staff stages process to an output | the house e-Service SRS: 1 Introduction (1.1, 1.2) · 2 Service card (2.1–2.16) · 3.1 Requirements table · 4.1 Workflow figure · 5.1 Business rules · 6 one story section per people's stage + the output story · annex of open questions |
| `e-commerce` | catalogue → cart → checkout → fulfilment → returns | overview, integrations, FR, order workflow, rules, stories, service levels / KPIs / notifications |
| `call-centre` | lead → call script → disposition → call-back → sale / QA | campaign overview, dispositions, contact rules, integrations, FR, call flow, rules, stories, KPIs |
| `approval` | an internal request through approval stages | process overview, eligibility, documents, outputs, roles, FR, workflow, rules, stories, SLAs |
| `saas` | a product feature | product context, external interfaces, FR, user flow, rules, stories, data dictionary, non-functional |
| `generic` | any system | ISO/IEC/IEEE 29148 structure: introduction (purpose, scope, definitions, references), overall description, specific requirements, workflow, verification by stories |

A pack is data: `chapters[].sections[]`, each with a title in both languages and a **generator** (`prose`, `description`, `identifier`, `recipients`, `assumptions`, `fees`, `documents`, `adminRef`, `channels`, `outputs`, `legislation`, `roles`, `integrations`, `languages`, `requirements`, `workflow`, `rules`, `statuses`, `glossary`, `kpis`, `slas`, `notifications`, `dataDictionary`, `questions`, `stories`); a glossary (the pack's words for customer, request, channels …); column headings; standard rules with evidence switches; the in-stage task rows; wording overrides of `templates/_core/text.json`. The generators are code, once, in `engine/srs/compose.mjs`.

### Writing your own pack
Copy `templates/_example-custom/` anywhere, edit `pack.json` against `templates/pack.schema.json`, then `node engine/srs/cli.mjs validate <folder>` (refuses an unknown generator, a title or glossary missing a language, unequal AR/EN columns, a section whose columns are undefined) and `build --pack <folder>`.

## What each generator writes (the authoring rules)
- **Functional requirements** (`FR-01…`, gap-free): the customer's standard rows (the pack chooses which), one row per partner integration (what it retrieves), payment (to payment; after payment to the first staff stage), auto-assignment per stage the desk walk marks, rework, each timer, tracking, staff notes and action log when there are staff stages, notifications when the evidence has any, the output when there is one. Each row names its **functional unit**. Rows that would restate a story step are not generated.
- **Business rules** (`BR-01…`): the pack's standard rules, each switched on only by its evidence (`staff`, `partners`, `serial`, `reroute`, `phone`, `recipients`, `payment`), then one rule per **non-forward** staff action, worded «When «<real caption>» is chosen at the «<stage>» stage, the system <effect>», then one per timer. Applicant-side gateway branches are not rules. Arabic rule text carries no Latin word outside a quoted name.
- **Stories**: one card per people's stage, the customer's own stages first. Patterns per kind (`customer`, `rework`, `review`, `approval`, `output`). Acceptance criteria: never a line per field, never «auto-assignment»; a staff stage says what the previous stage decided and **which screen sections it shows** (from the desk walk; absent → a named question). The **actions table** (إجراءات) lists routing buttons only, each with its effect; the stage's **tasks** (مهمات: notes, output notes, attachment name) are dictionary rows only.
- **Data dictionary**: 7 columns (field, type, required, editable, integration, default, constraints), types in the edition's words, documents as «attachment» rows with their formats; a register (countries, cities, nationalities, currencies, languages … or any list over the profile's threshold, default 30; over 12 options is never inlined) prints **its count only**.
- **«None» versus a question:** a list the record states as empty prints «none» (an answer); a list nobody stated becomes an open question naming the section.
- **Revisions:** the earlier issue on record (if any), then this issue; the last row is the issue date. Version format from the profile (`V{nn}`).
- **The figure** is drawn from the people's steps only: system steps are folded into the arrows, decisions read «Action», arrows carry the real captions.

## The evidence stage (`02-evidence.json`)
- `model` — the neutral model, with `sources` per fact.
- `ledger` — every element any source knows: fields, stages, payment, actions, return paths, decisions, ends, timers, system steps, fees, documents, integrations, outputs, legislation, segments, channels, notifications, KPIs, SLAs. Each row: `kind`, `id`, `name`, `presentIn`, `source`, `disposition` (`drawn`, `drawn-unobserved`, `document-only`, `not-a-stage`) and the `sections` that took it up. A row with no disposition fails the build; **untraced** elements are listed and asked in the document.
- `fill` — per section: `evidence`, `derived` (by a rule from evidence), `template` (pack prose with evidence values), `question`, `stated-none`; with the source.
- `openQuestions` — both languages, with the section each blocks.

## Corrections by text
`corrections.json`: `[{ id, locale?, find, replace, expect? }]`. Each is applied to every string of the edition after the build; one that finds nothing is reported `stale`, one whose `expect` text is then absent fails the build. A recurring editor edit belongs here (or upstream), not in `edits.json`.

## Gates in this stage
`tests/srs.test.mjs`: pack validity, the e-Service structure (chapter titles, the 16 card sections in order), edition parity, gap-free numbers, no unfilled placeholder, ledger completeness and untraced reporting, FR/BR generation, no mixed-language Arabic rule text, no «قرار ١», captions and translation questions, actions vs tasks, payment as a stage, dictionary columns and register counts, profile parameterisation, code lookup, revisions, stated-none vs question, corrections, domain neutrality of the core and the non-e-Service packs, every pack on the same evidence, rendering, and the security gate.
