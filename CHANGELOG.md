# Changelog / سجل التغييرات

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). Tag plan: `v0.1.0` on `main` after the first merge of the bible and editor branches; a MINOR for each roadmap step, a PATCH for fixes, MAJOR when the edits or design-pack contract changes incompatibly.

<div dir="rtl">

الصيغة وفق Keep a Changelog، والإصدارات وفق الترقيم الدلالي. خطة الوسوم: `v0.1.0` على `main` بعد أول دمج لفرعي المرجع والمحرر؛ ورقم فرعي (MINOR) لكل خطوة من خارطة الطريق، ورقم تصحيح (PATCH) للإصلاحات، ورقم رئيسي (MAJOR) عند تغيير غير متوافق في عقد التعديلات أو عقد حزمة التصميم.

</div>

## [0.9.0] - 2026-10-28

The workflow diagram is the house SRS figure again, and it is shapes and text you can edit; the toolbar follows what you select. / مخطط سير العمل بتصميم وثائق المتطلبات المعتمد، أشكالاً ونصوصاً قابلة للتحرير، وشريط أدوات يتبع ما تحدده.

### Added / أضيف
- **Diagram block** (`kind: 'diagram'`, contract `bible/contracts/diagram.schema.json`): a model of nodes, edges and group bands drawn by `engine/diagram.mjs` in the house look: the applicant's steps in a soft dashed band, sage staff stages with a person badge, white «إجراء» diamonds, a salmon rework box, stadium ends (✓ approval, ⊗ refusal) with a caption, a heavy solid forward path, dashed brown returns, red refusal lines, orthogonal routing with rounded corners, plated edge labels and a legend of every shape and line kind; the chain wraps onto the landscape sheet's proportion. Colours come from the theme's `diagram-*` tokens, so a design pack restyles it. / كتلة المخطط بتصميم الشكل المعتمد.
- Harvest writes a diagram block (from the process graph: applicant, payment, rework, staff, decisions, approval/refusal ends) instead of a picture. / الحصاد يكتب نموذج المخطط.
- **Editing in place**: click a shape, an arrow or the empty drawing; drag to move (grid snap), corner handle to resize, arrow keys nudge, double-click edits a label; add stage/applicant/start/payment/rework/system/decision/end/note/group/free text and 13 symbols; arrow from a shape, reconnect either end, reverse, arrow kind; kind, colour role and badge; duplicate, delete, front/back, align ×6, distribute ×2, group in a band; auto layout, reset to the harvested layout, flow direction, legend on/off; «New diagram». One `replace` op per gesture, so undo/redo, edits files, Save HTML, PDF and DOCX carry it. / التحرير في مكانه.
- **Mermaid**: import flowchart code into the model (laid out in the house style) and export the model as Mermaid, in the editor, `npm run diagram:mermaid` and the MCP tool `diagram_mermaid`. / مسار Mermaid.
- **Contextual, categorised toolbar** docked at the top: labelled sections (File · Insert · Edit · Document · Design · Export · View), and a highlighted selection section named for what is selected (text, table cell, image, logo, shape, arrow, several shapes, diagram) with a «More» menu so 1366 px never jams; Esc or a click on the page brings the general tools back. The Ctrl+K palette lists every command under the same categories. / شريط أدوات سياقي مصنّف.

### Changed / تغيّر
- PDF: the diagram is inline SVG with real text (searchable, Arabic shaped, no Type 3). DOCX: the diagram is **native Word shapes** (one DrawingML group of boxes, diamonds, stadiums, polylines with arrowheads and text boxes), editable in Word, no picture. / الوثيقة النصية بأشكال Word أصلية.
- Figure captions print «الشكل N: …» / "Figure N: …" above a framed sheet; the harvested caption reads «مخطط سير العمل: …». / عنوان الشكل.

### Tests / الاختبارات
- `tests/diagram.test.mjs`: structure (kinds, wires, legend), orthogonal routing, Mermaid round-trip, PDF text, DOCX native shapes, editing round-trip, and the toolbar context swap (none / shape / arrow / diagram / several / text / Esc). MCP lists and runs `diagram_mermaid`. / اختبارات جديدة.

