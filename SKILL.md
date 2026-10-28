---
name: business-wrap
description: Use when a requirements or specification document (SRS, service card, business requirements, workflow, user stories and acceptance criteria) must be produced, rebuilt, edited or exported as an Arabic and/or English PDF and DOCX from evidence; when someone wants to open the Business-Wrap editor or make small edits in an HTML replica instead of regenerating; when a design pack, palette, typography tokens, logo slot or font setup is changed; when a document's fonts, RTL text, pagination, colours or Type 3 glyphs look wrong; when a document should start from a process model (BPMN, Flowable, Camunda, draw.io, step list) or from crawling a live e-service; or before publishing the repo (security gate). Arabic triggers - وثيقة متطلبات، مواصفات الخدمة، بطاقة الخدمة، قصص المستخدمين، معايير القبول، مخطط سير العمل، افتح المحرر، محرر الوثيقة، تعديل الوثيقة، تصدير PDF أو DOCX، استخراج من نموذج إجراء، المرور على الخدمة، حزمة التصميم، لوحة الألوان، الخطوط، فحص الأمان.
---

# Business-Wrap

Turns observed evidence into a governed, bilingual (AR RTL / EN LTR) requirements document; a person edits an HTML replica of the PDF+DOCX; export writes PDF, DOCX, the edits file and a theme pack. Every rule has a gate.

## First: check for an update (once a day, never auto-update)
At the start of any Business-Wrap task run `node update/cli.mjs --check --lang <ar|en>` from this skill folder (or `npx business-wrap update --check`, or the MCP tool `check_update`). It is cached and makes at most one request a day; "can't check" means say nothing.
If it prints a notice, tell the user in ONE line, in their language: the new version and the three highlights it printed, and offer `node update/cli.mjs --apply --yes` (Claude Code plugin: `/plugin update business-wrap`). Never update without their consent. After an update, read `node update/cli.mjs --notes`: follow its «Migration notes» (changed commands, schemas) before anything else. An edits file whose `version` is newer than the engine is refused: update first, never down-convert it. Full rules: `bible/07-updates.md`.

## Local learning / التعلّم المحلي (mandatory, `bible/09-learning.md`)
Before harvesting, authoring or generating, read the learned rules (MCP `learning_rules`, or `.local/learning/rules.md`) and apply them. After the user's edits and after an export, run `learning_distill` (`npm run learn`). Tell the user in ONE line which learned rules were applied. Conflicts (`learning_conflicts`) go to the user side by side; never resolve, promote, retire or forget on your own. The journal stays on this machine: never copy it into a document, a commit or a message.

## Open the editor / افتح المحرر
The editor ships with this skill, ready to open: **`assets/editor/business-wrap.html`** (path relative to this SKILL.md; one self-contained file).

| Want | Do |
|---|---|
| Start a new document | open the file in Chrome or Edge (Windows: `start "" "<skill dir>/assets/editor/business-wrap.html"`); it opens on a blank AR + EN document |
| See the sample | pick «event-permit» in the service list |
| Open your own document JSON | Import (or Ctrl+K → Import) and choose the `*.ar.json` / `*.en.json`; it opens as its own service |
| One-click PDF + DOCX, page thumbnails, webhooks | from a clone: `npm install`, then `node engine/serve.mjs assets/editor/business-wrap.html` → http://127.0.0.1:4317/ (opened from disk, PDF + DOCX downloads the edited JSON and shows the export command) |
| A dedicated editor for your documents | `node engine/build-editor.mjs <doc.json or folder> --out out/<name>.editor.html` (reads your configured font folder) |
| Rebuild the shipped file after changing `editor/` or `engine/` | `npm run skill-html` (`npm test` fails while it is stale) |

Fonts: the shipped file names the Thmanyah fonts installed in the OS (`local()`), never a path or font bytes; without them it falls back to a system face until you install them (`fonts/README.md`).

<div dir="rtl">

المحرر جزء من المهارة وجاهز للفتح: **`assets/editor/business-wrap.html`**. افتحه في Chrome أو Edge فيبدأ على وثيقة فارغة بالعربية والإنجليزية؛ والمثال في قائمة الخدمات؛ ولفتح ملف JSON لوثيقتك استخدم «استيراد». للتصدير إلى PDF وDOCX بنقرة، والصور المصغرة للصفحات، وخطافات الويب: شغل `node engine/serve.mjs assets/editor/business-wrap.html` من نسخة المستودع بعد `npm install`. ولبناء محرر خاص بوثائقك: `node engine/build-editor.mjs`. وبعد تغيير `editor/` أو `engine/` أعد بناء الملف بالأمر `npm run skill-html`.

</div>

