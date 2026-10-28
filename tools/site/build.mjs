// Builds the public site from tools/site/pages/*.html. No dependencies.
//   node tools/site/build.mjs           write site/<page>.html (English), site/ar/<page>.html (Arabic),
//                                       site/sitemap.xml and the copied brand assets
//   node tools/site/build.mjs --check   exit 1 when any of those is stale (byte comparison)
//
// One source per page carries both languages: an element with data-l="en" or data-l="ar" is kept in its own
// edition and removed from the other by a balanced-tag stripper (no regex across nesting).
// Placeholders: {{head path="" en="" ar="" desc="" desc-ar=""}}, {{header page=""}}, {{family}}, {{footer}},
// {{icon:NAME}} (brand icon, inlined so its micro-animation runs), {{ui:NAME}} (Lucide UI glyph), {{copy}},
// {{version}} (package.json), {{mark}} (the cover mark, inlined), {{media:NAME}} (hero media, see MEDIA).
// A page whose source starts with <!-- bilingual --> (404.html) keeps both languages and uses absolute URLs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'site');
const BASE = 'https://nj-burrito.github.io/Business-Wrap/';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const REPO = 'https://github.com/NJ-Burrito/Business-Wrap';

// Brand files copied into site/assets: the first source that exists wins. brand/v3 is the brand; the
// brand/v2 icon line and the mark-small favicon stand-in go when the v3 files are merged (integration step).
const ASSETS = {
  'assets/tokens.css': ['brand/v3/tokens-v3.css'],
  'assets/icons.css': ['brand/v3/icons/icons.css', 'brand/v2/icons/icons.css'],
  'assets/favicon.svg': ['brand/v3/favicon/favicon.svg', 'brand/v3/logo/mark-small.svg'],
  'assets/favicon.ico': ['brand/v3/favicon/favicon.ico'],
  'assets/icon-192.png': ['brand/v3/favicon/icon-192.png'],
  'assets/icon-512.png': ['brand/v3/favicon/icon-512.png'],
  'assets/apple-touch-icon.png': ['brand/v3/favicon/apple-touch-icon.png'],
  'assets/og.png': ['brand/v3/social/og.png'],
  'assets/og-ar.png': ['brand/v3/social/og-ar.png'],
  'assets/social-card.png': ['brand/v3/social/social-card.png'],
  'assets/fonts/thmanyah-sans-400.woff2': ['fonts/nj-fonts/thmanyah/thmanyahsans/woff2/thmanyahsans-Regular.woff2'],
  'assets/fonts/thmanyah-sans-700.woff2': ['fonts/nj-fonts/thmanyah/thmanyahsans/woff2/thmanyahsans-Bold.woff2'],
  'assets/fonts/thmanyah-serif-display-700.woff2': ['fonts/nj-fonts/thmanyah/thmanyahserifdisplay/woff2/thmanyahserifdisplay-Bold.woff2'],
};
const ICON_DIRS = ['brand/v3/icons', 'brand/v2/icons'];
const MARK = ['brand/v3/logo/mark.svg'];
// Hero media (site/assets/media is the media package's folder): frozen names first, current files as stand-ins.
const MEDIA = {
  'hero-mp4': ['hero.mp4'],
  'hero-poster': ['hero-poster.webp', 'hero-site-poster.png'],
};

const first = (list) => list.find((p) => fs.existsSync(path.join(ROOT, p)));
const media = (n) => { const f = MEDIA[n].find((p) => fs.existsSync(path.join(OUT, 'assets', 'media', p))); if (!f) throw new Error(`media ${n}: none of ${MEDIA[n].join(', ')}`); return `assets/media/${f}`; };

