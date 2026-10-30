<div dir="rtl">

<h1 align="center">بزنس راب (Business-Wrap): مولد وثائق متطلبات ثنائية اللغة (عربي وإنجليزي)</h1>

<p align="center"><img src="https://raw.githubusercontent.com/NJ-Burrito/Business-Wrap/main/site/assets/media/hero-ar.gif" alt="بزنس راب: أدلة تدخل، ووثيقة متطلبات واحدة بالعربية والإنجليزية تخرج" width="720"></p>

<h3 align="center">📄 أدلة تدخل، ووثيقة متطلبات واحدة بالعربية والإنجليزية تخرج.</h3>

<p align="center">
  <a href="https://nj-burrito.github.io/Business-Wrap/ar/"><img src="https://img.shields.io/badge/website-nj--burrito.github.io-d3c6a6?labelColor=001e3d" alt="الموقع"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/releases/latest"><img src="https://img.shields.io/github/v/release/NJ-Burrito/Business-Wrap?label=release&color=d3c6a6&labelColor=001e3d" alt="الإصدار"></a>
  <a href="https://www.npmjs.com/package/business-wrap"><img src="https://img.shields.io/npm/v/business-wrap?label=npm&logo=npm&logoColor=be9a41&color=d3c6a6&labelColor=001e3d" alt="حزمة npm"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/actions/workflows/gates.yml"><img src="https://github.com/NJ-Burrito/Business-Wrap/actions/workflows/gates.yml/badge.svg" alt="الفحوص"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-d3c6a6?labelColor=001e3d" alt="الرخصة: MIT"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/.claude-plugin/marketplace.json"><img src="https://img.shields.io/badge/Claude%20Code-plugin-d3c6a6?labelColor=001e3d" alt="إضافة Claude Code"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/mcp/server.json"><img src="https://img.shields.io/badge/MCP-server-d3c6a6?labelColor=001e3d" alt="خادم MCP"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/README.md"><img src="https://img.shields.io/badge/Arabic%20%2B%20English-first--class-d3c6a6?labelColor=001e3d" alt="العربية والإنجليزية"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/stargazers"><img src="https://img.shields.io/github/stars/NJ-Burrito/Business-Wrap?style=social" alt="النجوم"></a>
</p>

## ⚡ في عشر ثوان

📥 **الأدلة تدخل:** نموذج الإجراء (BPMN أو draw.io أو YAML) أو جولة في الخدمة الحية.

✍️ **التحرير على الصفحة التي تطبع:** العربية من اليمين إلى اليسار، والإنجليزية من اليسار إلى اليمين.

📄 **المخرج:** PDF وDOCX، والخطوط مضمنة نصا حقيقيا قابلا للتحديد.

🆓 مجاني ومفتوح المصدر (رخصة MIT). يعمل على جهازك. لا يرفع شيء.