## [0.8.4] - 2026-10-28

From the final live run with 0.8.3 (10 of 11 checks, 0 filed, 0 workarounds). / من التشغيل الحي الأخير.

### Fixed / أصلح
- A textarea's inline «هذا الحقل مطلوب» was not captured: the field's message is now looked for in its own box, in the element its `aria-describedby` names, and just after its box; each field also gets an explicit blur after the Tab, and `aria-invalid` counts like `ng-invalid` once touched. / رسالة الحقل النصي متعدد الأسطر.

### Tests / الاختبارات
- An Angular-like textarea with a touched-only validator whose message sits after the field box. / اختبار جديد.

## [0.8.3] - 2026-10-28

From the fourth live run with 0.8.2 (0 requests filed, 0 workarounds, 8 of 11 checks). / من التشغيل الحي الرابع.

### Fixed / أصلح
- Card channels (and every card list: recipients, fees, required documents) were harvested but dropped by the mapper; they are now rows of the service-card table, so they reach the PDF and DOCX. / قنوات تقديم الخدمة في الوثيقة.
- An attachment is one row: the file input paired with its «attachment name» select (names, required, accepted types); the card's statement on required documents wins over the select's star, and a disagreement becomes an open question; the paired select leaves the inputs table. / صف مرفق واحد.
- Required in a dry run: every field is blurred first (Tab through), each inline message is kept with its field and listed with it under Validation messages; a non-final Next may be pressed, a final action never. / الإلزامي دون ضغط «إرسال».

### Tests / الاختبارات
- The fixture's card lists its documents; an «attachment name» select sits beside the file; the card's channels are checked in the PDF text; inline messages carry their field. / اختبارات جديدة.

## [0.8.2] - 2026-10-27

Urgent safety fix: the 0.8.1 live crawl filed two real staging requests. / إصلاح أمان عاجل: مرور 0.8.1 قدّم طلبين حقيقيين.

### Fixed / أصلح
- **Never submit by default.** `submit` defaults to false: the crawl stops before any final action (Send / Submit / Confirm / Pay / Finish, «إرسال» «تقديم» «حفظ وإرسال» «تأكيد» «دفع», or a plain `type=submit` with no step word) and logs «stopped before submit»; on that step the validation messages come from touching the fields, never from pressing. Filing needs `submit: true` **and** `--yes-file-real-request` or a typed YES; the editor and the MCP tool never file. Statuses come from the model or the config's `statuses`. / لا تقديم افتراضياً.
- The same form recorded twice after filling is one step, keeping the richer reading (options, required), live and when a saved harvest is mapped again. / الخطوة المكررة.
- The attachment field disappeared in 0.8.1 (it sat outside the main form): the scope is now the container of every form on the page, and file inputs in the main area are always read; the label still comes from the field's own container. / عودة حقل المرفقات.
- Card: fees, recipients and channels (a heading or title followed by its value or list). / البطاقة: الرسوم والمتلقون والقنوات.
- Required: starred fields stay required; the site's validation message only adds. / الإلزامي: النجمة تبقى، والرسالة تضيف فقط.
- Docs: «Safety: the crawler never files a request unless you ask» in SKILL.md, bible 08 and the README (AR + EN). / توثيق الأمان.

### Tests / الاختبارات
- The fixture counts filed requests: 0 in the default run, 0 with `submit: true` alone, 1 only with the flag; the attachment in a sibling form; fees / recipients / channels; no duplicate step. / اختبارات الأمان.

## [0.8.1] - 2026-10-27

From the live re-crawl with 0.8.0 (9 of 11 checks, 1 workaround). / من المرور الحي بالإصدار 0.8.0.

