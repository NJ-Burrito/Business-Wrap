<div dir="rtl">

<h1 align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="brand/logo/lockup-ar-dark.svg"><img src="brand/logo/lockup-ar.svg" alt="بزنس راب" height="64"></picture></h1>

<p align="center">عربي · الملف المقابل: <a href="README.md">README.md</a></p>

**وثائق متطلبات محكومة وثنائية اللغة: أدلة تدخل، ونسخة HTML قابلة للتعديل مطابقة لـ PDF وDOCX في الوسط، وتخرج PDF وDOCX والتعديلات والسمة. وخلف كل قاعدة فحص.**

| ابدأ من هنا | |
|---|---|
| ما هو والقواعد | `bible/README.ar.md` |
| التثبيت وأول تشغيل (Windows) | `docs/guide.ar.md` |
| مدخل المهارة (لـ Claude) | `SKILL.md` |
| مخطط البنية | `docs/architecture.md` |
| القرارات وخارطة الطريق والخصوصية | `docs/decisions.ar.md` و`docs/roadmap.ar.md` و`docs/privacy.ar.md` |
| المسرد بالعربية والإنجليزية | `docs/glossary.md` |
| البحث خلف الاختيارات | `docs/research/README.ar.md` |

## التثبيت

**إضافة Claude Code** (المهارة وخادم MCP معاً؛ تحتاج صلاحية الوصول إلى هذا المستودع):
```
/plugin marketplace add NJ-Burrito/Business-Wrap
/plugin install business-wrap@business-wrap
```
ثم قل: **«ابنِ وثيقة المتطلبات لـ…»** أو **«افتحها في المحرر»**.

**خادم MCP وحده** (stdio ومحلي فقط؛ يحتاج Node 20 أو أحدث، وChrome أو Edge لملف PDF، و`uv` لملف DOCX):
```
claude mcp add business-wrap -- npx -y -p business-wrap@0.8.4 business-wrap-mcp
```
ومن نسخة محلية بدل npm: `npm ci` ثم `claude mcp add business-wrap -- node <clone>/mcp/cli.mjs`.
الأدوات: `build_editor` و`validate_edits` و`apply_edits` و`export_document` و`export_design_pack` و`check_fonts`، والتفاصيل في `mcp/README.ar.md`.

## لوكلاء الذكاء الاصطناعي
‏Claude Code أو Claude Desktop أو Codex أو Cursor أو Gemini CLI أو أي عميل MCP: اقرأ `AGENTS.md` (و`SKILL.md`). في بداية أي مهمة على Business-Wrap شغل `npx business-wrap update --check` (أو أداة MCP ‏`check_update`)؛ وإن وجد إصدار أحدث فأخبر المستخدم بسطر واحد مع ثلاث نقاط، واعرض الأمر `npx business-wrap update --apply --yes`. لا تحدث دون موافقته؛ وبعد التحديث اتبع «ملاحظات الترحيل» (`npx business-wrap update --notes`). ويعلن خادم MCP عن التحديث في تعليمات التهيئة أيضا. التفاصيل: `bible/07-updates.ar.md`.

## المجلدات
| المجلد | يحوي |
|---|---|
| `bible/` | المنهج بالعربية والإنجليزية، والعقود الآلية |
| `engine/` و`editor/` و`samples/` و`tests/` | محرك محرر HTML ومحرك العرض ووثيقة المثال والاختبارات |
| `palette/` و`typography/` | الرموز التصميمية بصيغة DTCG وفحوصها |
| `design/` | حزم التصميم (`ours/` وخانة الرفع `custom/`) و`build.py` |
| `fonts/` | ملف تعريف الخطوط فقط (الترخيص يمنع رفع الملفات) |
| `logos/` | فارغ: توضع شعاراتك هنا، وهي مستثناة من git |
| `security/` | الفحص الذي يبقي محتوى العملاء والأسرار خارج المستودع |

## ثلاثة أوامر
```powershell
$env:PYTHONUTF8 = "1"
python design/build.py        # فحص التباين ثم بناء السمة
python security/check.py      # الشجرة والتاريخ ورسائل الالتزام
git config core.hooksPath .githooks
```

## المحرر
محرر HTML محلي في ملف واحد **هو** تخطيط الطباعة نفسه: الصفحة التي تعدلها هي الترميز وملف الأنماط اللذان تطبع منهما PDF (`engine/render.mjs`). وتسجل التعديلات في ملف تعديلات (`bible/contracts/edits.schema.json` الإصدار 1)، ثم تصدر إلى PDF وDOCX.

