# Automating the open editor (EN) · العربية أدناه

> Status 0.15.0: the MCP/CLI half is built and tested against a mock host; the host route and the tab bridge are wired in wave 2. Until then the tools answer `NO_HOST` or `NO_DOC`, never a guess.

## ⚡ The idea

🤖 An agent edits the document the user has OPEN, through the local host, and the user watches it happen. No browser driver, no CDP, no file round trip.

🔌 MCP tools (`mcp/editor-tools.mjs`): `editor_list_documents`, `editor_outline`, `editor_get`, `editor_ops`, `editor_action`, `editor_new`, `editor_import`, `host_health`. Terminal twin: `business-wrap editor <verb>` (always JSON on stdout, error JSON on stderr, exit 1).

```bash
business-wrap editor list --project DEMO
business-wrap editor outline --doc BW-SRS-001 --locale ar
business-wrap editor ops --doc BW-SRS-001 --locale ar --ops-file ops.json --agent "Claude (Opus 5.5)"
cat ops.json | business-wrap editor ops --doc BW-SRS-001 --locale ar --ops-file -
```

An op list or a pointer is never an argv value: give a file or stdin.

## 🔗 The frozen contract

| Piece | Shape |
|---|---|
| Call | `POST /api/editor/call` header `x-bw-token: <host.json token>` body `{tool, doc?, args}`; `tool` is `list get outline ops action new import` |
| Success | `200 {ok: true, result}`; an object `result` is spread into the tool answer, anything else arrives as `{ok: true, result}` |
| Errors | `404 {code:'NO_DOC'}` · `504 {code:'TAB_TIMEOUT', tab, lastBeatMs}` · `409 {code:'CONFLICT', path, live}` · `400 {code:'BAD_OP'\|'UNKNOWN_ACTION'}` · `401/403` is `AUTH` |
| Tab reply | the tab answers over SSE `req {id, tool, args}` with `POST /api/editor/reply {id, ok, result \| error}` |
| Health | `GET /api/host/health` → `{ok, version, pid, uptimeS, clients, tabs:[{tab, docs, live, lastBeatMs}], pendingRequests, warnings}` |

Result shapes the tools expect from the tab: `list` → `{documents:[{id, title, project, editions, savedAt, words}]}`; `get` → `{value, pointer, locale}`; `outline` → `{chapters:[…]}` (each node with its pointer); `ops` → `{applied, group, opsLen, hash}`; `action` → `{id, done}`; `new` → `{id, title, project}`.

## 🧱 Rules the tools enforce