**انتقل إلى:** [▶️ البدء السريع](#️-البدء-السريع) · [✅ قبل أن تبدأ](#-قبل-أن-تبدأ) · [🧩 التثبيت](#-التثبيت) · [🚀 الأوامر](#-الأوامر) · [🔁 التحديثات](#-التحديثات) · [🧰 ماذا يفعل](#-ماذا-يفعل) · [🔤 الخطوط](#-الخطوط) · [🤖 لوكلاء الذكاء الاصطناعي](#-لوكلاء-الذكاء-الاصطناعي) · [🔒 هل هو آمن؟](#-هل-هو-آمن) · [❓ أسئلة](#-أسئلة) · [🆘 مشكلة؟](#-مشكلة)

## ▶️ البدء السريع

📂 افتح طرفية في مجلد Business-Wrap: `cd Business-Wrap`

📦 ثبت مرة واحدة: `npm ci`

▶️ شغل الخادم المحلي: `npm run serve` (في المرة الأولى يبني محرر المثال)

🌐 افتح العنوان الذي يطبعه `http://127.0.0.1:4317/` في Chrome أو Edge.

⚠️ افتح المحرر دائما **عبر الخادم المحلي**، لا بالنقر المزدوج على ملف HTML. التصدير والطباعة وقائمة الطابعات والتحديث تحتاج الخادم.

## ✅ قبل أن تبدأ

| تحتاج إلى | تحقق منه | لماذا |
|---|---|---|
| 🟢 Node 20 أو أحدث | `node --version` | يشغل كل شيء |
| 🐍 uv | `uv --version` | يشغل خطوات Python (إنهاء PDF وبناء DOCX) مع حزمها، دون تثبيت بـ pip |
| 🌐 Chrome أو Edge | افتحه مرة | يطبع ملف PDF |
| 🌱 git | `git --version` | نسخ المستودع وسوق الإضافات |

📌 ليس لديك uv؟ ثبته: https://docs.astral.sh/uv/getting-started/installation/ (ودونه يعود بزنس راب إلى `python` العادي ويخبرك بالحزم التي يحتاجها).

🧪 اختياري، للفحوص فقط: poppler (`pdffonts -v`).

## 🧩 التثبيت

🧩 **إضافة Claude Code** (المهارة وخادم MCP وأوامر `/business-wrap:` معا؛ تعمل من ملفات الإضافة نفسها عبر Node، دون npm install ودون سجل npm):

<div dir="ltr">

```
/plugin marketplace add NJ-Burrito/Business-Wrap
/plugin install business-wrap@business-wrap
```

</div>

💬 ثم قل: **«ابن وثيقة متطلبات …»** أو **«افتحها في المحرر»**.

🔌 **خادم MCP وحده** (أي عميل MCP، stdio محلي؛ الإصدار 0.14.0 من وسم GitHub، فسجل npm ما زال على 0.12.0):

<div dir="ltr">

```
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.14.0 business-wrap-mcp
```

</div>

💻 **من المصدر:** `git clone https://github.com/NJ-Burrito/Business-Wrap` ثم [البدء السريع](#️-البدء-السريع).

<details>
<summary>📦 طرق أخرى: ملف الإصدار المضغوط، وخادم MCP من نسخة محلية، وقائمة الأدوات</summary>

- ملف الإصدار: `business-wrap-<version>.zip` مع `.sha256` من https://github.com/NJ-Burrito/Business-Wrap/releases/latest. وفي ذلك المجلد: `npm ci`.
- خادم MCP من نسخة محلية: `claude mcp add business-wrap -- node <path-to>/Business-Wrap/mcp/cli.mjs` (دون `npm ci`)
- الأدوات (15): `build_editor` و`validate_edits` و`apply_edits` و`export_document` و`export_design_pack` و`check_fonts` و`harvest_model` و`harvest_crawl` و`harvest_merge` و`harvest_sources` و`open_in_editor` و`close_editor` و`diagram_mermaid` و`check_update` و`apply_update`، إضافة إلى أدوات `learning_*`. وأداة الحصاد التي تُعطى `open: true` تفتح نتيجتها في المحرر. التفاصيل في [mcp/README.ar.md](mcp/README.ar.md).

</details>

## 🚀 الأوامر

<div dir="ltr">

```powershell
npm ci                 # install
npm run serve          # http://127.0.0.1:4317/ : builds the sample the first time; one-click PDF + DOCX
npm run sample         # rebuild out/sample/event-permit.editor.html
npm test               # every suite, one after another
```

</div>

<details>
<summary>📝 وثائقك أنت</summary>

<div dir="ltr">

```powershell
node engine/build-editor.mjs <doc.json | folder>... --out out/my.editor.html [--theme design/ours/theme.json] [--embed-fonts] [--ui ar|en]
node engine/export.mjs --doc <document.json> [--edits edits.json] [--locale ar|en] [--out dir]
```

</div>

عند فتح المحرر من الجهاز (file://) ينزل زر «PDF + DOCX» ملف الوثيقة المعدلة ويعرض أمر `export.mjs`، ومن خلال `npm run serve` يصدر بنقرة واحدة. المحرر الجاهز هو `assets/editor/business-wrap.html`.

</details>

<details>
<summary>⌨️ أوامر «/» في Claude Code (0.13.0)</summary>

عند تثبيت Business-Wrap إضافةً في Claude Code تظهر هذه الأوامر؛ اكتب `/` لتراها. كل أمر يشغّل `engine/cli.mjs` (الأمر نفسه `business-wrap <verb>` الذي تستطيع تشغيله بنفسك، بلا ذكاء اصطناعي وبلا شبكة) ويقول في سطر واحد ما فعله.

| الأمر | ماذا يفعل |
|---|---|
| `/business-wrap:open [doc.json\|folder\|editor.html]` | يشغّل الخادم المحلي ويفتح المحرر في Edge (وثيقة فارغة إن لم يُعطَ ملف) |
| `/business-wrap:close` | يوقف كل خادم ويغلق كل نافذة Edge فتحها هذا التثبيت |
| `/business-wrap:status` | الإصدار، والخوادم العاملة، وعدد الخطوات التي عولجت ذاتيًا |
| `/business-wrap:new ["Title"]` | زوج وثيقة فارغ جديد (عربي وإنجليزي) يُفتح في المحرر |
| `/business-wrap:harvest <url\|crawl.json\|model\|PDF/DOCX/HTML\|folder>` | يحصد خدمة حية (دون إرسال أبدًا) أو نموذج إجراء أو وثيقة، ثم يفتحها |
| `/business-wrap:import <file\|folder ...>` | مصادرك (BPMN وdraw.io وYAML وPDF وDOCX وHTML) إلى وثائق |
| `/business-wrap:build <doc.json\|folder> --out <editor.html>` | يبني ملف المحرر |
| `/business-wrap:export <doc.json> [ar\|en]` | PDF وDOCX، ثم فحوص العرض والتصدير |
| `/business-wrap:verify-history <file>` | يفحص السجل الكاشف للعبث |
| `/business-wrap:report <from> <to>` | تقرير العمل لفترة |
| `/business-wrap:update [--check\|--notes\|--apply --yes]` | يفحص، أو يعرض الجديد، أو يثبّت (بعد موافقتك فقط) |

ودون Claude Code تعمل الأوامر نفسها بـ `npm run cli -- <verb>` (مثلًا `npm run cli -- open samples/event-permit` و`npm run host:close`). كل أمر يعمل دون شبكة ودون ذكاء اصطناعي.

</details>

## 🔁 التحديثات

✨ **من داخل المحرر:** افتحه عبر `npm run serve`. الإصدار الأحدث يظهر في نافذة مع **حدث الآن** و**لاحقا** و**تخط هذا الإصدار**.

🛡️ «حدث الآن» يأخذ نسخة احتياطية أولا، ويستبدل ملفات البرنامج فقط، ويعيد الإصدار السابق عند أي فشل.

🧩 **إضافة Claude Code:** `/plugin marketplace update business-wrap` ثم `/plugin update business-wrap`.

⌨️ **الطرفية أو الوكيل:** `node update/cli.mjs --check` (طلب واحد في اليوم على الأكثر)، و`--apply --yes` للتثبيت، و`--notes` لما تغير.

🔓 المستودع عام: لا رمز ولا تسجيل دخول. ولا يجري أي تحديث دون موافقتك.

<details>
<summary>📖 كيف يعمل التحديث من داخل المحرر</summary>

عند الفتح (عبر `npm run serve -- <editor.html>` أو `node engine/serve.mjs <editor.html>`) يفحص المحرر وجود إصدار أحدث، مرة في اليوم على الأكثر ودون أن يعطل شيئا. «حدث الآن» ينزل الإصدار ويتحقق من بصمته، ويأخذ نسخة احتياطية، ويستبدل ملفات البرنامج فقط، ويتحقق من الإصدار الجديد، ثم يعيد تشغيل الخادم ويفتح مستندك حيث كنت. مستنداتك وتعديلاتك وسجلها وحزم التصميم والخطوط والشعارات و`out/` و`.local/` لا تمس أبدا. و**الإعدادات** (قسم «العرض» في الشريط، أو Ctrl+K) تعرض معلومات البرنامج، وحالة التحديث مع **تحقق الآن** ومفتاح الفحص التلقائي، وتفضيلاتك. وإن فتح المحرر من ملف على الجهاز (`file://`) فالصفحة لا تستطيع الفحص، وتشرح الإعدادات طريقة التحديث. كل الإصدارات: https://github.com/NJ-Burrito/Business-Wrap/releases. التفاصيل في [bible/07-updates.ar.md](bible/07-updates.ar.md).

</details>

## 🧰 ماذا يفعل

🌾 **الحصاد:** نموذج الإجراء يعطي الأدوار وسير العمل والقواعد والحالات، ومسح الخدمة الحية يعطي البطاقة والنموذج والمرفقات والرسائل. والدمج يجمع الاثنين.

📝 **المحرر:** ملف HTML واحد. الصفحة التي تحررها هي الصفحة التي تطبع. وكل تغيير قابل للتراجع ومسجل.

🔀 **لغتان وتخطيط واحد:** «ع» / «E» يبدل اللغة، وRTL / LTR يبدل اتجاه الكلمات. ويبقى الشريط والصفحة في مكانهما.

🧭 **المخططات:** مخطط سير العمل قابل للتعديل على الصفحة، مع استيراد Mermaid وتصديره.

🎨 **التصميم:** الألوان والأحجام وأجزاء القالب وأي خط. والعناوين تقول ما تفعله، بالعربية والإنجليزية.

📤 **التصدير:** PDF وDOCX وملف التعديلات JSON وحزمة التصميم وحفظ HTML وخطافات الويب.

🔐 **الأمان:** فحص أمني يبقي محتوى العملاء وبيانات الدخول والمسارات المحلية خارج المستودع.

<details>
<summary>🔍 جدول الميزات كاملا</summary>

| المجال | ما تحصل عليه |
|---|---|
| **الحصاد** | طريقان للدخول ودمج بينهما: نموذج الإجراء (BPMN أو draw.io أو YAML) يعطي الأدوار وسير العمل والقواعد والحالات، ومسح الخدمة الحية يعطي البطاقة والنموذج والمرفقات والرسائل. الدمج يجمع الاثنين ولا يختار أحدهما. |
| **المحرر** | ملف HTML واحد يفتح من الجهاز. الصفحة التي تحررها هي الصفحة التي تطبع. كل كلمة مطبوعة وكل جدول وعنوان وخاصية تصميم قابلة للتعديل والتراجع ومسجلة. |
| **الشريط** | أقسام معنونة (ملف · إدراج · تحرير · الوثيقة · التصميم · تصدير · العرض). حدد شيئا فتتقدم أدواته **وتبقى** أثناء عملك في اللوحات والقوائم ومنتقيات الألوان، والنقر على مساحة فارغة أو Esc يعيد الأدوات العامة. |
| **البطاقات الشارحة** | توقف لحظة على أي أداة (أو اصل إليها بلوحة المفاتيح): تظهر بطاقة باسمها واختصارها وجملة واحدة تشرح عملها مع حركة صغيرة توضحه، بالعربية والإنجليزية. |
| **التخطيط** | التخطيط لا ينقلب أبدا. «ع» / «E» يغير اللغة والنسخة، وRTL / LTR يغير اتجاه الكلمات، ويبقى الشريط واللوحات والصفحة والعلامة في أماكنها. |
| **عرض الصفحات** | متصل، أو صفحة واحدة، أو كتاب (الغلاف وحده، ثم صفحتان متجاورتان باتجاه قراءة الوثيقة). يحفظ اختيارك، ولا يمس الطباعة ولا التصدير. |
| **المخططات** | أشكال وأسهم بانحناءات ونصوص تعدل في مكانها ومحاذاة وترتيب تلقائي وتكبير ومفتاح. واستيراد Mermaid وتصديره. |
| **التصميم** | الألوان (مربع لون ورمز hex) والأحجام (منزلق ورقم ووحدة) وأجزاء القالب والعناوين المطبوعة وتنسيق الكتلة الواحدة وCSS متقدم. **أي خط**: خطوط المشروع، أو خطوط هذا الجهاز، أو ملف خط ترفعه. |
| **التصدير** | PDF وDOCX (الخطوط مضمنة دائما نصا حقيقيا قابلا للتحديد)، وملف التعديلات JSON، وحزمة التصميم، وحفظ HTML (المحرر بتعديلاتك). |
| **الأتمتة** | خطافات ويب عند الحفظ والتصدير، وخادم MCP، وإضافة Claude Code، والأمر `node update/cli.mjs` للبقاء على آخر إصدار. |
| **الأمان** | فحص أمني يبقي محتوى العملاء وبيانات الدخول والمسارات المحلية خارج المستودع، والمسح لا يرسل طلبا حقيقيا إلا إذا طلبت ذلك مرتين. |

🔤 كل خط تختاره يضمن نصا حقيقيا في PDF وDOCX، وترخيص الخط مسؤوليتك.

</details>

<details>
<summary>🌾 ابدأ وثيقة (الحصاد)</summary>

> **المسح لا يرسل طلبا إلا إذا طلبت.** المسح تجربة جافة: يقرأ كل خطوة ويتوقف قبل الإجراء الأخير («إرسال»، «تقديم»، «تأكيد»، «دفع»؛ Send وSubmit وConfirm وPay). الإرسال الحقيقي يحتاج `submit: true` في الإعداد **و** `--yes-file-real-request`.

<div dir="ltr">

```powershell
npm run harvest:model -- <process.bpmn | .drawio | .yaml>   # roles, workflow, rules, statuses
npm run harvest:crawl -- <crawl.json>                        # card, form, attachments, messages
npm run harvest:merge -- <harvest.json> <process.json>       # the union of both
```

</div>

كل واحد منها يعطي ملف الوثيقة بالعربية والإنجليزية ومحررا. وفي المحرر: **وثيقة جديدة**. التفاصيل في [bible/08-harvest.ar.md](bible/08-harvest.ar.md).

</details>

<details>
<summary>📝 المحرر والمخططات والتصميم والتصدير</summary>

- **أدوات التحديد تبقى.** الكتلة أو خلية الجدول أو الشعار أو الصورة أو شكل المخطط أو السهم يضع قسمه الخاص في مقدمة الشريط، ويبقى أثناء استخدامك القوائم ولوحة التصميم ومنتقيات الألوان والمحررات المضمنة. النقر على مساحة فارغة أو Esc يعيد الأدوات العامة.
- **أقسام تطوى بالطريقة نفسها في اللغتين.** كل كلمة تحجز عرض الأطول بين صيغتيها العربية والإنجليزية، فيظهر «ع» و«E» الأدوات نفسها في الأماكن نفسها.
- **«ع» / «E»** يبدل لغة الواجهة والنسخة التي تحررها، و**RTL / LTR** يبدل اتجاه الكلمات.
- **الأوامر** (`Ctrl+K`): كل إجراء مع البحث. **وضع التركيز** (`F`) يخفي الأدوات، و**الوضع الهادئ** يوقف الحركة (ويعمل تلقائيا حين يطلب النظام تقليل الحركة).

**عرض الصفحات** (العرض ← الصفحات): *متصل* هو الورقة الطويلة، و*صفحة* يعرض صفحة واحدة كل مرة، و*كتاب* يبدأ بالغلاف وحده ثم يضع الصفحات أزواجا باتجاه قراءة الوثيقة (في العربية: الصفحة الأولى من الزوج على اليمين).

**المخططات:** انقر شكلا لأدوات الشكل، أو سهما لأدوات السهم، أو مساحة الرسم الفارغة لأدوات المخطط. اسحب للنقل، واسحب الزاوية لتغيير الحجم، واسحب جزءا من السهم لثنيه، وانقر مرتين لتعديل النص، وCtrl مع العجلة للتكبير. **استيراد Mermaid وتصديره** (`npm run diagram:mermaid` وأداة MCP `diagram_mermaid`).

**التصميم:** الألوان حسب الدور، والأحجام والتباعد، وأجزاء القالب (إظهار وإخفاء وترتيب)، والعناوين المطبوعة، وتنسيق الكتلة الواحدة (**نسق هذا**)، وCSS متقدم بعد تنقيته.

| المخرج | الطريقة |
|---|---|
| PDF + DOCX | زر «PDF + DOCX» عبر `npm run serve`، أو `node engine/export.mjs` |
| ملف التعديلات JSON | «حفظ»: كل تغيير مع قيمته القديمة، ويمكن مراجعته في السجل |
| حزمة التصميم | لوحة التصميم ← تصدير التصميم (واستوردها في وثيقة أخرى) |
| حفظ HTML | المحرر بتعديلاتك في ملف واحد يفتح في أي مكان |
| خطافات الويب | الوثيقة ← خطافات الويب: يبلغ عنوانك عند الحفظ والتصدير (عبر `npm run serve`) |

**التصدير والطباعة:** قائمة تصدير واحدة ومدخل طباعة واحد؛ PDF وDOCX لكل لغة أو للغتين، وHTML، وHTML للطباعة، والتعديلات، وحزمة التصميم، والمخططات بصيغ Mermaid وSVG وPNG؛ مع نطاق الصفحات وخيار الغلاف.

**حزم القوالب:** الخدمة الإلكترونية، والتجارة الإلكترونية، ومركز الاتصال، والموافقات، وSaaS، وIEEE 29148 العامة، إضافة إلى حزمتك (`templates/_example-custom`). كل متطلب يذكر دليله. التفاصيل في [bible/09-template-packs.ar.md](bible/09-template-packs.ar.md).

**التعلم المحلي:** سجل لتعديلاتك في `.local/learning/` على هذا الجهاز فقط؛ ويحول `npm run learn` التصحيحات المتكررة إلى قواعد لمساعدك الذكي. الإعدادات ← «التعلم المحلي» لإيقافه أو مسح كل ما تعلمه. التفاصيل في [bible/10-learning.ar.md](bible/10-learning.ar.md).

</details>

<details>
<summary>🆕 الجديد في 0.13.0</summary>

- **المستندات** (Ctrl+O): كل حفظ وثيقة مستقلة (لا يُستبدل القالب أبدًا)؛ افتح هنا أو في تبويب جديد، وانسخ واحذف واسترجع، واستورد PDF أو DOCX أو HTML.
- **تغييرات** (Ctrl+Shift+H): خط زمني بكل تعديل مع رجوع وتقدّم ونقاط حفظ؛ والعداد يبدأ من جديد عند كل حفظ HTML.
- **مجلد الحفظ** (يُسأل عنه مرة واحدة عند أول حفظ أو تصدير، ويعرضه «افتح المجلد» في الإعدادات): انظر *أين تُحفظ ملفاتك* أدناه.
- **خادم في الخلفية:** إغلاق آخر تبويب يحفظ كل التبويبات ويوقف الخادم؛ والتشغيل التالي يعرض استئناف كل شيء أو بدء عمل جديد.
- قسما **الترويسة** و**التذييل** في شريط الأدوات: نص وحقول وشعارات وأرقام صفحات؛ ولكل عنصر نطاق: كل الصفحات، أو هذه الصفحة فقط، أو من هذه الصفحة فصاعدًا؛ ويُحرَّر على كل صفحة في عروض الصفحات.
- **إعداد الصفحة:** A3 وA4 وA5 وLetter وLegal؛ عمودي أو أفقي للوثيقة كلها أو لقسم واحد، ويظهر على لوحة المحرر كما سيُطبع (0.13.1)؛ وفاصل صفحة عند قسم تختاره.
- **الجداول (0.13.2):** تحديد الخلايا ودمجها وتقسيمها والتفافها وقوائم داخلها؛ نسخ ولصق من Excel؛ صيغ (SUM وAVERAGE وMIN وMAX وCOUNT)؛ تغيير الحجم بالسحب؛ Enter سطر جديد وTab ينتقل إلى الخلية التالية. وإدراج › قصة مستخدم، وأدوات «الفراغات والصفحات» لإزالة المساحات الفارغة.
- **العناصر:** جداول وأقسام وفصول في أي مكان؛ نسخ كتلة كاملة ولصقها؛ مربعات نص حرة؛ صور بأنماط التفاف النص السبعة كما في Word.
- **شريط التنسيق:** اللون والحجم والخط والمحاذاة والقوائم حتى ستة مستويات والاقتباس والرابط والشيفرة؛ وCtrl+B / I / U.
- **كل شيء قابل للتعديل:** مدخلات جدول المحتويات، وجدول ضبط الوثيقة، والمراجعات؛ ولها أدوات الجدول.
- **الثقة:** الملف الشخصي، ومصدر كل تغيير، والتوقيع، والمشاركة، والقفل والفتح، وسجل كاشف للعبث، وتقرير عمل بصيغة PDF.
- **الأدوات:** واجهة `business-wrap` السطرية (دون شبكة ودون ذكاء اصطناعي)، وأوامر «/»، والحصاد عبر MCP إلى المحرر، والمعالجة الذاتية وفحوص كل مرحلة.
- **التصميم:** استيراد لوحة ألوان (مع فحص التباين)، وحركة الشعار، ولوحات جانبية أهدأ (مجموعاتها مطوية)، ورسائل قصيرة تُغلق بالنقر.

### أين تُحفظ ملفاتك / Where your files go

```
Business-Wrap\
  اقرأني - README.txt                 ما هو كل مجلد، بالعربية والإنجليزية
  المستندات - Documents\
    <عنوان المستند>\                  مجلد لكل مستند (عنوانه العربي، وإلا الإنجليزي)
      <عنوان المستند>.html            الملف القابل للتحرير: «حفظ HTML» يكتب فوقه
      Exports\                        <التاريخ والوقت> <عنوان المستند> - العربية.pdf | - English.pdf | .docx | - both.pdf
      Sources\                        ما جمعه الحصاد أو الاستيراد لهذا المستند
      Versions\                       النسخ السابقة (تُحفظ ولا تُحذف)
    _غير مصنف - Unsorted\             ملفات قديمة لم نعرف مستندها
  .system\                            مخفي: history\ (سجل العمل) وbackups\ وsessions\ وlibrary\ وcache\
```

كل تصدير وكل إشعار حفظ يذكر المسار الحقيقي. لا يُكتب شيء في مكان آخر (الأوامر `business-wrap new|harvest|import|export` بلا `--out` تستعمل المجلدات نفسها؛ و`--out` للبناء والاختبار). مجلد 0.13.0-0.13.2 (`PDF` و`DOCX` و`HTML` و`HISTORY`) يُنقل إلى الشجرة عند أول تشغيل لـ 0.13.3: لا يُحذف شيء، وكل نقل مسجّل في `.system\migration-0.13.3.json`، ويبقى السجل مرتبطًا برقم المستند. `business-wrap tidy --dry-run` يطبع الخطة، و`business-wrap tidy` ينفّذها.

</details>

## 🔤 الخطوط

🎯 الوثائق تستخدم عائلات ثمانية. **خط Cairo ممنوع**، ولا يستخدم حتى بديلا احتياطيا.

🏠 **نسختك أنت لها الأولوية:** `BW_FONT_DIR`، ثم `.local/config.json`، ثم مجلد خطوط النظام.

🎁 **لا نسخة على هذا الجهاز؟** تستخدم نسخة احتياطية مضمنة في `fonts/nj-fonts/`، فيطبع PDF صحيحا من أول مرة.

⚖️ المجلد `fonts/nj-fonts/` تحت رخصة ثمانية، **لا** رخصة MIT. التفاصيل في [fonts/README.ar.md](fonts/README.ar.md).

## 🤖 لوكلاء الذكاء الاصطناعي

📘 اقرأ [AGENTS.md](AGENTS.md) و[SKILL.md](SKILL.md) (Claude Code وClaude Desktop وCodex وCursor وGemini CLI وأي عميل MCP).

🔔 في بداية أي مهمة شغل `node update/cli.mjs --check` (أو أداة MCP `check_update`)، وأخبر المستخدم بالإصدار الأحدث في سطر واحد، ولا تثبت أي تحديث دون موافقته.

<details>
<summary>⚙️ إعدادات الجهاز، والفحص الأمني، والمجلدات</summary>

**إعدادات الجهاز** (لا ترفع أبدا): `.local/config.json` (مستثنى من git) أو متغيرات البيئة، والبيئة هي الأولى.

| المفتاح | متغير البيئة | الغرض |
|---|---|---|
| `fontDir` | `BW_FONT_DIR` | مجلد الخطوط (يبحث فيه بعمق)، ويفضل TrueType |
| `watermarkDir` | `BW_WATERMARK_DIR` | صور علامة الأداة، لواجهة المحرر فقط |
| `chrome` | `BW_CHROME` | ملف تشغيل Chrome أو Edge |
| `poppler` | `BW_POPPLER` | مجلد `bin` في poppler (pdftotext وpdffonts في الفحوص) |
| `brandDir` | `BW_BRAND_DIR` | مجلد شعار الأداة (الافتراضي `brand/v3/logo/`)، للواجهة فقط |

المتصفحات المدعومة: Chrome وEdge، آخر إصدار مستقر (Chromium 120+).

**الفحص الأمني:**

<div dir="ltr">

```powershell
$env:PYTHONUTF8 = "1"
python security/check.py --all   # tree + history + commit messages: no client content, secrets or local paths
python design/build.py           # palette contrast gate + theme
git config core.hooksPath .githooks
```

</div>

| المجلد | يحتوي |
|---|---|
| `bible/` | المنهج بالعربية والإنجليزية، والعقود الآلية |
| `engine/` | المخرج، وعقد التعديلات، وبناء المحرر، وتصدير PDF وDOCX، والحصاد، وأوامر MCP |
| `editor/` | تطبيق المحرر: الهيكل والشريط والبطاقات الشارحة وعرض الصفحات والمخططات ولوحة التصميم والخطوط |
| `samples/event-permit/` | الخدمة النموذجية المجهلة، بالعربية والإنجليزية |
| `tests/` | فحص لكل مجال، ويشغلها كلها `npm test` |
| `design/`، `palette/`، `typography/` | حزم التصميم ورموز DTCG مع فحوصها |
| `fonts/` | قائمة الخطوط والنسخة الاحتياطية المضمنة من ثمانية (`fonts/nj-fonts/`، بترخيصها الخاص) |
| `security/` | الفحص الذي يبقي محتوى العملاء والأسرار خارج المستودع |
| `docs/` | الدليل والبنية والقرارات وخارطة الطريق والخصوصية والمسرد |

</details>

## 🔒 هل هو آمن؟

🏠 **محلي فقط:** المحرر وطابعة PDF ومنشئ DOCX تعمل كلها على جهازك. ولا يرفع شيء ([docs/privacy.ar.md](docs/privacy.ar.md)).

🔁 **طلب تلقائي واحد:** فحص التحديث، مرة في اليوم على الأكثر، إلى قائمة الإصدارات العامة على GitHub. وخطافات الويب ترسل فقط إلى عنوان تحدده أنت.

🌾 **المسح تجربة جافة:** يتوقف قبل الإرسال أو التقديم أو التأكيد أو الدفع، إلا إذا طلبت ذلك مرتين.

🔏 **سجل كاشف للعبث (0.13.0)، وحدّه بصدق:** كل تعديل وحفظ وتصدير وتوقيع وقفل وفتح قيدٌ في سجل متسلسل بالتجزئة وموقّع (`bwlog` الإصدار 1، صيغة مجمّدة) ينتقل داخل ملف HTML المُشارَك، وله نسخة مرآة في `HISTORY` داخل مجلد الحفظ. يُكشف ويُعرض أي قيد محذوف أو معدَّل، أو أي تعديل لم يُسجَّل. التشفير يحمي من القراءة العابرة فقط: Business-Wrap مفتوح المصدر برخصة MIT، فالمفتاح في الشيفرة. ومن يملك الشيفرة يستطيع أن يعيد بناء سلسلة كاملة بمفاتيح جديدة، ولا يُكشف ذلك إلا حيث توجد نسخة مرآة أو مفتاح مثبَّت من المؤلف الحقيقي (جهاز آخر، أو مخزن `HISTORY`، أو نسخة مُشارَكة سابقة). لا يوجد ختم زمني موثوق. وإزالة السجل وعلامة `bwlog` لا تكفي لتمرير الملف على أنه «أُنشئ قبل 0.13»: منذ 0.13.1 يحمل ملف Save-HTML آثارًا مستقلة أخرى (علامات الخط الزمني في كل نسخة لغوية، ووسم `bw-ledger` في رأس الصفحة بمعرّف الوثيقة وتجزئة حالتها، وسمة على `<html>`، وتجزئة ثانية في سياسة CSP، ورقم إصدار الملف نفسه)، وأي أثر منها بلا سجل صالح يُقرأ «محذوف السجل». ومن يعثر على كل هذه الآثار ويزيلها يدويًا يستطيع أن يجعل الملف يبدو أقدم من 0.13؛ وحيث تعرف نسخة `HISTORY` المرآة المحلية الوثيقة فإنها تُظهرها «محذوفة السجل» على هذا الجهاز. والقفل يمنع التعديل غير المقصود، وليس تحكمًا في الوصول ([bible/11-trust-ledger.ar.md](bible/11-trust-ledger.ar.md)).

🛡️ **فحص أمني** (`security/check.py`، مع gitleaks في CI) يبقي محتوى العملاء وبيانات الدخول والمسارات المحلية خارج المستودع. وجدت مشكلة؟ [SECURITY.ar.md](SECURITY.ar.md).

## ❓ أسئلة

<details>
<summary>🆓 هل هو مجاني؟</summary>

نعم. رخصة MIT، بلا خطة مدفوعة وبلا حساب.

</details>

<details>
<summary>🏠 هل تغادر وثيقتي جهازي؟</summary>

لا. المحرر وطابعة PDF ومنشئ DOCX تعمل كلها على جهازك.

الطلب التلقائي الوحيد هو فحص التحديث: مرة في اليوم على الأكثر، إلى قائمة الإصدارات العامة على GitHub. وخطافات الويب ترسل فقط إلى عنوان تحدده أنت.

</details>

<details>
<summary>🤖 هل أحتاج Claude؟</summary>

لا. المحرر وسطر الأوامر يعملان وحدهما. والإضافة وخادم MCP اختياريان.

</details>

<details>
<summary>🔄 ماذا يدخل وماذا يخرج؟</summary>

يدخل: نموذج إجراء (BPMN أو draw.io أو YAML) أو مسح لخدمة حية.

يخرج: PDF وDOCX وملف التعديلات JSON وحزمة التصميم والمحرر محفوظا بصيغة HTML.

</details>

<details>
<summary>🌾 هل يقدم المسح طلبا حقيقيا؟</summary>

لا، إلا إذا طلبت ذلك مرتين: `submit: true` في الإعدادات و`--yes-file-real-request`. وإلا توقف قبل الإرسال أو التقديم أو التأكيد أو الدفع.

</details>

<details>
<summary>🔤 أي الخطوط أستخدم؟</summary>

ثمانية افتراضيا: نسختك أنت لها الأولوية، ونسخة احتياطية مضمنة (تحت رخصة ثمانية لا MIT) تطبع PDF صحيحا من أول مرة. ويمكن أي خط على جهازك أو ملف ترفعه، وترخيصه مسؤوليتك.

</details>

<details>
<summary>💻 على أي نظام يعمل؟</summary>

جرى اختباره على Windows 11 مع Node 24 وChrome. ويحتاج Node 20 أو أحدث، وChrome أو Edge، وPython مع uv لملفات DOCX. ولم يجر اختباره على macOS ولينكس.

</details>

## 🆘 مشكلة؟

🆘 **[صفحة الدعم](https://nj-burrito.github.io/Business-Wrap/ar/support.html):** الحلول الشائعة.

📖 **[الدليل](docs/guide.ar.md):** التثبيت والبدء السريع وحل المشكلات والنسخ الاحتياطي.

🐞 **[افتح بلاغا](https://github.com/NJ-Burrito/Business-Wrap/issues/new/choose):** اختر خلل أو ميزة، واذكر الإصدار (`node update/cli.mjs --check`).

🔒 **مشكلة أمنية؟** أبلغ عنها بشكل خاص: [SECURITY.ar.md](SECURITY.ar.md).

## 🌐 المزيد من NJ
[الموقع الشخصي](https://nj-burrito.github.io/) · [NJ-Kit](https://nj-burrito.github.io/NJ-Kit/) · [QA-Wrap](https://nj-burrito.github.io/QA-Wrap/) · [Profile-Wrap](https://nj-burrito.github.io/Profile-Wrap/) · [Story-Wrap](https://nj-burrito.github.io/story-wrap/ar/) · [GitHub](https://github.com/NJ-Burrito)

⚖️ [MIT](LICENSE) · [NOTICE.md](NOTICE.md) (الخطوط) · [fonts/README.ar.md](fonts/README.ar.md)

</div>
