<div dir="rtl">

# خادم MCP لـ Business-Wrap (عربي) — الملف المقابل: README.md

خادم MCP عبر stdio فوق محرك Business-Wrap. محلي فقط: يقرأ ويكتب المسارات التي تعطيه إياها ولا يفتح أي منفذ شبكة. ويجب أن تنتهي المخرجات بالامتداد المذكور.

| الأداة | المعطيات | ما تفعله |
|---|---|---|
| `build_editor` | documents[], out .html, theme?, embed_fonts?, ui? | المحرر في ملف واحد لخدمة أو أكثر (`*.ar.json` و`*.en.json` هما النسختان) |
| `validate_edits` | edits | فحص العقد (الإصدار 1 بعد ترحيل الملفات الأقدم) ويعيد المشكلات |
| `apply_edits` | document, edits, out .json | يعيد تطبيق ملف التعديلات ويكتب الوثيقة المعدلة |
| `export_document` | document, edits?, locale?, out_dir, theme?, docx? | ملف PDF (Chrome بلا واجهة، بترميز المحرر نفسه) وملف DOCX |
| `export_design_pack` | out .json, theme? | السمة بصيغة `bw-design-pack` التي يستوردها المحرر |
| `harvest_model` | model, out_dir, name? | ملف BPMN أو draw.io أو قائمة خطوات ← نسختا الوثيقة والمحرر |
| `harvest_crawl` | config, out_dir | المرور على خدمة فعلية (Chrome ظاهر وتوقف للرمز المؤقت) ← النسختان والمحرر |
| `check_fonts` | theme? | أي الخطوط متاح وهل سيطبع أي منها بصيغة Type 3 |

## التشغيل
```
claude mcp add business-wrap -- npx -y -p business-wrap@0.8.2 business-wrap-mcp
# أو من نسخة محلية بعد npm ci:
node mcp/cli.mjs
```
الإعدادات من متغيرات البيئة أو من الملف المستثنى من git `.local/config.json`: `BW_FONT_DIR` (ملفات الخط TrueType) و`BW_CHROME` و`BW_POPPLER`.

## الاختبار
`npm run test:mcp` يشغل الخادم بالعميل الرسمي ويعرض الأدوات ثم يستدعي كل أداة على خدمة المثال.

</div>