## Start a document: harvest / ابدأ وثيقة: الاستخراج (`bible/08-harvest.md`)

> **Safety: the crawler never files a request unless you ask.** A crawl is a dry run: it reads every step and stops before the final action (Send, Submit, Confirm, Pay, Finish; «إرسال»، «تقديم»، «حفظ وإرسال»، «تأكيد»، «دفع»), logging «stopped before submit». Filing a real request needs `submit: true` in the config **and** `--yes-file-real-request` (or typing YES when asked). The editor and the MCP tool never file. Statuses then come from the model or the config's `statuses` list.

Two ways in, one result: `document.ar.json` + `document.en.json` and an editor.

| You have | Run | Notes |
|---|---|---|
| A BPMN 2.0 export (Flowable, Camunda, Activiti), a draw.io diagram, or a YAML/JSON step list | `npm run harvest:model -- <file> [--out dir]` · MCP `harvest_model` · editor **New document → From a process model** | lanes/groups → actors, user tasks → stories, gateways/conditions/timers → rules, end events → statuses; the figure shows people's steps only |
| Both: a crawl and a model of the same service | `npm run harvest:merge -- <harvest.json> <process.json\|model>` · MCP `harvest_merge` · editor **New document → Merge two harvests** | the union with the source of each chapter and status row; disagreements listed as conflicts; a second harvest `--into` the same folder merges, never overwrites |
| A live e-service | `npm run harvest:crawl -- <crawl.json>` · MCP `harvest_crawl` · editor **New document → Walk the live service** (needs `npm run serve`) | headed Chrome, one tab, keyboard first, robots respected, OTP/captcha pause waits for the human; credentials only as `$env:NAME` / `$secret:key` |

Rules that cost a rebuild if skipped:
- Never put a password in a crawl config; use `$env:` or `.local/harvest-secrets.json`.
- SPA portals: give the crawl a `waitFor` ready selector and `preForm` steps (terms, Continue), and `formRoot` / `exclude` when the page has a header language switcher; expression assignees need `--roles roles.json` (an unmapped role is asked for, never called "User").
- Harvested names are kept as written; a one-language source gives both editions the same names: review before issuing.
- Everything printed is editable (labels, title, cover code, field names and values, design, template parts); the rules and pointers are in `bible/04-edits-contract.md` § Everything is editable.
- After editing the flow in the **Process** panel, press **Rebuild the sections**; control data, revisions and placed logos stay.

<div dir="rtl">

> **الأمان: المرور لا يقدّم طلباً أبداً إلا إذا طلبت ذلك.** المرور تشغيل تجريبي: يقرأ كل خطوة ويتوقف قبل الإجراء النهائي («إرسال» و«تقديم» و«حفظ وإرسال» و«تأكيد» و«دفع»، وSend وSubmit وConfirm وPay وFinish)، ويسجل «stopped before submit». ولتقديم طلب حقيقي يلزم `submit: true` في الإعدادات **و**`--yes-file-real-request` (أو كتابة YES عند السؤال). والمحرر وأداة MCP لا يقدّمان أبداً. وتؤخذ الحالات حينها من النموذج أو من قائمة `statuses` في الإعدادات.

طريقان والنتيجة واحدة: `document.ar.json` و`document.en.json` ومحرر.

| لديك | شغّل | ملاحظات |
|---|---|---|
| تصدير BPMN 2.0 (Flowable أو Camunda أو Activiti)، أو مخطط draw.io، أو قائمة خطوات YAML أو JSON | `npm run harvest:model -- <file> [--out dir]` · أداة MCP `harvest_model` · في المحرر **وثيقة جديدة ← من نموذج إجراء** | المسارات والمجموعات ← الأطراف، ومهام المستخدم ← القصص، والبوابات والشروط والمهل ← القواعد، وأحداث النهاية ← الحالات؛ والمخطط يعرض خطوات الأشخاص فقط |
| مرور ونموذج للخدمة نفسها | `npm run harvest:merge -- <harvest.json> <process.json\|model>` · أداة MCP `harvest_merge` · في المحرر **وثيقة جديدة ← دمج حصادين** | الاتحاد مع مصدر كل فصل وكل صف حالة؛ والاختلافات تُعرض تعارضات؛ والحصاد الثاني `--into` المجلد نفسه يُدمج ولا يحل محل الأول |
| خدمة إلكترونية فعلية | `npm run harvest:crawl -- <crawl.json>` · أداة MCP `harvest_crawl` · في المحرر **وثيقة جديدة ← المرور على الخدمة الفعلية** (يحتاج `npm run serve`) | Chrome ظاهر، وتبويب واحد، ولوحة المفاتيح أولاً، واحترام robots، والتوقف للرمز المؤقت أو التحقق البشري حتى يتدخل الإنسان؛ وبيانات الدخول فقط بصيغة `$env:NAME` أو `$secret:key` |

