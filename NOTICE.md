# Notice · fonts

⚖️ The code is MIT ([LICENSE](LICENSE)). The fonts are not.

Fonts are not covered by this licence. The folder fonts/nj-fonts/ holds the
owner's licensed copy of the Thmanyah fonts, bundled as a fallback; those files
remain under the Thmanyah licence, not MIT. Any other font keeps its publisher's
own licence.

📖 Details: [fonts/README.md](fonts/README.md)

---

<div dir="rtl">

## تنبيه · الخطوط

⚖️ الشيفرة تحت رخصة MIT ([LICENSE](LICENSE)). والخطوط ليست كذلك.

رخصة MIT لا تشمل الخطوط. المجلد `fonts/nj-fonts/` يحوي نسخة المالك المرخصة من خطوط ثمانية، مضمنة بديلا احتياطيا، وتبقى هذه الملفات تحت رخصة ثمانية لا MIT. وأي خط آخر يبقى تحت رخصة ناشره.

📖 التفاصيل: [fonts/README.ar.md](fonts/README.ar.md)

</div>

---

# Notice · spell-check dictionaries and engine (0.15.0)

⚖️ The code is MIT. The spell checkers bundle third-party data and an engine under their own licences. They are shipped **unmodified**, each in its own
folder with its licence file, and are loaded at run time as data; nothing is merged into Business-Wrap's own code.

| Part | Where | Licence | Source |
|---|---|---|---|
| Arabic dictionary: Ayaspell, as packaged by LibreOffice (`ar.aff`, `ar.dic`) | `editor/dict/ar/` (with `COPYING.txt`) | GPL 2.0 / LGPL 2.1 / MPL 1.1 tri-licence. **We use it under the MPL 1.1 grant.** | <https://github.com/LibreOffice/dictionaries/tree/master/ar> at commit `4f1df64b2e8e14751aa7c2205d170ca016071315` (the files last changed in `10e0418ad6a7e1c519cbcf6b9329f0940bd07c9f`, 2019-03-07); upstream <http://ayaspell.sourceforge.net/> (Taha Zerrouki) |
| English dictionary: `dictionary-en` 4.0.0 (SCOWL en_US) | `editor/dict/en/` (with `license`) | BSD (SCOWL, © 2000-2018 Kevin Atkinson) with MIT packaging | <https://github.com/wooorm/dictionaries/tree/main/dictionaries/en> |
| Engine: `hunspell-asm` 4.0.2 (Hunspell compiled to WebAssembly) | `editor/spell-worker.js`, `editor/dict/engine.mjs` (built by `tools/vendor-spell.mjs`) | wrapper MIT; Hunspell itself MPL 1.1 / GPL 2 / LGPL 2.1 (we use it under the MPL 1.1 grant) | <https://github.com/kwonoj/hunspell-asm>, <https://github.com/hunspell/hunspell> |

- Each file's size and sha256 is in `editor/dict/SOURCES.json`; the Ayaspell files are byte-identical to the LibreOffice commit named above (git blob ids match).
- The MPL 1.1 requires that the covered files stay available in source form and that the licence notice is kept with them: the dictionary files are their own source, they are unchanged, and `COPYING.txt` stays next to them. A notice file beside data files is our reading of §3.5 for a data-only redistribution; this is a reading, not legal advice.
- No dictionary or engine is sent anywhere: checking runs on your machine (in a Worker, or in the local host), and the words you type are never uploaded.
- Not used on purpose: `@cspell/dict-ar` (LGPL-3.0 only, a derivative) and any GPL-only route.

---

<div dir="rtl">

## تنبيه · قواميس التدقيق الإملائي ومحركه (0.15.0)

⚖️ الشيفرة تحت رخصة MIT. أما المدققان الإملائيان فيضمّنان بيانات ومحركاً من طرف ثالث تحت رخصها. وهي تُسلَّم **دون أي تعديل**، كل منها في مجلده مع ملف رخصته، وتُحمَّل وقت التشغيل بوصفها بيانات، ولا يُدمج شيء منها في شيفرة بزنس راب.

- **القاموس العربي**: أياسبل (Ayaspell) كما تحزمه LibreOffice (`ar.aff` و`ar.dic`) في `editor/dict/ar/` مع `COPYING.txt`. رخصته ثلاثية GPL 2.0 / LGPL 2.1 / MPL 1.1، **ونستخدمه بموجب منحة MPL 1.1**. المصدر: <https://github.com/LibreOffice/dictionaries/tree/master/ar> عند الإيداع `4f1df64b2e8e14751aa7c2205d170ca016071315`؛ والمشروع الأصلي: <http://ayaspell.sourceforge.net/>.
- **القاموس الإنجليزي**: `dictionary-en` 4.0.0 (SCOWL en_US) في `editor/dict/en/` مع `license`، تحت BSD.
- **المحرك**: `hunspell-asm` 4.0.2 (Hunspell مبنيّ إلى WebAssembly)، غلافه MIT وHunspell نفسه MPL 1.1 / GPL 2 / LGPL 2.1، ونستخدمه بموجب MPL 1.1.
- حجم كل ملف وبصمته في `editor/dict/SOURCES.json`، وملفات أياسبل مطابقة بايتاً ببايت للإيداع المذكور.
- التدقيق يجري على جهازك (في Worker أو في المضيف المحلي)، ولا يُرفع أي نص إلى أي جهة.
- لا نستخدم عمداً `@cspell/dict-ar` (LGPL-3.0 فقط، وهو مشتق) ولا أي مسار GPL فقط.
- قراءتنا للرخصة ليست استشارة قانونية؛ ويُراجَع بند §3.5 من MPL 1.1 قبل الإصدار.

</div>
