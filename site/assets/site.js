/* Business-Wrap site: theme toggle (view transition), menu sheet, scroll reveals (which also play the icons),
   jump-nav spy with a sliding gold underline, copy buttons with a live region, video in view, cover tilt. */
(function () {
  var d = document.documentElement;
  var motion = d.classList.contains('motion');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ms = function (name) { var v = getComputedStyle(d).getPropertyValue(name).trim(); return /ms$/.test(v) ? parseFloat(v) : (parseFloat(v) * 1000 || 0); };

  // theme: a base cross-fade of the whole page; the sun and moon glyphs swap in CSS
  var tt = $('#theme-toggle');
  if (tt) tt.addEventListener('click', function () {
    var next = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    var apply = function () { d.setAttribute('data-theme', next); try { localStorage.setItem('bw-site-theme', next); } catch (e) {} };
    if (motion && document.startViewTransition) {
      d.classList.add('theme-vt');
      var done = function () { d.classList.remove('theme-vt'); };
      document.startViewTransition(apply).finished.then(done, done);
    } else apply();
  });

  // menu sheet (under 1024 px): page in, base out, focus kept inside while open
  var mb = $('#menu-toggle'), sheet = $('#menu'), scrim = $('#menu-scrim'), mc = $('#menu-close'), closeTimer;
  function openMenu() {
    clearTimeout(closeTimer);
    sheet.hidden = false; scrim.hidden = false;
    void sheet.offsetWidth;
    d.classList.add('menu-open'); mb.setAttribute('aria-expanded', 'true');
    var f = $('a', sheet); if (f) f.focus();
  }
  function closeMenu(back) {
    d.classList.remove('menu-open'); mb.setAttribute('aria-expanded', 'false');
    closeTimer = setTimeout(function () { sheet.hidden = true; scrim.hidden = true; }, ms('--bw-dur-base') + 20);
    if (back) mb.focus();
  }
  if (mb && sheet) {
    mb.addEventListener('click', function () { if (d.classList.contains('menu-open')) closeMenu(true); else openMenu(); });
    mc.addEventListener('click', function () { closeMenu(true); });
    scrim.addEventListener('click', function () { closeMenu(true); });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && d.classList.contains('menu-open')) closeMenu(true); });
    sheet.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = $$('a, button', sheet), a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
  }

  // reveals: once, when 15 % visible; icons play once as their card enters (icons.css keys on .is-inview)
  var hero = $('.hero'); if (hero) hero.classList.add('is-inview');
  var els = $$('[data-reveal],[data-reveal-stagger],.three,.story,.flow li,.safe li,.data tbody tr');
  if (!motion || !('IntersectionObserver' in window)) els.forEach(function (e) { e.classList.add('is-inview'); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var t = e.target; t.classList.add('is-inview'); io.unobserve(t);
        if (t.hasAttribute('data-reveal-stagger')) setTimeout(function () { t.classList.add('is-settled'); }, ms('--bw-dur-slow') + 6 * ms('--bw-stagger') + 50);
      });
    }, { threshold: 0.15 });
    els.forEach(function (e) { io.observe(e); });
  }

  // jump nav: the section in view gets aria-current, and the gold underline slides to its chip
  var jump = $('.jump');
  if (jump && 'IntersectionObserver' in window) {
    var ul = $('ul', jump), ind = $('.jump-ind', jump), box = $('.wrap', jump), links = $$('a', jump), cur = null;
    var place = function () {
      if (!cur || !ind) return;
      var w = box.getBoundingClientRect(), r = cur.getBoundingClientRect();
      ind.style.setProperty('--x', (r.left - w.left + 14) + 'px'); ind.style.width = Math.max(0, r.width - 28) + 'px'; ind.classList.add('on');
    };
    var set = function (id) {
      var a = links.filter(function (l) { return l.getAttribute('href') === '#' + id; })[0];
      if (!a || a === cur) return;
      if (cur) cur.removeAttribute('aria-current');
      cur = a; a.setAttribute('aria-current', 'true'); place();
      var ur = ul.getBoundingClientRect(), ar = a.getBoundingClientRect();
      if (ar.left < ur.left || ar.right > ur.right) ul.scrollBy({ left: ar.left - ur.left - 16, behavior: motion ? 'smooth' : 'auto' });
    };
    var spy = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) set(e.target.id); }); }, { rootMargin: '-35% 0px -60% 0px' });
    links.forEach(function (l) { var s = document.getElementById(l.getAttribute('href').slice(1)); if (s) spy.observe(s); });
    ul.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
  }

  // copy: icon swap copy to check, the live region says so in the page language, back after 1600 ms
  var status = $('#copy-status');
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.copy'); if (!b) return;
    var pre = b.parentNode.querySelector('pre'); if (!pre || !navigator.clipboard) return;
    navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
      b.classList.add('done');
      if (status) { status.textContent = ''; setTimeout(function () { status.textContent = status.getAttribute('data-done'); }, 30); }
      setTimeout(function () { b.classList.remove('done'); if (status) status.textContent = ''; }, 1600);
    }, function () {});
  });

  // the how-it-works video plays only in view and only when motion is allowed; otherwise the poster stays
  var v = $('.hero-video');
  // the poster loads only when the video comes near (it is below the fold); without IntersectionObserver at once
  if (v && v.getAttribute('data-poster')) {
    var poster = function () { if (!v.poster) v.poster = v.getAttribute('data-poster'); };
    if ('IntersectionObserver' in window) {
      var po = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { poster(); po.disconnect(); } }, { rootMargin: '600px 0px' });
      po.observe(v);
    } else poster();
  }
  if (v && motion && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { v.preload = 'auto'; var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
      });
    }, { threshold: 0.4 }).observe(v);
  }

  // cover object: a fine pointer tilts it toward the pointer, at most 4 degrees, no glare
  var cover = $('.hero .cover-stage');
  if (cover && motion && window.matchMedia && matchMedia('(pointer: fine)').matches) {
    var area = cover.parentNode;
    area.addEventListener('pointermove', function (e) {
      var r = cover.getBoundingClientRect();
      var x = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / r.width));
      var y = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / r.height));
      cover.style.setProperty('--ry', (x * 4).toFixed(2) + 'deg'); cover.style.setProperty('--rx', (-y * 4).toFixed(2) + 'deg');
    });
    area.addEventListener('pointerleave', function () { cover.style.setProperty('--ry', '0deg'); cover.style.setProperty('--rx', '0deg'); });
  }
})();
