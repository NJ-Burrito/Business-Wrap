# Changelog / سجل التغييرات

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). Tag plan: `v0.1.0` on `main` after the first merge of the bible and editor branches; a MINOR for each roadmap step, a PATCH for fixes, MAJOR when the edits or design-pack contract changes incompatibly.

<div dir="rtl">

الصيغة وفق Keep a Changelog، والإصدارات وفق الترقيم الدلالي. خطة الوسوم: `v0.1.0` على `main` بعد أول دمج لفرعي المرجع والمحرر؛ ورقم فرعي (MINOR) لكل خطوة من خارطة الطريق، ورقم تصحيح (PATCH) للإصلاحات، ورقم رئيسي (MAJOR) عند تغيير غير متوافق في عقد التعديلات أو عقد حزمة التصميم.

</div>

## [0.15.3] - 2026-10-31

🧭 The fourth owner-notes release: file icons that really change, one owning tab per document, a safer reset, single-edition documents and numbers that follow position. / 🧭 إصدار ملاحظات المالك الرابع: أيقونات ملفات تتغير فعلًا، وتبويب واحد مالك لكل وثيقة، وإعادة ضبط أكثر أمانًا، ووثائق بلغة واحدة، وأرقام تتبع الموضع.

### Added / أضيف
- 🗂️ **Settings > File icons also covers Windows 11's second app record**, so PDF and HTML files now change too. / **الإعدادات > أيقونات الملفات تشمل الآن سجل التطبيق الثاني في ويندوز 11**، فتتغير أيقونات PDF وHTML أيضًا.
- 📁 **Folder icons per file type are set automatically.** / **أيقونة المجلد لكل نوع ملف تُضبط تلقائيًا.**
- 🧹 **`business-wrap reset`** sends your data to the Recycle Bin (`--dry-run` shows it first, `--yes` skips the question), and **`doctor` lists every place the app keeps data.** / **الأمر `business-wrap reset`** ينقل بياناتك إلى سلة المحذوفات (`--dry-run` يعرضها أولًا و`--yes` يتخطى السؤال)، و**`doctor` يعرض كل مكان يحفظ فيه التطبيق بيانات.**
- 🖼️ **`editor render`** saves a diagram as a PNG picture. / **الأمر `editor render`** يحفظ المخطط صورة PNG.
- 📄 **Single-edition documents**: a document can be Arabic only or English only, with no empty second edition. / **وثائق بلغة واحدة**: يمكن أن تكون الوثيقة بالعربية فقط أو بالإنجليزية فقط، بلا نسخة ثانية فارغة.
- ✂️ **"Split this figure" in Check** breaks a figure that is too large to read into smaller ones. / **«قسّم هذا الشكل» في الفحص** يجزّئ الشكل الكبير غير المقروء إلى أشكال أصغر.
- 🔤 **A tashkeel warning with one-click removal**: visible text should carry no vowel marks. / **تحذير من التشكيل مع إزالة بنقرة واحدة**: النص الظاهر يجب ألا يحمل تشكيلًا.

### Changed / تغير
- 🔒 **One owning tab per document**: other tabs follow it read-only and offer Reload. / **تبويب واحد مالك لكل وثيقة**: تتبعه التبويبات الأخرى للقراءة فقط وتعرض «إعادة التحميل».
- 😴 **Sleeping tabs are reported at once** (`TAB_ASLEEP`), and the editor's Edge is launched so that it stays awake. / **التبويبات النائمة يُبلَّغ عنها فورًا** (`TAB_ASLEEP`)، ويُشغَّل Edge الخاص بالمحرر بحيث يبقى مستيقظًا.
- 🖥️ **One host per install**: a lock stops a second host from starting. / **مضيف واحد لكل تثبيت**: قفل يمنع تشغيل مضيف ثانٍ.
- 🔌 **The MCP server survives errors**, and `status` and `doctor` show where it is registered. / **خادم MCP يصمد أمام الأخطاء**، ويعرض `status` و`doctor` مكان تسجيله.
- 🔔 **The update check reads every release** and refreshes after 6 hours. / **فحص التحديثات يقرأ كل الإصدارات** ويتجدد بعد 6 ساعات.
- 📂 **`open` reopens the newest document**, and **`--help` only prints help.** / **الأمر `open` يعيد فتح أحدث وثيقة**، و**`--help` يطبع المساعدة فقط.**
- 🔢 **Numbers follow position everywhere**, and Renumber writes real numbers. / **الأرقام تتبع الموضع في كل مكان**، و«إعادة الترقيم» تكتب أرقامًا حقيقية.
- 📚 **Library word counts are per edition.** / **عدد الكلمات في المكتبة لكل نسخة على حدة.**
- 📏 **Folder names can be up to 100 characters.** / **أسماء المجلدات تصل إلى 100 حرف.**

### Fixed / أصلح
- 🧯 **Edits were lost when two tabs held one document**: the stale tab can no longer save over the newer copy. / **ضاعت تعديلات عندما كان تبويبان يحملان وثيقة واحدة**: لم يعد التبويب القديم قادرًا على الحفظ فوق النسخة الأحدث.
- 🚪 **Two hosts could run on one port**: now only one starts. / **كان يمكن أن يعمل مضيفان على منفذ واحد**: يبدأ الآن مضيف واحد فقط.
- 🧱 **Tables with empty columns and hand-written numbers are refused** instead of being saved. / **تُرفض الجداول ذات الأعمدة الفارغة والأرقام المكتوبة يدويًا** بدل حفظها.
- 🔤 **The spelling icon's hover motion** works again. / **حركة أيقونة الإملاء عند المرور** تعمل من جديد.
- 🆕 **The What's new text in the editor** shows the right release. / **نص «ما الجديد» في المحرر** يعرض الإصدار الصحيح.
- 🧲 **The drag grip** is no longer hidden under a side panel. / **مقبض السحب** لم يعد يختفي تحت لوحة جانبية.

### Known limits / حدود معروفة
- 🧪 **The Edge sleeping-tabs settings are not verified on a real Edge build.** / **إعدادات التبويبات النائمة في Edge لم تُتحقق على نسخة Edge حقيقية.**
- 🔄 **A folder icon in an Explorer window that is already open may need F5 to refresh.** / **قد تحتاج أيقونة المجلد في نافذة المستكشف المفتوحة إلى F5 لتتحدث.**

## [0.15.2] - 2026-10-31

🧭 The third owner-notes release: live-editor slash commands, a Spelling tab with a side panel, a calmer drafting-grid background, a smoother ribbon, and a true 100% zoom. / 🧭 إصدار ملاحظات المالك الثالث: أوامر مائلة داخل المحرر الحي، وتبويب للإملاء مع لوحة جانبية، وخلفية شبكة رسم أهدأ، وشريط أنعم، وتكبير 100% حقيقي.

### Added / أضيف
- ⌨️ **8 slash commands for the live editor** in Claude: `/business-wrap:tabs`, `outline`, `edit`, `proofread`, `check`, `diagram`, `explain` and `action`. An edit lands as one undo step, signed as the agent. / **8 أوامر مائلة للمحرر الحي** في Claude: `/business-wrap:tabs` و`outline` و`edit` و`proofread` و`check` و`diagram` و`explain` و`action`. ويصل التعديل خطوة تراجع واحدة موقّعة باسم المساعد.
- 🔤 **A Spelling tab** in the ribbon: next and previous error, fix, fix all, ignore, ignore all, add to dictionary, language and a count. / **تبويب الإملاء** في الشريط: الخطأ التالي والسابق، والتصحيح، وتصحيح الكل، والتجاهل، وتجاهل الكل، والإضافة إلى القاموس، واللغة، وعدّاد الأخطاء.
- 🗒️ **A spelling side panel**: click a misspelt word to see suggestions, then fix it, ignore it, ignore it everywhere, or add it to your dictionary. It floats over the pages and moves nothing. / **لوحة إملاء جانبية**: اضغط على كلمة خاطئة لترى الاقتراحات، ثم صحّحها أو تجاهلها أو تجاهلها في كل مكان أو أضفها إلى قاموسك. تظهر فوق الصفحات ولا تحرّك شيئًا.
- 🔘 **One spelling switch** turns on Arabic and English together. / **مفتاح إملاء واحد** يشغّل العربية والإنجليزية معًا.

### Changed / تغير
- 🎨 **A new calm drafting-grid background** behind the pages, in light and dark. The watermark is at the bottom left and notes pop up at the bottom right. / **خلفية جديدة هادئة بشبكة رسم** خلف الصفحات، في الوضع الفاتح والداكن. العلامة المائية أسفل اليسار والإشعارات أسفل اليمين.
- 💡 **The explanation panel opens after a short rest on a tool**, swaps in place as you move, and floats over the pages instead of pushing them. / **لوحة الشرح تُفتح بعد توقف قصير على الأداة**، وتتبدّل في مكانها وأنت تتنقل، وتطفو فوق الصفحات بدل دفعها.
- 🪄 **The ribbon opens and closes with a smooth glide**, and the pages move with it. / **الشريط يُفتح ويُغلق بانزلاق ناعم**، وتتحرك الصفحات معه.
- 📖 **Reading mode has its own icon.** / **لوضع القراءة أيقونته الخاصة.**
- 🔌 **Turning the server off keeps the editor open** and shows a Turn on card, so you can switch it back on. / **إيقاف الخادم يُبقي المحرر مفتوحًا** ويعرض بطاقة «تشغيل» لتعيده متى شئت.
- 🤖 **`/business-wrap:action` runs more safe actions**, and `/business-wrap:check` now counts spelling mistakes and diagram warnings. / **الأمر `/business-wrap:action` ينفّذ إجراءات آمنة أكثر**، والأمر `/business-wrap:check` يحسب الآن الأخطاء الإملائية وتحذيرات المخططات.
- ⚡ **Much lighter on your PC**: idle CPU fell from about 316 to 17 ms per second, and a sweep across the tools from about 27 to 4 ms per tool. / **أخف بكثير على جهازك**: انخفض استهلاك المعالج في الخمول من نحو 316 إلى 17 ملّي ثانية في الثانية، ومرور المؤشر على الأدوات من نحو 27 إلى 4 ملّي ثانية للأداة.

### Fixed / أصلح
- 🔍 **100% zoom was about 42% in single and spread view**: it is now true size. / **تكبير 100% كان نحو 42% في عرض الصفحة المفردة والمزدوجة**: صار الآن بالحجم الحقيقي.
- 📐 **Fill height now fits between the toolbar and the page buttons.** / **«ملء الارتفاع» يناسب الآن المساحة بين شريط الأدوات وأزرار الصفحات.**
- 🌐 **The Arabic menu closes on a click outside it**, and the check for it now reports where the click landed. / **القائمة بالعربية تُغلق عند الضغط خارجها**، وصار فحصها يذكر موضع الضغطة.
- 🧩 **Explanation panel races** (flicker when moving across tools) are gone. / **اختفى وميض لوحة الشرح** عند التنقل السريع بين الأدوات.

### Known limits / حدود معروفة
- 📏 Fill height keeps fitting when the window or the ribbon changes, until you zoom by hand; then it stays at your zoom. / **«ملء الارتفاع» يبقى مضبوطًا عند تغيّر النافذة أو الشريط**، حتى تكبّر بيدك؛ عندها يبقى على تكبيرك.
- 🔒 Editor actions that delete, close or stop something stay refused over MCP. / **إجراءات المحرر التي تحذف أو تغلق أو توقف شيئًا تبقى مرفوضة عبر MCP.**

## [0.15.1] - 2026-10-31

🗂️ A small release: Business-Wrap file icons on this PC, the user-story ID card as a real table, faster GitHub checks, and a calmer toolbar. / 🗂️ إصدار صغير: أيقونات Business-Wrap لملفاتك على هذا الجهاز، وبطاقة هوية قصة المستخدم جدولًا حقيقيًا، وفحوص GitHub أسرع، وشريط أدوات أهدأ.

### Added / أضيف
- 🗂️ **Settings > File icons**: "Use Business-Wrap icons on this PC" and "Restore Windows icons". It needs the local server and works on Windows only. Be aware that it changes the icon of every PDF, Word and web page file on this Windows account, including other file types that share the same app (for example .htm). Restore puts back exactly what was there. / **الإعدادات > أيقونات الملفات**: "استعمال أيقونات Business-Wrap على هذا الجهاز" و"استعادة أيقونات ويندوز". يحتاج إلى الخادم المحلي ويعمل على ويندوز فقط. انتبه إلى أنه يغيّر أيقونة كل ملفات PDF وWord وصفحات الويب في حساب ويندوز هذا، ومنها أنواع أخرى تشترك في التطبيق نفسه (مثل ‎.htm). والاستعادة تعيد بالضبط ما كان موجودًا.
- 📋 **The user-story ID card is a real table**: add and delete rows and columns, merge cells and undo, with the same tools as every other table. It was listed as a known limit in 0.14.0. Older documents open as before, and PDF and DOCX print the same rows. / **بطاقة هوية قصة المستخدم صارت جدولًا حقيقيًا**: أضف الصفوف والأعمدة واحذفها، وادمج الخلايا، وتراجع، بالأدوات نفسها التي لكل جدول آخر. كانت مذكورة حدًّا معروفًا في 0.14.0. وتُفتح الوثائق الأقدم كما هي، ويطبع PDF وDOCX الصفوف نفسها.

### Changed / تغير
- ⚙️ **GitHub checks run in 4 parallel parts**: about 9.5 minutes instead of about 24. / **فحوص GitHub تعمل في 4 أجزاء متوازية**: نحو 9.5 دقيقة بدل نحو 24.
- 🛡️ **A guard test catches Windows-only code in tests**, so a test that only passes on Windows is flagged early. / **اختبار حارس يكشف الشيفرة الخاصة بويندوز في الاختبارات**، فيُنبَّه مبكرًا إلى أي اختبار ينجح على ويندوز فقط.

### Fixed / أصلح
- ⌨️ **The toolbar no longer re-measures on every key**: 450 changes became 55 per 20 keystrokes. / **شريط الأدوات لم يعد يعيد القياس عند كل ضغطة مفتاح**: من 450 تغييرًا إلى 55 لكل 20 ضغطة.
- 🧪 **Tests that failed only on Linux** are fixed: the zip check, the Edge path, the Arabic direction reload, the provenance contributors, the tab flush on close, the palette hover and the power-off confirmation in Settings. / **اختبارات كانت تفشل على لينكس فقط** أُصلحت: فحص الملف المضغوط، ومسار Edge، وإعادة تحميل اتجاه العربية، ومساهمو سجل المصدر، وحفظ التبويب عند الإغلاق، ومرور المؤشر على لوحة الأوامر، وتأكيد الإطفاء في الإعدادات.

## [0.15.0] - 2026-10-31

🎛️ The second owner-notes release: a tidier ribbon, an explanation panel with a picture for every tool, a dim navy dark mode, one server switch, offline spell checking, whole-project export and import, and an editor your AI assistant can drive. / 🎛️ إصدار ملاحظات المالك الثاني: شريط أكثر ترتيبًا، ولوحة شرح برسم لكل أداة، ووضع داكن كحلي معتم، ومفتاح واحد للخادم، وتدقيق إملائي بلا إنترنت، وتصدير المشاريع واستيرادها كاملة، ومحرر يستطيع مساعدك الذكي تشغيله.

**In 10 seconds / في عشر ثوان**
- 🎀 The ribbon has 15 tabs, each with its own icon and colour, tools on a tidy grid with a name under each, and no scrolling. / للشريط 15 تبويبًا، لكل منها أيقونته ولونه، والأدوات على شبكة مرتبة باسم تحت كل أداة، بلا تمرير.
- 💡 The explanation panel is on the right and shows a small drawing for every tool. / لوحة الشرح على اليمين وتعرض رسمًا صغيرًا لكل أداة.
- 🌙 Dark mode is now a dim navy, and the page sits on a soft giant NJ logo. / الوضع الداكن صار كحليًا معتمًا، وتستند الصفحة إلى شعار NJ كبير وخافت.
- 🔌 One server switch, offline Arabic and English spell checking, and a fix for the lost connection when you open many tabs. / مفتاح واحد للخادم، وتدقيق إملائي عربي وإنجليزي بلا إنترنت، وإصلاح لانقطاع الاتصال عند فتح تبويبات كثيرة.
- 📦 Export and import a whole project, and your AI assistant can read and edit the open document. / تصدير مشروع كامل واستيراده، ويستطيع مساعدك الذكي قراءة الوثيقة المفتوحة وتحريرها.

