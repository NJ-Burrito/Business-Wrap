<div dir="rtl">

# Business-Wrap (عربي) — الملف المقابل: README.md

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

خاص ومملوك: انظر `LICENSE`. ولا يرفع أي شيء: انظر `docs/privacy.ar.md`.

</div>