### Fixed / أصلح
- **Language flip (high):** the header's language dropdown was read as a form field and cycled, which switched the portal language. Fields are now read only inside the form (`formRoot`, or the form with the most controls; header / nav / footer / `[role=banner]` and `exclude` left alone), a language switcher is never cycled, and a run whose captured text is in the other script, or whose page `lang` changed, stops with an error. / قلب اللغة: الحقول من داخل النموذج فقط، ومبدّل اللغة لا يُلمس، والمرور يتوقف بخطأ إن تبدلت اللغة.
- **Empty card:** SPA cards are read (div label/value pairs, PrimeNG cards, panels, fieldsets, tabs, description blocks, fee / duration / steps lists); a `card` selector map. / البطاقة الفارغة.
- **Required flags:** also from CSS `::after` asterisks, `ng-invalid` after touch or submit, an error in the field's own box, and the site's validation message naming the field (also applied when a saved harvest is mapped again). / الحقول الإلزامية.
- **Attachment label:** from the field's own container, never a panel caption. / تسمية المرفق.
- Captcha fields (`g-recaptcha-response`) skipped; a gateway named "action" is numbered «قرار ١» / "Decision 1". / حقول التحقق البشري والبوابات.

### Tests / الاختبارات
- The fixture SPA gains a header language switcher that really switches the page, a div / panel / tabs card, a CSS `::after` asterisk, a field named only in the validation summary, a file labelled after it inside a captioned panel and a captcha field; a script check on a swapped harvest; a gateway named "action". / اختبارات جديدة.

## [0.8.0] - 2026-10-27

From the first field test (one live service, clean room, the skill only: partial pass, 6 workarounds). / من أول اختبار ميداني.

### Added / أضيف
- `npm run harvest:merge -- <harvest.json> <process.json|model>`, MCP `harvest_merge`, editor **New document → Merge two harvests**: the union of a crawl and a model with provenance per chapter and status row; disagreements kept as conflicts and shown; a second harvest `--into` the same folder merges instead of overwriting. / أمر الدمج وأداته ومعالجه.
- Model: a **roles mapping file** (`--roles`) for expression assignees and raw keys, per edition; unmapped roles get a readable fallback, an open question and a prompt in the Process panel; a **monitoring-graph JSON** harvester for back offices that do not export XML. / ملف أسماء الأدوار وقارئ مخطط المراقبة.
- Crawler: `waitFor` ready selectors after network idle, `preForm` steps (terms, Continue, re-login), PrimeNG-style controls (`p-dropdown`, `p-select`, `p-multiselect`, `p-calendar`, `p-datepicker`, `p-radiobutton`, `p-checkbox`, `p-inputnumber`), `--raw` to map a saved harvest offline. / المرور على بوابات SPA.
- DOCX font embedding without Word (`engine/docx/embed_fonts.py`, `word/fonts/*.odttf`), default on, editor toggle and `--no-embed-fonts`. / تضمين الخطوط في DOCX دون Word.
- `serve.mjs --out`, `export.mjs` writes beside the document. / مجلد التصدير.

### Fixed / أصلح
- Labels came from the section title on SPA forms; required flags were lost; fields with no id or name could not be filled; a crash lost the whole harvest. / التسميات والإلزامي والملء والحفظ التدريجي.
- A user task with candidate groups was called "User"; expression assignees and `sid-…` ids were printed raw; unnamed gateways printed nothing readable; `--name` was ignored for BPMN. / أسماء الأدوار والبوابات و`--name`.
- The EN edition printed the Arabic slug as its document code, running header and spine. / رمز الوثيقة في النسخة الإنجليزية.
- Export file names turned Arabic into `-------`; exports landed in the repository's `out/exports`. / أسماء ملفات التصدير ومكانها.
- `serve.mjs` exited 0 silently when started through a junction or a symlink; it now compares real paths and prints an error on a bad path. / تشغيل الخادم عبر رابط.
- The check panel reported empty logo slots while logos were placed; `update --check` could hit a libuv assertion on exit (unread response bodies, `process.exit`). / عدّ الشعارات وخروج فحص التحديث.

### Tests / الاختبارات
- `tests/field.test.mjs`: an invented SPA (async render, terms gate, PrimeNG-style controls, sibling labels, asterisks, no ids or names) crawled end to end in both languages; the merge with a conflict; a monitoring graph → document; expression-assignee mapping; the EN code; Arabic file names; DOCX fonts embedded (word/fonts parts, toggle, obfuscation self-test); the server through a junction. / اختبارات الفجوات الميدانية.

