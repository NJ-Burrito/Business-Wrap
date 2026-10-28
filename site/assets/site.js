/* Business-Wrap site: language and theme toggles, scroll reveals (which also play the icons), copy buttons. */
(function () {
  var d = document.documentElement;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var lt = document.getElementById('lang-toggle');
  if (lt) lt.addEventListener('click', function () {
    var next = d.getAttribute('data-lang') === 'ar' ? 'en' : 'ar';
    d.setAttribute('data-lang', next); d.lang = next; d.dir = next === 'ar' ? 'rtl' : 'ltr';
    store('bw-site-lang', next);
    try { var u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null, '', u); } catch (e) {}
    document.title = d.getAttribute('data-title-' + next) || document.title;
  });
  var t0 = d.getAttribute('data-title-' + d.getAttribute('data-lang')); if (t0) document.title = t0;

  var tt = document.getElementById('theme-toggle');
  if (tt) tt.addEventListener('click', function () {
    var next = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    d.setAttribute('data-theme', next); store('bw-site-theme', next);
  });

  var els = document.querySelectorAll('[data-reveal],[data-reveal-stagger],.sweep,.card,.rows li,.flow li,.three');
  if (!d.classList.contains('motion') || !('IntersectionObserver' in window)) {
    for (var i = 0; i < els.length; i++) els[i].classList.add('is-inview');
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-inview'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.copy'); if (!b) return;
    var pre = b.parentNode.querySelector('pre'); if (!pre || !navigator.clipboard) return;
    navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
      b.classList.add('done'); setTimeout(function () { b.classList.remove('done'); }, 1600);
    }, function () {});
  });
})();