### Added / أضيف
- 🎀 **A new ribbon**: 11 general tabs and 4 that appear when you select a table, a picture or a diagram. Tabs sit in the middle of the bar, each has its own icon and colour, and the selected tab looks raised. Tools are laid out on an even grid, grouped in shaded categories, and every tool has its name under it. Nothing scrolls sideways. Press the open tab again to fold it. / **شريط جديد**: 11 تبويبًا عامًا و4 تظهر عند تحديد جدول أو صورة أو مخطط. التبويبات في منتصف الشريط، ولكل تبويب أيقونته ولونه، ويبدو التبويب المحدد بارزًا. الأدوات على شبكة منتظمة ضمن فئات بدرجات لونية مختلفة، وتحت كل أداة اسمها. لا شيء يمرَّر أفقيًا. اضغط التبويب المفتوح مرة ثانية ليُطوى.
- 🔍 **Zoom from 25% to 400%**, with **Fill height** beside Fill width, a zoom box you can type in, and Ctrl plus the mouse wheel. / **تكبير من 25% إلى 400%**، مع **ملء الارتفاع** بجانب ملء العرض، وخانة تكتب فيها النسبة، وCtrl مع عجلة الفأرة.
- 💡 **Explanation panel on the right**: it opens when you rest on a tool for a moment, shows a short animated drawing for each one, stays until you close it, and no longer hides itself after a few views. / **لوحة الشرح على اليمين**: تفتح حين تقف على أداة لحظة، وتعرض رسمًا متحركًا قصيرًا لكل أداة، وتبقى حتى تغلقها، ولم تعد تختفي بعد بضع مرات.
- 🐾 **A livelier NJ watermark**: 20 small reactions that show up now and then and make no sound. There is one hidden surprise too. / **علامة NJ أكثر حيوية**: 20 ردة فعل صغيرة تظهر بين حين وآخر بلا صوت. وفيها مفاجأة مخبأة واحدة.
- 🖼️ **NJ backdrop**: one giant NJ logo, low in opacity, behind the pages. / **خلفية NJ**: شعار NJ كبير واحد بشفافية منخفضة خلف الصفحات.
- 🔌 **One server switch** in the top bar and in Settings. Its colour and icon show whether the server is on. / **مفتاح واحد للخادم** في الشريط العلوي وفي الإعدادات. يبيّن لونه وأيقونته إن كان الخادم يعمل.
- ✍️ **Spell checking** for Arabic and English, built in and offline, with its own switch for each edition. Words are checked by script, so a mixed paragraph gets the right dictionary. / **تدقيق إملائي** للعربية والإنجليزية، مدمج وبلا إنترنت، بمفتاح لكل نسخة. تُفحص الكلمات بحسب خطها، فتأخذ الفقرة المختلطة القاموس الصحيح.
- 📦 **Project export and import**: export every document of a project as HTML, PDF, DOCX or edits, in one folder or one zip with an index page. Import a project, a folder, a zip or a pile of PDF, DOCX and HTML files into the library as one project, with progress and a summary of what came in and what failed. / **تصدير المشاريع واستيرادها**: صدّر كل وثائق مشروع بصيغة HTML أو PDF أو DOCX أو التعديلات، في مجلد واحد أو ملف مضغوط واحد مع صفحة فهرس. واستورد مشروعًا أو مجلدًا أو ملفًا مضغوطًا أو مجموعة ملفات PDF وDOCX وHTML إلى المكتبة كمشروع واحد، مع شريط تقدم وملخص بما دخل وما فشل.
- 🤖 **Live editor tools for AI assistants**: list the open documents, read one, get its outline, apply a batch of edits in one undo step signed as the agent, and run an editor action. Your own edits made meanwhile stay signed as you. / **أدوات المحرر الحي للمساعدات الذكية**: سرد الوثائق المفتوحة، وقراءة واحدة منها، وجلب فهرسها، وتطبيق دفعة تعديلات بخطوة تراجع واحدة موقّعة باسم المساعد، وتشغيل إجراء في المحرر. وتبقى تعديلاتك أثناء ذلك موقّعة باسمك.
- 🔢 **Numbers computed at render time**, and diagrams that split into several figures when they are too big to read, with a warning in the Check panel. / **ترقيم يُحسب عند العرض**، ومخططات تنقسم إلى عدة أشكال حين تكبر على القراءة، مع تحذير في لوحة الفحص.

### Changed / تغير
- ↔️ **Top bar spacing**: more room between the logo, history, language and direction controls. / **تباعد الشريط العلوي**: مساحة أوسع بين الشعار والسجل واللغة والاتجاه.
- ⬇️ **Side drawers open from the top** of the screen, under the bar, instead of from the middle. / **الأدراج الجانبية تفتح من أعلى الشاشة**، تحت الشريط، بدل منتصفها.
- 🌙 **Dark mode is a dim navy**, and every text and icon colour was checked for contrast. / **الوضع الداكن كحلي معتم**، وروجع تباين كل لون نص وأيقونة.
- ⚡ **Faster**: idle, hover, tab switch and typing cost less work than in 0.14.0. / **أسرع**: الخمول والمرور بالمؤشر وتبديل التبويب والكتابة تستهلك عملًا أقل من 0.14.0.
- ⏻ **Power-off moved to Settings**; the top bar keeps only the server switch. / **زر الإطفاء انتقل إلى الإعدادات**، ويبقى في الشريط العلوي مفتاح الخادم وحده.
- 🔗 **Many tabs, one connection**: the editor now uses one live connection per browser, so opening more than a few tabs no longer stalls the rest. / **تبويبات كثيرة باتصال واحد**: يستعمل المحرر اتصالًا حيًا واحدًا لكل متصفح، فلا يتعطل الباقي عند فتح أكثر من بضعة تبويبات.
- 🚀 **The MCP server starts faster** and no longer waits for the update check. After an update it tells your assistant to restart instead of running half-old code, and it keeps your settings across versions. / **خادم MCP يبدأ أسرع** ولم يعد ينتظر فحص التحديث. وبعد التحديث يطلب من مساعدك إعادة التشغيل بدل تشغيل شيفرة نصفها قديم، ويحتفظ بإعداداتك بين الإصدارات.
- 🧭 **Automation mode**: open the editor with `?automation=1` to skip the resume and profile pop-ups; the page announces `bw:ready` when it is settled. / **وضع الأتمتة**: افتح المحرر بالرابط `?automation=1` لتجاوز نوافذ الاستئناف والملف الشخصي؛ وتعلن الصفحة `bw:ready` حين تستقر.

### Fixed / أصلح
- ⌨️ **No typed text lost when a tab closes**: the last words are flushed before the tab goes, and an older save can no longer overwrite a newer one. / **لا يضيع ما كتبته عند إغلاق التبويب**: تُحفظ آخر الكلمات قبل أن يُغلق، ولم يعد حفظ أقدم يكتب فوق أحدث.
- 💾 **Stop and power-off save open tabs** first. / **الإيقاف والإطفاء يحفظان التبويبات المفتوحة** أولًا.
- 🎛️ **Wrong greyed-out tools** after switching ribbon tabs. / **أدوات رمادية خطأً** بعد تبديل تبويبات الشريط.
- ♿ **Changes button**: its spoken name matches the number on screen. / **زر التغييرات**: اسمه المنطوق يطابق الرقم الظاهر على الشاشة.
- 🎞️ **Icons without hover motion** now move like the rest. / **أيقونات بلا حركة عند المرور** صارت تتحرك مثل بقية الأيقونات.
- 📤 **Export menu** no longer scrolls, and all its formats are visible. / **قائمة التصدير** لم تعد تتمرر، وكل صيغها ظاهرة.
- 🧩 **Diagram tab group names** are visible at 1366 px. / **أسماء مجموعات تبويب المخطط** ظاهرة عند عرض 1366 بكسل.
- 📐 **Page layout**: the explanation panel no longer adds a sideways scroll bar on a wide page. / **تخطيط الصفحة**: لوحة الشرح لم تعد تضيف شريط تمرير أفقيًا على صفحة عريضة.
- 📚 **Library import** reports its toasts instead of failing silently when nothing comes in. / **الاستيراد إلى المكتبة** يعرض إشعاراته بدل أن يفشل بصمت حين لا يدخل شيء.

### Migration notes / ملاحظات الترحيل
- Nothing to run: your documents and history open as they are. / لا شيء لتشغله: تُفتح وثائقك وسجلها كما هي.
- A script that clicked the power-off button in the top bar should use Settings, and one that read the old explanation panel settings can drop them. / النص البرمجي الذي كان ينقر زر الإطفاء في الشريط العلوي عليه أن يستعمل الإعدادات، والذي كان يقرأ إعدادات لوحة الشرح القديمة يمكنه التخلي عنها.
- MCP clients get the new tools `editor_list_documents`, `editor_get`, `editor_outline`, `editor_ops`, `editor_action`, `editor_new`, `editor_import` and `host_health`; they need an open editor tab, and answer `NO_TAB` without one. See docs/automation.md. / عملاء MCP يحصلون على الأدوات الجديدة `editor_list_documents` و`editor_get` و`editor_outline` و`editor_ops` و`editor_action` و`editor_new` و`editor_import` و`host_health`؛ وتحتاج إلى تبويب محرر مفتوح، وتجيب `NO_TAB` من دونه. انظر docs/automation.md.

### Known limits / حدود معروفة
- The spell dictionaries are not stored inside a saved HTML file; a file opened from disk uses the browser's own spell checking. / قواميس التدقيق الإملائي لا تُخزَّن داخل ملف HTML المحفوظ؛ والملف المفتوح من القرص يستعمل تدقيق المتصفح نفسه.
- The first Arabic spell-check load takes a few seconds. / أول تحميل للتدقيق الإملائي العربي يستغرق بضع ثوان.
- A PDF imported into a project may bring tables in as plain paragraphs. / ملف PDF المستورد إلى مشروع قد تصل جداوله فقرات عادية.

## [0.14.0] - 2026-10-30

🎀 The owner-notes release: a ribbon with tabs, safer deleting, user-story tables, file badges, a faster editor and a better report. / 🎀 إصدار ملاحظات المالك: شريط بتبويبات، وحذف أكثر أمانًا، وجداول قصص المستخدم، وشارات للملفات، ومحرر أسرع، وتقرير أفضل.

**In 10 seconds / في عشر ثوان**
- 🎀 The toolbar is now a ribbon with tabs, and your selection is kept when you change tab. / صار الشريط شريطًا بتبويبات، وتبقى جملتك المحددة عند تغيير التبويب.
- 🗑️ Delete has scopes (this item, this section, the whole list) and lists renumber on their own. / للحذف نطاقات (هذا العنصر أو هذا القسم أو القائمة كلها)، وتُعاد ترقيم القوائم تلقائيًا.
- 📋 User-story tables, one document ID, click on a line to place the caret and insert there. / جداول قصص المستخدم، ومعرّف واحد للوثيقة، والنقر على سطر لوضع المؤشر والإدراج عنده.
- 🏷️ Your files get their own badges: HTML favicon, DOCX and PDF thumbnails, a folder icon. / لملفاتك شاراتها: أيقونة تبويب HTML، ومصغّرات DOCX وPDF، وأيقونة المجلد.
- ⚡ Typing is about three times faster, and Save, Save as new copy and Export are three clear actions. / الكتابة أسرع بنحو ثلاث مرات، والحفظ و«حفظ كنسخة جديدة» والتصدير ثلاثة إجراءات واضحة.

### Added / أضيف
- 🎀 **Ribbon tabs** replace the row of section buttons; the selected text or cell stays selected when you switch tab. / **تبويبات الشريط** تحل محل صف أزرار الأقسام؛ ويبقى النص أو الخلية المحددة محددًا عند تبديل التبويب.
- 🗑️ **Delete scopes**: delete this item, this section or the whole list, each one undo step. / **نطاقات الحذف**: احذف هذا العنصر أو هذا القسم أو القائمة كلها، وكلها خطوة تراجع واحدة.
- 🔢 **Renumber lists**: numbered lists renumber after an insert, a delete or a move, in the editor, the PDF and the DOCX. / **إعادة ترقيم القوائم**: القوائم المرقمة تُعاد ترقيمها بعد الإدراج أو الحذف أو النقل، في المحرر وPDF وDOCX.
- 🆔 **One document ID**: a document keeps one ID across its two editions, its history and its folder. / **معرّف واحد للوثيقة**: تحتفظ الوثيقة بمعرّف واحد عبر نسختيها وسجلها ومجلدها.
- 📋 **User-story tables**: a table kind for user stories with an ID, a role, a goal and acceptance criteria. / **جداول قصص المستخدم**: نوع جدول لقصص المستخدم بمعرّف ودور وهدف ومعايير قبول.
- 🖱️ **Click on a line** puts the caret there, and **insert at the caret** adds the new block at that point. / **النقر على سطر** يضع المؤشر عنده، و**الإدراج عند المؤشر** يضيف الكتلة الجديدة في تلك النقطة.
- 📏 **Ruler and one-page landscape**: a page ruler, and a landscape setting for a single page. / **المسطرة والصفحة الأفقية**: مسطرة للصفحة، وإعداد أفقي لصفحة واحدة.
- 🖼️ **Wrap modes and position** for pictures and boxes, set from the ribbon. / **أنماط الالتفاف والموضع** للصور والصناديق، من الشريط.
- 🧩 **Diagram symbol gallery and legend edit**: pick a symbol from a gallery and edit the legend in place. / **معرض رموز المخطط وتحرير المفتاح**: اختر رمزًا من معرض وحرّر مفتاح الرموز في مكانه.
- 💡 **Explainer side panel** that says what the selected thing is and what you can do with it. / **لوحة شرح جانبية** تقول ما هو العنصر المحدد وما يمكنك فعله به.
- ⏳ **Waiting popup** for slow work, with what is happening. / **نافذة انتظار** للأعمال البطيئة تبيّن ما يجري.
- 📖 **Reading mode** to read the document without the editing tools. / **وضع القراءة** لقراءة الوثيقة دون أدوات التحرير.
- 🔌 **Server banner** with Start and Open buttons when the page is opened from disk. / **شريط الخادم** بزري تشغيل وفتح عندما تُفتح الصفحة من القرص.
- 🏷️ **File badges**: the HTML file has its own favicon, the DOCX and PDF files carry a thumbnail (the PDF also names its creator), and each document folder has the Business-Wrap folder icon. On Windows the PDF in Explorer shows the icon of your PDF app, which Windows decides. / **شارات الملفات**: لملف HTML أيقونة تبويب خاصة، ولملفي DOCX وPDF مصغّر (ويذكر PDF منشئه)، ولكل مجلد وثيقة أيقونة مجلد Business-Wrap. في ويندوز يعرض مستكشف الملفات لملف PDF أيقونة برنامج PDF لديك، وويندوز هو من يقرر ذلك.
- 📊 **Report PDF** without edits, with 4 chart kinds, and an **Open folder** button. / **تقرير PDF** بلا تعديلات، مع 4 أنواع من الرسوم، وزر **افتح المجلد**.

### Changed / تغير
- 🔔 **Toasts** appear clear of the page controls. / **الإشعارات** تظهر بعيدًا عن أزرار الصفحة.
- 💾 **Save, Save as new copy and Export** are three separate actions with their own names. / **حفظ و«حفظ كنسخة جديدة» وتصدير** ثلاثة إجراءات منفصلة بأسماء واضحة.
- ⚡ **Typing is about three times faster** on long documents. / **الكتابة أسرع بنحو ثلاث مرات** في الوثائق الطويلة.
- 📁 **The old section buttons** are inside the ribbon tabs; the commands are the same. / **أزرار الأقسام القديمة** صارت داخل تبويبات الشريط؛ والأوامر هي نفسها.

### Fixed / أصلح
- ♿ **Accessibility**: the changes button's accessible name now contains its visible count. / **إمكانية الوصول**: الاسم المتاح لزر التغييرات يحوي الآن العدد الظاهر.
- 🔌 **Stop all** stops only the servers of its own state folder. / **إيقاف الكل** يوقف خوادم مجلد حالته فقط.
- 📄 **PDF import** on Linux reads headings correctly. / **استيراد PDF** على لينكس يقرأ العناوين بشكل صحيح.

### Migration notes / ملاحظات الترحيل
- Nothing to run: your documents open as they are, and the first save in a document folder gives the folder its icon (Windows only). / لا شيء لتشغله: تُفتح وثائقك كما هي، وأول حفظ في مجلد وثيقة يعطي المجلد أيقونته (ويندوز فقط).
- A tool or a script that clicked the old section buttons should open the ribbon tab first. / الأداة أو النص البرمجي الذي كان ينقر أزرار الأقسام القديمة عليه أن يفتح تبويب الشريط أولًا.

### Known limits / حدود معروفة
- Hovering over a very long document still costs some time. / المرور بالمؤشر فوق وثيقة طويلة جدًا ما زال يكلف بعض الوقت.
- The story ID card is a card, not a grid. / بطاقة معرّف القصة بطاقة وليست شبكة.
- Fix on the page is an anchor lock: it keeps the object at its anchor and does not float it freely. / التثبيت على الصفحة قفل مرساة: يُبقي الكائن عند مرساته ولا يطفو بحرية.

## [0.13.3] - 2026-10-30

🧭 An audit pass: typing, cells and pages behave, every icon moves the same way, one folder per document, and Settings starts and stops the local servers. / 🧭 جولة تدقيق: الكتابة والخلايا والصفحات تعمل كما يُتوقع، وكل أيقونة تتحرك بالأسلوب نفسه، ومجلد واحد لكل وثيقة، والإعدادات تشغّل الخوادم المحلية وتوقفها.

**In 10 seconds / في عشر ثوان**
- 🗂️ One folder per document: the file, its Exports, Sources and earlier Versions together; machine files are hidden in `.system`. / مجلد واحد لكل وثيقة: الملف وتصديراته ومصادره ونسخه السابقة معًا؛ وملفات الجهاز مخفية في `.system`.
- 🔌 Settings can start the local server and stop every Business-Wrap server. / الإعدادات تستطيع تشغيل الخادم المحلي وإيقاف كل خوادم Business-Wrap.
- ⌨️ Typing, Enter, undo and cell edits are fixed: hidden diacritics survive and each action undoes in one step. / إصلاح الكتابة وEnter والتراجع وتعديل الخلايا: التشكيل المخفي يبقى، وكل إجراء يُتراجع عنه بخطوة واحدة.
- 🎨 Every icon has its own move, takes the theme colour, shows a focus ring and stands still in calm mode. / لكل أيقونة حركتها، وتأخذ لون السمة، وتُظهر حلقة تركيز، وتثبت في الوضع الهادئ.
- 💾 Save HTML from a served editor now embeds the fonts (about 11 MB). / حفظ HTML من محرر مخدَّم يضمّن الخطوط الآن (نحو 11 ميغابايت).

