/* WP2 · A5 A6 — the Header «الترويسة» and Footer «التذييل» toolbar sections (0.13.0).
 * doc.chrome = { header: {items}, footer: {items} }; Item = {id, kind: text|field|logo|page, value, align, scope, anchor?}.
 * No doc.chrome = the 0.12.0 band; the first edit materialises today's band as items (chromeDefaults), so nothing moves.
 * On screen: each document shows its bands as an editable strip above the body (the per-page frames are views.js's,
 * fed by <template class="bw-run"> from engine/render.mjs). Shared helpers for the 2x extensions are defined here (w2*). */
// the WP2 commands' icons: lucide-static 1.62.0, ISC licence (https://lucide.dev/license), processed as engine/vendor-icons.mjs
Object.assign(IC, {"secChrome":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M3 9h18\" /> </svg>","secFormat":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 4v16\" /> <path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\" /> <path d=\"M9 20h6\" /> </svg>","secWrap":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"m16 16-3 3 3 3\" /> <path d=\"M3 12h14.5a1 1 0 0 1 0 7H13\" /> <path d=\"M3 19h6\" /> <path d=\"M3 5h18\" /> </svg>","hdrText":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6\" /> <path d=\"M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7\" /> <path d=\"M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1\" /> <path d=\"M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1\" /> <path d=\"M9 6v12\" /> </svg>","hdrField":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1\" /> <path d=\"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1\" /> </svg>","hdrLogo":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13\" /> <path d=\"M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z\" /> <path d=\"M5 22h14\" /> </svg>","chStart":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M15 12H3\" /> <path d=\"M17 19H3\" /> </svg>","chCenter":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M17 12H7\" /> <path d=\"M19 19H5\" /> </svg>","chEnd":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M21 12H9\" /> <path d=\"M21 19H7\" /> </svg>","chDelete":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M10 11v6\" /> <path d=\"M14 11v6\" /> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" /> <path d=\"M3 6h18\" /> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" /> </svg>","chScope":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z\" /> <path d=\"m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845\" /> </svg>","hdrConf":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /> </svg>","ftrText":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6\" /> <path d=\"M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7\" /> <path d=\"M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1\" /> <path d=\"M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1\" /> <path d=\"M9 6v12\" /> </svg>","ftrField":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1\" /> <path d=\"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1\" /> </svg>","ftrStart":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M15 12H3\" /> <path d=\"M17 19H3\" /> </svg>","ftrCenter":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M17 12H7\" /> <path d=\"M19 19H5\" /> </svg>","ftrEnd":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M21 12H9\" /> <path d=\"M21 19H7\" /> </svg>","ftrDelete":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M10 11v6\" /> <path d=\"M14 11v6\" /> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" /> <path d=\"M3 6h18\" /> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" /> </svg>","ftrScope":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z\" /> <path d=\"m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845\" /> </svg>","fmtBold":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8\" /> </svg>","fmtItalic":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <line x1=\"19\" x2=\"10\" y1=\"4\" y2=\"4\" /> <line x1=\"14\" x2=\"5\" y1=\"20\" y2=\"20\" /> <line x1=\"15\" x2=\"9\" y1=\"4\" y2=\"20\" /> </svg>","fmtUnderline":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M6 4v6a6 6 0 0 0 12 0V4\" /> <line x1=\"4\" x2=\"20\" y1=\"20\" y2=\"20\" /> </svg>","fmtStrike":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M16 4H9a3 3 0 0 0-2.83 4\" /> <path d=\"M14 12a4 4 0 0 1 0 8H6\" /> <line x1=\"4\" x2=\"20\" y1=\"12\" y2=\"12\" /> </svg>","fmtCode":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"m16 18 6-6-6-6\" /> <path d=\"m8 6-6 6 6 6\" /> </svg>","fmtLink":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\" /> <path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\" /> </svg>","fmtColor":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" /> <circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" /> </svg>","fmtFont":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 4v16\" /> <path d=\"M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2\" /> <path d=\"M9 20h6\" /> </svg>","fmtSize":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"m15 16 2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16\" /> <path d=\"M15.697 14h5.606\" /> <path d=\"m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16\" /> <path d=\"M3.304 13h6.392\" /> </svg>","fmtClear":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M4 7V4h16v3\" /> <path d=\"M5 20h6\" /> <path d=\"M13 4 8 20\" /> <path d=\"m15 15 5 5\" /> <path d=\"m20 15-5 5\" /> </svg>","fmtAlignStart":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M15 12H3\" /> <path d=\"M17 19H3\" /> </svg>","fmtAlignCenter":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M17 12H7\" /> <path d=\"M19 19H5\" /> </svg>","fmtAlignEnd":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M21 12H9\" /> <path d=\"M21 19H7\" /> </svg>","fmtJustify":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M3 5h18\" /> <path d=\"M3 12h18\" /> <path d=\"M3 19h18\" /> </svg>","fmtTop":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"14\" height=\"6\" x=\"5\" y=\"16\" rx=\"2\" /> <rect width=\"10\" height=\"6\" x=\"7\" y=\"6\" rx=\"2\" /> <path d=\"M2 2h20\" /> </svg>","fmtMiddle":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"14\" height=\"6\" x=\"5\" y=\"16\" rx=\"2\" /> <rect width=\"10\" height=\"6\" x=\"7\" y=\"2\" rx=\"2\" /> <path d=\"M2 12h20\" /> </svg>","fmtBottom":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"14\" height=\"6\" x=\"5\" y=\"12\" rx=\"2\" /> <rect width=\"10\" height=\"6\" x=\"7\" y=\"2\" rx=\"2\" /> <path d=\"M2 22h20\" /> </svg>","fmtLine":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 22v-6\" /> <path d=\"M12 8V2\" /> <path d=\"M4 12H2\" /> <path d=\"M10 12H8\" /> <path d=\"M16 12h-2\" /> <path d=\"M22 12h-2\" /> <path d=\"m15 19-3 3-3-3\" /> <path d=\"m15 5-3-3-3 3\" /> </svg>","fmtBefore":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M5 3h14\" /> <path d=\"m18 13-6-6-6 6\" /> <path d=\"M12 7v14\" /> </svg>","fmtAfter":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 17V3\" /> <path d=\"m6 11 6 6 6-6\" /> <path d=\"M19 21H5\" /> </svg>","fmtQuote":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z\" /> <path d=\"M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z\" /> </svg>","fmtBullets":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M3 5h.01\" /> <path d=\"M3 12h.01\" /> <path d=\"M3 19h.01\" /> <path d=\"M8 5h13\" /> <path d=\"M8 12h13\" /> <path d=\"M8 19h13\" /> </svg>","fmtNumbers":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M11 5h10\" /> <path d=\"M11 12h10\" /> <path d=\"M11 19h10\" /> <path d=\"M4 4h1v5\" /> <path d=\"M4 9h2\" /> <path d=\"M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02\" /> </svg>","fmtShapes":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M13 5h8\" /> <path d=\"M13 12h8\" /> <path d=\"M13 19h8\" /> <path d=\"m3 17 2 2 4-4\" /> <path d=\"m3 7 2 2 4-4\" /> </svg>","fmtIndent":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H11\" /> <path d=\"M21 12H11\" /> <path d=\"M21 19H11\" /> <path d=\"m3 8 4 4-4 4\" /> </svg>","fmtOutdent":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H11\" /> <path d=\"M21 12H11\" /> <path d=\"M21 19H11\" /> <path d=\"m7 8-4 4 4 4\" /> </svg>","pgSetup":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\" /> <path d=\"m14.5 12.5 2-2\" /> <path d=\"m11.5 9.5 2-2\" /> <path d=\"m8.5 6.5 2-2\" /> <path d=\"m17.5 15.5 2-2\" /> </svg>","pgBreak":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M5.42 9.42 8 12\" /> <circle cx=\"4\" cy=\"8\" r=\"2\" /> <path d=\"m14 6-8.58 8.58\" /> <circle cx=\"4\" cy=\"16\" r=\"2\" /> <path d=\"M10.8 14.8 14 18\" /> <path d=\"M16 12h-2\" /> <path d=\"M22 12h-2\" /> </svg>","tocHide":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M16 5H3\" /> <path d=\"M11 12H3\" /> <path d=\"M16 19H3\" /> <path d=\"m15.5 9.5 5 5\" /> <path d=\"m20.5 9.5-5 5\" /> </svg>","tocAdd":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M16 5H3\" /> <path d=\"M11 12H3\" /> <path d=\"M16 19H3\" /> <path d=\"M18 9v6\" /> <path d=\"M21 12h-6\" /> </svg>","fmRowAdd":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M16 5H3\" /> <path d=\"M11 12H3\" /> <path d=\"M16 19H3\" /> <path d=\"M18 9v6\" /> <path d=\"M21 12h-6\" /> </svg>","fmRowDel":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M16 5H3\" /> <path d=\"M11 12H3\" /> <path d=\"M16 19H3\" /> <path d=\"M21 12h-6\" /> </svg>","fmColAdd":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"7\" height=\"13\" x=\"3\" y=\"8\" rx=\"1\" /> <path d=\"m15 2-3 3-3-3\" /> <rect width=\"7\" height=\"13\" x=\"14\" y=\"8\" rx=\"1\" /> </svg>","fmColDel":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M9 3v18\" /> <path d=\"M15 3v18\" /> </svg>","insTable":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M12 3v18\" /> <rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M3 9h18\" /> <path d=\"M3 15h18\" /> </svg>","insSection":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M4 12h8\" /> <path d=\"M4 18V6\" /> <path d=\"M12 18V6\" /> <path d=\"M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1\" /> </svg>","insChapter":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M4 12h8\" /> <path d=\"M4 18V6\" /> <path d=\"M12 18V6\" /> <path d=\"m17 12 3-2v8\" /> </svg>","insTextBox":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M14 21h1\" /> <path d=\"M14 3h1\" /> <path d=\"M19 3a2 2 0 0 1 2 2\" /> <path d=\"M21 14v1\" /> <path d=\"M21 19a2 2 0 0 1-2 2\" /> <path d=\"M21 9v1\" /> <path d=\"M3 14v1\" /> <path d=\"M3 9v1\" /> <path d=\"M5 21a2 2 0 0 1-2-2\" /> <path d=\"M5 3a2 2 0 0 0-2 2\" /> <path d=\"M7 12h10\" /> <path d=\"M7 16h6\" /> <path d=\"M7 8h8\" /> <path d=\"M9 21h1\" /> <path d=\"M9 3h1\" /> </svg>","copyBlock":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /> <path d=\"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\" /> <path d=\"M16 4h2a2 2 0 0 1 2 2v4\" /> <path d=\"M21 14H11\" /> <path d=\"m15 10-4 4 4 4\" /> </svg>","pasteBlock":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M11 14h10\" /> <path d=\"M16 4h2a2 2 0 0 1 2 2v1.344\" /> <path d=\"m17 18 4-4-4-4\" /> <path d=\"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113\" /> <rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\" /> </svg>","wrapInline":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"M21 5H3\" /> <path d=\"M15 12H3\" /> <path d=\"M17 19H3\" /> </svg>","wrapSquare":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"m16 16-3 3 3 3\" /> <path d=\"M3 12h14.5a1 1 0 0 1 0 7H13\" /> <path d=\"M3 19h6\" /> <path d=\"M3 5h18\" /> </svg>","wrapTight":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"m16 16-3 3 3 3\" /> <path d=\"M3 12h14.5a1 1 0 0 1 0 7H13\" /> <path d=\"M3 19h6\" /> <path d=\"M3 5h18\" /> </svg>","wrapThrough":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <path d=\"m16 16-3 3 3 3\" /> <path d=\"M3 12h14.5a1 1 0 0 1 0 7H13\" /> <path d=\"M3 19h6\" /> <path d=\"M3 5h18\" /> </svg>","wrapTopBottom":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect width=\"13\" height=\"7\" x=\"8\" y=\"3\" rx=\"1\" /> <path d=\"m2 9 3 3-3 3\" /> <rect width=\"13\" height=\"7\" x=\"8\" y=\"14\" rx=\"1\" /> </svg>","wrapBehind":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect x=\"14\" y=\"14\" width=\"8\" height=\"8\" rx=\"2\" /> <rect x=\"2\" y=\"2\" width=\"8\" height=\"8\" rx=\"2\" /> <path d=\"M7 14v1a2 2 0 0 0 2 2h1\" /> <path d=\"M14 7h1a2 2 0 0 1 2 2v1\" /> </svg>","wrapFront":"<svg aria-hidden=\"true\" focusable=\"false\" class=\"ic\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" > <rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"2\" /> <path d=\"M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2\" /> <path d=\"M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2\" /> </svg>"});
const W2 = { sel: null }; // the chrome item picked on screen: {part, i}
const w2doc = () => cur().doc;
const w2id = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Ops that create what a path needs (an object at /chrome, /overlays …) and the op itself, in one commit. */
function w2commit(ops, opt) { commit(ops, opt); }
/** The stable id of a block (A6 anchors, A15/A23 overlays): given on first use, kept by move and duplicate. */
function w2blockId(ptr, pre) {
  const blk = get(w2doc(), ptr);
  if (!blk) return null;
  if (blk.id) return blk.id;
  const id = w2id('b');
  pre.push({ op: 'replace', path: `${ptr}/id`, value: id, old: undefined });
  return id;
}
function w2docCss(id, css) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  el.textContent = css;
}
/** Toolbar sections of the extensions, registered at load: boot() runs after every extension (engine/build-editor.mjs),
 * so the first mount draws them; nothing is rebuilt afterwards. */
