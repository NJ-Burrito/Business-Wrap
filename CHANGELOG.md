# Changelog / سجل التغييرات

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). Tag plan: `v0.1.0` on `main` after the first merge of the bible and editor branches; a MINOR for each roadmap step, a PATCH for fixes, MAJOR when the edits or design-pack contract changes incompatibly.

<div dir="rtl">

الصيغة وفق Keep a Changelog، والإصدارات وفق الترقيم الدلالي. خطة الوسوم: `v0.1.0` على `main` بعد أول دمج لفرعي المرجع والمحرر؛ ورقم فرعي (MINOR) لكل خطوة من خارطة الطريق، ورقم تصحيح (PATCH) للإصلاحات، ورقم رئيسي (MAJOR) عند تغيير غير متوافق في عقد التعديلات أو عقد حزمة التصميم.

</div>

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