### Added / أضيف
- 🗂️ **A new file tree**: `Business-Wrap\المستندات - Documents\<title>\` holds `<title>.html`, `Exports\`, `Sources\` and `Versions\` (the earlier saves, never deleted); history, backups, sessions and the library live in the hidden `.system\`; a README in the save folder says what each folder is. / شجرة ملفات جديدة: المجلد `Business-Wrap\المستندات - Documents\<العنوان>\` يضم `<العنوان>.html` و`Exports\` و`Sources\` و`Versions\` (الحفظات السابقة، ولا تُحذف)؛ ويقع السجل والنسخ الاحتياطية والجلسات والمكتبة في المجلد المخفي `.system\`؛ وملف «اقرأني» في مجلد الحفظ يشرح كل مجلد.
- 🧹 **`business-wrap tidy [--dry-run]`** moves an old folder (`PDF`, `DOCX`, `HTML`, `HISTORY`) into the tree. It moves and never deletes, writes a log in `.system\migration-0.13.3.json`, and is safe to run again. / الأمر `business-wrap tidy [--dry-run]` ينقل المجلد القديم (`PDF` و`DOCX` و`HTML` و`HISTORY`) إلى الشجرة. ينقل ولا يحذف، ويكتب سجلًا في `.system\migration-0.13.3.json`، ويمكن تشغيله مرة أخرى بأمان.
- 📂 **Settings › Files folder** shows the save folder with an «Open folder» button. / الإعدادات › مجلد الملفات تعرض مجلد الحفظ مع زر «افتح المجلد».
- 🔌 **Settings › Local server**: **Start server** (on a page opened from disk; it asks ports 4317 to 4327 first and starts nothing if a server already answers) and **Stop all Business-Wrap servers** (with a confirmation; your open documents are saved first). / الإعدادات › الخادم المحلي: «تشغيل الخادم» (في الصفحة المفتوحة من القرص؛ يسأل المنافذ 4317 إلى 4327 أولًا ولا يشغّل شيئًا إن أجاب خادم) و«إيقاف كل خوادم Business-Wrap» (مع تأكيد؛ وتُحفظ مستنداتك المفتوحة أولًا).
- 🔗 **The `business-wrap:` link and `business-wrap protocol register|status|unregister`**: a per-user handler (no administrator rights) that accepts only `open?file=<a Business-Wrap .html file>` and `stop`. / الرابط `business-wrap:` والأمر `business-wrap protocol register|status|unregister`: معالج خاص بالمستخدم (دون صلاحيات المسؤول) لا يقبل إلا `open?file=<ملف Business-Wrap بصيغة .html>` و`stop`.
- 🎨 **One icon system**: each of the 226 icons has its own move on hover, focus and press, takes the theme colour, shows a focus ring, and is static in calm mode and under reduced motion. Five icons that looked alike (header and footer delete, row up and down, keep with next) now have their own glyphs. / نظام أيقونات واحد: لكل أيقونة من الأيقونات الـ226 حركتها عند المرور والتركيز والضغط، وتأخذ لون السمة، وتُظهر حلقة تركيز، وتثبت في الوضع الهادئ وعند تقليل الحركة. وخمس أيقونات كانت متشابهة (حذف الترويسة والتذييل، ورفع الصف وخفضه، والإبقاء مع التالي) لها الآن رموزها الخاصة.
- 🪞 **Arabic mirror**: start and end icons, and undo and redo, swap sides in the Arabic interface. / المرآة العربية: أيقونات البداية والنهاية والتراجع والإعادة تتبادل الجهتين في الواجهة العربية.
- 🧱 **Floated pictures and boxes** have the corner handle and resize by dragging; a click on a text box shows its selection. / الصور والصناديق العائمة لها مقبض الزاوية وتتغير أحجامها بالسحب؛ والنقر على مربع النص يُظهر تحديده.
- 🌈 **Section colours**: each toolbar section has its own colour from brand v3. / ألوان الأقسام: لكل قسم في الشريط لونه الخاص من هوية v3.
- 🪟 **Exit motion** for the ask dialog, the command palette and the print centre, static in calm mode. / حركة خروج لنافذة السؤال ولوحة الأوامر ومركز الطباعة، وتثبت في الوضع الهادئ.
- 🧪 **Test hygiene**: a test can no longer read or write your real save folder or `.local\`; the guard is in the engine and every suite imports `tests/_isolate.mjs`. / سلامة الاختبارات: لم يعد بوسع أي اختبار قراءة مجلد الحفظ الحقيقي أو `.local\` أو الكتابة فيهما؛ والحارس في المحرك وكل مجموعة تستورد `tests/_isolate.mjs`.

### Changed / تغير
- 💾 **Save HTML from a served editor embeds the fonts** (about 11 MB a file); a file opened from disk keeps linking them. / حفظ HTML من محرر مخدَّم يضمّن الخطوط (نحو 11 ميغابايت للملف)؛ والملف المفتوح من القرص يبقى رابطًا لها.
- 📁 **Exports, harvests and imports without `--out`** go to the document's own folder (`Exports\`, `Sources\`); the MCP tools' `out_dir` is optional with the same default. / التصدير والحصاد والاستيراد دون `--out` تذهب إلى مجلد الوثيقة نفسها (`Exports\` و`Sources\`)؛ والوسيط `out_dir` في أدوات MCP اختياري بالقيمة الافتراضية نفسها.
- 🔒 **Content security policy**: `connect-src` is now `'self' file: http://127.0.0.1:*`, loopback only, so a page opened from disk can ask whether your own server answers. No other origin is allowed. / سياسة أمان المحتوى: صار `connect-src` يساوي `'self' file: http://127.0.0.1:*`، أي العنوان المحلي فقط، ليتمكن الملف المفتوح من القرص من سؤال خادمك عن حاله. ولا يُسمح بأي أصل آخر.
- 🌐 **The English update popup** reads left to right with English labels. / نافذة التحديث الإنجليزية تُقرأ من اليسار إلى اليمين بعناوين إنجليزية.
- 🔤 **Code fields** use Thmanyah Sans with tabular numbers. / حقول الشيفرة تستخدم خط ثمانية سانس بأرقام جدولية.
- 🧮 **Formulas**: a bare range such as `=A1:B2` outside a function gives #ERR; an empty reference (`=Z99`) stays 0, as in Excel. / الصيغ: النطاق المجرد مثل `=A1:B2` خارج دالة يعطي #ERR؛ والمرجع الفارغ (`=Z99`) يبقى 0 كما في Excel.
- 📝 **The 0.13.2 format-bar line** no longer lists a highlight tool: there is none. / سطر شريط التنسيق في 0.13.2 لم يعد يذكر أداة تمييز، فلا توجد أداة كهذه.

### Fixed / أصلح
- ⌨️ **Writing**: typing is applied as a change to the text, so hidden diacritics survive; Enter over a selection removes it and the split is one undo step; keyboard undo works after an app edit; the command palette lists the format tools. / الكتابة: تُطبَّق الكتابة تغييرًا على النص فيبقى التشكيل المخفي؛ وEnter فوق تحديد يزيله ويكون الفصل خطوة تراجع واحدة؛ والتراجع بلوحة المفاتيح يعمل بعد تعديل من التطبيق؛ ولوحة الأوامر تعرض أدوات التنسيق.
- 📊 **Cells**: a structural edit and the paste that follows it undo in one step; Ctrl+B, I and U act on the selected cells; leaving a cell no longer triggers a second recalculation. / الخلايا: التعديل البنيوي واللصق الذي يليه يُتراجع عنهما بخطوة واحدة؛ وCtrl+B وI وU تعمل على الخلايا المحددة؛ ومغادرة الخلية لم تعد تُشغّل إعادة حساب ثانية.
- 📄 **Pages**: a page size set on one block passes to the next in both editions; placeholders and logos follow each edition; edits to a control table mirror to the other language; a chapter-level page break can be removed; a selected picture shows its selection. / الصفحات: مقاس الصفحة المضبوط على كتلة ينتقل إلى التالية في النسختين؛ والعناصر النائبة والشعارات تتبع كل نسخة؛ وتعديلات جدول التحكم تنعكس على اللغة الأخرى؛ ويمكن إزالة فاصل صفحة على مستوى الفصل؛ والصورة المحددة يظهر تحديدها.
- 💾 **Save HTML** from a served editor keeps the fonts; without embedding it restores the `file://` paths. / حفظ HTML من محرر مخدَّم يحتفظ بالخطوط؛ وبلا تضمين يعيد مسارات `file://`.
- 🔏 **Ledger reopen**: the entries a session adds to the host mirror are read as an older copy, not as tampering; a real truncation still warns. / إعادة فتح السجل: ما تضيفه الجلسة من قيود إلى نسخة الخادم يُقرأ نسخةً أقدم لا عبثًا؛ والاقتطاع الحقيقي ما زال ينبّه.
- 🔌 **MCP**: `apply_edits`, `export_document` and loading an edited file check `baseHash` and the edition; `force: true` overrides the check. / MCP: الأدوات `apply_edits` و`export_document` وتحميل الملف المعدَّل تتحقق من `baseHash` والنسخة؛ والخيار `force: true` يتجاوز ذلك.
- 🆘 **CLI help**: the `update` and `mcp` commands print their usage for `--help` and exit 2 on an unknown flag, with no network call. / مساعدة سطر الأوامر: الأمران `update` و`mcp` يطبعان طريقة الاستخدام عند `--help` ويخرجان بالرمز 2 عند علم مجهول، دون اتصال بالشبكة.
- 📝 **DOCX** core properties carry the document title and language. / خصائص ملف DOCX الأساسية تحمل عنوان الوثيقة ولغتها.
- 🔔 **Panels and the update popup**: panel icons share one size, the profile icons are distinct, and the popup follows its language. / اللوحات ونافذة التحديث: أيقونات اللوحات بحجم واحد، وأيقونات الملف الشخصي متمايزة، والنافذة تتبع لغتها.