function w2addSections(cats) {
  bwExt({ sections: cats.map((cat) => ({ cat })) });
  for (const cat of cats) GENERAL_GROUPS.splice(GENERAL_GROUPS.indexOf(cat), 1); // steps aside in selections: not a palette group
}
/** Shows a section only while its condition holds (sections are built by buildUi; this survives a rebuild). */
function w2showSection(cat, on) {
  // a contextual section (format, wrap, front matter) exists only while it applies: the bar keeps its room at 1366 px
  const el = root.querySelector(`.island .sec[data-cat="${cat}"]`);
  if (!on) { if (el) { el.remove(); fitBar(); } return; }
  if (el) return;
  root.querySelector('.island .sec[data-cat="export"]')?.insertAdjacentHTML('beforebegin', sec(cat, CMDS.filter((c) => c.group === cat).map(tool)));
  fitBar();
}

const W2_CHROME = {
  /** doc.chrome made from today's band (one op), unless it exists. */
  ensure(pre) {
    if (w2doc().chrome) return;
    pre.push({ op: 'replace', path: '/chrome', value: chromeDefaults(S.ed), old: undefined });
  },
  items(part) { return w2doc().chrome?.[part]?.items || chromeDefaults(S.ed)[part].items; },
  add(part, item) {
    const pre = [];
    this.ensure(pre);
    const n = (w2doc().chrome?.[part]?.items || chromeDefaults(S.ed)[part].items).length;
    w2commit([...pre, { op: 'insert', path: `/chrome/${part}/items/-`, value: { id: w2id(part[0]), align: 'start', scope: 'all', ...item } }]);
    W2.sel = { part, i: n, pageB: S.sel?.b || w2pageBlock(null) }; // F2 · 28: "this page" = where it was added
    render();
    return n;
  },
  set(part, i, key, value) {
    const pre = [];
    this.ensure(pre);
    const old = (w2doc().chrome?.[part]?.items || chromeDefaults(S.ed)[part].items)[i];
    if (!old) return;
    w2commit([...pre, { op: 'replace', path: `/chrome/${part}/items/${i}`, value: { ...old, [key]: value }, old }]);
  },
  remove(part, i) {
    const pre = [];
    this.ensure(pre);
    const old = (w2doc().chrome?.[part]?.items || chromeDefaults(S.ed)[part].items)[i];
    if (!old) return;
    w2commit([...pre, { op: 'delete', path: `/chrome/${part}/items/${i}`, old }]);
    W2.sel = null;
    undoToast(t('ux.deletedItem'), () => w2commit([{ op: 'insert', path: `/chrome/${part}/items/${i}`, value: old }]));
  },
  /** A6: every page / this page only / from this page on — anchored to the selected block (it gains an id). */
  scope(part, i, scope, blockPtr) {
    const pre = [];
    this.ensure(pre);
    const old = (w2doc().chrome?.[part]?.items || chromeDefaults(S.ed)[part].items)[i];
    if (!old) return false;
    const next = { ...old, scope };
    if (scope === 'all') delete next.anchor;
    else {
      // F2 · 28: the page the item was picked on (no block selection needed); a block pointer, when given, wins
      const b = blockOf(blockPtr || W2.sel?.pageB || S.sel?.b || w2pageBlock(null));
      if (!b) { toast(t('w2.needBlock'), 'warn'); return false; }
      next.anchor = w2blockId(b.ptr, pre);
    }
    w2commit([...pre, { op: 'replace', path: `/chrome/${part}/items/${i}`, value: next, old }]);
    return true;
  },
};