// Colour literals in an icon stylesheet or icon file are fallbacks for other hosts; on the site the tokens decide.
const noHexFallback = (s) => s.replace(/,\s*#[0-9a-fA-F]{3,8}\)/g, ')').replace(/var\(--bw-marker-icon, var\(--bw-accent\)\)/g, 'var(--bw-marker-icon)');

const UI = {
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  arrow: '<path class="shaft" d="M5 12h14"/><path class="head" d="m12 5 7 7-7 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  'life-buoy': '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
};
const ui = (n, cls = '') => { if (!UI[n]) throw new Error(`unknown ui glyph ${n}`); return `<svg class="ui ${cls || 'i-' + n}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${UI[n]}</svg>`; };

function icon(name) {
  const dir = ICON_DIRS.find((d) => fs.existsSync(path.join(ROOT, d, `${name}.svg`)));
  if (!dir) throw new Error(`icon ${name}: not in ${ICON_DIRS.join(' or ')}`);
  let s = fs.readFileSync(path.join(ROOT, dir, `${name}.svg`), 'utf8').trim();
  s = s.replace(/<title>[\s\S]*?<\/title>/, '').replace(/\s*role="img"/, '').replace(/\s*aria-label="[^"]*"/, '');
  s = s.replace(/(<[^>]*class="hl"[^>]*?)\s*fill="#[0-9a-fA-F]{3,8}"/g, '$1');
  return s.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
}

function mark(cls = '') {
  const f = first(MARK);
  if (!f) throw new Error(`mark: none of ${MARK.join(', ')}`);
  let s = fs.readFileSync(path.join(ROOT, f), 'utf8').trim();
  s = s.replace(/\s*role="img"/, '').replace(/\s*aria-label="[^"]*"/, '').replace(/\s*width="\d+"\s*height="\d+"/, '');
  return s.replace('<svg ', `<svg class="mark${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false" `);
}

const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";

const T = {
  en: { skip: 'Skip to content', home: 'Business-Wrap home', site: 'Site', menu: 'Menu', close: 'Close menu', theme: 'Switch between light and dark', gh: 'Source on GitHub', other: 'العربية', otherLang: 'ar', name: 'Business-Wrap', copy: 'Copy command', copied: 'Copied', ogAlt: 'Business-Wrap: evidence in, one document in two languages' },
  ar: { skip: 'انتقل إلى المحتوى', home: 'الصفحة الرئيسية لبزنس راب', site: 'الموقع', menu: 'القائمة', close: 'أغلق القائمة', theme: 'بدل بين الفاتح والداكن', gh: 'المصدر على GitHub', other: 'English', otherLang: 'en', name: 'بزنس راب', copy: 'انسخ الأمر', copied: 'تم النسخ', ogAlt: 'بزنس راب: أدلة تدخل، ووثيقة واحدة بلغتين' },
};
const NAV = {
  en: [['#how', 'How it works'], ['#features', 'Features'], ['#install', 'Install'], ['#faq', 'FAQ'], ['support.html', 'Support']],
  ar: [['#how', 'كيف يعمل'], ['#features', 'المزايا'], ['#install', 'التثبيت'], ['#faq', 'أسئلة شائعة'], ['support.html', 'الدعم']],
};
const LEGAL = {
  en: [['support.html', 'Support'], ['privacy.html', 'Privacy'], ['terms.html', 'Terms'], [`${REPO}/blob/main/CHANGELOG.md`, 'Changelog']],
  ar: [['support.html', 'الدعم'], ['privacy.html', 'الخصوصية'], ['terms.html', 'الشروط'], [`${REPO}/blob/main/CHANGELOG.md`, 'سجل التغييرات']],
};

const pageUrl = (lang, file) => BASE + (lang === 'ar' ? 'ar/' : '') + (file === 'index.html' ? '' : file);

function head(a, lang, file, ld, pre) {
  const t = lang === 'ar' ? a.ar : a.en;
  const d = lang === 'ar' ? a['desc-ar'] : a.desc;
  const self = pageUrl(lang, file);
  const og = BASE + (lang === 'ar' ? 'assets/og-ar.png' : 'assets/og.png');
  const alt = file === '404.html' ? '' : `<link rel="alternate" hreflang="en" href="${pageUrl('en', file)}">
<link rel="alternate" hreflang="ar" href="${pageUrl('ar', file)}">
<link rel="alternate" hreflang="x-default" href="${pageUrl('en', file)}">
`;
  return `<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(d)}">
${file === '404.html' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${self}">`}
${alt}<meta name="theme-color" content="#fafaf9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#001e3d" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Business-Wrap">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:url" content="${self}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(T[lang].ogAlt)}">
<meta property="og:locale" content="${lang === 'ar' ? 'ar_AR' : 'en_US'}">
<meta property="og:locale:alternate" content="${lang === 'ar' ? 'en_US' : 'ar_AR'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t)}">
<meta name="twitter:description" content="${esc(d)}">
<meta name="twitter:image" content="${og}">
<meta name="twitter:image:alt" content="${esc(T[lang].ogAlt)}">
${ld ? `<script type="application/ld+json">${ld}</script>\n` : ''}<link rel="icon" href="${pre}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${pre}assets/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="${pre}assets/apple-touch-icon.png">
<link rel="preload" href="${pre}assets/fonts/thmanyah-sans-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${pre}assets/fonts/thmanyah-serif-display-700.woff2" as="font" type="font/woff2" crossorigin>
<script src="${pre}assets/boot.js"></script>
<link rel="stylesheet" href="${pre}assets/tokens.css">
<link rel="stylesheet" href="${pre}assets/icons.css">
<link rel="stylesheet" href="${pre}assets/site.css">
<script src="${pre}assets/site.js" defer></script>`;
}

// The wordmark is live text in Thmanyah Serif Display beside the inlined cover mark (the mark builds on load, c.3).
function brandLink(lang, home, cls = '') {
  const word = lang === 'ar' ? 'بزنس <span class="wm-rule">راب</span>' : 'Business-<span class="wm-rule">Wrap</span>';
  return `<a class="brand${cls}" href="${home}" aria-label="${T[lang].home}">${mark('is-build')}<span class="wordmark" aria-hidden="true">${word}</span></a>`;
}

function header(page, lang, pre, twin) {
  const t = T[lang];
  const abs = pre.startsWith('/') ? pre : '';
  const homeHref = abs || './';
  const link = (h) => (h.startsWith('http') ? h : h.startsWith('#') ? (page === 'home' ? h : `${abs || './'}${h}`) : abs + h);
  const cur = (h) => (h === `${page}.html` ? ' aria-current="page"' : '');
  const nav = NAV[lang].map(([h, l]) => `<a href="${link(h)}"${cur(h)}>${l}</a>`).join('');
  const sheet = [...NAV[lang], ...LEGAL[lang].slice(1)].map(([h, l]) => `<li><a href="${link(h)}"${cur(h)}>${l}</a></li>`).join('');
  return `<a class="skip" href="#main">${t.skip}</a>
<div class="spine" aria-hidden="true"><span class="cap"></span></div>
<header class="masthead">
  <div class="wrap">
    ${brandLink(lang, homeHref)}
    <nav class="topnav" aria-label="${t.site}">${nav}</nav>
    <div class="tools">
      <a class="tbtn tbtn-gh" href="${REPO}" aria-label="${t.gh}">${ui('github')}</a>
      <button type="button" class="tbtn" id="theme-toggle" aria-label="${t.theme}">${ui('moon')}${ui('sun')}</button>
      <a class="tbtn tbtn-lang" href="${twin}" hreflang="${t.otherLang}" lang="${t.otherLang}">${ui('languages')}<span>${t.other}</span></a>
      <button type="button" class="tbtn tbtn-menu" id="menu-toggle" aria-label="${t.menu}" aria-expanded="false" aria-controls="menu">${ui('menu')}<span>${t.menu}</span></button>
    </div>
  </div>
</header>
<div class="menu-scrim" id="menu-scrim" hidden></div>
<nav class="menu-sheet" id="menu" aria-label="${t.menu}" hidden>
  <button type="button" class="tbtn menu-close" id="menu-close" aria-label="${t.close}">${ui('x')}</button>
  <ul>${sheet}<li><a href="${REPO}">GitHub</a></li></ul>
</nav>`;
}

const FAMILY = [
  ['https://nj-burrito.github.io/', 'https://nj-burrito.github.io/', 'Portfolio', 'work, posts and contact', 'الموقع الشخصي', 'الأعمال والمنشورات والتواصل'],
  ['https://nj-burrito.github.io/NJ-Kit/', 'https://nj-burrito.github.io/NJ-Kit/', 'NJ-Kit', 'a free working method for Claude Code', 'NJ-Kit', 'منهج عمل مجاني لـ Claude Code'],
  ['https://nj-burrito.github.io/QA-Wrap/', 'https://nj-burrito.github.io/QA-Wrap/', 'QA-Wrap', 'test the page, get the bug report', 'QA-Wrap', 'اختبر الصفحة، وخذ تقرير الخلل جاهزا'],
  ['https://nj-burrito.github.io/Profile-Wrap/', 'https://nj-burrito.github.io/Profile-Wrap/', 'Profile-Wrap', 'your LinkedIn on autopilot, you stay the boss', 'Profile-Wrap', 'لينكدإن على الطيار الآلي، وأنت صاحب القرار'],
  ['https://nj-burrito.github.io/story-wrap/', 'https://nj-burrito.github.io/story-wrap/ar/', 'Story-Wrap', 'the series <bdi lang="ar" dir="rtl">«مكتب المفقودات»</bdi>', 'Story-Wrap', 'سلسلة «مكتب المفقودات»'],
];

function family(lang) {
  const ar = lang === 'ar';
  const tiles = FAMILY.map(([en, arU, n, l, nAr, lAr]) => `<a class="tile" href="${ar ? arU : en}"><b>${ar ? nAr : n}</b><span>${ar ? lAr : l}</span>${ui('arrow', 'more')}</a>`).join('\n      ');
  return `<section class="section family-sec" id="more" aria-labelledby="more-h">
  <div class="wrap">
    <header class="sec-head" data-reveal><h2 id="more-h">${ar ? 'المزيد من NJ' : 'More from NJ'}</h2><p>${ar ? 'أدوات مجانية بالقواعد نفسها: على جهازك أولا، بالعربية والإنجليزية، بلا حساب.' : 'Free tools with the same rules: local first, Arabic and English, no account.'}</p></header>
    <div class="family" data-reveal-stagger>
      ${tiles}
    </div>
  </div>
</section>`;
}

function footer(lang, pre) {
  const ar = lang === 'ar';
  const abs = pre.startsWith('/') ? pre : '';
  const legal = LEGAL[lang].map(([h, l]) => `<a href="${h.startsWith('http') ? h : abs + h}">${l}</a>`).join('');
  const story = ar ? 'https://nj-burrito.github.io/story-wrap/ar/' : 'https://nj-burrito.github.io/story-wrap/';
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="foot-brand">${mark('is-dark')}<p><strong>${T[lang].name}</strong><span>${ar ? 'أدلة تدخل. وثيقة واحدة بلغتين.' : 'Evidence in. One document, two languages.'}</span></p></div>
    <nav class="foot-row" aria-label="${ar ? 'صفحات الموقع' : 'Site pages'}">${legal}</nav>
    <nav class="foot-row foot-family" aria-label="${ar ? 'العائلة والروابط' : 'Family and links'}"><a href="https://nj-burrito.github.io/">${ar ? 'الموقع الشخصي' : 'Portfolio'}</a><a href="https://nj-burrito.github.io/NJ-Kit/">NJ-Kit</a><a href="https://nj-burrito.github.io/QA-Wrap/">QA-Wrap</a><a href="https://nj-burrito.github.io/Profile-Wrap/">Profile-Wrap</a><a href="${story}">Story-Wrap</a><a href="https://github.com/NJ-Burrito">GitHub</a><a href="https://www.linkedin.com/in/nader-alzghoul">LinkedIn</a><a href="${REPO}">${ar ? 'المصدر' : 'Source'}</a><a href="https://nj-burrito.github.io/#contact">${ar ? 'تواصل' : 'Contact'}</a></nav><!-- bw-allow:bw-denylist (Lead approved 2026-10-28: Nader's own profile link on his own tool site) -->
    <p class="fine">${ar ? `رخصة MIT. لا صلة له بأي جهة حكومية ولا بشركة Anthropic. الخطوط: انظر <a href="${REPO}/blob/main/NOTICE.md">NOTICE</a>.` : `MIT licence. Not affiliated with any government service or with Anthropic. Fonts: see <a href="${REPO}/blob/main/NOTICE.md">NOTICE</a>.`}</p>
  </div>
  <p class="sr-only" id="copy-status" role="status" data-done="${T[lang].copied}"></p>
</footer>`;
}

