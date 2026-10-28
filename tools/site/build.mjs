// Builds site/*.html from tools/site/pages/*.html. No dependencies.
//   node tools/site/build.mjs           write site/*.html
//   node tools/site/build.mjs --check   exit 1 when site/*.html is stale
// Placeholders: {{head path="" en="" ar="" desc=""}}, {{header page=""}}, {{family}}, {{footer}},
// {{icon:NAME}} (brand v2 icon, inlined so its micro-animation runs), {{ui:NAME}} (small Lucide-style UI glyph), {{copy}}.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'site');
const BASE = 'https://nj-burrito.github.io/Business-Wrap/';

const UI = {
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
};
const ui = (n, cls = '') => `<svg class="ui ${cls || 'i-' + n}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${UI[n]}</svg>`;

function icon(name) {
  const f = path.join(HERE, 'icons', `${name}.svg`);
  let s = fs.readFileSync(f, 'utf8').trim();
  s = s.replace(/<title>[\s\S]*?<\/title>/, '').replace(/\s*role="img"/, '').replace(/\s*aria-label="[^"]*"/, '');
  return s.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
}

const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; media-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";

function head(a, ld) {
  const url = BASE + (a.path === 'index.html' ? '' : a.path);
  return `<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.en)}</title>
<meta name="description" content="${esc(a.desc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en" href="${url}?lang=en">
<link rel="alternate" hreflang="ar" href="${url}?lang=ar">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta name="theme-color" content="#0B6B50">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Business-Wrap">
<meta property="og:title" content="${esc(a.en)}">
<meta property="og:description" content="${esc(a.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Business-Wrap: evidence in, one document in two languages">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(a.en)}">
<meta name="twitter:description" content="${esc(a.desc)}">
<meta name="twitter:image" content="${BASE}assets/og.png">
<meta name="twitter:image:alt" content="Business-Wrap: evidence in, one document in two languages">
${ld ? `<script type="application/ld+json">${ld}</script>\n` : ''}<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<script src="assets/boot.js"></script>
<link rel="stylesheet" href="assets/thmanyah.css">
<link rel="stylesheet" href="assets/tokens.css">
<link rel="stylesheet" href="assets/icons.css">
<link rel="stylesheet" href="assets/site.css">
<script src="assets/site.js" defer></script>`;
}

function header(page) {
  const cur = (p) => (p === page ? ' aria-current="page"' : '');
  return `<a class="skip" href="#main"><span data-l="en">Skip to content</span><span data-l="ar">انتقل إلى المحتوى</span></a>
<header class="masthead">
  <div class="wrap">
    <a class="brand" href="./" aria-label="Business-Wrap home">
      <span data-l="en"><img class="logo-light" src="assets/logo/lockup-en.svg" alt="Business-Wrap" width="180" height="30"><img class="logo-dark" src="assets/logo/lockup-en-dark.svg" alt="Business-Wrap" width="180" height="30"></span>
      <span data-l="ar"><img class="logo-light" src="assets/logo/lockup-ar.svg" alt="بزنس راب" width="150" height="30"><img class="logo-dark" src="assets/logo/lockup-ar-dark.svg" alt="بزنس راب" width="150" height="30"></span>
    </a>
    <nav class="topnav" aria-label="Site">
      <a href="./#install"${cur('install')}><span data-l="en">Install</span><span data-l="ar">التثبيت</span></a>
      <a href="support.html"${cur('support')}><span data-l="en">Support</span><span data-l="ar">الدعم</span></a>
      <a href="privacy.html"${cur('privacy')}><span data-l="en">Privacy</span><span data-l="ar">الخصوصية</span></a>
      <a href="terms.html"${cur('terms')}><span data-l="en">Terms</span><span data-l="ar">الشروط</span></a>
    </nav>
    <a class="tbtn" href="https://github.com/NJ-Burrito/Business-Wrap" aria-label="GitHub">${ui('github')}</a>
    <button type="button" id="theme-toggle" class="tbtn" aria-label="Light or dark · فاتح أو داكن">${ui('moon')}${ui('sun')}</button>
    <button type="button" id="lang-toggle" class="tbtn">${ui('languages')}<span data-l="en" lang="ar">العربية</span><span data-l="ar" lang="en">English</span></button>
  </div>
</header>`;
}

const FAMILY = [
  ['https://nj-burrito.github.io/', 'Portfolio', 'work, posts and contact', 'الموقع الشخصي', 'الأعمال والمنشورات والتواصل'],
  ['https://nj-burrito.github.io/NJ-Kit/', 'NJ-Kit', 'a free working method for Claude Code', 'NJ-Kit', 'منهج عمل مجاني لـ Claude Code'],
  ['https://nj-burrito.github.io/QA-Wrap/', 'QA-Wrap', 'test the page, get the bug report', 'QA-Wrap', 'اختبر الصفحة، وخذ تقرير الخلل جاهزا'],
  ['https://nj-burrito.github.io/Profile-Wrap/', 'Profile-Wrap', 'your LinkedIn on autopilot, you stay the boss', 'Profile-Wrap', 'لينكدإن على الطيار الآلي، وأنت صاحب القرار'],
  ['https://nj-burrito.github.io/story-wrap/', 'Story-Wrap', 'the series «مكتب المفقودات»', 'Story-Wrap', 'سلسلة «مكتب المفقودات»'],
];

