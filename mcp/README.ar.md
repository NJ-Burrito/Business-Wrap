<div dir="rtl">

# خادم MCP لـ Business-Wrap (عربي) · الملف المقابل: [README.md](README.md)

## ⚡ في عشر ثوان

🔌 أمر واحد:

```bash
claude mcp add business-wrap -- npx -y -p business-wrap@latest business-wrap-mcp
```

✅ يحتاج Node 20 فأحدث وuv، وChrome أو Edge لملف PDF.

🔒 محلي فقط: لا منفذ شبكة، ويقرأ ويكتب المسارات التي تعطيه إياها فقط.

🔤 الخطوط تعمل من أول مرة (نسخة ثمانية الاحتياطية المضمنة)، و`BW_FONT_DIR` له الأولوية.

**انتقل إلى:** [🧰 الأدوات](#-الأدوات) · [▶️ التشغيل](#️-التشغيل) · [🧪 الاختبار](#-الاختبار)

## 🧰 الأدوات

خادم MCP عبر stdio فوق محرك Business-Wrap، فيه 15 أداة (عدا أدوات التعلّم المحلي). ويجب أن تنتهي المخرجات بالامتداد المذكور.

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
| `check_fonts` | theme? | أي الخطوط متاح وهل سيطبع أي منها بصيغة Type 3 |
| `check_update` | force? | هل يوجد إصدار أحدث (طلب واحد في اليوم على الأكثر) |
| `apply_update` | confirm | يثبت الإصدار الأحدث ويحفظ إعداداتك وملفاتك، ويرفض دون `confirm: true` |

## ▶️ التشغيل

```bash
claude mcp add business-wrap -- npx -y -p business-wrap@latest business-wrap-mcp
# أو من نسخة محلية بعد npm ci:
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
