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

## In the editor
**New document** (island button or `Ctrl+K`): *From a process model* reads the file in the page; *Walk the live service* needs `npm run serve` because it runs a browser on this machine. The new service opens at once in both editions.
**Process** panel: add actors, steps, decisions and end statuses, connect them, see the figure, then **Rebuild the sections** (both editions; document control, revisions and placed logos stay).

## MCP
`harvest_model {model, out_dir, name?}` and `harvest_crawl {config, out_dir}` return the two document paths and the editor path.

## Gates
`tests/harvest.test.mjs`: an invented Flowable-style BPMN, a draw.io file (plain and compressed), a YAML list, and a local bilingual site walked end to end with an OTP pause that resumes by itself; credentials checked absent from the harvest; robots respected; viewport-only screenshots; the wizard and the Process panel in the editor.