### Migration notes / ملاحظات الترحيل
- An old save folder (`PDF`, `DOCX`, `HTML`, `HISTORY`) is moved into the tree on the first start of a folder you chose. To see the plan first, run `business-wrap tidy --dry-run`; to move it yourself, run `business-wrap tidy`. Nothing is deleted. / المجلد القديم (`PDF` و`DOCX` و`HTML` و`HISTORY`) يُنقل إلى الشجرة عند أول تشغيل لمجلد اخترته. لرؤية الخطة أولًا شغّل `business-wrap tidy --dry-run`، ولنقله بنفسك شغّل `business-wrap tidy`. ولا يُحذف شيء.
- History files are now named `<Document title> (<first 8 characters of the id>).bwlog`; the older names keep working. Do not move or edit `.system`. / ملفات السجل تُسمى الآن `<عنوان الوثيقة> (<أول 8 أحرف من المعرّف>).bwlog`؛ والأسماء القديمة تبقى تعمل. لا تنقل `.system` ولا تعدّله.
- A tool that read `PDF\`, `DOCX\` or `HISTORY\` should now read the document's `Exports\` and `.system\history\`. / الأداة التي كانت تقرأ `PDF\` أو `DOCX\` أو `HISTORY\` عليها الآن أن تقرأ `Exports\` الخاص بالوثيقة و`.system\history\`.
- Editors saved before 0.13.3 keep their old content security policy, so their Start server button cannot probe: open the file with the new build. Files made by 0.13.0 to 0.13.2 open as they are. / المحررات المحفوظة قبل 0.13.3 تحتفظ بسياسة الأمان القديمة، فلا يستطيع زر «تشغيل الخادم» فيها الفحص: افتح الملف بالإصدار الجديد. وملفات 0.13.0 إلى 0.13.2 تُفتح كما هي.

## [0.13.2] - 2026-10-29

📊 Real tables, Enter and line breaks that behave, user stories, page-gap tools, and a history that can no longer be lost silently. / 📊 جداول حقيقية، وزر Enter وفواصل أسطر تعمل كما يُتوقع، وقصص مستخدم، وأدوات لفراغات الصفحات، وسجل لا يضيع بصمت.

**In 10 seconds / في عشر ثوان**
- 📊 Table cells work like a spreadsheet: select, merge, split, paste from Excel, formulas, resize. / خلايا الجدول تعمل كجدول بيانات: تحديد ودمج وتقسيم ولصق من Excel وصيغ وتغيير حجم.
- ↩️ Enter in a cell is a new line; Tab moves to the next cell; Enter commits a formula. / Enter داخل الخلية سطر جديد؛ وTab ينتقل إلى الخلية التالية؛ وEnter يثبّت الصيغة.
- 📖 Insert a user story and add points to it. / إدراج قصة مستخدم وإضافة نقاط إليها.
- 🧹 «Gaps and pages» tools remove empty space. / أدوات «الفراغات والصفحات» تزيل المساحات الفارغة.
- 🛡️ An old file is migrated, or refused with a backup, and never opened with its history lost. / الملف القديم يُرحَّل أو يُرفض مع نسخة احتياطية، ولا يُفتح أبدًا وقد فقد سجله.

### Added / أضيف
- 📊 **Table cells**: insert and delete rows and columns (merges, widths, heights and formula references follow), merge and split cells, and a wrap toggle per cell. / خلايا الجدول: إدراج الصفوف والأعمدة وحذفها (وتتبعها الخلايا المدمجة والعروض والارتفاعات ومراجع الصيغ)، ودمج الخلايا وتقسيمها، ومفتاح التفاف لكل خلية.
- 🔢 **Lists inside a cell**: bullets or numbers, Enter starts the next item; they print the same in the editor, PDF and DOCX. / القوائم داخل الخلية: نقطية أو رقمية، وEnter يبدأ البند التالي؛ وتظهر بالشكل نفسه في المحرر وPDF وDOCX.
- 🖱️ **Selecting cells**: drag, Shift+click or Ctrl+click; the format bar (bold, colour, font, size, alignment, lists) acts on every selected cell. / تحديد الخلايا: بالسحب أو Shift+نقر أو Ctrl+نقر؛ وشريط التنسيق (غامق ولون وخط وحجم ومحاذاة وقوائم) يعمل على كل الخلايا المحددة.
- 📋 **Copy, cut and paste** between cells and from Excel: an Excel block pasted into one cell spreads over the cells below and beside it; one value pasted over a selection fills it; a copy from the table keeps its format and shifts its formulas. / النسخ والقص واللصق بين الخلايا ومن Excel: كتلة Excel الملصوقة في خلية واحدة تتوزع على الخلايا أسفلها وبجانبها؛ وقيمة واحدة ملصوقة فوق تحديد تملؤه؛ والنسخ من الجدول يحفظ التنسيق ويزيح الصيغ.
- 🧽 **Delete and Backspace clear** the selected cells; **Clear value** and **Clear format** are separate commands; Esc inside a cell selects that cell. / مفتاحا Delete وBackspace يمسحان الخلايا المحددة؛ و«مسح القيمة» و«مسح التنسيق» أمران منفصلان؛ وEsc داخل الخلية يحدد تلك الخلية.
- ➗ **Formulas** in cells: SUM, AVERAGE, MIN, MAX and COUNT, the four operations and brackets, cell references and ranges; a bad formula, a cycle or a division by zero shows #ERR. The PDF and DOCX print the value. / الصيغ في الخلايا: SUM وAVERAGE وMIN وMAX وCOUNT والعمليات الأربع والأقواس، ومراجع الخلايا والنطاقات؛ والصيغة الخاطئة أو الدائرية أو القسمة على صفر تُظهر #ERR. ويطبع PDF وDOCX القيمة.
- ↔️ **Resize** column widths and row heights by dragging, or by command; one size applies to every selected column or row. / تغيير الحجم: عروض الأعمدة وارتفاعات الصفوف بالسحب أو بالأمر؛ ويُطبَّق حجم واحد على كل الأعمدة أو الصفوف المحددة.
- 📖 **Insert › User story**: a new story in the SRS card layout with the next US-NN number and the document's own columns. / إدراج › قصة مستخدم: قصة جديدة بتخطيط بطاقة وثيقة المتطلبات، مع رقم US-NN التالي وأعمدة الوثيقة نفسها.
- ➕ **More points**: add an acceptance point after the selected one or at the end of the list, add another story in the same block, and press Enter inside a point to start the next. / مزيد من النقاط: إضافة نقطة قبول بعد النقطة المحددة أو في نهاية القائمة، وإضافة قصة أخرى في الكتلة نفسها، وEnter داخل النقطة يبدأ التالية.
- 🧹 **«Gaps and pages» tools**: add or remove a page break, pull the next section up, delete a section (with an undo message; the page size passes on so no later page turns), and remove empty paragraphs and sections left blank. / أدوات «الفراغات والصفحات»: إضافة فاصل صفحة أو حذفه، وسحب القسم التالي إلى الأعلى، وحذف قسم (مع رسالة تراجع؛ ويمرَّر مقاس الصفحة فلا تنقلب صفحة لاحقة)، وإزالة الفقرات الفارغة والأقسام التي بقيت خالية.
- 🛡️ **History safeguard**: every file now carries a format number. An older file is migrated step by step; a file from a newer Business-Wrap, or one whose history would be lost, is refused before anything changes, a copy is saved in `HISTORY\backups`, and the page explains why instead of opening empty. / حماية السجل: يحمل كل ملف الآن رقم صيغة. الملف الأقدم يُرحَّل خطوة خطوة؛ والملف الأحدث من إصدار آخر، أو الذي سيضيع سجله، يُرفض قبل أي تغيير، وتُحفظ نسخة في `HISTORY\backups`، وتشرح الصفحة السبب بدل أن تُفتح فارغة.
- 🧪 **A history fixture per release and a release gate**: each version keeps a real file made by its own build, and a release is stopped if a version has no fixture or an old one no longer opens with its whole history (`npm run gate:history`). / ملف اختبار للسجل لكل إصدار وبوابة إصدار: يحتفظ كل إصدار بملف حقيقي صنعه إصداره نفسه، ويُمنع الإصدار إذا غاب الملف أو لم يعد ملف قديم يُفتح بسجله كاملًا (`npm run gate:history`).
- 🔧 **Recover-history tool** `tools/recover-history.mjs`: matches a file that lost its log to the logs kept in `HISTORY\`; it only reports by default, and applies only the ones you approve, after a backup. / أداة استرجاع السجل `tools/recover-history.mjs`: تطابق الملف الذي فقد سجله مع السجلات المحفوظة في `HISTORY\`؛ وتكتفي بالتقرير افتراضيًا، ولا تطبّق إلا ما توافق عليه، بعد نسخة احتياطية.
- ⚡ **Faster tests**: `npm test` runs the suites in parallel and prints only what failed, with each suite's time; `npm run test:changed` runs only the suites touched by your change. / اختبارات أسرع: `npm test` يشغّل المجموعات بالتوازي ويطبع ما فشل فقط مع زمن كل مجموعة؛ و`npm run test:changed` يشغّل المجموعات التي مسّها تغييرك فقط.
- 🎨 **Format bar on a highlighted range**: bold, italic, underline, colour, font, size and alignment now apply to every paragraph or cell the selection touches, not only the first. / شريط التنسيق على النطاق المحدد: الغامق والمائل والتسطير واللون والخط والحجم والمحاذاة تُطبَّق الآن على كل فقرة أو خلية يشملها التحديد وليس على الأولى فقط.
- 🧹 **Remove empty pages** also removes a table of empty cells and a section left with no blocks that still starts a page; «pull up» falls back to it when there is no page break to drop. / «إزالة الصفحات الفارغة» تزيل أيضًا جدولًا خلاياه فارغة وقسمًا بلا كتل ما زال يبدأ صفحة؛ و«اسحب لأعلى» تلجأ إليها حين لا يوجد فاصل صفحة لإزالته.
- ⌨️ **Shift+Arrow** extends the selected cell range like Excel (Esc inside a cell selects it first). / Shift+الأسهم يوسّع نطاق الخلايا المحددة كما في Excel (اضغط Esc داخل الخلية لتحديدها أولًا).
- ↩️ **A formula edit undoes in one step** (typing it and turning it into a formula were two). / تعديل الصيغة يُتراجع عنه بخطوة واحدة (كان الكتابة وتحويلها إلى صيغة خطوتين).
- 🧮 **Fill handle**: drag the corner of the selected cells to fill them; formulas shift their relative references (A1 → A2 going down) and `$`-anchored parts stay. / مقبض التعبئة: اسحب زاوية الخلايا المحددة لتعبئتها؛ وتتحرك مراجع الصيغ النسبية (A1 ← A2 نزولًا) وتبقى الأجزاء المثبتة بـ `$`.
- 🔠 **Format bar over several paragraphs** formats only the highlighted part of the first and last paragraph, not the whole paragraphs. / شريط التنسيق على عدة فقرات يُنسّق الجزء المحدد فقط من الفقرة الأولى والأخيرة لا الفقرتين كاملتين.
- 🧹 **Remove empty pages** also removes blank paragraphs left after the words of a block (a page empty only by spacing). / «إزالة الصفحات الفارغة» تزيل أيضًا الفقرات الفارغة المتروكة بعد كلمات الكتلة (صفحة فارغة بسبب التباعد فقط).

### Changed / تغير
- ↩️ **Enter and Shift+Enter**: Enter in a paragraph or an acceptance point splits it at the caret into a new paragraph (the other language's edition keeps its shape); Enter in a table cell or a list item, and Shift+Enter anywhere, is a line break that prints as a line break in the editor, PDF and DOCX. A formula typed in a cell is committed by Enter; Tab moves between cells. Titles still commit on Enter. / Enter وShift+Enter: Enter داخل فقرة أو نقطة قبول يقسمها عند المؤشر إلى فقرة جديدة (وتحافظ نسخة اللغة الأخرى على شكلها)؛ وEnter داخل خلية جدول أو بند قائمة، وShift+Enter في أي مكان، يضيف فاصل سطر يُطبع فاصل سطر في المحرر وPDF وDOCX. والصيغة المكتوبة في خلية يثبّتها Enter؛ وTab ينتقل بين الخلايا. وتبقى العناوين تُثبَّت بـ Enter.
- 🎯 **Lists and text boxes follow the selection**: a bullet, number or shape list applies to every paragraph or cell the highlighted range touches and switches off together; a new text box is placed at the caret, not at the top of the page. / القوائم ومربع النص تتبع التحديد: القائمة النقطية أو الرقمية أو المشكلة تُطبَّق على كل فقرة أو خلية يمسّها النص المظلَّل وتُلغى معًا؛ ويوضع مربع النص الجديد عند المؤشر لا في أعلى الصفحة.

### Fixed / أصلح
- 🔔 **The share dialog and its message fit the screen**: the message wraps (a long path breaks anywhere, buttons stay whole), the dialog scrolls inside, and both stay within the window down to a 1024 × 640 screen. / نافذة المشاركة ورسالتها تناسبان الشاشة: الرسالة تلتف (والمسار الطويل ينكسر في أي موضع، وتبقى الأزرار كاملة)، والنافذة تتمرر من الداخل، وتبقى الاثنتان داخل الإطار حتى شاشة 1024 × 640.
- 🔏 **A file re-opened by a newer version no longer loses its history**: the log, its mark, contributors and lock are carried over on every re-wrap, and a future edition attribute survives Save HTML. / الملف الذي يعيد فتحه إصدار أحدث لم يعد يفقد سجله: يُنقل السجل وعلامته والمساهمون والقفل عند كل إعادة تغليف، وتبقى سمات النسخ المستقبلية بعد «حفظ HTML».
- 🖼️ A click that follows a press on a drawing no longer clears its selection when the page redraws; the 16 new icons have the same hover and press motion as the others. / النقر الذي يلي الضغط على رسم لم يعد يلغي تحديده عند إعادة رسم الصفحة؛ وللأيقونات الست عشرة الجديدة حركة المرور والضغط نفسها كغيرها.
- 🖱️ A click right after a press that selected a block no longer clears the selection when the page redraws under it («صفحة جديدة قبل هذا القسم» then acts on the right section). / النقر بعد ضغطة حددت كتلة لم يعد يلغي التحديد عند إعادة رسم الصفحة.
- 🧪 The host test uses free ports, so two test runs at once no longer collide. / اختبار الخادم يستخدم منافذ حرة، فلا يتعارض تشغيلان معًا.

### Migration notes / ملاحظات الترحيل
- Files made by 0.13.0 and 0.13.1 open as they are and are stamped with format 1; nothing to do. Merges, widths, heights and formulas are stored beside the table. / ملفات 0.13.0 و0.13.1 تُفتح كما هي ويوضع عليها رقم الصيغة 1؛ ولا شيء يلزم. وتُخزَّن الخلايا المدمجة والعروض والارتفاعات والصيغ بجانب الجدول.
- Enter in a table cell is now a new line. Commit with Tab, or click outside the cell. / Enter في خلية الجدول صار يبدأ سطرًا جديدًا. ثبّت القيمة بـ Tab أو بالنقر خارج الخلية.

## [0.13.1] - 2026-10-29

🧰 Projects and bulk edits, a background host with a power-off button, Save in place, and the second review's fixes. / 🧰 مشاريع وتعديل جماعي، وخادم في الخلفية بزر إيقاف، وحفظ في المكان، وإصلاحات المراجعة الثانية.

**In 10 seconds / في عشر ثوان**
- 🗂️ Projects in «المستندات», and one bulk edit across a project or chosen documents. / مشاريع في «المستندات»، وتعديل جماعي واحد على مشروع أو وثائق تختارها.
- 💾 Ctrl+S saves the document itself, in place: its own HTML file, no download. / Ctrl+S يحفظ الوثيقة نفسها في مكانها: ملف HTML الخاص بها، بلا تنزيل.
- ⏻ The host runs with no window; a power-off button stops every Business-Wrap host. / الخادم يعمل بلا نافذة؛ وزر إيقاف يوقف كل خوادم Business-Wrap.
- 🔏 Exports are logged, a renamed person stays one person, a stripped log is never "made before 0.13". / التصدير يُسجَّل، والشخص الذي غيّر اسمه يبقى شخصًا واحدًا، والسجل المنزوع لا يُعدّ «أُنشئ قبل 0.13».

### Added / أضيف
- 🗂️ **Projects** «المشاريع» in the documents list: group documents per project, many projects at once, rename, delete to the project trash and restore; kept in the browser and in `HISTORY\projects.json`. / المشاريع في قائمة «المستندات»: تجميع الوثائق لكل مشروع، ومشاريع كثيرة معًا، وإعادة تسمية، وحذف إلى سلة المشاريع واسترجاع؛ تُحفظ في المتصفح وفي `HISTORY\projects.json`.
- ✏️ **Bulk edit** «تعديل جماعي»: add, delete or edit a field or a section across a whole project or hand-picked documents, with a preview before anything is applied. / التعديل الجماعي: إضافة حقل أو قسم أو حذفه أو تعديله في مشروع كامل أو وثائق تختارها، مع معاينة قبل التطبيق.
- ⏻ **Power off** in the toolbar, with a confirm popup, and `business-wrap stop --all`: every Business-Wrap host and service stops (Claude's own MCP server is left to Claude). / زر الإيقاف في الشريط مع نافذة تأكيد، و`business-wrap stop --all`: يتوقف كل خادم وخدمة لـ Business-Wrap (ويُترك خادم MCP الخاص بـ Claude له).
- 📤 **Share** opens a popup (recipient, note, what travels) and a result card; «افتح موقع الملف» selects the saved HTML in Explorer. / المشاركة تفتح نافذة (المستلم والملاحظة وما ينتقل) وبطاقة نتيجة؛ و«افتح موقع الملف» يحدد ملف HTML المحفوظ في المستكشف.
- 🎨 **Icons** on every panel button that had only words (palette import, profile picture, report, compare, checkpoint, template, check-panel jump, the documents list, page setup, find), each with its own hover, focus and press motion; every 0.13 icon animates like the 0.12 ones. / أيقونات على كل زر في اللوحات كان كلمات فقط (استيراد اللوحة، صورة الملف الشخصي، التقرير، المقارنة، نقطة الحفظ، القالب، الانتقال من لوحة الفحص، قائمة المستندات، إعداد الصفحة، البحث)، ولكل منها حركتها عند المرور والتركيز والضغط؛ وكل أيقونات 0.13 تتحرك كأيقونات 0.12.

### Changed / تغير
- 💾 **Save in place**: Ctrl+S and the yellow Save write the document's own `<title>-<date>-<AR|ENG>.html` in `HTML\` (overwritten, history appended) and its list entry, and reset the change counter; one Save HTML at a time. / الحفظ في المكان: Ctrl+S وزر الحفظ الأصفر يكتبان ملف الوثيقة `<العنوان>-<التاريخ>-<AR|ENG>.html` في `HTML\` (يُستبدل ويُلحق به السجل) وسطرها في القائمة، ويعيدان عدّاد التغييرات إلى صفر؛ وحفظ HTML واحد في كل مرة.
- 📥 **File › Import** is the documents list's import: an HTML (a share too), DOCX, PDF or JSON opens as a document; an edits file still merges. / «ملف › استيراد» هو استيراد قائمة المستندات: ملف HTML (والمشارَك أيضًا) أو DOCX أو PDF أو JSON يُفتح وثيقةً؛ وملف التعديلات ما زال يُدمج.
- 🖥️ **Background host**: launched from Claude it shows no console window; the profile (name, picture) is kept with the host, across relaunch and update. / الخادم في الخلفية: يعمل من Claude دون نافذة طرفية؛ والملف الشخصي (الاسم والصورة) يُحفظ مع الخادم عبر إعادة التشغيل والتحديث.
- 🔤 **One title**: the cover title drives «عنوان الوثيقة», the list, share and saved file names, the report, the PDF title and the browser tab. / عنوان واحد: عنوان الغلاف يقود «عنوان الوثيقة» والقائمة وأسماء ملفات المشاركة والحفظ والتقرير وعنوان PDF وتبويب المتصفح.
- 📐 **Page setup on the canvas**: the editor shows landscape and A3, A5, Letter or Legal pages as set, for the whole document or one section, as the PDF and DOCX print them. / إعداد الصفحة على اللوحة: يعرض المحرر الصفحات الأفقية وA3 وA5 وLetter وLegal كما ضُبطت، للوثيقة كلها أو لقسم، كما يطبعها PDF وDOCX.
- 🧭 **Side panels**: buttons with borders, hover, motion and colours like the «عرض الصفحات» control; the header strip sits beside an open panel. / اللوحات الجانبية: أزرار بحدود وتأثير مرور وحركة وألوان كمفتاح «عرض الصفحات»؛ وشريط الترويسة يقف بجانب اللوحة المفتوحة.
- 🔄 **Updates** come from the GitHub release, never npm, and never move to an older version; install 0.13.1 from the GitHub tag. / التحديثات من إصدار GitHub لا من npm، ولا تنتقل أبدًا إلى إصدار أقدم؛ وثبّت 0.13.1 من وسم GitHub.

### Fixed / أصلح
- 🔏 **A served 0.13.0 file keeps its history**: re-wrapping an older editor file carried only the documents and dropped the log, the `bwlog` mark, contributors, the lock and the head traces, so it opened «stripped». / ملف 0.13.0 المقدَّم يحتفظ بسجله: إعادة تغليف ملف المحرر الأقدم كانت تنقل الوثائق وحدها وتُسقط السجل وعلامة `bwlog` والمساهمين والقفل وآثار الرأس، فيُفتح «منزوعًا».
- 🔏 **Trust ledger** (review 2): every PDF, DOCX and print export is logged, so the report counts them; a renamed profile is one person with its other names listed; removing the log and the mark shows «stripped», never «made before 0.13». / سجل الثقة (المراجعة الثانية): كل تصدير PDF وDOCX وطباعة يُسجَّل فيعدّه التقرير؛ والملف الشخصي المعاد تسميته شخص واحد مع أسمائه الأخرى؛ وإزالة السجل والعلامة تُظهر «منزوع» لا «أُنشئ قبل 0.13».
- ✒️ **Ctrl+A on a bullet** with mixed formatting, then bold or a colour, formats the whole bullet (it coloured only the last word). / Ctrl+A على بند منقّط بتنسيق مختلط ثم الغامق أو اللون ينسّق البند كله (كان يلوّن الكلمة الأخيرة فقط).
- 🔔 Toasts with buttons expire and never stack; the RTL/LTR choice is kept per edition; the toolbar folds groups into «…» at laptop widths instead of dropping them; small edit dialogs keep what was typed and use a colour swatch, a font list and a size stepper; text boxes get a move grip and stay inside the page; every wrap mode switches back. / الرسائل ذات الأزرار تنتهي ولا تتكدس؛ واتجاه RTL/LTR يُحفظ لكل نسخة؛ والشريط يطوي المجموعات في «…» على شاشات الحاسوب المحمول بدل إسقاطها؛ ونوافذ التعديل الصغيرة تحفظ ما كُتب وتستخدم منتقي ألوان وقائمة خطوط ومحدد حجم؛ ومربعات النص لها مقبض نقل وتبقى داخل الصفحة؛ وكل نمط التفاف يعود.
- 🗂️ The save-folder dialog no longer freezes the server and opens in front; `HISTORY\` is always hidden and never served; closing a tab keeps the last typed text and closed tabs stay closed; several harvest sources under one name no longer overwrite each other. / نافذة اختيار مجلد الحفظ لا تجمّد الخادم وتُفتح في المقدمة؛ و`HISTORY\` مخفي دائمًا ولا يُقدَّم؛ وإغلاق التبويب يحفظ آخر نص مكتوب والتبويبات المغلقة تبقى مغلقة؛ ومصادر الحصاد المتعددة تحت اسم واحد لم يعد بعضها يستبدل بعضًا.
- 🧾 **SRS pipeline**: seven defects found while adjudicating six real builds, fixed at the root. / مسار وثيقة المتطلبات: سبعة عيوب وُجدت عند فحص ست وثائق حقيقية، أُصلحت من جذرها.
- 🧪 `npm test` runs every suite in `tests/` (power, projects, bulk and the SRS suites were left out), and a check keeps it so; Save and Import hover help describe the new behaviour. / `npm test` يشغّل كل مجموعة في `tests/` (كانت مجموعات الإيقاف والمشاريع والتعديل الجماعي ووثائق المتطلبات خارجه)، وفحص يُبقيه كذلك؛ وشرح «حفظ» و«استيراد» عند المرور يصف السلوك الجديد.

### Migration notes / ملاحظات الترحيل
- Nothing to do: 0.13.0 files, logs (`bwlog` v1, unchanged) and settings open as they are. Ctrl+S on the local server no longer downloads an edits file; Export › edits still does. / لا شيء يلزم: ملفات 0.13.0 وسجلاتها (`bwlog` الإصدار 1، دون تغيير) وإعداداتها تُفتح كما هي. وCtrl+S على الخادم المحلي لم يعد ينزّل ملف تعديلات؛ و«تصدير › التعديلات» ما زال يفعل.

## [0.13.0] - 2026-10-29

🗂️ A document library, a change timeline, header and footer sections, Word-style objects and a tamper-evident history. / 🗂️ مكتبة وثائق، وخط زمني للتغييرات، وقسما الترويسة والتذييل، وعناصر كما في Word، وسجل كاشف للعبث.

**In 10 seconds / في عشر ثوان**
- 🗂️ «المستندات»: every Save is its own document; open, duplicate, delete, restore, import PDF, DOCX or HTML. / «المستندات»: كل حفظ وثيقة مستقلة؛ فتح ونسخ وحذف واسترجاع، واستيراد PDF أو DOCX أو HTML.
- 🕘 «تغييرات»: a timeline with back, forward and checkpoints. / «تغييرات»: خط زمني مع رجوع وتقدّم ونقاط حفظ.
- 🧾 Header and Footer: two toolbar sections, items per page, edited on every page. / الترويسة والتذييل: قسمان في شريط الأدوات، وعناصر لكل صفحة، وتحرير على كل صفحة.
- 🔏 A signed, hash-chained history that shows any removed or edited entry. / سجل موقّع ومتسلسل بالتجزئة يكشف أي قيد محذوف أو معدَّل.
- ⌨️ A `business-wrap` CLI and "/" commands that work offline, with no AI. / واجهة `business-wrap` السطرية وأوامر «/» تعمل دون شبكة ودون ذكاء اصطناعي.

### Added / أضيف
- 🗂️ **Document library** «المستندات» (Ctrl+O, and a File tool): Save creates a new entry from a template and updates a library document; open here or in a new tab, duplicate, trash and restore, import PDF, DOCX or a Save-HTML file; the lock state travels with the entry. / مكتبة الوثائق «المستندات» (Ctrl+O، وأداة في «ملف»): الحفظ ينشئ مدخلًا جديدًا من القالب ويحدّث وثيقة المكتبة؛ فتح هنا أو في تبويب جديد، ونسخ، وسلة محذوفات واسترجاع، واستيراد PDF أو DOCX أو ملف HTML محفوظ؛ وحالة القفل تنتقل مع المدخل.
- 🕘 **Changes timeline** «تغييرات» (Ctrl+Shift+H, the counter, and a Document tool): step back and forward, checkpoints, the author of each change; the counter restarts at Save HTML only. / الخط الزمني «تغييرات» (Ctrl+Shift+H، والعداد، وأداة في «الوثيقة»): رجوع وتقدّم، ونقاط حفظ، ومؤلف كل تغيير؛ والعداد يبدأ من جديد عند حفظ HTML فقط.
- 📁 **Save folder** `<folder>\Business-Wrap\{PDF,DOCX,HTML,HISTORY}` with `<title>-<date>-<AR|ENG>` names (a clash gets -2, never an overwrite), asked once on the first Save **or export**; the Export & Print centre writes there too. / مجلد الحفظ `<المجلد>\Business-Wrap\{PDF,DOCX,HTML,HISTORY}` بأسماء `<العنوان>-<التاريخ>-<AR|ENG>` (والتكرار يأخذ -2، دون استبدال أبدًا)، ويُسأل عنه مرة عند أول حفظ **أو تصدير**؛ ومركز التصدير والطباعة يكتب فيه أيضًا.
- 🖥️ **Background host**: closing the last tab saves every tab and stops the server completely; the next launch offers to resume everything or start new work. / خادم في الخلفية: إغلاق آخر تبويب يحفظ كل التبويبات ويوقف الخادم تمامًا؛ والتشغيل التالي يعرض استئناف كل شيء أو بدء عمل جديد.
- 🧾 **Header «الترويسة» and Footer «التذييل»**, two toolbar sections: text, fields, logos, page numbers, alignment; each item for every page, this page only, or from this page on; in the page views each page carries its own header and footer, edited in place. / قسما الترويسة والتذييل في شريط الأدوات: نص وحقول وشعارات وأرقام صفحات ومحاذاة؛ ولكل عنصر نطاق؛ وفي عروض الصفحات تحمل كل صفحة ترويستها وتذييلها، وتُحرَّر في مكانها.
- 📐 **Page setup**: A3, A4, A5, Letter, Legal; portrait or landscape for the whole document or one section; a page break at a chosen section, in PDF and DOCX. / إعداد الصفحة: A3 وA4 وA5 وLetter وLegal؛ عمودي أو أفقي للوثيقة أو لقسم؛ وفاصل صفحة عند قسم تختاره، في PDF وDOCX.
- 🧱 **Objects**: tables, sections and chapters anywhere; copy and paste a whole block; free text boxes; images with Word's seven wrap modes (inline, square, tight, through, top and bottom, behind, in front). / العناصر: جداول وأقسام وفصول في أي مكان؛ نسخ كتلة ولصقها؛ مربعات نص حرة؛ وصور بأنماط الالتفاف السبعة كما في Word.
- ✒️ **Format bar** for a selection: colour, size, font, alignment, vertical alignment, quote, link, code, bold, italic, underline, bullets and numbers to six levels. / شريط تنسيق للتحديد: اللون والحجم والخط والمحاذاة الأفقية والعمودية والاقتباس والرابط والشيفرة والغامق والمائل والتسطير والقوائم حتى ستة مستويات.
- 🔏 **Trust**: a profile, provenance per change (who, what, exact diff, when), sign, share, lock and unlock (no password, a warning), a tamper-evident hash-chained signed history (`bwlog` v1, frozen) mirrored in `HISTORY`, and a work report as PDF; toolbar tools for Provenance, Sign, Lock and Share. / الثقة: ملف شخصي، ومصدر كل تغيير، وتوقيع، ومشاركة، وقفل وفتح (بلا كلمة مرور، مع تنبيه)، وسجل كاشف للعبث متسلسل وموقّع (`bwlog` الإصدار 1، مجمّد) له نسخة مرآة في `HISTORY`، وتقرير عمل PDF؛ وأدوات في الشريط للمصدر والتوقيع والقفل والمشاركة.
- ⌨️ **Tooling**: the `business-wrap` CLI (every verb offline, no AI), Claude Code "/" commands, MCP `harvest_sources`, `open_in_editor`, `close_editor`, healers for locators and waits only (marked HEALED, never PASS) and per-stage gates. / الأدوات: الواجهة السطرية `business-wrap` (كل أمر دون شبكة ودون ذكاء اصطناعي)، وأوامر «/» في Claude Code، وأدوات MCP الجديدة، ومعالجة ذاتية للمحددات والانتظار فقط (تُوسم HEALED لا PASS)، وفحوص لكل مرحلة.
- 🎨 **Design**: import a colour palette (hex lines, JSON, CSS variables, ASE, a swatch image) behind the contrast gate; logo motion with a stronger hover. / التصميم: استيراد لوحة ألوان خلف فحص التباين؛ وحركة للشعار مع تأثير أقوى عند المرور.

### Changed / تغير
- 🧭 **Toolbar**: mounted once and patched in place, so only the clicked control animates; hover explainers wait about 900 ms and do not repeat for a tool already seen or used. / شريط الأدوات يُبنى مرة ويُحدَّث في مكانه، فلا يتحرك إلا ما نُقر؛ وبطاقات الشرح تنتظر نحو 900 مللي ثانية ولا تتكرر لأداة رأيتها أو استخدمتها.
- 🗃️ **Side panels**: every panel (Design, Process and local learning included) opens with its first group expanded and the rest collapsed, rows shaded alternately; a click outside closes it. / اللوحات الجانبية: كل لوحة (التصميم والإجراء والتعلم المحلي معها) تفتح بمجموعتها الأولى ظاهرة والباقي مطويًّا، بصفوف متناوبة التظليل؛ والنقر خارجها يغلقها.
- 🔔 **Toasts** at the bottom: about 2.5 s, a click dismisses them. / الرسائل في الأسفل: نحو ثانيتين ونصف، والنقر يغلقها.
- ↕️ **Move up / down** crosses into the next or previous section, moves a paragraph, a row or a whole section, and the selection follows. / النقل للأعلى والأسفل يعبر إلى القسم المجاور، وينقل فقرة أو صفًّا أو قسمًا كاملًا، والتحديد يتبعه.
- ✏️ **Everything editable**: TOC entries (delete hides the entry, the section stays), the document-control table and revisions get the table tools. / كل شيء قابل للتعديل: مدخلات جدول المحتويات (الحذف يخفي المدخل ويبقى القسم)، وجدول ضبط الوثيقة والمراجعات لها أدوات الجدول.
- 🔤 **Thmanyah only** in the editor chrome: the last monospace fallbacks (version badge, commands, update details) now use Thmanyah Sans. / خطوط ثمانية وحدها في واجهة المحرر: آخر الخطوط الاحتياطية أحادية المسافة صارت Thmanyah Sans.
- ⚖️ **Licence MIT everywhere it is stated**, the About card included, which also states the history's honest limit. / رخصة MIT في كل موضع تُذكر فيه، ومنها بطاقة «حول» التي تذكر أيضًا حد السجل بصدق.

### Fixed / أصلح
- 🔁 **Redo** no longer freezes the tab with local learning on. / الإعادة لم تعد تجمّد التبويب مع التعلم المحلي.
- ⌨️ **Shortcuts** work with the focus in the toolbar (Alt+↑ after a toolbar Move, Ctrl+Z, Ctrl+D, Delete). / الاختصارات تعمل والتركيز في شريط الأدوات.
- ✅ **Check panel**: each problem has a button that jumps to and rings its place. / لوحة الفحص: لكل مشكلة زر يقفز إلى موضعها ويحدده.
- 🧩 **Extensions boot after they load**: the first view already shows every extension's tools; the draft-recovery question and the first-open motion are no longer lost to a second build. / الإضافات تُشغَّل بعد تحميلها: يظهر كل شيء من أول عرض، ولا يضيع سؤال استعادة المسودة ولا حركة الفتح الأولى.
- 🧪 **Acceptance review (2026-10-29), every FAIL and PARTIAL line**: / مراجعة القبول (2026-10-29)، كل بند «فشل» أو «جزئي»:
  - ↕️ Insert an image, then move a paragraph down twice: no crash; every structural change reaches both editions or is refused. / إدراج صورة ثم نقل فقرة للأسفل مرتين: لا انهيار؛ وكل تغيير بنيوي يصل إلى النسختين أو يُرفض.
  - 🖼️ «إدراج صورة» and paste give the image Word's seven wrap modes, like a dropped file. / «إدراج صورة» واللصق يعطيان الصورة أنماط الالتفاف السبعة، كالملف المسحوب.
  - 🗃️ Every side-panel group starts collapsed, rows alternate their shade, one chevron convention. / كل مجموعة في اللوحات الجانبية تبدأ مطويّة، والصفوف متناوبة التظليل، واتجاه واحد للأسهم.
  - 🧾 A header or footer item «هذه الصفحة فقط» applies to the page it was picked on; the toast shows only on success. / عنصر الترويسة أو التذييل «هذه الصفحة فقط» يُطبَّق على الصفحة التي اختير منها؛ والرسالة تظهر عند النجاح فقط.
  - ✅ «اذهب إليه» rings the place in the body, never the contents row, on every finding. / «اذهب إليه» يحدد الموضع في المتن لا سطر جدول المحتويات، في كل ملاحظة.
  - 🗂️ The list copy is always the latest; Open here sets `#doc=<id>` and closes the drawer; a reload reopens the document. / نسخة القائمة هي الأحدث دائمًا؛ و«افتح هنا» يضع `#doc=<id>` ويغلق اللوحة؛ وإعادة التحميل تعيد فتح الوثيقة.
  - 📁 Share, the work report and imports use `<title>-<date>-<AR|ENG>` with the spaces kept; no `.manifest.json` in `DOCX\`. / المشاركة وتقرير العمل والاستيراد تستخدم `<العنوان>-<التاريخ>-<AR|ENG>` مع إبقاء المسافات؛ ولا ملف `.manifest.json` في `DOCX\`.
  - 🔏 Every open path is logged: the documents list, New, import (the file's log kept as `entry.prov`), duplicate (`copy.from` names the source), a JSON document and the New wizard. / كل طريق فتح يُسجَّل: قائمة المستندات، وجديد، والاستيراد (يُحفظ سجل الملف في `entry.prov`)، والنسخ (`copy.from` يسمّي المصدر)، ووثيقة JSON، ومعالج الوثيقة الجديدة.
  - 🧷 `verify-history` and the `ledger` gate run one full check (state, tail, stripped, `HISTORY` head): a content-only edit and a cut tail fail. / `verify-history` وفحص `ledger` يشغّلان فحصًا كاملًا واحدًا (الحالة، والذيل، والحذف، ورأس `HISTORY`): التعديل في المحتوى وحده وقطع الذيل يفشلان.
  - 🕰️ A document made before 0.13 shows «بلا سجل (أُنشئت قبل 0.13)» in a neutral style and is logged from then on; a 0.13 document whose log was removed stays «stripped». / الوثيقة المنشأة قبل 0.13 تُظهر «بلا سجل (أُنشئت قبل 0.13)» بلون محايد وتُسجَّل من ذلك الحين؛ ووثيقة 0.13 التي حُذف سجلها تبقى «محذوفة السجل».
  - 📊 The work report counts every edit and export once and keeps its chart labels whole. / تقرير العمل يعدّ كل تعديل وتصدير مرة واحدة ويُبقي تسميات الرسم كاملة.
  - 🌙 The relaunch dialog takes the house design and the dark theme (text at 4.5:1 or more). / نافذة الاستئناف تأخذ تصميم البيت والسمة الداكنة (نص بتباين 4.5:1 أو أكثر).
  - 🔌 The plugin, `mcp/server.json` and `mcp/smithery.yaml` start the MCP server locally with `node mcp/cli.mjs`; no npm package is needed. / الإضافة و`mcp/server.json` و`mcp/smithery.yaml` تشغّل خادم MCP محليًا بالأمر `node mcp/cli.mjs`؛ دون حاجة إلى حزمة npm.

### Extras / إضافات
- 🧪 **The build parses the editor script**: two merged files declaring the same name now fail the build with the name, not the browser with a blank page. / البناء يفحص نص المحرر: اسمان متطابقان من ملفين مدموجين يُفشلان البناء باسم المشكلة بدل صفحة فارغة في المتصفح.
- 🔍 **`tests/audit.probe.mjs`** (`npm run audit`): the feature audit drives every toolbar feature in headed Edge and prints works / partial / broken with a works rate. / أداة تدقيق الميزات تشغّل كل ميزة في Edge وتطبع ما يعمل وما يعمل جزئيًا وما لا يعمل مع نسبة النجاح.
- 🧷 **`verify-history`** checks a `.bwlog` file or a shared HTML file; **`report`** writes the work report from the command line. / الأمر `verify-history` يفحص ملف `.bwlog` أو ملف HTML مُشارَكًا، والأمر `report` يكتب تقرير العمل من سطر الأوامر.
- ♿ **Update progress** reads at full contrast while it waits (axe). / تقدم التحديث يُقرأ بتباين كامل أثناء الانتظار.
- 🔌 **Every test picks a free port**, so a running editor never breaks `npm test`. / كل اختبار يختار منفذًا حرًا، فلا يكسر محرر عامل تشغيل `npm test`.
- 🕒 **«آخر حفظ»** beside the change counter (list copy and last HTML) replaces the «حُفظ تلقائياً» toast. / ختم «آخر حفظ» بجانب عداد التغييرات (نسخة القائمة وآخر HTML) بدل رسالة «حُفظ تلقائياً».
- 📥 **Import keeps structure**: PDF, DOCX and HTML headings become chapters and sections, tables become tables, the title comes from the document. / الاستيراد يحفظ البنية: عناوين PDF وDOCX وHTML تصير فصولًا وأقسامًا، والجداول جداول، والعنوان من الوثيقة نفسها.
- 📈 **Per-document metrics** in the documents list: edits, active minutes, contributors, last signer, locked. / مقاييس لكل وثيقة في قائمة المستندات: التعديلات، والدقائق النشطة، والمساهمون، وآخر موقّع، والقفل.
- 🔀 **«مقارنة بآخر حفظ HTML»** in «تغييرات», with a restore for each change. / «مقارنة بآخر حفظ HTML» في «تغييرات»، مع استرجاع كل تغيير وحده.
- 🔐 **The lock banner names the signer** when a shared file opens. / شريط القفل يسمّي الموقّع عند فتح الملف المُشارَك.
- 📄 **«نسخ كقالب»**: a document's design, header and footer items and chapters, with empty bodies, for the next service. / «نسخ كقالب»: تصميم الوثيقة وعناصر الترويسة والتذييل والفصول بمتون فارغة، للخدمة التالية.
- 🔢 **Requirement IDs**: FR- and BR- codes unique and in sequence; a story with no acceptance criteria warns. / معرّفات المتطلبات: رموز FR- وBR- فريدة ومتتابعة؛ والقصة بلا معايير قبول تُنبّه.
- ↩️ **«تراجع» for 5 s** after deleting a block, an object, a header item or a document. / «تراجع» لمدة 5 ثوانٍ بعد حذف كتلة أو عنصر أو عنصر ترويسة أو وثيقة.
- 🧭 **`tests/owner-flows.test.mjs`**: one check per line of the owner's request, in `npm test`. / ملف `tests/owner-flows.test.mjs`: فحص لكل بند من طلب المالك، ضمن `npm test`.

### Migration notes / ملاحظات الترحيل
- Documents without the new fields render and export byte-identical to 0.12.0. A tool that read `/api/export/file` output from `exports/<service>/<locale>/` finds it in the save folder when the server runs without `--out`; with `--out` nothing moved. An editor extension now loads **before** boot: listen to `boot` instead of assuming the editor is drawn at load. / الوثائق التي لا تستخدم الحقول الجديدة تُعرض وتُصدَّر مطابقة لـ 0.12.0 بايتًا ببايت. ومخرجات `/api/export/file` تذهب إلى مجلد الحفظ حين يعمل الخادم دون `--out`، ومع `--out` لم يتغير شيء. وإضافة المحرر تُحمَّل الآن **قبل** التشغيل: استمع إلى الحدث `boot` بدل افتراض أن المحرر مرسوم عند التحميل.
- The tamper-evident history is obfuscated, not secret: the key is in the MIT source. See the README's "Is it safe?" and `bible/11-trust-ledger.md`. / السجل الكاشف للعبث مموَّه لا سري: المفتاح في الشيفرة المفتوحة. انظر «هل هو آمن؟» في README و`bible/11-trust-ledger.ar.md`.

## [0.12.0] - 2026-10-28

🎨 A new brand, an Arabic website, and an editor with no hard-coded colour. / 🎨 هوية جديدة، وموقع بالعربية، ومحرر بلا ألوان ثابتة في الكود.

**In 10 seconds / في عشر ثوان**
- 🎨 Brand v3 "Cover & Rule": navy and gold, light and dark from the same colour ramps. / الهوية الثالثة «الغلاف والمسطرة»: كحلي وذهبي، والوضعان الفاتح والداكن من سلالم الألوان نفسها.
- 🌐 The website has an Arabic edition at `/ar/`. / للموقع نسخة عربية على `/ar/`.
- 🖌️ The editor runs on brand tokens: 182 hard-coded colours down to 0. / المحرر يعمل على رموز الهوية: 182 لونا ثابتا صارت 0.
- 🎞️ New hero, banner and logo animations, in English and Arabic. / رسوم متحركة جديدة للواجهة واللافتة والشعار، بالإنجليزية والعربية.
- 🛡️ NOTICE, a security policy pair and issue forms. / ملف NOTICE، وسياسة أمان بلغتين، ونماذج للبلاغات.

### Added / أضيف
- 🎨 **Brand v3** in `brand/v3/`: tokens (`tokens-v3.css`, light and dark JSON, every contrast pair passes `palette/check.py`), the logo set (mark, EN and AR lockups and wordmarks outlined from Thmanyah Serif Display, an animated mark that stays still under reduced motion), favicons, social cards (`og.png`, `og-ar.png`), 22 redrawn icons, and a brand guide pair (`BRAND.md`, `BRAND.ar.md`). / الهوية الثالثة في `brand/v3/`: الرموز، ومجموعة الشعار، والأيقونات المفضلة، وصور المشاركة، و22 أيقونة معاد رسمها، ودليل الهوية بلغتين.
- 🌐 **Arabic website** at `/ar/`, built from the same page sources as the English one, with its own canonical link, language links both ways and an Arabic social image; a 404 page. / موقع عربي على `/ar/` من مصادر الصفحات نفسها، مع رابط أساسي خاص وروابط اللغة في الاتجاهين وصورة مشاركة عربية؛ وصفحة 404.
- 🎞️ **Motion**: one motion system for the site, the editor and the animations; `hero.gif` and `hero-ar.gif` (9 s loops), `hero.mp4`, `github-banner.gif` (6 s), a logo loop. Reduced motion stops every animation. / نظام حركة واحد للموقع والمحرر والرسوم المتحركة، وحلقات الواجهة واللافتة والشعار؛ وتقليل الحركة يوقف كل حركة.
- ⚖️ **`NOTICE.md`** (the Thmanyah font terms, EN and AR) and **`SECURITY.md` / `SECURITY.ar.md`** (report privately; only the latest release gets fixes). / ملف NOTICE لشروط خطوط ثمانية، وسياسة الأمان بلغتين.
- 📝 **Issue forms** (bug, feature; blank issues off) and a pull request template. / نماذج البلاغات (خلل، ميزة) وقالب طلب الدمج.
- 📚 **Docs front page** (`docs/README.md` pair). The MCP README pair now lists all 12 tools. / صفحة أولى للوثائق، وصفحة MCP تذكر الأدوات الـ12 كلها.

### Changed / تغير
- 🖌️ **Editor chrome on brand v3 tokens**: no hard-coded colour left (a test guards it), new panel motion, calm mode and reduced motion leave nothing running. PDF and DOCX colours are unchanged: documents never read the brand tokens. / واجهة المحرر على رموز الهوية الثالثة، مع اختبار يمنع الألوان الثابتة؛ وألوان PDF وDOCX لم تتغير.
- 🔤 **Site fonts self-hosted**: three Thmanyah woff2 files ship with the site. / خطوط الموقع مستضافة معه: ثلاثة ملفات woff2 من ثمانية.
- 🔢 **The site takes its version from `package.json`**, and `update/version-sync.mjs` fails when a page or its structured data says another one. / الموقع يأخذ رقم الإصدار من `package.json`، وأداة مزامنة الإصدار تفشل إن ذكرت صفحة رقما آخر.
- 📖 **README pair** rewritten for brand v3: new badges, sections on safety, questions and help. / إعادة كتابة ملفي README على الهوية الثالثة: شارات جديدة، وأقسام للأمان والأسئلة والمساعدة.
- 🚀 **Release notes** open with an "In 10 seconds" list, and their MCP line is `npx -y -p business-wrap@latest business-wrap-mcp`. / ملاحظات الإصدار تبدأ بقائمة «في عشر ثوان»، وسطر MCP فيها يستخدم `business-wrap@latest`.
- 🧪 **CONTRIBUTING pair**: a "Run the checks" section with the same commands CI runs. / ملفا المساهمة: قسم «شغل الفحوص» بأوامر CI نفسها.

### Removed / حذف
- 🗂️ Brand v1 and v2 files (`brand/logo`, `brand/png`, `brand/v2`, `brand/build.py`); history keeps them. The npm package ships `brand/v3` instead of `brand/logo`. / ملفات الهويتين الأولى والثانية، ويحفظها السجل؛ والحزمة تحمل `brand/v3` بدل `brand/logo`.
- 🧹 Internal working files are no longer tracked (session handoff, build receipts, the distribution checklist). / ملفات العمل الداخلية لم تعد في المستودع.

### Fixed / أصلح
- 📋 **Site install commands**: the copy button no longer covers the command, and the MCP line is the same in the README, the site and the release notes. / أوامر التثبيت في الموقع: زر النسخ لا يغطي الأمر، وسطر MCP واحد في كل مكان.
- 🔗 **Docs links**: every relative link in `docs/` resolves, and the MCP README pair uses the `@latest` install line. / كل الروابط النسبية في الوثائق تعمل.

### Migration notes / ملاحظات الترحيل
- No command or schema change. A tool that read `brand/logo/` or `brand/v2/` reads `brand/v3/logo/` and `brand/v3/tokens-v3.css` now; the class `.bw-highlight` still works. / لا تغيير في الأوامر أو المخططات. ما كان يقرأ `brand/logo/` أو `brand/v2/` يقرأ الآن `brand/v3/`، والصنف `.bw-highlight` ما زال يعمل.

## [0.11.1] - 2026-10-28

🔓 Public repo, and a plugin that works on a fresh machine. / 🔓 مستودع عام، وإضافة تعمل على جهاز جديد.

**In 10 seconds / في عشر ثوانٍ**
- ⚖️ MIT licence; the repo is public. / رخصة MIT، والمستودع عام.
- 🔌 The Claude Code plugin's MCP server now starts on a fresh machine. / خادم MCP في الإضافة يعمل الآن على جهاز جديد.
- 🔤 Thmanyah ships as a fallback, so PDFs print with the right fonts out of the box. / خطوط ثمانية مضمنة احتياطيًا، فتطبع ملفات PDF بالخط الصحيح مباشرة.
- 📖 README pair rewritten for visitors. / إعادة كتابة ملفي README للزوار.
- 🐍 Fresh machine needs only Node, uv and Chrome or Edge: no pip installs. / الجهاز الجديد يحتاج Node وuv وChrome أو Edge فقط، دون pip.
- ▶️ `npm run serve` is the way in: it builds the sample the first time; open the editor through it. / `npm run serve` هو المدخل: يبني المثال في المرة الأولى، وافتح المحرر عبره.

### Added / أضيف
- 🔤 **Bundled fallback fonts** in `fonts/nj-fonts/thmanyah/` (Serif Text, Serif Display: otf, ttf, woff2; Sans: otf, woff2). Used only when no other copy is found: `BW_FONT_DIR`, `.local/config.json` and the system font folder still win. These files are under the Thmanyah licence, not MIT. / خطوط احتياطية مضمنة في `fonts/nj-fonts/thmanyah/`، تُستخدم فقط إن لم توجد نسخة أخرى؛ ومجلد المستخدم وإعداداته وخطوط النظام لها الأولوية. هذه الملفات تحت رخصة ثمانية، لا MIT.
- ⚖️ **MIT licence** (`LICENSE`) and licence fields in the package, plugin and marketplace. / رخصة MIT وحقول الرخصة في الحزمة والإضافة والسوق.

### Changed / تغيّر
- 📖 **README pair rewritten** for the public repo: an answer in 10 seconds, prerequisites with check commands, jump links, long detail folded. The same pass on the CONTRIBUTING, fonts, MCP and guide pairs; private-repo wording removed from the docs. / إعادة كتابة ملفي README للمستودع العام: الجواب في عشر ثوانٍ، والمتطلبات مع أوامر التحقق، وروابط القفز، والتفاصيل الطويلة مطوية. والمعالجة نفسها لأزواج المساهمة والخطوط وMCP والدليل، وحذف صياغات المستودع الخاص من الوثائق.
- 🐍 **Python steps run through uv** with the packages each step needs (`engine/py.mjs`: pymupdf for PDF finishing and thumbnails, python-docx and lxml for DOCX). Without uv, plain `python` runs and one message names the missing tool. / خطوات Python تعمل عبر uv مع حزم كل خطوة؛ ودون uv يعمل `python` العادي مع رسالة واحدة توضح الناقص.
- 🔓 **Updater for the public repo**: no token, no sign-in, the `gh` login is no longer read; an optional read-only token only lifts GitHub's rate limit. Downloads are checked hop by hop; the update notice names `/plugin marketplace update`. `release.yml` actions pinned by SHA. / المحدّث للمستودع العام: دون رمز ولا تسجيل دخول، وتحقق من كل قفزة في التنزيل، والإشعار يذكر `/plugin marketplace update`.
- 🔐 `security/check.py` and `security/gitleaks.toml` allow font binaries at exactly one path, `fonts/nj-fonts/thmanyah/<family>/<otf|ttf|woff2>/`; the rule still fails everywhere else, in the tree and in history. / بوابة الأمان تسمح بملفات الخط في مسار واحد فقط، وتبقى القاعدة سارية في كل مكان آخر.
- 🧩 `fonts/manifest.json` gains `${BW_ROOT}` (the repo or plugin root) and lists `fonts/nj-fonts` last. / ملف الخطوط يضيف `${BW_ROOT}` ويضع `fonts/nj-fonts` في آخر القائمة.

### Fixed / أصلح
- ▶️ **`npm run serve` on a fresh clone**: it served `out/sample/...` that did not exist yet. With no editor given it now builds the sample first, then serves it, and prints that the editor must be used through the server (export, print, printers, updates). `npm run serve -- <editor.html>` serves your own file. The editor's "can't reach the server" message says how to start it (EN+AR). / `npm run serve` على نسخة جديدة يبني المثال أولاً ثم يقدّمه، ويذكّر بفتح المحرر عبر الخادم؛ ورسالة تعذّر الوصول إلى الخادم تشرح طريقة تشغيله.
- 🔌 **Plugin MCP launch**: `business-wrap` is not on npm, so `npx -p business-wrap@0.11.0` failed on a fresh machine. From 0.11.1 the package is published to npm (no longer `private`), and the plugin and Smithery run `npx -y -p business-wrap@0.11.1 business-wrap-mcp`. Without npm, `npx -y -p github:NJ-Burrito/Business-Wrap#v0.11.1 business-wrap-mcp` installs from the release tag. `update/version-sync.mjs` keeps either pinned ref in step with `package.json`. The package ships what the server, the editor build, export and the updater need (engine, editor, mcp, update, templates, design theme, palette, typography, fonts, samples). / إصلاح تشغيل خادم MCP في الإضافة: الحزمة تُنشر الآن على npm ويشغّلها الأمر `npx -y -p business-wrap@0.11.1 business-wrap-mcp`، ومن دون npm يعمل التثبيت من وسم الإصدار على GitHub، وأداة مزامنة الإصدار تتحقق من الرقم.

