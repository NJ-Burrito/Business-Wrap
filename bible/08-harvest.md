# 08 · Harvest: from what the user has to the document JSON (EN) — pair: 08-harvest.ar.md

Two ways in, one result: the same pair of document JSON files (`document.ar.json`, `document.en.json`) that the editor opens, with the sections a requirements document needs. Contracts: `contracts/harvest.schema.json` (process IR, crawl config, raw crawl harvest).

## A. From a process model
| Input | Read as |
|---|---|
| BPMN 2.0 XML (Flowable, Camunda, Activiti exports) | lanes and pools → actors; `userTask` / `manualTask` → steps done by people; `candidateGroups` / `candidateUsers` / `assignee` → the actor when there is no lane; `formProperty` (with enum `value`s) and `formKey` → the step's data dictionary; gateways + `conditionExpression` / flow names → decision rules; boundary and intermediate timers → timer rules; `subProcess` → flattened, entered at its start, left from its ends; `endEvent` → final statuses; service, script, send, receive, business-rule tasks and call activities → system steps |
| draw.io / diagrams.net XML, plain or compressed | swimlanes → actors; rhombus → decision; ellipses → start (no way in) and end (no way out); `shape=process` / cylinder → system step; edges and their labels → flows |
| YAML or JSON step list | `process`, `actors`, `steps` (`name` + `actor` + `next`, or `decision` + `options` / `yes` / `no`, optional `fields`, `timer: {after, to}`, `system: true`), `ends` |

The parser builds the **process IR** and keeps it in the document (`process`), so the editor's **Process** panel can redraw the flow and **rebuild the sections** later.

**The figure shows people's steps only.** System steps are collapsed: an arrow from a person's step through any number of system steps lands on the next person's step or decision, keeping the first label met. One lane per actor, columns by order, decisions as diamonds, timers dashed. RTL documents get the figure mirrored.

