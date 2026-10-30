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

## 🩺 أخطاء يستطيع الوكيل أن يتفرع عليها

`NO_HOST` (شغّل خادما: `open_in_editor`) · `NO_DOC` (استورد الوثيقة أولا) · `TAB_TIMEOUT` (اللسان معلّق: `host_health`) · `CONFLICT` · `BAD_OP` · `UNKNOWN_ACTION` · `RESTART_REQUIRED` (حُدّثت الإضافة والخادم يعمل: `/reload-plugins` أو أعد تشغيل العميل).

</div>
