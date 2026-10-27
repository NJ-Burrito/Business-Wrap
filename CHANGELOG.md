# Changelog / سجل التغييرات

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). Tag plan: `v0.1.0` on `main` after the first merge of the bible and editor branches; a MINOR for each roadmap step, a PATCH for fixes, MAJOR when the edits or design-pack contract changes incompatibly.

<div dir="rtl">

الصيغة وفق Keep a Changelog، والإصدارات وفق الترقيم الدلالي. خطة الوسوم: `v0.1.0` على `main` بعد أول دمج لفرعي المرجع والمحرر؛ ورقم فرعي (MINOR) لكل خطوة من خارطة الطريق، ورقم تصحيح (PATCH) للإصلاحات، ورقم رئيسي (MAJOR) عند تغيير غير متوافق في عقد التعديلات أو عقد حزمة التصميم.

</div>

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
