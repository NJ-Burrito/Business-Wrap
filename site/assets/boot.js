/* Business-Wrap site, runs before paint: language, theme, motion. No network, no cookies; localStorage only for two preferences. */
(function () {
  var d = document.documentElement, lang = 'en', theme;
  try {
    var q = new URLSearchParams(location.search).get('lang');
    var s = localStorage.getItem('bw-site-lang');
    if (q === 'ar' || q === 'en') lang = q;
    else if (s === 'ar' || s === 'en') lang = s;
    else if ((navigator.language || '').toLowerCase().indexOf('ar') === 0) lang = 'ar';
    theme = localStorage.getItem('bw-site-theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  d.setAttribute('data-lang', lang); d.lang = lang; d.dir = lang === 'ar' ? 'rtl' : 'ltr';
  d.setAttribute('data-theme', theme);
  try { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('motion'); } catch (e) {}
})();