## [0.7.0] - 2026-10-27

### Added / أضيف
- Harvest path A, from a process model: BPMN 2.0 (Flowable, Camunda, Activiti, with their extension attributes: user tasks, candidate groups, assignee, form properties, conditions, timers, gateways, subprocesses), draw.io (plain and compressed) and a YAML/JSON step list → the process IR → both document editions; the workflow figure shows people's steps only. / الاستخراج من نموذج إجراء.
- Harvest path B, crawl a live service: headed Chrome, one tab, keyboard-first triggers, robots.txt respected, rate limit, OTP/captcha pause for the human, credentials only from `$env:` or the gitignored `.local/harvest-secrets.json`; card, form steps (labels, required, options, conditional fields, attachments), validation messages, statuses, both languages, viewport-only screenshots. / الاستخراج بالمرور على الخدمة الفعلية.
- `npm run harvest:model`, `npm run harvest:crawl`, MCP `harvest_model` and `harvest_crawl`, the editor's **New document** wizard and **Process** panel (draw the flow, rebuild the sections in both editions). / الأوامر وأدوات MCP ومعالج الوثيقة الجديدة ولوحة الإجراء.
- `bible/08-harvest` (AR + EN), `bible/contracts/harvest.schema.json`, SKILL.md «Start a document: harvest» (AR + EN). / الفصل والعقد ونص المهارة.
- Tests: invented Flowable-style BPMN, draw.io plain and compressed, YAML list, a local bilingual site crawled end to end with an OTP pause that resumes by itself, the wizard and the Process panel. / الاختبارات.
### Changed / تغير
- Two separate switches: **Language «ع» / «E»** sets the interface language and the document edition; **Direction RTL / LTR** sets the layout direction independently (follows the language until chosen, then remembered; view only). Each has an icon, a tooltip and an accessible name in both languages. / مبدّلان منفصلان: اللغة «ع» / «E»، والاتجاه RTL / LTR مستقل عنها ويُحفظ.
- Everything in the document is editable: every printed label (`/labels`, house ← design pack ← document; in place or from the Labels list; «apply to all documents» writes the design pack), the title, subtitle and cover code, every field name and value; the Design panel edits colours per role, sizes, line height, margins, rule widths and table styles live (`/design`), **Style this** gives one element its own style, template parts can be shown, hidden and reordered (`/layout`), chapters moved, duplicated, hidden or deleted, sections and tables added, and an advanced CSS field is sanitised (no `@import`, no remote `url()`, no expressions). All of it is undoable, is carried by the edits JSON and reaches the PDF and the DOCX. / كل شيء في الوثيقة قابل للتحرير: التسميات والعنوان ورمز الغلاف وأسماء الحقول وقيمها والتصميم وأجزاء القالب وCSS متقدم منقّى.
- A harvested value edited by hand is flagged «manual»; a re-harvest keeps it and reports the conflict, shown in the editor on open. / القيمة المعدّلة يدوياً تبقى عند إعادة الاستخراج ويُعرض التعارض.
- Tests assert both label sets and that the direction toggles independently of the language; `tests/editable.test.mjs` edits a table header, the cover code, the title, the subtitle, a field name and a field value (all four found in the PDF text and the DOCX), the header fill colour (painted in the PDF, shaded in the DOCX), an instance style, sanitised CSS rejecting a remote `@import`, the edits-JSON round trip, undo, the empty-label check and the re-harvest conflict. / الاختبارات.

## [0.6.0] - 2026-10-27