Sections written: Introduction (source named) · Actors and roles · Workflow diagram · Steps (step, actor, leads to) · Business rules (decisions and timers) · User stories (one per person's step, with actions and data dictionary) · Request statuses · Open questions for what the model does not say (a step with no actor, no end event). Names are kept as written in the source: a model in one language gives both editions the same names, labelled in each language.

```
npm run harvest:model -- path/to/model.bpmn20.xml [--out out/harvest] [--name "Service name"]
```

## B. Crawl and harvest a live service
A real Chrome (headed by default) walks the service the way a person does:
1. robots.txt is read first; a disallowed start page stops the crawl (`respectRobots: false` overrides it, deliberately).
2. The service card: title, paragraphs, label/value facts (`dl`, two-column tables).
3. Login, either up front or when its form appears; values come from `$env:NAME` or `$secret:key` (the gitignored `.local/harvest-secrets.json`). Typed values are never written to the harvest, the log or a file name.
4. **Pauses for the human** (OTP, captcha): the crawl waits until the selector is gone (or another appears), then resumes.
5. Each form step: every visible field with its label as the user reads it, type, required flag, select and radio options, file inputs with accepted types; for each select and radio option, which hidden fields it reveals (conditional fields); an empty attempt to collect the validation messages (the site's own first, the browser's built-in ones only when the site shows none); then neutral sample values and Next.
6. After sending: the page title and the list of statuses.
7. One tab, keyboard first (focus + Enter / Space, a click only if nothing happened), a delay between actions (`delayMs`), viewport-only screenshots for each stage.
8. Both languages when the config gives a start page for each.

Raw output: `harvest.json` + screenshots. Sections written: Introduction · Service card · Inputs (one section per form step: label, type, required, options, shown when) · Attachments · Validation messages · User stories (one per form step) · Request statuses.

```
npm run harvest:crawl -- path/to/crawl.json [--out out/harvest] [--headless]
```

## C. Merge the two harvests (0.8.0)
A crawl knows what the applicant meets (card, inputs, attachments, validation messages); a model knows what happens after (actors, workflow, rules, tasks, statuses). The merge is their **union, never a pick**:

| Chapter | From |
|---|---|
| Introduction | both (each source named) |
| Service card, Inputs, Attachments, Validation messages | crawl |
| Actors and roles, Workflow diagram, Steps, Business rules | model |
| User stories | the form steps (crawl), then the people's tasks (model) |
| Request statuses | the union, each row with its source (crawl / model / both) |

Every chapter and status row is recorded in `provenance` (pointer → `crawl` · `model` · `both`). Where the two say different things about one fact (the service title today), the crawl's wording is kept, because it is what the applicant reads, and the other is recorded in `harvestConflicts`; the editor lists it in the conflicts panel on open. A second harvest of the other kind **written into the same document folder** (`--into <dir>`) merges in the same way and never replaces the first; hand edits flagged «manual» stay.

```
npm run harvest:merge -- path/to/harvest.json path/to/process.json [--out dir] [--name "Service name"] [--roles roles.json]
```
MCP `harvest_merge {crawl, model, out_dir, name?, roles?}`; editor **New document → Merge two harvests**.

## Readable names (0.8.0)
- **Expression assignees** (`${service.getAssignee(execution,'Role_head-of-section_Key')}`) are resolved through a **roles mapping file** (`--roles roles.json`: `{ "Role_head-of-section_Key": {"ar": "…", "en": "Head of section"}, "_name": {"ar": "…", "en": "…"} }`; the key can be the whole expression, the quoted literal or its readable form). Without a mapping the name is a readable fallback ("Head of section") and the actor is flagged **unresolved**: an open question is written and the editor's Process panel asks for the name. A user task with candidate groups or an assignee is never called "User".
- Raw keys (`Task_Verification_Key`, `edit-by-applicant`) become readable words; **unnamed gateways** are numbered per edition («قرار ١» / «Decision 1»); raw `sid-…` ids are never printed.
- `--name` wins over the name in any model (BPMN included), in both editions.
- **Monitoring-graph JSON**: back offices that show the process but do not export the XML give a graph (`{key, description, graph: {nodes, edges}}`); `harvest:model` reads it like BPMN.

## The crawler on SPA portals (0.8.0)
`waitFor` (one ready selector, or `{card, form}`) after network idle (`idleMs`); `preForm` steps between the card and the form (`check` a terms box once, `press` Continue, `login: true` to sign in again, `ready`); labels from the control's own label, `aria-labelledby`, the label before it or its field box (`.p-field`), the placeholder: **never the section title**; required from `required`/`aria-required`, an asterisk, or an empty control marked `ng-invalid`; options of `p-dropdown` / `p-select` / `p-multiselect` (read from their overlay), `p-calendar` / `p-datepicker` as dates, `p-radiobutton` groups by `formcontrolname`; a control with no id or name is filled through the tag the crawler gives it; `harvest.json` is written after every step, so a crash keeps what was read; `--raw harvest.json` maps a saved harvest again without a browser.

## The live re-crawl fixes (0.8.1)
- **Only the form.** Fields are read inside `formRoot` (or the form with the most controls), never in the header, navigation, footer or `[role=banner]`; `exclude` lists more selectors to leave alone. A control whose options are language names is the site's language switcher and is never cycled. Each run checks that what the site localises (titles, step titles, options, messages) is in the run's script, and that the page's `lang` did not change; otherwise it **stops with an error** naming `exclude` / `formRoot`.
- **Card:** label/value pairs in divs, PrimeNG cards, panels, fieldsets and tabs, description blocks and lists (fees, duration, steps) are read; `card: {root, title, description, item, label, value, lists}` names them when needed.
- **Required:** also from an asterisk drawn by CSS (`::after` / `::before`), from `ng-invalid` once touched or submitted, from an error shown in the field's own box after the empty attempt, and from the site's validation message naming the field ("Product name: required").
- **Labels:** the field's own container is the highest ancestor that holds no other control; its label wins (before or after the control); a panel, card or tab caption is never a field label.
- Captcha fields (`g-recaptcha-response` and the like) are skipped; a gateway named after its variable ("action", "decision") is numbered like an unnamed one.

## Editions, files, fonts (0.8.0)
- The document code (`control.documentId`, the running header and the cover spine) is Latin in both editions: the process key, the crawl name, or a transliteration; never the Arabic slug.
- Export file names keep Arabic readable (`طلب-حجز-قاعة.ar.pdf`); exports go to `--out`, or an `exports` folder beside the document / the editor, never into this repository.
- The DOCX carries its TrueType fonts (`word/fonts/*.odttf`, default on; editor toggle «Embed the fonts in the DOCX», CLI `--no-embed-fonts`), so it opens right without Thmanyah installed.

## In the editor
**New document** (island button or `Ctrl+K`): *From a process model* reads the file in the page; *Walk the live service* needs `npm run serve` because it runs a browser on this machine. The new service opens at once in both editions.
**Process** panel: add actors, steps, decisions and end statuses, connect them, see the figure, then **Rebuild the sections** (both editions; document control, revisions and placed logos stay).

## MCP
`harvest_model {model, out_dir, name?}` and `harvest_crawl {config, out_dir}` return the two document paths and the editor path.

## Gates
`tests/harvest.test.mjs`: an invented Flowable-style BPMN, a draw.io file (plain and compressed), a YAML list, and a local bilingual site walked end to end with an OTP pause that resumes by itself; credentials checked absent from the harvest; robots respected; viewport-only screenshots; the wizard and the Process panel in the editor.
