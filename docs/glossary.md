# Glossary / المسرد

One table, both languages (the pair is the unit). / جدول واحد باللغتين، فالزوج وحدة واحدة.

| English | العربية | Meaning / المعنى |
|---|---|---|
| Harvest | جمع الأدلة | Collecting what the live system shows: forms, branches, attachments, records, the process model. / جمع ما يعرضه النظام الحي: النماذج والفروع والمرفقات والسجلات ونموذج العملية. |
| Evidence | الأدلة | Harvested facts normalised, each with its source. / الحقائق المجموعة بعد تنظيمها، ولكل منها مصدرها. |
| Evidence ledger | سجل الأدلة | One list of every workflow element every source knows, each with a disposition. / قائمة واحدة بكل عنصر سير عمل يعرفه أي مصدر، ولكل عنصر تصنيف. |
| Disposition | التصنيف | `drawn`, `drawn-unobserved`, `document-only`, `not-a-stage`. / تصنيف العنصر: مرسوم، مرسوم غير مرصود، في الوثيقة فقط، ليس مرحلة. |
| Checkpoint | نقطة الحفظ | The file a stage writes and the next stage reads. / الملف الذي تكتبه مرحلة وتقرؤه التالية. |
| Document JSON | ملف JSON للوثيقة | `03-document.<locale>.json`: the document laid onto the template. / الوثيقة موزعة على فصول القالب. |
| Block | الكتلة | `prose`, `table`, `figure`, `stories`. / نص، جدول، شكل، قصص. |
| Edition | النسخة | The Arabic (RTL) or English (LTR) version of one document. / النسخة العربية (من اليمين) أو الإنجليزية (من اليسار) من الوثيقة نفسها. |
| Edits file | ملف التعديلات | `edits.json`: ordered ops a person made in the editor. / العمليات المرتبة التي أجراها شخص في المحرر. |
| Op | العملية | One edit: setText, replace, insert, delete, move, duplicate. / تعديل واحد: تغيير نص، استبدال، إدراج، حذف، نقل، تكرار. |
| JSON Pointer | مؤشر JSON | RFC 6901 path to a node, e.g. `/chapters/0/sections/1`. / مسار إلى عقدة في الملف. |
| Base hash | بصمة الأساس | sha256 of the document the edits apply to. / بصمة الوثيقة التي تنطبق عليها التعديلات. |
| Gate | الفحص | An automatic check that holds delivery on FAIL. / فحص آلي يوقف التسليم عند الرسوب. |
| Design pack | حزمة التصميم | Token files + font manifest + layout notes. / ملفات الرموز وملف الخطوط وملاحظات التخطيط. |
| Design token | الرمز التصميمي | A named value (colour, size, space) in DTCG format. / قيمة مسماة (لون أو حجم أو مسافة) بصيغة DTCG. |
| Role | الدور | A colour by purpose (ink, paper, primary…) aliasing a ramp step. / لون بحسب وظيفته يشير إلى درجة من تدرج. |
| Ramp | التدرج | An even lightness ladder around one anchor colour. / سلم إضاءة متساوي الخطوات حول لون مرجعي. |
| Theme | السمة | `theme.json`, the flat file all outputs read. / الملف المسطح الذي تقرؤه كل المخرجات. |
| Type 3 font | خط Type 3 | Glyphs drawn as PDF procedures without a font name; hides the real face. / حروف مرسومة إجراءات بلا اسم خط، تخفي الخط الحقيقي. |
| Running head | الترويسة الجارية | The line at the top of every body page. / السطر أعلى كل صفحة من صفحات المتن. |
| Watermark (tool) | العلامة المائية للأداة | The tool's mark in the editor UI only, never in outputs. / علامة الأداة في واجهة المحرر فقط، لا في المخرجات. |
| Logo slot | خانة الشعار | A place in the document for the user's own logo; ships empty. / موضع في الوثيقة لشعار المستخدم، يشحن فارغا. |
| Open question | سؤال مفتوح | A fact no source answers yet, with its owner. / حقيقة لم يجب عنها أي مصدر بعد، مع صاحبها. |
| Consolidation | التجميع | End-of-batch promotion of a recurring fix to a pipeline rule, by vote and proof. / رفع إصلاح متكرر إلى قاعدة في خط الإنتاج في نهاية الدفعة، بالتصويت والإثبات. |
| RTL / LTR | من اليمين إلى اليسار / من اليسار إلى اليمين | Text direction. / اتجاه النص. |
| Tashkeel | التشكيل | Arabic diacritics; never in visible document text. / الحركات العربية؛ لا تظهر في نص الوثيقة أبدا. |