async function w2chromeAction(id) {
  const op = id.replace(/^(hdr|ftr|ch)/, '');
  // hdr*/ftr* add to their band; ch* work on the item picked on screen, whichever band it is in
  const part = id === 'hdrConf' ? 'footer' : id.startsWith('hdr') ? 'header' : id.startsWith('ftr') ? 'footer' : W2.sel?.part;
  if (op === 'Text') { const v = await ask(t('w2.textPrompt')); if (v) W2_CHROME.add(part, { kind: 'text', value: v }); return; }
  if (op === 'Field') { openDrawer(part === 'header' ? 'w2hdrField' : 'w2ftrField'); return; }
  if (op === 'Logo') { const img = await pickImage(); if (img) W2_CHROME.add(part, { kind: 'logo', value: 'header', src: img.src }); return; }
  if (op === 'Conf') { const v = await ask(t('w2.confPrompt'), labelsOf().confidential || ''); if (v) setText('/labels/confidential', v); render(); return; }
  if (!W2.sel || W2.sel.part !== part) { toast(t('w2.pickItem'), 'info'); return; } // the item tools of a band act on an item of that band
  const i = W2.sel.i;
  if (op === 'Start' || op === 'Center' || op === 'End') W2_CHROME.set(part, i, 'align', op.toLowerCase());
  else if (op === 'Delete') W2_CHROME.remove(part, i);
  else if (op === 'Scope') {
    const now = W2_CHROME.items(part)[i]?.scope || 'all';
    const next = { all: 'only', only: 'from', from: 'all' }[now];
    if (W2_CHROME.scope(part, i, next)) toast(t('w2.scope.' + next), 'info'); // the toast says what happened, only when it did
  }
}
const W2_ITEM_OPS = ['Start', 'Center', 'End', 'Delete', 'Scope'];
// A5: two sections, as asked: «الترويسة» (header) and «التذييل» (footer); each carries its own item tools.
// The ch* ids stay as actions (scripts, older palettes): they work on the picked item, whichever band it is in.
const W2_HDR_IDS = ['hdrText', 'hdrField', 'hdrLogo', ...W2_ITEM_OPS.map((o) => 'hdr' + o)];
const W2_FTR_IDS = ['ftrText', 'ftrField', 'hdrConf', ...W2_ITEM_OPS.map((o) => 'ftr' + o)];
const W2_CH_IDS = [...W2_HDR_IDS, ...W2_FTR_IDS, ...W2_ITEM_OPS.map((o) => 'ch' + o)];
for (const o of W2_ITEM_OPS) { IC['hdr' + o] = IC['ftr' + o] = IC['ch' + o]; }
const W2_FIELDS = [...CHROME_FIELDS.map((f) => ['field', f]), ['page', 'n'], ['page', 'n/N']];
function w2fieldDrawer(part) {
  return () => ({
    title: t(part === 'header' ? 'secHeader' : 'secFooter'),
    html: `<p>${esc(t('w2.fieldPick'))}</p><div class="list">${W2_FIELDS.map(([k, v]) => `<button type="button" class="b" data-w2f="${k}:${v}"><span class="w">${esc(t('w2.f.' + v))}</span></button>`).join('')}</div>`,
    mount: (el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w2f]');
      if (!b) return;
      const [kind, value] = b.dataset.w2f.split(/:(.*)/);
      W2_CHROME.add(part, { kind, value });
      closeDrawer();
    }),
  });
}