### Added / أضيف
- Updates for people and for their AI agents: `npx business-wrap update --check` prints one line when a newer release exists (cached, at most one request a day; the private repo is read with the user's `gh` login or a token in `.local/update-token`, and an unauthenticated check is a quiet "can't check"). / تحديثات للإنسان ولوكيله: سطر واحد عند توفر إصدار أحدث، مرة في اليوم على الأكثر.
- `npx business-wrap update --apply --yes` updates the installed folder and keeps `.local`, `design/custom`, `logos`, `fonts/custom`, `drafts` and `out`; a git checkout fast-forwards, a zip install is verified by SHA-256 with one backup and a rollback. / التحديث يحفظ إعدادات المستخدم وحزمه وشعاراته ومسوداته.
- The editor shows "what's new" once after an update and, when served, an "update available" card with Update / Later / Turn off. / المحرر يعرض «الجديد» مرة بعد التحديث وبطاقة «يتوفر تحديث».
- MCP: `check_update` and `apply_update` (asks for `confirm: true`); the server's instructions and the first tool result of a session carry `update_available`. / أداتا MCP للتحقق والتحديث، وتنبيه في تعليمات الخادم.
- `AGENTS.md` and SKILL.md tell any agent to check at the start of a Business-Wrap task and tell the user in one line; an optional Claude Code SessionStart hook (off by default). / تعليمات للوكلاء وخطاف اختياري معطل افتراضيا.
- CI: `update/version-sync.mjs` keeps package, plugin, marketplace, MCP registry, Smithery and READMEs on one version; a tag publishes the release with notes cut from this file. / فحص توحيد الإصدار، والإصدار من الوسم.

### Migration notes / ملاحظات الترحيل
- New command: `npx business-wrap update` (`--check`, `--apply --yes`, `--notes`, `--enable-hook`, `--off`). Run `--check` at the start of a Business-Wrap task; never `--apply` without the user's consent.
- New MCP tools: `check_update`, `apply_update` (call `apply_update` with `confirm: true` only after the user agreed). Restart the MCP server after an update.
- Edits files stay version 1. An edits file with a newer `version` is refused with "update first"; v0 bare op arrays are migrated to v1 on import and on update.
- No breaking change to document JSON or design packs.

## [0.5.1] - 2026-10-27

### Added / أضيف
- The editor ships inside the skill: `assets/editor/business-wrap.html`, one self-contained file (styles, script, icons, logo inlined) that opens from disk on a blank document, with the anonymised sample one click away in the service list. / المحرر داخل المهارة: ملف واحد مكتفٍ بذاته يفتح من القرص على وثيقة فارغة، والمثال على بعد نقرة.
- Import now opens any document JSON as a service of its own (hashed like the build), besides merging edits files. / الاستيراد يفتح أي ملف JSON لوثيقة خدمةً مستقلة.
- `samples/blank/` (AR + EN starter document); `npm run skill-html` rebuilds the shipped editor; `npm test` fails when the shipped file is stale, and `tests/skill-html.test.mjs` opens it headless (no console errors, blank first, sample listed, runtime document load). / وثيقة بداية فارغة، وأمر إعادة البناء، وفحص يُسقط الاختبار إذا تقادم الملف.
- The shipped editor names fonts with `local()` only: no machine path and no font bytes in the file; install the fonts in the OS, or build a personal editor that reads the configured font folder. / المحرر المشحون يسمي الخطوط عبر `local()` فقط: لا مسار ولا ملفات خطوط داخله.

### Changed / تغير
- SKILL.md: an «Open the editor» section with the exact path and commands, in English and Arabic. / قسم «افتح المحرر» في SKILL.md.
- Plugin, marketplace, MCP and package versions 0.5.1; the npm package ships `assets/editor`, `samples/blank` and `brand/logo`. / الإصدارات 0.5.1.

## [0.5.0] - 2026-10-27

### Changed / تغيّر
- The default theme is the house pack `design/ours` (the original SRS palette: navy #003c7a, cover band #001e3d with gold cap #be9a41, table header #e1eaf4, zebra #f2f6fa, callouts #a81a1f / #f2e4e4); the editor shell uses the same colours. / السمة الافتراضية هي ألوان وثائق SRS الأصلية، والمحرر يستخدمها أيضاً.
- Editor redesign: a floating island toolbar (logo, RTL / LTR switches, live counter), a selection rail beside the selection, a command palette (Ctrl+K), slide-over panels, toasts, skeletons and progress, focus mode (F) and calm mode; every motion turns off under reduced motion or calm mode. Icons from lucide-static, vendored into `editor/icons.json` (offline). / إعادة تصميم المحرر: شريط عائم، وشريط تحديد، ولوحة أوامر، ووضع تركيز ووضع هادئ.
- The language toggles read RTL and LTR. The tool's logo (`brand/logo/`, from the brand branch) replaces the product name in the UI. / مبدّلات اللغة تقرأ RTL وLTR، والشعار بدل الاسم.

### Added / أضيف
- Free-placed logos and images (`overlays`): drag anywhere (cover, every page, next to a block), resize, snap guides, remembered in the document, printed at the exact position in the PDF and placed as anchored pictures in the DOCX. No fixed logo slots. / الشعارات والصور توضع بحرية وتُطبع في موضعها.
- Images by upload, paste or drag-drop, re-encoded through a canvas (metadata stripped). / الصور بالرفع أو اللصق أو السحب مع إزالة البيانات الوصفية.
- Webhooks: off by default, user URLs and events, test-send, delivery log, sent through the local server (`/api/webhook`); schema `bible/contracts/webhook.schema.json`. / خطافات الويب عبر الخادم المحلي.
- Tests: RTL / LTR labels, command palette, logo drag + remembered position + exact PDF position + DOCX anchor, image insert + export, metadata stripping, webhook test-send to a local mock, calm mode and reduced motion, the brand mark's reveal; axe with every panel, the palette and the selection rail open (0 violations). / اختبارات جديدة.

## [0.4.0] — 2026-10-27

### Added / أضيف
- Tool watermark: the NJ role mark in the editor UI, built like the owner's portfolio — four roles (tester → teacher → volunteer → professional) that change on click or Enter/Space with a .96s cross-fade on cubic-bezier(.76,0,.24,1), the role word rising letter by letter (560 ms, 40 ms stagger), an idle float and a spring pointer tilt, a one-time animated intro that a click skips; reduced motion turns off the intro, float, tilt and letter motion. / علامة الأداة: شعار NJ بأدواره الأربعة كما في الموقع الشخصي، يتبدل بالنقر أو Enter، مع احترام تقليل الحركة.
- Images in `editor/brand/watermark/` (WebP 256 px, no metadata; the 2.4 MB GIF became a 157 KB animated WebP); allow-listed in the security gate. / الصور في `editor/brand/watermark/` بلا بيانات وصفية ومسموحة في فحص الأمان.
- Tests: the click changes the role, the mark mirrors with the UI language, never blocks editing, stays out of Save-HTML and print, and keeps still under reduced motion; axe runs with the mark present (0 violations). / اختبارات العلامة.

### Unchanged / دون تغيير
- The watermark is UI only: never in the PDF, DOCX, print, edits JSON, design pack or Save-HTML. / العلامة للواجهة فقط ولا تظهر في أي مخرج.

## [0.3.0] — 2026-10-27

### Added / أضيف
- MCP server (stdio, local only): `build_editor`, `validate_edits`, `apply_edits`, `export_document`, `export_design_pack`, `check_fonts`; `mcp/cli.mjs`, `mcp/server.json` (MCP Registry), `mcp/smithery.yaml`, `glama.json`; test `npm run test:mcp`. / خادم MCP محلي بست أدوات واختبار.
- Claude Code plugin: `.claude-plugin/plugin.json` (skill + MCP server) and `.claude-plugin/marketplace.json` (the repo is its own marketplace). / إضافة Claude Code وسوقها.
- README install section and badges (AR + EN), `mcp/README.md` pair. / قسم التثبيت بالعربية والإنجليزية.
- The npm package `business-wrap` (bin `business-wrap-mcp`) is prepared but stays `private` while the repository is private. / حزمة npm جاهزة وتبقى خاصة ما دام المستودع خاصاً.

### Fixed / أصلح
- CI (Linux): pasted HTML and an imported Save-HTML file are read by string work only and never reach an HTML parser; on Linux Chrome the parsed payload's inline handler was blocked by the page CSP and reported as a console error. CSP reports in the test now name their source. / لصق HTML واستيراد الملف لا يمرّان بمحلل HTML.
- CI (Linux): with a fallback face poppler drops the shadda and returns the lam-alef ligature reversed; the fallback-mode text check compares the typed sentence without lam and alef (proved on the CI artifact). / فحص النص العربي مع خط احتياطي.

## [0.2.0] — 2026-10-27

### Fixed / أصلح
- CI: the editor test crashed on the runner because `uv` was missing (a `spawnSync` returned no output), and the Thmanyah-only checks cannot pass where the licensed fonts are not installed. Tools never throw now; face-specific checks print `SKIP` with the reason; CI installs uv, poppler, an Arabic fallback face and the Python libraries. / التكامل المستمر: تعطل الاختبار لغياب `uv`، وفحوص خط ثمانية لا تنجح حيث لا تثبت الخطوط؛ أصبحت تُتخطى بسطر SKIP مع السبب.
- DOCX: a chapter holding a figure is set on landscape sheets with its heading; section headings carry their numbers; one-section chapters print no section heading — as the PDF does. / DOCX: الفصل الذي فيه شكل على صفحات أفقية مع عنوانه، وأرقام الأقسام كما في PDF.
- `palette/check.py --help` prints the usage instead of running the gate. / خيار المساعدة في فحص الألوان.

### Added / أضيف
- gitleaks 8.30.1 in CI (pinned, checksum verified, full history) and in the local gate; generated folders are allowlisted for directory scans. / gitleaks في التكامل المستمر.
- Structural conflict prompt on import (move / delete / insert / duplicate of the same block, row or paragraph on both sides), with Keep mine / Take theirs. / تنبيه التعارض البنيوي عند الاستيراد.
- Page thumbnails through the local server (the document is printed and every sheet rasterised; a click jumps to that page). / مصغرات الصفحات عبر الخادم المحلي.
- Accessibility: axe-core check on the editor in Arabic and English with every panel open (0 violations), keyboard-only pass; caret placed on keyboard focus; toolbar landmark. / فحص إمكانية الوصول بلا مخالفات.
- Tests: table column add/delete, design-pack import (hostile values refused), structural conflict, thumbnails; `npm test` runs the editor and accessibility checks. / اختبارات جديدة.
- `tests/docx_fidelity.py`: Word exports the DOCX to PDF without saving it, then the page-by-page comparison. / أداة مقارنة DOCX بـPDF.
- CONTRIBUTING (AR + EN): on the free plan GitHub refuses branch protection and rulesets for a private repo; hooks + CI are the documented substitute. / بديل حماية الفرع على الخطة المجانية.
- Skill eval run recorded in `evals/results-2026-10-27.md` (AR + EN); SKILL quick reference gained the editor commands; the AR/EN pair rules are in the edits contract. / نتائج تقييم المهارة.

## [Unreleased] → v0.1.0

### Added / أضيف
- Bible (AR + EN): pipeline, document standard, gates, edits contract, lessons, design system. / المرجع بالعربية والإنجليزية.
- Contracts: `edits.schema.json` v1, `design-pack.schema.json`. / العقود.
- DTCG tokens: palette (5 ramps, 19 roles, diagram set) and typography (sizes, weights, line heights, space, rules, page geometry). / الرموز التصميمية.
- `palette/check.py` contrast gate, `design/build.py` pack → theme. / فحص التباين وبناء السمة.
- Font manifest (no binaries), logo and design upload slots. / ملف تعريف الخطوط وخانات الرفع.
- `security/check.py` + `gitleaks.toml`: secrets, client terms (hashed), ID/phone shapes, emails, local paths, font binaries, image metadata, files over 5 MB; tree + history + commit messages. / فحص الأمان.
- CI workflow, pre-commit and pre-push hooks, repo templates, docs (guide, glossary, architecture, decisions, roadmap, privacy). / التكامل المستمر والخطافات والتوثيق.