function family() {
  const en = FAMILY.map(([u, n, l]) => `<a href="${u}"><b>${n}</b><span>${l}</span></a>`).join('\n      ');
  const ar = FAMILY.map(([u, , , n, l]) => `<a href="${u === 'https://nj-burrito.github.io/story-wrap/' ? u + 'ar/' : u}"><b>${n}</b><span>${l}</span></a>`).join('\n      ');
  return `<section class="section" id="more" aria-labelledby="more-h">
  <div class="wrap">
    <div data-l="en" lang="en" dir="ltr"><div class="section-head"><span class="kicker">The family</span><h2 id="more-h">More from NJ</h2><p>Free tools with the same rules: local first, Arabic and English, no account.</p></div>
    <div class="family" data-reveal-stagger>
      ${en}
    </div></div>
    <div data-l="ar" lang="ar" dir="rtl"><div class="section-head"><span class="kicker">العائلة</span><h2>المزيد من NJ</h2><p>أدوات مجانية بالقواعد نفسها: على جهازك أولا، بالعربية والإنجليزية، بلا حساب.</p></div>
    <div class="family" data-reveal-stagger>
      ${ar}
    </div></div>
  </div>
</section>`;
}

function footer() {
  return `<footer class="site-foot">
  <div class="wrap">
    <div class="row" data-l="en" lang="en" dir="ltr"><strong>Business-Wrap</strong><a href="https://nj-burrito.github.io/">Portfolio</a><a href="https://nj-burrito.github.io/NJ-Kit/">NJ-Kit</a><a href="https://nj-burrito.github.io/QA-Wrap/">QA-Wrap</a><a href="https://nj-burrito.github.io/Profile-Wrap/">Profile-Wrap</a><a href="https://nj-burrito.github.io/story-wrap/">Story-Wrap</a></div>
    <div class="row" data-l="ar" lang="ar" dir="rtl"><strong>بزنس راب</strong><a href="https://nj-burrito.github.io/">الموقع الشخصي</a><a href="https://nj-burrito.github.io/NJ-Kit/">NJ-Kit</a><a href="https://nj-burrito.github.io/QA-Wrap/">QA-Wrap</a><a href="https://nj-burrito.github.io/Profile-Wrap/">Profile-Wrap</a><a href="https://nj-burrito.github.io/story-wrap/ar/">Story-Wrap</a></div>
    <div class="row"><a href="https://github.com/NJ-Burrito">GitHub</a><a href="https://www.linkedin.com/in/nader-alzghoul">LinkedIn</a><a href="https://github.com/NJ-Burrito/Business-Wrap">Source</a><a href="https://nj-burrito.github.io/#contact"><span data-l="en">Contact</span><span data-l="ar">تواصل</span></a></div><!-- bw-allow:bw-denylist (Lead approved 2026-10-28: Nader's own profile link on his own tool site) -->
    <p class="fine"><span data-l="en">MIT licence. Not affiliated with any government service or with Anthropic.</span><span data-l="ar">رخصة MIT. لا صلة له بأي جهة حكومية ولا بشركة Anthropic.</span></p>
  </div>
</footer>`;
}

function build(file) {
  let s = fs.readFileSync(path.join(HERE, 'pages', file), 'utf8');
  const ldFile = path.join(HERE, 'pages', file.replace(/\.html$/, '.ld.json'));
  const ld = fs.existsSync(ldFile) ? JSON.stringify(JSON.parse(fs.readFileSync(ldFile, 'utf8'))) : '';
  s = s.replace(/\{\{head ([^}]*)\}\}/, (_, a) => head(attrs(a), ld));
  s = s.replace(/\{\{header ([^}]*)\}\}/, (_, a) => header(attrs(a).page));
  s = s.replace(/\{\{family\}\}/g, family).replace(/\{\{footer\}\}/g, footer);
  s = s.replace(/\{\{icon:([a-z-]+)\}\}/g, (_, n) => icon(n));
  s = s.replace(/\{\{ui:([a-z]+)\}\}/g, (_, n) => ui(n));
  s = s.replace(/\{\{copy\}\}/g, `<button type="button" class="copy" aria-label="Copy · نسخ">${ui('copy')}${ui('check')}</button>`);
  if (/\{\{/.test(s)) throw new Error(`${file}: unresolved placeholder ${s.match(/\{\{[^}]*\}\}/)[0]}`);
  return s;
}

const check = process.argv.includes('--check');
let stale = 0;
for (const f of fs.readdirSync(path.join(HERE, 'pages')).filter((f) => f.endsWith('.html'))) {
  const html = build(f);
  const dest = path.join(OUT, f);
  if (check) { if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== html) { console.error(`STALE site/${f}`); stale++; } }
  else { fs.writeFileSync(dest, html); console.log(`wrote site/${f}`); }
}
if (check) { if (stale) process.exit(1); console.log('PASS site is up to date'); }