```powershell
npm install        # playwright-core only (drives the local Chrome)
npm run sample     # builds out/sample/event-permit.editor.html
npm run serve      # http://127.0.0.1:4317/ - one-click PDF + DOCX
npm test           # the editor check, both editions
node engine/build-editor.mjs <doc.json | folder>... --out out/my.editor.html [--theme design/ours/theme.json] [--embed-fonts] [--ui ar|en]
node engine/export.mjs --doc <document.json> [--edits edits.json] [--locale ar|en] [--out dir]
```
عند فتحه من القرص (file://) ينزل زر «PDF وDOCX» ملف JSON المعدل ويعرض أمر `export.mjs`؛ وعند فتحه عبر `npm run serve` يصدر بنقرة واحدة.

### كل شيء قابل للتحرير
كل نص مطبوع (التسميات ورؤوس الجداول والعنوان والعنوان الفرعي ورمز الغلاف وأسماء الحقول وقيمها)، وكل خاصية تصميم (لوحة التصميم بمعاينة حية)، وعنصر واحد بمفرده (**نسّق هذا**)، وأجزاء القالب (إظهار وإخفاء وترتيب)، وCSS متقدم منقّى. وكل ذلك قابل للتراجع، وينتقل في ملف التعديلات، ويصل إلى PDF وDOCX. انظر `bible/04-edits-contract.ar.md`.

### ابدأ وثيقة (الاستخراج)
> **الأمان: المرور لا يقدّم طلباً أبداً إلا إذا طلبت ذلك.** المرور تشغيل تجريبي: يقرأ كل خطوة ويتوقف قبل الإجراء النهائي («إرسال» و«تقديم» و«حفظ وإرسال» و«تأكيد» و«دفع»، وSend وSubmit وConfirm وPay وFinish)، ويسجل «stopped before submit». ولتقديم طلب حقيقي يلزم `submit: true` في الإعدادات **و**`--yes-file-real-request` (أو كتابة YES عند السؤال). والمحرر وأداة MCP لا يقدّمان أبداً. وتؤخذ الحالات حينها من النموذج أو من قائمة `statuses` في الإعدادات.

من نموذج إجراء (`npm run harvest:model -- <bpmn|drawio|yaml>`) أو بالمرور على الخدمة الفعلية (`npm run harvest:crawl -- <crawl.json>`)؛ والطريقان يعطيان ملفي الوثيقة بالعربية والإنجليزية ومحرراً. انظر `bible/08-harvest.ar.md`.

### المحرر باختصار
- **الشريط العائم** (أعلى الصفحة): الشعار، والخدمة، ومبدّل اللغة **«ع» / «E»** (لغة الواجهة ونسخة الوثيقة)، والتراجع والإعادة، والصورة وإضافة شعار، والبحث، والصفحات، والحفظ وتصدير PDF + DOCX، وعداد التغييرات الحي، ومبدّل اتجاه التخطيط **RTL / LTR** (مستقل عن اللغة؛ يتبعها حتى تختار، ثم يُحفظ اختيارك)، والعرض، والأوامر.
- **شريط التحديد** يظهر بجانب ما تحدده (كتلة، خلية جدول، شعار، صورة) وفيه الأوامر الخاصة به فقط.
- **لوحة الأوامر** (`Ctrl+K`): كل الأوامر، قابلة للبحث، مجمّعة، مع اختصار كل منها.
- **الشعارات والصور** توضع في أي مكان: اسحبها إلى الغلاف أو الترويسة أو بجانب أي كتلة، وغيّر حجمها من الزاوية، وحرّكها بالأسهم، واحذفها بـ Delete، مع أدلة محاذاة اختيارية. ويُحفظ الموضع في الوثيقة ويُطبع في المكان ذاته.
- **وضع التركيز** (`F`) يخفي الأدوات، و**الوضع الهادئ** يوقف كل الحركة (ويعمل تلقائياً عند طلب النظام تقليل الحركة). و**خطافات الويب** (لوحة) متوقفة حتى تضيف رابطاً، وتُرسل عبر `npm run serve`.

### إعدادات الجهاز (لا ترفع إلى المستودع أبدا)
الملف `.local/config.json` (مستثنى من git) أو متغيرات البيئة؛ ومتغيرات البيئة تغلب.

| المفتاح | متغير البيئة | الوظيفة |
|---|---|---|
| `fontDir` | `BW_FONT_DIR` | جذر الخطوط: `<family>/otf` و`woff2` والمجلد المحلي `ttf/` الذي يبحث فيه ملف التعريف أولا |
| `watermarkDir` | `BW_WATERMARK_DIR` | صور العلامة المائية للأداة (svg أو png)، في واجهة المحرر فقط |
| `chrome` | `BW_CHROME` | ملف تشغيل Chrome أو Edge |
| `poppler` | `BW_POPPLER` | مجلد `bin` لأداة poppler (pdftotext وpdffonts في الاختبارات) |
| `brandDir` | `BW_BRAND_DIR` | مجلد شعار الأداة (الافتراضي `brand/logo/`)، للواجهة فقط |

المتصفحات المدعومة: Chrome وEdge بآخر إصدار مستقر (Chromium 120 فأحدث)؛ ولا يدعم Firefox ولا Safari (لا يدعم Firefox التحرير `plaintext-only`، ومسار الطباعة مسار Chromium).

| المسار | الدور |
|---|---|
| `engine/render.mjs` | ملف JSON للوثيقة ← HTML الطباعة (في المتصفح وفي Node) |
| `engine/edits.mjs` | عقد التعديلات: التطبيق والترحيل والتحقق والدمج وطي الحروف في البحث والاستبدال والمقارنة |
| `engine/build-editor.mjs` | يجمع المحرر في ملف واحد (مع سياسة أمان المحتوى وبصمة نص التطبيق) |
| `engine/export.mjs` و`engine/pdf_post.py` | PDF (Chrome بلا واجهة مع أرقام الصفحات) وDOCX |
| `engine/docx/` | منشئ DOCX (python-docx)، والتسميات من `engine/i18n.json` |
| `engine/serve.mjs` | خادم على 127.0.0.1 فقط للتصدير بنقرة واحدة |
| `engine/i18n.json` | كل نصوص الواجهة والتسميات المطبوعة، بالعربية والإنجليزية |
| `editor/` | تطبيق المحرر وأنماطه |
| `samples/event-permit/` | الخدمة النموذجية مجهولة الهوية، بالعربية والإنجليزية |
| `tests/` | `editor.test.mjs` (المتحقق)، و`fidelity.mjs` و`pdf_compare.py` |

خاص ومملوك: انظر `LICENSE`. ولا يرفع أي شيء: انظر `docs/privacy.ar.md`.

</div>
