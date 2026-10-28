/* Business-Wrap site, runs before paint: old ?lang=ar links, theme, motion. No network, no cookies; localStorage
   keeps one preference (the theme). The language comes from the path: / is English, /ar/ is Arabic. */
(function () {
  var d = document.documentElement, theme;
  try {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'ar' && d.getAttribute('data-lang') !== 'ar') {
      var file = location.pathname.split('/').pop();
      location.replace('ar/' + (file === 'index.html' ? '' : file) + location.hash);
      return;
    }
  } catch (e) {}
  try { theme = localStorage.getItem('bw-site-theme'); } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  d.setAttribute('data-theme', theme);
  try { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('motion'); } catch (e) {}
})();