// Balanced-tag stripper: remove every element carrying data-l="<lang>" with its whole subtree.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function stripLang(html, lang) {
  const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const want = new RegExp(`\\sdata-l="${lang}"`);
  let out = '', last = 0, m;
  while ((m = TAG.exec(html))) {
    if (m[0].startsWith('<!--') || m[1] || !want.test(m[3])) continue;
    const start = m.index, name = m[2].toLowerCase();
    if (VOID.has(name) || m[4]) { out += html.slice(last, start); last = TAG.lastIndex; continue; }
    let depth = 1, n;
    while (depth && (n = TAG.exec(html))) {
      if (n[0].startsWith('<!--')) continue;
      const nm = n[2].toLowerCase();
      if (n[1]) depth--; else if (!VOID.has(nm) && !n[4]) depth++;
    }
    if (depth) throw new Error(`unbalanced element <${name} data-l="${lang}"> at ${start}`);
    out += html.slice(last, start); last = TAG.lastIndex;
    while (out.endsWith(' ') || out.endsWith('\t')) out = out.slice(0, -1);
    if (out.endsWith('\n') && html[last] === '\n') last++;
  }
  return (out + html.slice(last)).replace(/\sdata-l="(en|ar)"/g, '');
}

function build(file, lang) {
  let s = fs.readFileSync(path.join(HERE, 'pages', file), 'utf8');
  const bilingual = s.startsWith('<!-- bilingual -->');
  if (bilingual) s = s.replace(/^<!-- bilingual -->\n/, '');
  const pre = bilingual ? '/Business-Wrap/' : lang === 'ar' ? '../' : '';
  const twin = file === 'index.html' ? (lang === 'ar' ? '../' : 'ar/') : (lang === 'ar' ? `../${file}` : `ar/${file}`);
  const ldFile = path.join(HERE, 'pages', file.replace(/\.html$/, '.ld.json'));
  const ld = fs.existsSync(ldFile) ? JSON.stringify(JSON.parse(fs.readFileSync(ldFile, 'utf8').replace(/\{\{version\}\}/g, VERSION))) : '';
  s = s.replace(/<html[^>]*>/, `<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" data-lang="${lang}">`);
  s = s.replace(/\{\{head ([^}]*)\}\}/, (_, a) => head(attrs(a), lang, file, ld, pre));
  s = s.replace(/\{\{header ([^}]*)\}\}/, (_, a) => header(attrs(a).page, lang, pre, bilingual ? `/Business-Wrap/${lang === 'ar' ? '' : 'ar/'}` : twin));
  s = s.replace(/\{\{family\}\}/g, () => family(lang)).replace(/\{\{footer\}\}/g, () => footer(lang, pre));
  s = s.replace(/\{\{icon:([a-z-]+)\}\}/g, (_, n) => icon(n));
  s = s.replace(/\{\{ui:([a-z-]+)\}\}/g, (_, n) => ui(n));
  s = s.replace(/\{\{mark\}\}/g, () => mark());
  s = s.replace(/\{\{media:([a-z0-9-]+)\}\}/g, (_, n) => media(n));
  s = s.replace(/\{\{version\}\}/g, VERSION);
  s = s.replace(/\{\{copy\}\}/g, `<button type="button" class="copy" aria-label="${T[lang].copy}">${ui('copy')}${ui('check')}</button>`);
  if (/\{\{/.test(s)) throw new Error(`${file}: unresolved placeholder ${s.match(/\{\{[^}]*\}\}/)[0]}`);
  if (!bilingual) s = stripLang(s, lang === 'ar' ? 'en' : 'ar');
  // page-relative asset URLs: the Arabic edition lives one folder down
  if (pre === '../') s = s.replace(/(\s(?:href|src|poster|data-poster)=")assets\//g, '$1../assets/');
  if (bilingual) s = s.replace(/(\s(?:href|src|poster|data-poster)=")assets\//g, '$1/Business-Wrap/assets/');
  // no tashkeel on public Arabic (the gate below refuses it)
  if (/[\u064B-\u0652]/.test(s)) throw new Error(`${lang}/${file}: Arabic diacritics found (public Arabic is unvowelled)`);
  if (/\u2014/.test(s)) throw new Error(`${lang}/${file}: em dash found`);
  return s;
}

function sitemap(pages) {
  const day = '2026-10-28';
  const urls = pages.filter((f) => f !== '404.html').flatMap((f) => ['en', 'ar'].map((l) => `  <url><loc>${pageUrl(l, f)}</loc><lastmod>${day}</lastmod><xhtml:link rel="alternate" hreflang="en" href="${pageUrl('en', f)}"/><xhtml:link rel="alternate" hreflang="ar" href="${pageUrl('ar', f)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl('en', f)}"/></url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

const check = process.argv.includes('--check');
let stale = 0;
const pending = [];
function emit(rel, data) {
  const dest = path.join(OUT, rel);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  if (check) {
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(buf)) { console.error(`STALE site/${rel}`); stale++; }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(buf)) { fs.writeFileSync(dest, buf); console.log(`wrote site/${rel}`); }
  }
}

for (const [rel, sources] of Object.entries(ASSETS)) {
  const src = first(sources);
  if (!src) { pending.push(rel); continue; }
  let data = fs.readFileSync(path.join(ROOT, src));
  if (rel.endsWith('.css') && rel !== 'assets/tokens.css') data = Buffer.from(noHexFallback(data.toString('utf8')), 'utf8');
  emit(rel, data);
}
const pages = fs.readdirSync(path.join(HERE, 'pages')).filter((f) => f.endsWith('.html')).sort();
for (const f of pages) {
  const bilingual = fs.readFileSync(path.join(HERE, 'pages', f), 'utf8').startsWith('<!-- bilingual -->');
  if (bilingual) { emit(f, build(f, 'en')); continue; }
  emit(f, build(f, 'en'));
  emit(`ar/${f}`, build(f, 'ar'));
}
emit('sitemap.xml', sitemap(pages));
for (const p of pending) console.log(`PENDING site/${p}: no brand source yet (${ASSETS[p].join(' | ')}); the current file stays`);
if (check) { if (stale) process.exit(1); console.log(`PASS site is up to date (version ${VERSION})`); }