قواعد يكلّف تجاوزها إعادة البناء:
- لا تضع كلمة مرور في إعدادات المرور؛ استخدم `$env:` أو `.local/harvest-secrets.json`.
- بوابات SPA: أعطِ المرور محدد الجاهزية `waitFor` وخطوات `preForm` (الشروط والمتابعة)، و`formRoot` و`exclude` حين يكون في الترويسة مبدّل لغة؛ والمكلَّفون بالتعبيرات يحتاجون `--roles roles.json` (والدور غير المحسوم يُسأل عنه، ولا يُسمى "User").
- الأسماء المستخرجة تبقى كما وردت؛ والمصدر المكتوب بلغة واحدة يعطي النسختين الأسماء نفسها، فراجعها قبل الإصدار.
- كل ما يُطبع قابل للتحرير (التسميات والعنوان ورمز الغلاف وأسماء الحقول وقيمها والتصميم وأجزاء القالب)؛ والقواعد والمؤشرات في `bible/04-edits-contract.ar.md`.
- بعد تعديل السير في لوحة **الإجراء** اضغط **أعد بناء الأقسام**؛ ويبقى ضبط الوثيقة والمراجعات والشعارات الموضوعة.

</div>

## When NOT to use
- A free-form letter, slide deck or marketing page (no evidence chain, no gates).
- Editing a delivered PDF/DOCX by hand: edit through the editor so the change survives the next rebuild.

## Read next (progressive disclosure)
| Need | Read |
|---|---|
| What runs, in what order | `bible/01-pipeline.md` (AR: `.ar.md`) |
| What a document must contain, AR/EN rules, pagination | `bible/02-document-standard.md` |
| Which gate proves what | `bible/03-gates.md` |
| The editor's edits JSON | `bible/04-edits-contract.md`, `bible/contracts/edits.schema.json` |
| A symptom you have seen before | `bible/05-lessons.md` |
| Colours, sizes, page geometry, custom design | `bible/06-design-system.md`, `design/README.md` |
| Fonts setup, Type 3 | `fonts/README.md` |
| Start a document from a BPMN / draw.io / YAML model or a live service | `bible/08-harvest.md`, `bible/contracts/harvest.schema.json` |
| What the tool learned from the user's edits; rules, conflicts, privacy | `bible/09-learning.md`, `npm run learn -- rules` |
| Install, quickstart, troubleshooting | `docs/guide.md` |

## Quick reference
| Task | Command |
|---|---|
| Palette contrast gate + swatches | `python palette/check.py` |
| Build a theme from a design pack | `python design/build.py [design/custom/<name>/pack.json]` |
| Security gate (tree + history) | `python security/check.py` |
| Build the editor for documents (`*.ar.json` / `*.en.json`) | `node engine/build-editor.mjs <doc.json or folder> --out out/x.editor.html` |
| Editor with one-click PDF + DOCX and page thumbnails | `node engine/serve.mjs out/x.editor.html` → http://127.0.0.1:4317/ |
| Export without the UI (edits replayed) | `node engine/export.mjs --doc <document.json> --edits <edits.json> --locale ar\|en` |
| Sample, editor check, accessibility check | `npm run sample` · `npm test` |
| The same actions as MCP tools (build_editor, apply_edits, export_document, …) | `node mcp/cli.mjs` — see `mcp/README.md` |

Always `PYTHONUTF8=1` on Windows; Python packages through `uv`.

## Rules that cost a rebuild if skipped
1. Evidence, not memory: one named source per section; a missing source prints a stated gap, never an invented value.
2. Union merges, never select-one; one fact computed once before anything reads it.
3. Edits go through `edits.json`; never hand-edit the document JSON.
4. AR and EN editions are one unit: a structural change made in one is made in the other.
5. Thmanyah fonts only (Cairo banned), printed from TrueType; binaries never committed.
6. Logo slots ship empty; the tool watermark stays in the editor UI and never reaches an output.
7. Zero client content in the repo; run `security/check.py` before every commit and push.
8. Judge Arabic PDF text with poppler `pdftotext -enc UTF-8`; an empty read is a tool suspicion.

## Common mistakes
| Mistake | Fix |
|---|---|
| Re-rendering the stage after the one you changed | re-run from the stage that owns the fact (`bible/01-pipeline.md`) |
| A colour or pt typed into a template | add or use a token; rebuild the theme |
| "All fixes applied" | prove per item from the printed PDF: "N of M applied" |
| Fonts look right in the editor, wrong in the PDF | the PDF used CFF → Type 3, or a `file://` font was refused; see `docs/guide.md` § Troubleshooting |
