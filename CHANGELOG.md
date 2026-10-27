# Changelog / سجل التغييرات

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). Tag plan: `v0.1.0` on `main` after the first merge of the bible and editor branches; a MINOR for each roadmap step, a PATCH for fixes, MAJOR when the edits or design-pack contract changes incompatibly.

<div dir="rtl">

الصيغة وفق Keep a Changelog، والإصدارات وفق الترقيم الدلالي. خطة الوسوم: `v0.1.0` على `main` بعد أول دمج لفرعي المرجع والمحرر؛ ورقم فرعي (MINOR) لكل خطوة من خارطة الطريق، ورقم تصحيح (PATCH) للإصلاحات، ورقم رئيسي (MAJOR) عند تغيير غير متوافق في عقد التعديلات أو عقد حزمة التصميم.

</div>

## [Unreleased] → v0.1.0

### Added / أضيف
- Bible (AR + EN): pipeline, document standard, gates, edits contract, lessons, design system. / المرجع بالعربية والإنجليزية.
- Contracts: `edits.schema.json` v1, `design-pack.schema.json`. / العقود.
- DTCG tokens: palette (5 ramps, 19 roles, diagram set) and typography (sizes, weights, line heights, space, rules, page geometry). / الرموز التصميمية.
- `palette/check.py` contrast gate, `design/build.py` pack → theme. / فحص التباين وبناء السمة.
- Font manifest (no binaries), logo and design upload slots. / ملف تعريف الخطوط وخانات الرفع.
- `security/check.py` + `gitleaks.toml`: secrets, client terms (hashed), ID/phone shapes, emails, local paths, font binaries, image metadata, files over 5 MB; tree + history + commit messages. / فحص الأمان.
- CI workflow, pre-commit and pre-push hooks, repo templates, docs (guide, glossary, architecture, decisions, roadmap, privacy). / التكامل المستمر والخطافات والتوثيق.