- ✍️ `locale` is required for `editor_ops`; the mirror default is `false` and explicit.
- 🧪 A batch is checked against the edits contract v1 (op names, JSON-pointer paths, `value` where needed) before any call: `BAD_OP` costs no round trip.
- 🔁 One batch is ONE undo group, saved to the library and signed in the provenance log as the agent (never with the human's key). An op may carry `old`; a mismatch is `CONFLICT` and nothing is applied.
- 🛑 `editor_action` is an allow-list: `renumber`, `check`, `saveHtml`, `share {to, note}`, `exportPdf`. Anything else is `UNKNOWN_ACTION`.
- 🔒 The token authorises local-process control of the editor on `127.0.0.1` only (same trust as `open_in_editor`). `BW_HOST_URL` + `BW_HOST_TOKEN` point the tools at another host (tests).

## 🖥️ The page surface an automation can rely on (core, 0.15.0)

- 🚪 `?automation=1` on the editor URL: no resume dialog and no first-launch card; `<html data-bw-automation="1">` and `BW.automation === true` are set before anything else.
- 🟢 Ready: the window event `bw:ready` fires once, `<html data-bw-ready="1">` stays, and `await BW.whenReady(ms = 20000)` resolves (it rejects naming what still holds). Ready = booted + a 700 ms grace + no open dialog + no hold + the `#doc=` document on screen. `BW.ready` (boolean) is the older, earlier flag. `const release = BW.holdReady(reason)` makes readiness wait for an async decision (resume, profile); call `release()` after.
- 🪟 Dialogs carry `data-bw-dialog="<id>"` (`pf-first`, `resume`, `share`, `share-done`, `print`, `ask`, `confirm`, `dialog`; a clash gets a `-2` suffix). `BW.dialogs()` lists them, `BW.dialog(id)` returns one.
- 🎛️ `BW.runAction(id, arg?)` throws `unknown action: <id>` for an id that is not a command; `BW.hasAction(id)` asks first. Zoom: `BW.zoomTo(percent)` (25 to 400), `BW.setZoom(fraction)`, actions `zoomPct`, `zoomHeight` (fill the window height), `zoomFit`. Project actions `projExport` and `projImport` open the project dialogs.
- 🔤 Spelling: `BW.EXT.spell` = `{open, act, toggle, scan, enabled, next, prev, issues(), engine()}`; `issues()` lists `{ed, word, lang, path}`, `engine()` says whether the checker runs in a `worker` or the `host`. Server toggle: `BW.EXT.server` = `{start, stop, press, check, state}`; the window event `bw:server` carries `{online}`.
- 🏷️ Watermark reactions: dispatch `new CustomEvent('bw:wm', {detail: {id: 'W01'}})` on `window`; only `BW.EXT.watermark` plays them.
- 🖼️ `render_diagram` (MCP) renders one diagram model to a PNG through the same engine as the PDF (`model_file` or `model`, `locale`, `scale`); `merge` prints `diagramWarnings` (a figure that would print below 7 pt or overlap); `apply_edits` output has its numbers normalised, so the JSON equals what prints.

## 🩺 Errors an agent can branch on

`NO_HOST` (start one: `open_in_editor`) · `NO_DOC` (import it first) · `TAB_TIMEOUT` (the tab is hung: `host_health`) · `CONFLICT` · `BAD_OP` · `BAD_ARGS` · `UNKNOWN_ACTION` · `AUTH` · `HOST_ERROR` · `RESTART_REQUIRED` (the plugin was updated while the server ran: `/reload-plugins` or restart the client).

<div dir="rtl">

# أتمتة المحرر المفتوح (عربي)

> الحالة في 0.15.0: نصف MCP وسطر الأوامر مبنيان ومختبران مقابل خادم وهمي؛ ومسار الخادم وجسر اللسان يُوصَلان في الموجة الثانية. وإلى ذلك الحين تجيب الأدوات بـ `NO_HOST` أو `NO_DOC` ولا تخمّن.

## ⚡ الفكرة

🤖 يعدّل الوكيل الوثيقة التي فتحها المستخدم، عبر الخادم المحلي، والمستخدم يرى ذلك وهو يحدث. بلا مشغّل متصفح ولا CDP ولا دورة ملفات.

🔌 أدوات MCP (`mcp/editor-tools.mjs`): `editor_list_documents` و`editor_outline` و`editor_get` و`editor_ops` و`editor_action` و`editor_new` و`editor_import` و`host_health`. ونظيرها في الطرفية: `business-wrap editor <verb>` (JSON دائما في stdout، وخطأ JSON في stderr، ورمز خروج 1).

```bash
business-wrap editor list --project DEMO
business-wrap editor ops --doc BW-SRS-001 --locale ar --ops-file ops.json --agent "Claude (Opus 5.5)"
```

قائمة التعديلات أو المؤشر لا يمرّان وسيطا في سطر الأوامر أبدا: أعطِ ملفا أو stdin.

## 🔗 العقد المجمَّد

| الجزء | الشكل |
|---|---|
| الاستدعاء | `POST /api/editor/call` وترويسة `x-bw-token` (رمز host.json) والجسم `{tool, doc?, args}` |
| النجاح | `200 {ok: true, result}` |
| الأخطاء | `NO_DOC` (404) و`TAB_TIMEOUT` (504) و`CONFLICT` (409) و`BAD_OP` و`UNKNOWN_ACTION` (400) و`AUTH` (401/403) |
| رد اللسان | يجيب اللسان عبر SSE `req {id, tool, args}` بـ `POST /api/editor/reply {id, ok, result \| error}` |
| الصحة | `GET /api/host/health` |

## 🧱 قواعد تفرضها الأدوات

- ✍️ `locale` مطلوب في `editor_ops`، والمرآة افتراضيا `false` وبشكل صريح.
- 🧪 تُفحص الدفعة بعقد التعديلات الإصدار 1 قبل أي استدعاء، فيكلّف `BAD_OP` رحلة صفرا.
- 🔁 الدفعة الواحدة خطوة تراجع واحدة، تُحفظ في المكتبة وتُوقَّع في سجل المصدر باسم الوكيل (لا بمفتاح الإنسان أبدا). وإن حمل التعديل `old` فعدم التطابق `CONFLICT` ولا يُطبَّق شيء.
- 🛑 `editor_action` قائمة سماح: `renumber` و`check` و`saveHtml` و`share {to, note}` و`exportPdf`؛ وما سواها `UNKNOWN_ACTION`.
- 🔒 الرمز يخوّل التحكم بالمحرر من عملية محلية على `127.0.0.1` فقط (الثقة نفسها في `open_in_editor`).

## 🖥️ سطح الصفحة الذي تعتمد عليه الأتمتة (الأساس، 0.15.0)

- 🚪 `?automation=1` في رابط المحرر: لا نافذة استئناف ولا بطاقة أول تشغيل؛ ويُضبط `<html data-bw-automation="1">` و`BW.automation === true` قبل أي شيء.
- 🟢 الجاهزية: يُطلق حدث النافذة `bw:ready` مرة واحدة، ويبقى `<html data-bw-ready="1">`، ويتحقق `await BW.whenReady(ms = 20000)` (ويُرفض مسمّيا ما ما زال يحجز). الجاهزية = اكتمل الإقلاع + مهلة 700 ملّي ثانية + لا نافذة مفتوحة + لا حجز + ظهور وثيقة `#doc=`. و`BW.ready` (منطقي) علامة أقدم وأبكر. `const release = BW.holdReady(reason)` يجعل الجاهزية تنتظر قرارا غير متزامن (الاستئناف أو الملف الشخصي)؛ استدعِ `release()` بعده.
- 🪟 تحمل النوافذ `data-bw-dialog="<id>"` (`pf-first` و`resume` و`share` و`share-done` و`print` و`ask` و`confirm` و`dialog`؛ والتصادم يأخذ لاحقة `-2`). `BW.dialogs()` تسردها و`BW.dialog(id)` تعيد واحدة.
- 🎛️ `BW.runAction(id, arg?)` ترمي `unknown action: <id>` لمعرّف ليس أمرا؛ و`BW.hasAction(id)` تسأل قبلها. التكبير: `BW.zoomTo(percent)` (من 25 إلى 400) و`BW.setZoom(fraction)` والأوامر `zoomPct` و`zoomHeight` (ملء ارتفاع النافذة) و`zoomFit`. وأمرا المشروع `projExport` و`projImport` يفتحان نافذتي المشروع.
- 🔤 التدقيق الإملائي: `BW.EXT.spell` = `{open, act, toggle, scan, enabled, next, prev, issues(), engine()}`؛ تسرد `issues()` عناصر `{ed, word, lang, path}` وتقول `engine()` إن كان المدقق يعمل في `worker` أو في `host`. مفتاح الخادم: `BW.EXT.server` = `{start, stop, press, check, state}`؛ وحدث النافذة `bw:server` يحمل `{online}`.
- 🏷️ ردود العلامة المائية: أرسل `new CustomEvent('bw:wm', {detail: {id: 'W01'}})` على `window`؛ و`BW.EXT.watermark` وحده يشغّلها.
- 🖼️ الأداة `render_diagram` (MCP) تعرض نموذج مخطط واحد صورة PNG بالمحرك نفسه الذي يعرض PDF (`model_file` أو `model` و`locale` و`scale`)؛ و`merge` يطبع `diagramWarnings` (شكل سيُطبع بأقل من 7 نقاط أو بتداخل)؛ ويخرج `apply_edits` بأرقام مطبّعة فيطابق JSON ما يُطبع.

## 🩺 أخطاء يستطيع الوكيل أن يتفرع عليها

`NO_HOST` (شغّل خادما: `open_in_editor`) · `NO_DOC` (استورد الوثيقة أولا) · `TAB_TIMEOUT` (اللسان معلّق: `host_health`) · `CONFLICT` · `BAD_OP` · `UNKNOWN_ACTION` · `RESTART_REQUIRED` (حُدّثت الإضافة والخادم يعمل: `/reload-plugins` أو أعد تشغيل العميل).

</div>