### Migration notes / ملاحظات الترحيل
- Nothing to do. A machine with its own Thmanyah copy keeps using it. / لا شيء مطلوب؛ الجهاز الذي لديه نسخته من ثمانية يبقى عليها.

## [0.11.0] - 2026-10-28

Update from inside the editor, and a Settings page. / التحديث من داخل المحرر، وصفحة الإعدادات.

### Added / أضيف
- **Export & Print centre**: one Export menu (PDF/DOCX per language or both, HTML, print HTML, edits, design pack, diagram Mermaid/SVG/PNG), page range, cover option, printers list through the local server. / مركز التصدير والطباعة.
- **Labels, one command registry, View menu**: the toolbar and Ctrl+K read the same registry (palette ⊆ toolbar, tested); View holds zoom reset/fit, both editions, page views and Settings. / سجل أوامر واحد وقائمة العرض.
- **Local learning** (hidden): edits, notes and exports (including every Export-centre action) become redacted events in `.local/learning/`; `npm run learn` distils rules; MCP `learning_*` tools; reached only from Settings → «التعلّم المحلي»; updates never touch `.local/learning`. / التعلّم المحلي.
- **Template packs for any business**: a neutral service model, six packs (e-service, e-commerce, call-centre, approval, SaaS, generic IEEE 29148) plus custom packs, an evidence stage with a ledger, organisation profiles (`bible/09-template-packs.md`). / حزم القوالب والنموذج المحايد ومرحلة الأدلة.
- **Settings page** (toolbar View section, or Ctrl+K → Settings): About (name, logo, version, release date, repository, licence, credits), Update (installed and latest version, last check, Check now, check automatically at launch, on by default) and Preferences (interface language, word direction, page view, reduce motion, explainer cards). / صفحة الإعدادات: حول البرنامج، والتحديث، والتفضيلات.
- **Update check at launch**: when the editor is opened through the local server (`npm run serve`), it asks the server whether a newer release exists, without blocking anything and at most once a day unless you press Check now; offline or on any error it stays silent and Settings shows why. / فحص التحديث عند الفتح، مرة في اليوم على الأكثر.
- **Update popup**: a newer release shows its version and what is new (Added, Changed, Fixed), with Update now, Later and Skip this version. / نافذة التحديث مع ما الجديد.
- **One-click update**: Update now runs the updater on the server and shows its steps (download and fingerprint check, backup, replace, verify, done); the server restarts on the new version and the editor reopens your document where you were, with no other step. / تحديث بنقرة واحدة، ويعود المحرر إلى موضعك.
- **Old work keeps working**: an editor or a Save-HTML file from 0.9.x or 0.10.0 opened through the server opens in the new editor with its edits, history, comments and snapshots; the stored draft is migrated to the new schema after a byte-for-byte backup. / الأعمال القديمة تفتح في المحرر الجديد كما هي.

