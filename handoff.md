# goals
Business-Wrap 0.11.0 (branch `upd`, worktree `Business-Wrap-wt-upd`, from main at 0da3688): update from inside the editor (auto-check at launch, a popup with the notes, one-click update that keeps every piece of user work and reopens the document where the user was) and a Settings page (About, Update, Preferences).

## current state
- Committed on `upd`, not pushed, not merged, not tagged: the Lead reviews, merges, pushes, watches CI and tags `v0.11.0`.
- Every suite run one by one (`out/gates.log`; copy in `Desktop\Business-Wrap-field-test\compare-0.11.0\gates.log`), version-sync 0.11.0, skill-html current, `security/check.py --all` 0 findings.
- Evidence: `Desktop\Business-Wrap-field-test\compare-0.11.0\` (viewport shots: settings-ar/en, popup-ar/en, progress-ar/en). README screenshots `docs/screens/update-popup.{ar,en}.png`.

## files in flight
- none open.

## changed
- New: `editor/settings.js` + `editor/settings.css` (the Settings drawer: About from `DATA.about`, Update from `BW_UPDATE`, Preferences writing bw:ui / bw:dir / bw:pages / bw:calm / bw:explainers / bw:update-auto), `tests/updater.test.mjs` (server endpoints with a mocked feed, apply of a fake newer release, rollback on forced failure and on a broken release, checksum refusal, state migration, re-wrap of old Save-HTML files), `tests/settings.test.mjs` (browser: popup, skip, 24 h throttle, toggle, file:// no requests, progress → reload to the same place with the edits, 0.9.1 / 0.10.0 Save-HTML opened and edited, axe), `tests/fixtures/saved/{0.9.1,0.10.0}.editor.html.gz` (Save-HTML of those tags with one edit, a comment and a snapshot; font URLs blanked).
- `editor/update.js` rewritten: auto-check (served only, once per 24 h, `bw:update-last`), popup (textContent only, AR+EN headings, Update now / Later / Skip), progress modal (download, backup, replace, verify, done via `/api/update/progress`), wait for the new version on `/api/version`, `bw:resume`, reload; `resumeAfterUpdate` (hoisted) loads the draft without the restore question.
- `engine/serve.mjs`: `/api/version`, `/api/update/check`, `/api/update/apply` (202, job), `/api/update/progress`; `installDir` and `onUpdated` options; the CLI is now a supervisor that restarts the server on exit code 75; GET / re-wraps an older editor (`rewrapEditorHtml`).
- `update/apply.mjs`: stages + `onStage`; `swapInstall` async with verify and an exact rollback (new files removed, every backed-up file copied back); dropped files removed only inside `CODE_ROOTS`; KEEP adds exports, harvest, profiles; `verifyInstall`; unzip via Windows' own tar or `unzip` on Linux; git mode resets to the old commit when verify fails.
- `update/check.mjs`: `checkForUpdate({current})`, `reason` on unknown, `notes` and `publishedAt` in the answer.
- `engine/edits.mjs`: `STATE_SCHEMA = 2`, `migrateEdition`, `migrateState` (forward-only, idempotent); `editor/editor.js` uses them (embedded editions, `readDraft` with a byte-for-byte backup `bw:draft-backup:<set>:v<n>`), Settings button + `settings` command + drawer; `editor/explainers.js` honours bw:explainers.
- `engine/build-editor.mjs`: `editorHtml` split out, `aboutInfo`, `rewrapEditorHtml`, `DATA.about`, `DATA.stateSchema`; settings.css in the UI css; update.js + settings.js appended.
- Icons (settings, refresh, download, info, sliders …), 53 AR/EN strings in `editor/ux-i18n.json`, `tests/a11y.test.mjs` adds the Settings state, `package.json` 0.11.0 + the two suites, manifests, CHANGELOG 0.11.0, bible 07 AR+EN, README pair (Updates section), SKILL.md, AGENTS.md, `assets/editor/business-wrap.html` rebuilt.

## failed attempts
- The popup's scrim had `display:grid`, which beats the `hidden` attribute: it stayed in the page invisibly (axe found the empty dialog). Fixed with `[hidden]{display:none!important}` in the shadow style.
- Shell heredocs that carry backslashes were mangled by the tool wrapper; scripts are written as files instead. Python on Windows wrote CRLF; normalised to LF.

## next step
1. Lead: review, merge `upd`, push, watch CI (CI has no Thmanyah and no gh auth: the new suites mock the feed and read no face; `zip`/`unzip` are on the ubuntu runner), tag `v0.11.0`.
2. Owner eye on `compare-0.11.0\` (run-once rule: not re-checked by a person here). A real end-to-end update needs a published release newer than the install: test it once 0.11.0 is installed and 0.11.1+ is tagged.

<div dir="rtl">

## خلاصة بالعربية
الفرع `upd` يحمل الإصدار 0.11.0: يفحص المحرر وجود تحديث عند فتحه عبر الخادم المحلي (مرة في اليوم على الأكثر)، ويعرض نافذة فيها ما الجديد مع «حدّث الآن» و«لاحقاً» و«تخطَّ هذا الإصدار»، ويحدّث بنقرة واحدة مع خطوات ظاهرة، ثم يعود إلى المستند حيث كان المستخدم دون أن يمس مستنداته أو تعديلاته أو سجلها، ويعيد كل شيء كما كان عند أي فشل. وصفحة الإعدادات فيها حول البرنامج والتحديث والتفضيلات. الخطوة التالية: يراجع القائد ويدمج ويرفع ويضع الوسم.

</div>

- 2026-10-28: int = main + upd, learn, print, tpl (0.11.0); learning hidden in Settings; gates/gaps2 lanes still to merge.
