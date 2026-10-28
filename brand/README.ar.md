<div dir="rtl">

# هوية بزنس راب (عربي) · الملف المقابل: [README.md](README.md)

⚡ **في 10 ثوان**
- 🟦 الهوية الحالية هي **الإصدار 3، «الغلاف والخط»**: كل ملفاتها في [`v3/`](v3/).
- 🖼️ شاهدها في صفحة واحدة: لوحة الهوية [`v3/index.html`](v3/index.html).
- 📘 القواعد: [`v3/BRAND.ar.md`](v3/BRAND.ar.md) · [`v3/BRAND.md`](v3/BRAND.md).
- 🧾 الإصداران 1 و2 متقاعدان، ويحفظهما سجل git.

| ماذا | أين |
|---|---|
| 🎨 المتغيرات (`--bw-*`، فاتح وداكن) | [`v3/tokens-v3.css`](v3/tokens-v3.css) و[`v3/tokens-v3.json`](v3/tokens-v3.json) و[`v3/dark/tokens-v3.dark.json`](v3/dark/tokens-v3.dark.json) |
| 📊 التباين، كل الأزواج | [`v3/contrast-v3.md`](v3/contrast-v3.md) |
| 🔖 الشعار والشعار الأفقي والاسم والعلامة المتحركة | [`v3/logo/`](v3/logo/) |
| 🧩 الأيقونات (22) وملف sprite وCSS | [`v3/icons/`](v3/icons/) |
| ⭐ أيقونات المتصفح والتطبيق | [`v3/favicon/`](v3/favicon/) |
| 🪧 بطاقة المشاركة وصور og | [`v3/social/`](v3/social/) |
| 🛠️ أدوات البناء وفحص الهوية | [`v3/tools/`](v3/tools/) |

الهوية للأداة وحدها: لا تظهر أبدا في مخرجات الوثائق (PDF وDOCX والطباعة وملف التعديلات JSON وحزمة التصميم وتصدير «حفظ HTML»). للوثائق حزمة تصميمها الخاصة.

إعادة بناء كل شيء (يلزم وجود ملفات خط ثمانية محليا لاسم الشعار ولصور PNG):

<div dir="ltr">

```
python brand/v3/tools/build_tokens_v3.py palette/tokens.json brand/v3
uv run --no-project --with fonttools --with uharfbuzz python brand/v3/tools/build_logo.py
python brand/v3/tools/build_icons.py
uv run --no-project --with playwright --with pillow python brand/v3/tools/export_png.py
python brand/v3/tools/build_board.py
uv run --no-project --with pillow python brand/v3/tools/check_brand.py
```

</div>
</div>