/** The editable strip of the document's bands (segment 0), above the body; print never sees it. */
function w2strip() {
  document.querySelectorAll('#bw-pair .w2-strip').forEach((x) => x.remove());
  // beside the document, never inside it (the page's own markup stays the print markup); one edition, long view
  if (S.side || viewsActive()) return;
  for (const ed of [S.ed]) {
    const main = mainOf(ed);
    if (!main || !M[S.svc][ed]) continue;
    const d = cur(ed).doc;
    const show = { ...d, chrome: d.chrome || chromeDefaults(ed) };
    const o = { locale: ed, theme: S.theme, labels: I18N.doc[ed], L: labelsOf(ed), logos: S.theme.logos };
    const seg = pageModel(show).segments[0];
    const div = document.createElement('div');
    div.className = 'w2-strip';
    div.setAttribute('contenteditable', 'false');
    div.innerHTML = `<div class="w2-band-h"><span class="w2-tag">${esc(t('secHeader'))}</span>${runBand(show, o, 'header', seg)}</div><div class="w2-band-f"><span class="w2-tag">${esc(t('secFooter'))}</span>${runBand(show, o, 'footer', seg)}</div>`;
    // the strip edits through its own handler (it is not part of the document's markup): data-p → data-w2p
    div.querySelectorAll('[data-p]').forEach((x) => { if (d.chrome) { x.dataset.w2p = x.dataset.p; x.tabIndex = 0; x.contentEditable = 'plaintext-only'; } x.removeAttribute('data-p'); });
    if (W2.sel && ed === S.ed) div.querySelector(`[data-ci="${W2.sel.part}:${W2.sel.i}"]`)?.classList.add('w2-ci-sel');
    div.dir = main.dir;
    div.lang = ed;
    main.before(div);
  }
}