### Changed / تغيّر
- **The updater replaces program files only**: a file the release dropped is removed only inside the program folders; documents, edits files, design packs, uploaded fonts, logos, `out/`, `exports/`, `harvest/` and `.local/` are never written; one full backup first; any failure in the replace or the verify restores the previous version and the data exactly. A Git checkout fast-forwards and resets to the old commit if the new one does not load. / المحدّث يستبدل ملفات البرنامج فقط.
- `npm run serve` supervises the server so an in-editor update can restart it on the new code. / الخادم المحلي يعيد تشغيل نفسه بعد التحديث.

### Fixed / أصلح
- Unpacking a release zip on Linux (GNU tar cannot read zips: `unzip` is used) and on Windows from Git Bash (Windows' own tar is used). / فك ضغط الإصدار على لينكس وويندوز.

### Tests / الاختبارات
- `tests/updater.test.mjs` (new): server endpoints with a mocked release feed; a fake newer release applied with every user file byte-identical; forced failures and a broken release roll back to the exact previous tree; checksum refusal; the state migration (forward-only, idempotent); 0.9.1 and 0.10.0 Save-HTML files re-wrapped with their edits.
- `tests/settings.test.mjs` (new): Settings in Arabic and English, the popup on a newer release only, skip remembered, the 24 h throttle and the toggle, file:// makes no update request, the progress steps and the reload back to the same place with the edits, 0.9.1 and 0.10.0 Save-HTML files opened and edited, axe.

### Migration notes / ملاحظات الترحيل
- The editor's stored draft (`localStorage bw:draft:<set>`) moves from schema 1 to 2 on first open (`engine/edits.mjs migrateState`); the original is kept under `bw:draft-backup:<set>:v1`. Edits files (`*.edits.json`) are unchanged (version 1).
- New server endpoints: `GET /api/version`, `GET /api/update/check[?force=1]`, `POST /api/update/apply {confirm:true}` (202, runs on), `GET /api/update/progress`; `GET /api/update` still answers as before.
- `applyUpdate` accepts `onStage`; `swapInstall` is now async and removes dropped files only inside `CODE_ROOTS`.

## [0.10.0] - 2026-10-28

The editor's shell, reworked from the owner's field notes, and any font as real text. / هيكل المحرر من ملاحظات المالك الميدانية، وأي خط نصاً حقيقياً.

> Owner decision 2026-10-28: every chosen font is embedded as real text in PDF and DOCX; the font's licence is the user's responsibility.

### Added / أضيف
- **Hover explainers** (A5): rest on any tool, picker or Design-panel control for about 700 ms, or reach it with the keyboard, and a card shows its name, shortcut, one sentence and a looping illustration of what it does. Arabic and English (`editor/ux-i18n.json`, 145 tools and controls); the next tool's card shows at once; Esc, leaving, pressing or scrolling hides it; reduced motion shows a still frame. / بطاقات شارحة عند التوقف على أي أداة.
- **Page views** (A6): View → Pages: Continuous, Single (one page at a time), Book (the cover alone, then two pages side by side in the edition's reading direction). Page Up/Down, the arrow keys, the wheel and a page pill turn pages; editing works in every view; remembered per browser; print, PDF, DOCX and the edits file never see it. / عرض الصفحات: متصل، صفحة، كتاب.
- **Any font** (B1): the font picker lists the project's fonts, this computer's installed fonts (Local Font Access, asked once; A→Z, searchable, with a preview) and fonts you upload (TTF, OTF, WOFF); Thmanyah stays the default; the choice is saved in the document and reaches the PDF and the DOCX. / منتقي الخطوط: خطوط المشروع والجهاز والمرفوعة.
- **Slider + number + unit** (B3) for every size and spacing: decimals allowed, letters refused, a unit picker (pt, px, mm, cm, %, em where they make sense) that converts the value so the size stays; colours as a swatch plus a hex code. / منزلق ورقم ووحدة.

### Changed / تغيّر
- **The layout never flips** (A1): «ع» / «E» changes the interface language and the edition, RTL / LTR changes only the direction of the words; the toolbar, panels, page and watermark keep the default right-to-left arrangement in both languages (the watermark stays bottom right). / التخطيط لا ينقلب.
- **Arabic/English parity** (A2): every toolbar word reserves the width of the longer of its two languages, so «ع» and «E» fold the bar the same way and each tool keeps its icon, its label and its place. / تطابق العربية والإنجليزية.
- **Whole-field toggles** (A3): click anywhere on the «ع» / «E», RTL / LTR or Pages field (not just the letters); a gold thumb slides from where it is to the new choice, critically damped; no motion under reduced motion or Calm mode. / النقر في أي مكان من الحقل.
- **Sticky selection tools** (A4): the selection's tools stay while you work in menus, panels, pickers, colour inputs and inline editors; only a click on empty space or Esc brings the general tools back (Esc peels one layer at a time). / أدوات التحديد تبقى.
- **Plain-language Design panel** (B2): every label rewritten in Arabic and English (no raw tokens such as `primary-deep`, `h1`, `rule-w`, `zebra`), grouped, with short hints. / لوحة تصميم بلغة واضحة.
- **Every chosen font is real text** (B4, owner override): each face is normalised in memory before printing or embedding (TrueType outlines, OS/2 fsType 0); licence warnings and the "left out" export note are gone. A family with no bold face gets a **synthetic Bold** at export (`engine/font_normalise.py --embolden`), so bold text stays bold and stays real text instead of Chrome's faked bold (Type 3). / كل خط مختار نص حقيقي، والعريض المركّب.

### Fixed / أصلح
- **Logos and images lost their tools on click** (the 0.9.1 "hold" behaviour): a click on a free-placed logo selected it on press and then counted as an empty-space click; any toolbar rebuild (View, Dark …) also hid the selection's tools. / اختفاء أدوات الشعار عند النقر.
- **Toolbar menus were clipped inside the toolbar** (owner test 2026-10-28): «More» menus were `position: fixed` inside the toolbar, whose blur makes it their containing block, so they opened inside it and needed scrolling. They now open in the top layer (popover API), anchored to their button and shifted or flipped to stay in the window; the toolbar never scrolls; Esc returns focus to the button; an outside click closes the menu and keeps the selection's tools. / قوائم الشريط كانت تُقصّ داخله.
- **Moving logos and images** (owner test 2026-10-28): a click on a logo now focuses it, so the arrow keys nudge it at once (pressing it did not take focus, and a selected diagram kept the arrow keys); a drag is tracked on the window and ends cleanly on a cancelled pointer; the logo follows the pointer 1:1 when the page is zoomed or in Single / Book view (the move was scaled by the zoom); an anchored image dropped in a paged view lands in its page's column. Logos, free-placed images, diagram shapes and free text move by a real drag in Continuous, Single and Book view, Arabic and English; the position is saved, survives a reopen and prints where it was dropped. / نقل الشعارات والصور.
- **Printing from a paged view gave a different page count**: the print pass measured the paged layout; it now measures the plain sheet (9 pages in every view for the sample). / عدد صفحات الطباعة من العرض المقسّم.
- **The DOCX follows the chosen font**: a chosen heading family other than the house pair now reaches the Word file's headings and cover (it fell back to the house face). / ملف Word يتبع الخط المختار.
- The page no longer jumps down after the toolbar's entry animation (the bar's height is measured on its layout box). / قفزة الصفحة بعد ظهور الشريط.

### Tests / الاختبارات
- `tests/ux.test.mjs` (new, 88 checks; menus and moves added after the owner test): boxes identical across «ع»/«E» × RTL/LTR at 1366 and 1920; same controls, icons, names and fold state in both languages; padding clicks toggle, thumb under the pressed option, spring curve, mid-flight slide, reduced motion; shape and logo tools stay through menus, pickers, the Design panel and the popover, desk click and Esc clear; explainer at ~700 ms not at 300 ms, Esc, leave, keyboard focus, every tool has AR+EN text, still frame under reduced motion; Book view cover alone and RTL/LTR pairing, Single page, remembered, editing, print CSS unaffected, same printed page count in every view; every toolbar menu fully visible in the top layer at 1366 and 1920 with its last item reachable and no toolbar scroll; logo, image, shape and free text follow a 120 px drag within 2 px in all three views, AR and EN, nudge, reopen, print position.
- `tests/design.test.mjs` (new, B1–B4, plus the faux-bold gate): a font with no bold face prints a synthetic Bold, no Type 3 in pdffonts, the bold headings extract with pdftotext.
- `tests/editor.test.mjs`: the shell stays right-to-left and the words follow; the watermark keeps its corner in both languages.

## [0.9.1] - 2026-10-28

The five gaps left in 0.9.0 against the owner's diagram and toolbar notes. / الفجوات الخمس المتبقية من 0.9.0.

### Added / أضيف
- **Bend arrows by hand**: a selected arrow shows a handle on each segment (drag it across; orthogonal stays orthogonal) and a dot on each corner (drag it; its neighbours follow; Delete removes the bend); «Add bend point», «Remove bend point», «Auto route». Stored as `via` on the edge (contract updated), one `replace` per gesture, so undo, the edits file, Save HTML, the PDF and the DOCX carry it; moving both ends of an arrow carries its bends. / ثني الأسهم يدوياً.
- **Labels edited in place**: double-click (or Enter/F2 on a selection) opens a text box on the shape, arrow or free-text label itself, in the drawing's face; Enter or blur saves, Shift+Enter adds a line (printed as a line break), Esc cancels; the caret follows Arabic or Latin text. The label dialog is gone. / تحرير النص في مكانه.
- **Diagram zoom**: zoom out · fit · zoom in stay in view in every diagram section, 100% in «More», Ctrl+wheel over the drawing; the frame keeps its height and scrolls; view state only (never an op, never printed). / تكبير المخطط وتصغيره.

### Changed / تغيّر
- **Legend is one row** for the house sample at A4 landscape, centred, as the reference: the key is measured at its set width and its spacing tightens before a second row opens (a narrow drawing with many kinds still wraps). The English key is shorter («Applicant pays», «Main path» …); the legend's line samples point the way the chain runs, as the reference. / المفتاح صف واحد.
- Closer to the reference figure: a tighter corridor under the rework box and between the rows, so the drawing fills the frame's width; the figure title sits closer to its frame. / أقرب إلى الشكل المعتمد.
- **Toolbar section titles always show** (1280–1920 px, Arabic and English): when the bar runs out of room the general tools drop their words, then each section in turn folds its extra tools into its own «More», then the selection's words go; the bar never scrolls sideways. / عناوين الأقسام تبقى ظاهرة.

### Fixed / أصلح
- Toolbar icons with circles (search, zoom) drew half-dashed once the bar folded: the logo's own `.fold` style leaked into the bar; the fold classes are renamed. A re-selected arrow no longer keeps the previous one's blue highlight. / أيقونات الشريط.

### Tests / الاختبارات
- `tests/diagram.test.mjs`: bend points (routed through, orthogonal, ports kept, PDF SVG, DOCX drawing, edits round-trip, auto layout clears), legend one row / wraps when narrow, line breaks; in the editor: segment drag stores `via`, add/remove bend, auto route, undo, Save HTML; in-place editing (opens on the shape, RTL-aware, Shift+Enter, Enter, Esc, arrow label, blur); zoom (tools in view, in, 100%, fit, Ctrl+wheel, no op); section titles visible at 1366 in four contexts, AR and EN. / اختبارات جديدة.

## [0.9.0] - 2026-10-28

The workflow diagram is the house SRS figure again, and it is shapes and text you can edit; the toolbar follows what you select. / مخطط سير العمل بتصميم وثائق المتطلبات المعتمد، أشكالاً ونصوصاً قابلة للتحرير، وشريط أدوات يتبع ما تحدده.

### Added / أضيف
- **Diagram block** (`kind: 'diagram'`, contract `bible/contracts/diagram.schema.json`): a model of nodes, edges and group bands drawn by `engine/diagram.mjs` in the house look: the applicant's steps in a soft dashed band, sage staff stages with a person badge, white «إجراء» diamonds, a salmon rework box, stadium ends (✓ approval, ⊗ refusal) with a caption, a heavy solid forward path, dashed brown returns, red refusal lines, orthogonal routing with rounded corners, plated edge labels and a legend of every shape and line kind; the chain wraps onto the landscape sheet's proportion. Colours come from the theme's `diagram-*` tokens, so a design pack restyles it. / كتلة المخطط بتصميم الشكل المعتمد.
- Harvest writes a diagram block (from the process graph: applicant, payment, rework, staff, decisions, approval/refusal ends) instead of a picture. / الحصاد يكتب نموذج المخطط.
- **Editing in place**: click a shape, an arrow or the empty drawing; drag to move (grid snap), corner handle to resize, arrow keys nudge, double-click edits a label; add stage/applicant/start/payment/rework/system/decision/end/note/group/free text and 13 symbols; arrow from a shape, reconnect either end, reverse, arrow kind; kind, colour role and badge; duplicate, delete, front/back, align ×6, distribute ×2, group in a band; auto layout, reset to the harvested layout, flow direction, legend on/off; «New diagram». One `replace` op per gesture, so undo/redo, edits files, Save HTML, PDF and DOCX carry it. / التحرير في مكانه.
- **Mermaid**: import flowchart code into the model (laid out in the house style) and export the model as Mermaid, in the editor, `npm run diagram:mermaid` and the MCP tool `diagram_mermaid`. / مسار Mermaid.
- **Contextual, categorised toolbar** docked at the top: labelled sections (File · Insert · Edit · Document · Design · Export · View), and a highlighted selection section named for what is selected (text, table cell, image, logo, shape, arrow, several shapes, diagram) with a «More» menu so 1366 px never jams; Esc or a click on the page brings the general tools back. The Ctrl+K palette lists every command under the same categories. / شريط أدوات سياقي مصنّف.

### Changed / تغيّر
- PDF: the diagram is inline SVG with real text (searchable, Arabic shaped, no Type 3). DOCX: the diagram is **native Word shapes** (one DrawingML group of boxes, diamonds, stadiums, polylines with arrowheads and text boxes), editable in Word, no picture. / الوثيقة النصية بأشكال Word أصلية.
- Figure captions print «الشكل N: …» / "Figure N: …" above a framed sheet; the harvested caption reads «مخطط سير العمل: …». / عنوان الشكل.

### Tests / الاختبارات
- `tests/diagram.test.mjs`: structure (kinds, wires, legend), orthogonal routing, Mermaid round-trip, PDF text, DOCX native shapes, editing round-trip, and the toolbar context swap (none / shape / arrow / diagram / several / text / Esc). MCP lists and runs `diagram_mermaid`. / اختبارات جديدة.

## [0.8.4] - 2026-10-28

From the final live run with 0.8.3 (10 of 11 checks, 0 filed, 0 workarounds). / من التشغيل الحي الأخير.

### Fixed / أصلح
- A textarea's inline «هذا الحقل مطلوب» was not captured: the field's message is now looked for in its own box, in the element its `aria-describedby` names, and just after its box; each field also gets an explicit blur after the Tab, and `aria-invalid` counts like `ng-invalid` once touched. / رسالة الحقل النصي متعدد الأسطر.

### Tests / الاختبارات
- An Angular-like textarea with a touched-only validator whose message sits after the field box. / اختبار جديد.

## [0.8.3] - 2026-10-28

From the fourth live run with 0.8.2 (0 requests filed, 0 workarounds, 8 of 11 checks). / من التشغيل الحي الرابع.

### Fixed / أصلح
- Card channels (and every card list: recipients, fees, required documents) were harvested but dropped by the mapper; they are now rows of the service-card table, so they reach the PDF and DOCX. / قنوات تقديم الخدمة في الوثيقة.
- An attachment is one row: the file input paired with its «attachment name» select (names, required, accepted types); the card's statement on required documents wins over the select's star, and a disagreement becomes an open question; the paired select leaves the inputs table. / صف مرفق واحد.
- Required in a dry run: every field is blurred first (Tab through), each inline message is kept with its field and listed with it under Validation messages; a non-final Next may be pressed, a final action never. / الإلزامي دون ضغط «إرسال».

### Tests / الاختبارات
- The fixture's card lists its documents; an «attachment name» select sits beside the file; the card's channels are checked in the PDF text; inline messages carry their field. / اختبارات جديدة.

## [0.8.2] - 2026-10-27

Urgent safety fix: the 0.8.1 live crawl filed two real staging requests. / إصلاح أمان عاجل: مرور 0.8.1 قدّم طلبين حقيقيين.

### Fixed / أصلح
- **Never submit by default.** `submit` defaults to false: the crawl stops before any final action (Send / Submit / Confirm / Pay / Finish, «إرسال» «تقديم» «حفظ وإرسال» «تأكيد» «دفع», or a plain `type=submit` with no step word) and logs «stopped before submit»; on that step the validation messages come from touching the fields, never from pressing. Filing needs `submit: true` **and** `--yes-file-real-request` or a typed YES; the editor and the MCP tool never file. Statuses come from the model or the config's `statuses`. / لا تقديم افتراضياً.
- The same form recorded twice after filling is one step, keeping the richer reading (options, required), live and when a saved harvest is mapped again. / الخطوة المكررة.
- The attachment field disappeared in 0.8.1 (it sat outside the main form): the scope is now the container of every form on the page, and file inputs in the main area are always read; the label still comes from the field's own container. / عودة حقل المرفقات.
- Card: fees, recipients and channels (a heading or title followed by its value or list). / البطاقة: الرسوم والمتلقون والقنوات.
- Required: starred fields stay required; the site's validation message only adds. / الإلزامي: النجمة تبقى، والرسالة تضيف فقط.
- Docs: «Safety: the crawler never files a request unless you ask» in SKILL.md, bible 08 and the README (AR + EN). / توثيق الأمان.

### Tests / الاختبارات
- The fixture counts filed requests: 0 in the default run, 0 with `submit: true` alone, 1 only with the flag; the attachment in a sibling form; fees / recipients / channels; no duplicate step. / اختبارات الأمان.

## [0.8.1] - 2026-10-27

From the live re-crawl with 0.8.0 (9 of 11 checks, 1 workaround). / من المرور الحي بالإصدار 0.8.0.

### Fixed / أصلح
- **Language flip (high):** the header's language dropdown was read as a form field and cycled, which switched the portal language. Fields are now read only inside the form (`formRoot`, or the form with the most controls; header / nav / footer / `[role=banner]` and `exclude` left alone), a language switcher is never cycled, and a run whose captured text is in the other script, or whose page `lang` changed, stops with an error. / قلب اللغة: الحقول من داخل النموذج فقط، ومبدّل اللغة لا يُلمس، والمرور يتوقف بخطأ إن تبدلت اللغة.
- **Empty card:** SPA cards are read (div label/value pairs, PrimeNG cards, panels, fieldsets, tabs, description blocks, fee / duration / steps lists); a `card` selector map. / البطاقة الفارغة.
- **Required flags:** also from CSS `::after` asterisks, `ng-invalid` after touch or submit, an error in the field's own box, and the site's validation message naming the field (also applied when a saved harvest is mapped again). / الحقول الإلزامية.
- **Attachment label:** from the field's own container, never a panel caption. / تسمية المرفق.
- Captcha fields (`g-recaptcha-response`) skipped; a gateway named "action" is numbered «قرار ١» / "Decision 1". / حقول التحقق البشري والبوابات.

### Tests / الاختبارات
- The fixture SPA gains a header language switcher that really switches the page, a div / panel / tabs card, a CSS `::after` asterisk, a field named only in the validation summary, a file labelled after it inside a captioned panel and a captcha field; a script check on a swapped harvest; a gateway named "action". / اختبارات جديدة.

## [0.8.0] - 2026-10-27

From the first field test (one live service, clean room, the skill only: partial pass, 6 workarounds). / من أول اختبار ميداني.

### Added / أضيف
- `npm run harvest:merge -- <harvest.json> <process.json|model>`, MCP `harvest_merge`, editor **New document → Merge two harvests**: the union of a crawl and a model with provenance per chapter and status row; disagreements kept as conflicts and shown; a second harvest `--into` the same folder merges instead of overwriting. / أمر الدمج وأداته ومعالجه.
- Model: a **roles mapping file** (`--roles`) for expression assignees and raw keys, per edition; unmapped roles get a readable fallback, an open question and a prompt in the Process panel; a **monitoring-graph JSON** harvester for back offices that do not export XML. / ملف أسماء الأدوار وقارئ مخطط المراقبة.
- Crawler: `waitFor` ready selectors after network idle, `preForm` steps (terms, Continue, re-login), PrimeNG-style controls (`p-dropdown`, `p-select`, `p-multiselect`, `p-calendar`, `p-datepicker`, `p-radiobutton`, `p-checkbox`, `p-inputnumber`), `--raw` to map a saved harvest offline. / المرور على بوابات SPA.
- DOCX font embedding without Word (`engine/docx/embed_fonts.py`, `word/fonts/*.odttf`), default on, editor toggle and `--no-embed-fonts`. / تضمين الخطوط في DOCX دون Word.
- `serve.mjs --out`, `export.mjs` writes beside the document. / مجلد التصدير.

### Fixed / أصلح
- Labels came from the section title on SPA forms; required flags were lost; fields with no id or name could not be filled; a crash lost the whole harvest. / التسميات والإلزامي والملء والحفظ التدريجي.
- A user task with candidate groups was called "User"; expression assignees and `sid-…` ids were printed raw; unnamed gateways printed nothing readable; `--name` was ignored for BPMN. / أسماء الأدوار والبوابات و`--name`.
- The EN edition printed the Arabic slug as its document code, running header and spine. / رمز الوثيقة في النسخة الإنجليزية.
- Export file names turned Arabic into `-------`; exports landed in the repository's `out/exports`. / أسماء ملفات التصدير ومكانها.
- `serve.mjs` exited 0 silently when started through a junction or a symlink; it now compares real paths and prints an error on a bad path. / تشغيل الخادم عبر رابط.
- The check panel reported empty logo slots while logos were placed; `update --check` could hit a libuv assertion on exit (unread response bodies, `process.exit`). / عدّ الشعارات وخروج فحص التحديث.

### Tests / الاختبارات
- `tests/field.test.mjs`: an invented SPA (async render, terms gate, PrimeNG-style controls, sibling labels, asterisks, no ids or names) crawled end to end in both languages; the merge with a conflict; a monitoring graph → document; expression-assignee mapping; the EN code; Arabic file names; DOCX fonts embedded (word/fonts parts, toggle, obfuscation self-test); the server through a junction. / اختبارات الفجوات الميدانية.

## [0.7.0] - 2026-10-27

### Added / أضيف
- Harvest path A, from a process model: BPMN 2.0 (Flowable, Camunda, Activiti, with their extension attributes: user tasks, candidate groups, assignee, form properties, conditions, timers, gateways, subprocesses), draw.io (plain and compressed) and a YAML/JSON step list → the process IR → both document editions; the workflow figure shows people's steps only. / الاستخراج من نموذج إجراء.
- Harvest path B, crawl a live service: headed Chrome, one tab, keyboard-first triggers, robots.txt respected, rate limit, OTP/captcha pause for the human, credentials only from `$env:` or the gitignored `.local/harvest-secrets.json`; card, form steps (labels, required, options, conditional fields, attachments), validation messages, statuses, both languages, viewport-only screenshots. / الاستخراج بالمرور على الخدمة الفعلية.
- `npm run harvest:model`, `npm run harvest:crawl`, MCP `harvest_model` and `harvest_crawl`, the editor's **New document** wizard and **Process** panel (draw the flow, rebuild the sections in both editions). / الأوامر وأدوات MCP ومعالج الوثيقة الجديدة ولوحة الإجراء.
- `bible/08-harvest` (AR + EN), `bible/contracts/harvest.schema.json`, SKILL.md «Start a document: harvest» (AR + EN). / الفصل والعقد ونص المهارة.
- Tests: invented Flowable-style BPMN, draw.io plain and compressed, YAML list, a local bilingual site crawled end to end with an OTP pause that resumes by itself, the wizard and the Process panel. / الاختبارات.
### Changed / تغير
- Two separate switches: **Language «ع» / «E»** sets the interface language and the document edition; **Direction RTL / LTR** sets the layout direction independently (follows the language until chosen, then remembered; view only). Each has an icon, a tooltip and an accessible name in both languages. / مبدّلان منفصلان: اللغة «ع» / «E»، والاتجاه RTL / LTR مستقل عنها ويُحفظ.
- Everything in the document is editable: every printed label (`/labels`, house ← design pack ← document; in place or from the Labels list; «apply to all documents» writes the design pack), the title, subtitle and cover code, every field name and value; the Design panel edits colours per role, sizes, line height, margins, rule widths and table styles live (`/design`), **Style this** gives one element its own style, template parts can be shown, hidden and reordered (`/layout`), chapters moved, duplicated, hidden or deleted, sections and tables added, and an advanced CSS field is sanitised (no `@import`, no remote `url()`, no expressions). All of it is undoable, is carried by the edits JSON and reaches the PDF and the DOCX. / كل شيء في الوثيقة قابل للتحرير: التسميات والعنوان ورمز الغلاف وأسماء الحقول وقيمها والتصميم وأجزاء القالب وCSS متقدم منقّى.
- A harvested value edited by hand is flagged «manual»; a re-harvest keeps it and reports the conflict, shown in the editor on open. / القيمة المعدّلة يدوياً تبقى عند إعادة الاستخراج ويُعرض التعارض.
- Tests assert both label sets and that the direction toggles independently of the language; `tests/editable.test.mjs` edits a table header, the cover code, the title, the subtitle, a field name and a field value (all four found in the PDF text and the DOCX), the header fill colour (painted in the PDF, shaded in the DOCX), an instance style, sanitised CSS rejecting a remote `@import`, the edits-JSON round trip, undo, the empty-label check and the re-harvest conflict. / الاختبارات.

## [0.6.0] - 2026-10-27

### Added / أضيف
- Updates for people and for their AI agents: `npx business-wrap update --check` prints one line when a newer release exists (cached, at most one request a day; the private repo is read with the user's `gh` login or a token in `.local/update-token`, and an unauthenticated check is a quiet "can't check"). / تحديثات للإنسان ولوكيله: سطر واحد عند توفر إصدار أحدث، مرة في اليوم على الأكثر.
- `npx business-wrap update --apply --yes` updates the installed folder and keeps `.local`, `design/custom`, `logos`, `fonts/custom`, `drafts` and `out`; a git checkout fast-forwards, a zip install is verified by SHA-256 with one backup and a rollback. / التحديث يحفظ إعدادات المستخدم وحزمه وشعاراته ومسوداته.
- The editor shows "what's new" once after an update and, when served, an "update available" card with Update / Later / Turn off. / المحرر يعرض «الجديد» مرة بعد التحديث وبطاقة «يتوفر تحديث».
- MCP: `check_update` and `apply_update` (asks for `confirm: true`); the server's instructions and the first tool result of a session carry `update_available`. / أداتا MCP للتحقق والتحديث، وتنبيه في تعليمات الخادم.
- `AGENTS.md` and SKILL.md tell any agent to check at the start of a Business-Wrap task and tell the user in one line; an optional Claude Code SessionStart hook (off by default). / تعليمات للوكلاء وخطاف اختياري معطل افتراضيا.
- CI: `update/version-sync.mjs` keeps package, plugin, marketplace, MCP registry, Smithery and READMEs on one version; a tag publishes the release with notes cut from this file. / فحص توحيد الإصدار، والإصدار من الوسم.

### Migration notes / ملاحظات الترحيل
- New command: `npx business-wrap update` (`--check`, `--apply --yes`, `--notes`, `--enable-hook`, `--off`). Run `--check` at the start of a Business-Wrap task; never `--apply` without the user's consent.
- New MCP tools: `check_update`, `apply_update` (call `apply_update` with `confirm: true` only after the user agreed). Restart the MCP server after an update.
- Edits files stay version 1. An edits file with a newer `version` is refused with "update first"; v0 bare op arrays are migrated to v1 on import and on update.
- No breaking change to document JSON or design packs.

## [0.5.1] - 2026-10-27

### Added / أضيف
- The editor ships inside the skill: `assets/editor/business-wrap.html`, one self-contained file (styles, script, icons, logo inlined) that opens from disk on a blank document, with the anonymised sample one click away in the service list. / المحرر داخل المهارة: ملف واحد مكتفٍ بذاته يفتح من القرص على وثيقة فارغة، والمثال على بعد نقرة.
- Import now opens any document JSON as a service of its own (hashed like the build), besides merging edits files. / الاستيراد يفتح أي ملف JSON لوثيقة خدمةً مستقلة.
- `samples/blank/` (AR + EN starter document); `npm run skill-html` rebuilds the shipped editor; `npm test` fails when the shipped file is stale, and `tests/skill-html.test.mjs` opens it headless (no console errors, blank first, sample listed, runtime document load). / وثيقة بداية فارغة، وأمر إعادة البناء، وفحص يُسقط الاختبار إذا تقادم الملف.
- The shipped editor names fonts with `local()` only: no machine path and no font bytes in the file; install the fonts in the OS, or build a personal editor that reads the configured font folder. / المحرر المشحون يسمي الخطوط عبر `local()` فقط: لا مسار ولا ملفات خطوط داخله.

### Changed / تغير
- SKILL.md: an «Open the editor» section with the exact path and commands, in English and Arabic. / قسم «افتح المحرر» في SKILL.md.
- Plugin, marketplace, MCP and package versions 0.5.1; the npm package ships `assets/editor`, `samples/blank` and `brand/logo`. / الإصدارات 0.5.1.

## [0.5.0] - 2026-10-27

### Changed / تغيّر
- The default theme is the house pack `design/ours` (the original SRS palette: navy #003c7a, cover band #001e3d with gold cap #be9a41, table header #e1eaf4, zebra #f2f6fa, callouts #a81a1f / #f2e4e4); the editor shell uses the same colours. / السمة الافتراضية هي ألوان وثائق SRS الأصلية، والمحرر يستخدمها أيضاً.
- Editor redesign: a floating island toolbar (logo, RTL / LTR switches, live counter), a selection rail beside the selection, a command palette (Ctrl+K), slide-over panels, toasts, skeletons and progress, focus mode (F) and calm mode; every motion turns off under reduced motion or calm mode. Icons from lucide-static, vendored into `editor/icons.json` (offline). / إعادة تصميم المحرر: شريط عائم، وشريط تحديد، ولوحة أوامر، ووضع تركيز ووضع هادئ.
- The language toggles read RTL and LTR. The tool's logo (`brand/logo/`, from the brand branch) replaces the product name in the UI. / مبدّلات اللغة تقرأ RTL وLTR، والشعار بدل الاسم.

### Added / أضيف
- Free-placed logos and images (`overlays`): drag anywhere (cover, every page, next to a block), resize, snap guides, remembered in the document, printed at the exact position in the PDF and placed as anchored pictures in the DOCX. No fixed logo slots. / الشعارات والصور توضع بحرية وتُطبع في موضعها.
- Images by upload, paste or drag-drop, re-encoded through a canvas (metadata stripped). / الصور بالرفع أو اللصق أو السحب مع إزالة البيانات الوصفية.
- Webhooks: off by default, user URLs and events, test-send, delivery log, sent through the local server (`/api/webhook`); schema `bible/contracts/webhook.schema.json`. / خطافات الويب عبر الخادم المحلي.
- Tests: RTL / LTR labels, command palette, logo drag + remembered position + exact PDF position + DOCX anchor, image insert + export, metadata stripping, webhook test-send to a local mock, calm mode and reduced motion, the brand mark's reveal; axe with every panel, the palette and the selection rail open (0 violations). / اختبارات جديدة.

## [0.4.0] — 2026-10-27

### Added / أضيف
- Tool watermark: the NJ role mark in the editor UI, built like the owner's portfolio — four roles (tester → teacher → volunteer → professional) that change on click or Enter/Space with a .96s cross-fade on cubic-bezier(.76,0,.24,1), the role word rising letter by letter (560 ms, 40 ms stagger), an idle float and a spring pointer tilt, a one-time animated intro that a click skips; reduced motion turns off the intro, float, tilt and letter motion. / علامة الأداة: شعار NJ بأدواره الأربعة كما في الموقع الشخصي، يتبدل بالنقر أو Enter، مع احترام تقليل الحركة.
- Images in `editor/brand/watermark/` (WebP 256 px, no metadata; the 2.4 MB GIF became a 157 KB animated WebP); allow-listed in the security gate. / الصور في `editor/brand/watermark/` بلا بيانات وصفية ومسموحة في فحص الأمان.
- Tests: the click changes the role, the mark mirrors with the UI language, never blocks editing, stays out of Save-HTML and print, and keeps still under reduced motion; axe runs with the mark present (0 violations). / اختبارات العلامة.

### Unchanged / دون تغيير
- The watermark is UI only: never in the PDF, DOCX, print, edits JSON, design pack or Save-HTML. / العلامة للواجهة فقط ولا تظهر في أي مخرج.

## [0.3.0] — 2026-10-27

### Added / أضيف
- MCP server (stdio, local only): `build_editor`, `validate_edits`, `apply_edits`, `export_document`, `export_design_pack`, `check_fonts`; `mcp/cli.mjs`, `mcp/server.json` (MCP Registry), `mcp/smithery.yaml`, `glama.json`; test `npm run test:mcp`. / خادم MCP محلي بست أدوات واختبار.
- Claude Code plugin: `.claude-plugin/plugin.json` (skill + MCP server) and `.claude-plugin/marketplace.json` (the repo is its own marketplace). / إضافة Claude Code وسوقها.
- README install section and badges (AR + EN), `mcp/README.md` pair. / قسم التثبيت بالعربية والإنجليزية.
- The npm package `business-wrap` (bin `business-wrap-mcp`) is prepared but stays `private` while the repository is private. / حزمة npm جاهزة وتبقى خاصة ما دام المستودع خاصاً.

### Fixed / أصلح
- CI (Linux): pasted HTML and an imported Save-HTML file are read by string work only and never reach an HTML parser; on Linux Chrome the parsed payload's inline handler was blocked by the page CSP and reported as a console error. CSP reports in the test now name their source. / لصق HTML واستيراد الملف لا يمرّان بمحلل HTML.
- CI (Linux): with a fallback face poppler drops the shadda and returns the lam-alef ligature reversed; the fallback-mode text check compares the typed sentence without lam and alef (proved on the CI artifact). / فحص النص العربي مع خط احتياطي.

## [0.2.0] — 2026-10-27

### Fixed / أصلح
- CI: the editor test crashed on the runner because `uv` was missing (a `spawnSync` returned no output), and the Thmanyah-only checks cannot pass where the licensed fonts are not installed. Tools never throw now; face-specific checks print `SKIP` with the reason; CI installs uv, poppler, an Arabic fallback face and the Python libraries. / التكامل المستمر: تعطل الاختبار لغياب `uv`، وفحوص خط ثمانية لا تنجح حيث لا تثبت الخطوط؛ أصبحت تُتخطى بسطر SKIP مع السبب.
- DOCX: a chapter holding a figure is set on landscape sheets with its heading; section headings carry their numbers; one-section chapters print no section heading — as the PDF does. / DOCX: الفصل الذي فيه شكل على صفحات أفقية مع عنوانه، وأرقام الأقسام كما في PDF.
- `palette/check.py --help` prints the usage instead of running the gate. / خيار المساعدة في فحص الألوان.

### Added / أضيف
- gitleaks 8.30.1 in CI (pinned, checksum verified, full history) and in the local gate; generated folders are allowlisted for directory scans. / gitleaks في التكامل المستمر.
- Structural conflict prompt on import (move / delete / insert / duplicate of the same block, row or paragraph on both sides), with Keep mine / Take theirs. / تنبيه التعارض البنيوي عند الاستيراد.
- Page thumbnails through the local server (the document is printed and every sheet rasterised; a click jumps to that page). / مصغرات الصفحات عبر الخادم المحلي.
- Accessibility: axe-core check on the editor in Arabic and English with every panel open (0 violations), keyboard-only pass; caret placed on keyboard focus; toolbar landmark. / فحص إمكانية الوصول بلا مخالفات.
- Tests: table column add/delete, design-pack import (hostile values refused), structural conflict, thumbnails; `npm test` runs the editor and accessibility checks. / اختبارات جديدة.
- `tests/docx_fidelity.py`: Word exports the DOCX to PDF without saving it, then the page-by-page comparison. / أداة مقارنة DOCX بـPDF.
- CONTRIBUTING (AR + EN): on the free plan GitHub refuses branch protection and rulesets for a private repo; hooks + CI are the documented substitute. / بديل حماية الفرع على الخطة المجانية.
- Skill eval run recorded in `evals/results-2026-10-27.md` (AR + EN); SKILL quick reference gained the editor commands; the AR/EN pair rules are in the edits contract. / نتائج تقييم المهارة.

## [Unreleased] → v0.1.0

### Added / أضيف
- Bible (AR + EN): pipeline, document standard, gates, edits contract, lessons, design system. / المرجع بالعربية والإنجليزية.
- Contracts: `edits.schema.json` v1, `design-pack.schema.json`. / العقود.
- DTCG tokens: palette (5 ramps, 19 roles, diagram set) and typography (sizes, weights, line heights, space, rules, page geometry). / الرموز التصميمية.
- `palette/check.py` contrast gate, `design/build.py` pack → theme. / فحص التباين وبناء السمة.
- Font manifest (no binaries), logo and design upload slots. / ملف تعريف الخطوط وخانات الرفع.
- `security/check.py` + `gitleaks.toml`: secrets, client terms (hashed), ID/phone shapes, emails, local paths, font binaries, image metadata, files over 5 MB; tree + history + commit messages. / فحص الأمان.
- CI workflow, pre-commit and pre-push hooks, repo templates, docs (guide, glossary, architecture, decisions, roadmap, privacy). / التكامل المستمر والخطافات والتوثيق.
