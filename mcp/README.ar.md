<div dir="rtl">

# خادم MCP لـ Business-Wrap (عربي) · الملف المقابل: [README.md](README.md)

## ⚡ في عشر ثوان

🔌 أمر واحد (الإصدار 0.15.3 من وسم GitHub، فسجل npm ما زال على 0.12.0؛ أو إضافة Claude Code، أو نسخة محلية أدناه):

```bash
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.15.3 business-wrap-mcp
```

✅ يحتاج Node 20 فأحدث وuv، وChrome أو Edge لملف PDF.

🔒 محلي فقط: لا منفذ شبكة، ويقرأ ويكتب المسارات التي تعطيه إياها فقط.

🔤 الخطوط تعمل من أول مرة (نسخة ثمانية الاحتياطية المضمنة)، و`BW_FONT_DIR` له الأولوية.

**انتقل إلى:** [🧰 الأدوات](#-الأدوات) · [▶️ التشغيل](#️-التشغيل) · [🧪 الاختبار](#-الاختبار)

## 🧰 الأدوات

خادم MCP عبر stdio فوق محرك Business-Wrap، فيه 23 أداة (عدا أدوات التعلّم المحلي). ويجب أن تنتهي المخرجات بالامتداد المذكور.

| الأداة | المعطيات | ما تفعله |
|---|---|---|
| `build_editor` | documents[], out .html, theme?, embed_fonts?, ui? | المحرر في ملف واحد لخدمة أو أكثر (`*.ar.json` و`*.en.json` هما النسختان) |
| `validate_edits` | edits | فحص العقد (الإصدار 1 بعد ترحيل الملفات الأقدم) ويعيد المشكلات |
| `apply_edits` | document, edits, out .json | يعيد تطبيق ملف التعديلات ويكتب الوثيقة المعدلة |
| `export_document` | document, edits?, locale?, out_dir, theme?, docx? | ملف PDF (Chrome بلا واجهة، بترميز المحرر نفسه) وملف DOCX |
| `export_design_pack` | out .json, theme? | السمة بصيغة `bw-design-pack` التي يستوردها المحرر |
| `diagram_mermaid` | mermaid?, model_file?, locale? | مخطط Mermaid ← نموذج مخطط بأسلوب سير العمل المعتمد، أو المخطط عائدا إلى Mermaid |
| `harvest_model` | model, out_dir, name?, roles?, open? | ملف BPMN أو draw.io أو قائمة خطوات ← نسختا الوثيقة والمحرر، و`open: true` يفتحها في المحرر أيضاً |
| `harvest_merge` | crawl, model, out_dir, name?, roles? | دمج ما جمع من الخدمة الفعلية مع نموذج العملية في وثيقة واحدة بنسختيها |
| `harvest_crawl` | config, out_dir, open? | المرور على خدمة فعلية (Chrome ظاهر وتوقف للرمز المؤقت، ولا يرسل طلباً أبداً) ← النسختان والمحرر |
| `harvest_sources` | sources[], out_dir, name?, roles?, open? | ملفاتك أو مجلداتك: BPMN وdraw.io وخطوات YAML/JSON وPDF وDOCX وHTML وTXT وMD ← وثائق، وما لا يُقرأ يُذكر في المتروك |
| `open_in_editor` | documents[]? \| editor? \| doc_id? | يشغّل الخادم المحلي عند الحاجة ويفتح المحرر في Edge، ويعيد `{url, doc_id}` |
| `close_editor` | (لا شيء) | يوقف كل خادم ونافذة Edge شغّلها هذا التثبيت |
| `editor_list_documents` | project? | الوثائق في مكتبة المحرر عند الخادم العامل (ويشغّل الخادم إن لم يكن يعمل) |
| `editor_outline` | doc, locale? | الفصول والأقسام وأنواع الكتل ومعرّفاتها مع مؤشر JSON لكل عقدة، من المحرر الحي |
| `editor_get` | doc, pointer?, locale? | القيمة عند مؤشر في الوثيقة كما يحملها المحرر الآن (بما فيها التعديلات غير المحفوظة) |
| `editor_ops` | doc, ops[], locale, mirror?, agent?, group? | يطبّق دفعة تعديلات على الوثيقة المفتوحة في المحرر خطوة تراجع واحدة، ويحفظها ويوقّعها باسم الوكيل؛ و`old` الخاطئ يعيد `CONFLICT` ولا يطبّق شيئا |
| `editor_action` | doc, id, args? | ترقيم وفحص وحفظ HTML ومشاركة {to, note} وتصدير PDF لوثيقة في المحرر |
| `editor_new` | title, project?, template? | وثيقة فارغة جديدة في مكتبة المحرر |
| `editor_import` | document? | file?, project? | يضع وثيقة في مكتبة المحرر (وفي مشروع) |
| `host_health` | (لا شيء) | الخادم وألسنته وأي لسان معلّق (`lastBeatMs` فوق 15000) |
| `check_fonts` | theme? | أي الخطوط متاح وهل سيطبع أي منها بصيغة Type 3 |
| `check_update` | force? | هل يوجد إصدار أحدث (طلب واحد في اليوم على الأكثر) |
| `apply_update` | confirm | يثبت الإصدار الأحدث في نسخة محلية أو تثبيت npx ويحفظ إعداداتك وملفاتك، ويرفض دون `confirm: true`. وفي إضافة Claude Code لا يغيّر شيئا ويعيد `{plugin: true, how}` (فالعميل هو الذي يحدّث الإضافة) |

أدوات `editor_*` تعمل على الوثيقة التي فتحها المستخدم، عبر الخادم المحلي، فيرى التعديل وهو يحدث. وأخطاؤها تحمل `code`: `NO_HOST` و`NO_DOC` و`TAB_TIMEOUT` و`CONFLICT` و`BAD_OP` و`UNKNOWN_ACTION` و`RESTART_REQUIRED`. وتعمل الأفعال نفسها من الطرفية بـ `business-wrap editor <verb>`. العقد: [docs/automation.md](../docs/automation.md).

## 🔄 بعد تحديث الإضافة

🔁 يبقي Claude Code خادم MCP العامل على مجلد الإصدار الذي بدأ منه. بعد `/plugin update business-wrap` شغّل `/reload-plugins` (وإن كان العميل بلا هذا الأمر فأعد تشغيله). وإلى أن تفعل، تجيب كل أداة بـ `RESTART_REQUIRED` مع الإصدار الذي حمّله الخادم والمثبّت على القرص، بدل أن تشغّل شيفرة نصفها قديم.

⏳ الخادم الذي فشل بدؤه مرة قد يبقى «غير متصل» حتى 15 دقيقة (يخزّن Claude Code الفشل)، و`/reload-plugins` أو تعديل إعداد الإضافة يعيد المحاولة فورا.

🩺 `business-wrap doctor` (أو `/business-wrap:doctor`) يطبع الإصدار على القرص ومكان الحالة وآخر بدايات الخادم مع زمن `initialize` وأي انحراف. والسجل `mcp.log` في مجلد الحالة.

💾 في إضافة Claude Code تعيش الحالة (host.json وملف Edge وworkspace.json والإعدادات) في مجلد بيانات الإضافة الذي ينجو من التحديثات، وأول تشغيل بعد التحديث ينسخها من مجلد الإصدار السابق.

## ▶️ التشغيل

```bash
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.15.3 business-wrap-mcp
# أو من نسخة محلية (دون npm ci: حزمة MCP مضمّنة في mcp/vendor/sdk.mjs):
node mcp/cli.mjs
```

<details>
<summary>⚙️ الإعدادات</summary>

من متغيرات البيئة أو من الملف المستثنى من git `.local/config.json`:

- `BW_FONT_DIR`: ملفات خطك بصيغة TrueType
- `BW_CHROME`: نسخة Chrome أو Edge التي تطبع بها
- `BW_POPPLER`: مجلد poppler (`pdftotext` و`pdffonts`) الذي تقرأ به الاختبارات ملفات PDF

</details>

## 🧪 الاختبار

`npm run test:mcp` يشغل الخادم بالعميل الرسمي ويعرض الأدوات ثم يستدعي كل أداة على خدمة المثال.

</div>