IC.secHeader = IC.secChrome;
IC.secFooter = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M3 15h18" /> </svg>';
w2addSections(['header', 'footer']);
bwExt({
  cmds: [
    ...W2_HDR_IDS.slice(0, 3).map((id) => ({ id, group: 'header', edit: true })),
    { id: 'every', group: 'header', edit: true },
    ...W2_HDR_IDS.slice(3).map((id) => ({ id, group: 'header', edit: true })),
    ...W2_FTR_IDS.map((id) => ({ id, group: 'footer', edit: true })),
  ],
  actions: Object.fromEntries(W2_CH_IDS.map((id) => [id, w2chromeAction])),
  drawers: { w2hdrField: w2fieldDrawer('header'), w2ftrField: w2fieldDrawer('footer') },
  expose: { w2chrome: W2_CHROME },
  on: {
    boot: () => {
      setTimeout(w2strip);
      // the two sections step aside while a selection's own section is in the bar (1366 px has no room for both)
      // and come back with the general tools; a picked header/footer item brings back its own band's section
      new MutationObserver(() => {
        const sel = root.querySelector('.island')?.classList.contains('has-sel');
        w2showSection('header', !sel || W2.sel?.part === 'header');
        w2showSection('footer', !sel || W2.sel?.part === 'footer');
      }).observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
      // a side panel slides over the page's start: when the window has room, the page steps aside so the strip (and the
      // page) is never hidden under it (owner 2026-10-29: a footer name lost its first letters behind Settings)
      const room = () => {
        const de = document.documentElement, d = root.querySelector('.drawer:not([hidden]):not(.closing)');
        const r = d && { left: d.offsetLeft, width: d.offsetWidth, right: d.offsetLeft + d.offsetWidth }; // layout box: the entry slide is not counted
        const page = document.querySelector('#bw-pair main.bw-doc')?.getBoundingClientRect().width || 0;
        let l = 0, rr = 0;
        if (r?.width) { const left = r.left + r.width / 2 < innerWidth / 2, w = Math.ceil(left ? r.right : innerWidth - r.left) + 12; if (innerWidth - w >= page + 16) { if (left) l = w; else rr = w; } }
        de.style.setProperty('--bw-room-l', `${l}px`);
        de.style.setProperty('--bw-room-r', `${rr}px`);
      };
      new MutationObserver((ms) => { if (ms.some((m) => m.target.classList?.contains('drawer'))) room(); }).observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] }); // the panel only: no layout read per render
      addEventListener('resize', room);
      room();
      w2docCss('w2-doc-css', `@media print{.w2-strip{display:none!important}}
.w2-strip{font-size:9pt;color:var(--muted);background:var(--paper,#fff);border:1px dashed var(--rule-strong);border-radius:2mm;max-width:210mm;margin:4mm auto;padding:1.5mm 3mm;display:grid;gap:1mm}
.w2-strip .bw-band{display:flex;justify-content:space-between;align-items:center;min-height:6mm}
.w2-band-h,.w2-band-f{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3mm;align-items:center}
.w2-strip .bw-band{flex-wrap:wrap;column-gap:3mm}
.w2-strip .bw-band>*{min-width:0;overflow-wrap:anywhere}
@media screen{#bw-pair{padding-left:var(--bw-room-l,0px);padding-right:var(--bw-room-r,0px);transition:padding .3s cubic-bezier(.16,1,.3,1)}}
@media screen and (prefers-reduced-motion:reduce){#bw-pair{transition:none}}
.w2-tag{font-size:8pt;color:var(--accent);font-weight:700}
.w2-strip [data-ci]{cursor:pointer;border-radius:1mm;padding:0 1mm}
.w2-strip [data-ci]:hover{outline:1px solid var(--rule-strong)}
.w2-strip .w2-ci-sel{outline:2px solid var(--primary)}
.w2-strip img{height:5mm}`);
    },
    render: () => w2strip(),
  },
});
/** F2 · 28: the block that stands for "this page": the first block of the page frame the item sits on (paged view),
 *  else the block selected last, else the first block in view. */
function w2pageBlock(el) {
  const main = mainOf(S.ed);
  const blocks = [...(main?.querySelectorAll('.wrap [data-b]') || [])];
  const f = el?.closest?.('.bw-run-f');
  if (f && typeof viewsPageOf === 'function') { const k = +f.dataset.page; const b = blocks.find((x) => viewsPageOf(x) >= k); if (b) return b.dataset.b; }
  if (W2.lastB && blockOf(W2.lastB)) return W2.lastB;
  return (blocks.find((x) => x.getBoundingClientRect().bottom > 90) || blocks[0])?.dataset.b || null;
}
// the press on a band item clears the page selection: remember it first (capture runs before the editor's handler)
document.addEventListener('pointerdown', () => { if (S.sel?.b) W2.lastB = S.sel.b; }, true);
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('#bw-pair :is(.w2-strip, .bw-runs) [data-ci]');
  if (!el) { if (e.target.closest?.('#bw-pair main.bw-doc')) W2.sel = null; return; }
  const [part, i] = el.dataset.ci.split(':');
  W2.sel = { part, i: +i, pageB: w2pageBlock(el) };
  document.querySelectorAll('.w2-ci-sel').forEach((x) => x.classList.remove('w2-ci-sel'));
  el.classList.add('w2-ci-sel');
  root.querySelector('.sec[data-cat="chrome"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
});
document.addEventListener('input', (e) => {
  const el = e.target.closest?.('#bw-pair :is(.w2-strip, .bw-runs) [data-w2p]');
  if (el) setText(el.dataset.w2p, el.innerText.replace(/\s+/g, ' ').trim(), S.ed);
});
document.addEventListener('focusout', (e) => { if (e.target.closest?.('#bw-pair :is(.w2-strip, .bw-runs) [data-w2p]')) render(); });
