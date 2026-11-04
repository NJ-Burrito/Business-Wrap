/* 0.14.0 A2 · Waiting popup. Whenever an operation outlasts ~300 ms — busy(true) (export, new document, import, crawl …)
 * or a heavy server call (export, import, print job, update, library write, harvest …) — a small card says what is
 * happening, in the UI language, with a spinner; it leaves the moment the work is done. It never blocks the page (no
 * scrim) and never waits for ever: after 25 s it says the work is taking long and offers «إخفاء»; after 120 s it hides
 * itself with a warning toast (the work itself is not cancelled — the card only stops claiming it is running).
 * 0.17.8 O5 · Loading screen: a phase still running after SCREEN ms (1.5 s) swaps the small card for a themed screen in the same
 * words (title, what is happening, an animated bar); it never traps the page either (the scrim lets clicks through), shows Hide
 * after 25 s and gives up after 120 s. Quiet jobs (library autosaves) never get the screen. Only the Calm button holds it still.
 * Calm / reduced motion: the spinner holds still (the words still change). */
const BUSY = (() => {
  const DELAY = 300;
  const lim = () => ({ slow: 25000, giveUp: 120000, ...(window.__bwBusyT || {}) }); // the test shortens the long waits
  const jobs = new Map(); // id → { what, t0 }
  let seq = 0, timer = 0, slowT = 0, giveT = 0, shownAt = 0, screenT = 0;
  const KINDS = [
    [/\/api\/export/, 'busy.export'], [/\/api\/import/, 'busy.import'], [/\/api\/print\/job/, 'busy.print'], [/\/api\/update\/apply/, 'busy.update'],
    [/\/api\/library\/(html|blank|mirror)/, 'busy.library', 'quiet'], [/\/api\/workspace\/html/, 'busy.export'], [/\/api\/file-icons\/(apply|restore)/, 'busy.icons'], [/\/api\/pages/, 'busy.print'], [/\/api\/harvest/, 'busy.harvest'], [/\/api\/share/, 'busy.share'], [/\/api\/webhook/, 'busy.webhook'],
  ];
  function card() {
    const shell = root.querySelector('.shell');
    if (!shell) return null;
    let c = shell.querySelector(':scope > .bw-busy');
    if (!c) {
      c = document.createElement('div');
      c.className = 'bw-busy';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      c.hidden = true;
      c.innerHTML = '<span class="bz-sp" aria-hidden="true"></span><span class="bz-m"></span><button type="button" class="bz-x" hidden></button>';
      c.querySelector('.bz-x').addEventListener('click', () => hide(true));
      shell.appendChild(c);
    }
    return c;
  }
  function screen() {
    const shell = root.querySelector('.shell');
    if (!shell) return null;
    let c = shell.querySelector(':scope > .bw-load');
    if (!c) {
      c = document.createElement('div');
      c.className = 'bw-load';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      c.hidden = true;
      c.innerHTML = '<div class="bl-box"><div class="bl-art" aria-hidden="true"><i></i><i></i><i></i></div><div class="bl-t"></div><div class="bl-d"></div><div class="bl-bar" aria-hidden="true"><b></b></div><button type="button" class="bl-x" hidden></button></div>';
      c.querySelector('.bl-x').addEventListener('click', () => hide(true));
      shell.appendChild(c);
    }
    return c;
  }
  const up = () => { const c = root.querySelector('.bw-busy'), l = root.querySelector('.bw-load'); return (c && !c.hidden) || (l && !l.hidden); };
  const label = () => { const last = [...jobs.values()].at(-1); return last ? t(last.what) : ''; };
  function paint(slow = false) {
    const c = card();
    if (!c) return;
    c.lang = S.ui;
    c.dir = root.querySelector('.shell')?.dataset.tdir || 'rtl';
    c.classList.toggle('slow', slow);
    c.querySelector('.bz-m').textContent = slow ? `${label()} — ${t('busy.slow')}` : label();
    const x = c.querySelector('.bz-x');
    x.hidden = !slow;
    x.textContent = t('busy.hide');
    const s = root.querySelector('.bw-load');
    if (s) {
      s.lang = S.ui; s.dir = c.dir; s.classList.toggle('slow', slow);
      s.querySelector('.bl-t').textContent = label();
      s.querySelector('.bl-d').textContent = slow ? t('busy.slow') : t('busy.keep');
      const b = s.querySelector('.bl-x'); b.hidden = !slow; b.textContent = t('busy.hide');
    }
  }
  /** The phase outlasted the card: the themed screen takes over (not for quiet jobs). */
  function upgrade() {
    screenT = 0;
    if (!jobs.size || [...jobs.values()].every((j) => j.quiet)) return;
    const s = screen(), c = root.querySelector('.bw-busy');
    if (!s) return;
    paint(!!c?.classList.contains('slow'));
    s.hidden = false;
    if (c) c.hidden = true;
  }
  function show() {
    if (!jobs.size) return;
    const c = card();
    if (!c) return;
    paint(false);
    c.hidden = false;
    shownAt = performance.now();
    clearTimeout(screenT); screenT = setTimeout(upgrade, lim().screen ?? 1500);
    slowT = setTimeout(() => { if (jobs.size) paint(true); }, lim().slow);
    giveT = setTimeout(() => { if (jobs.size) { hide(true); toast(t('busy.gaveUp'), 'warn'); } }, lim().giveUp);
  }
  function hide(force) {
    clearTimeout(timer); clearTimeout(slowT); clearTimeout(giveT); clearTimeout(screenT);
    timer = slowT = giveT = screenT = 0;
    if (force) jobs.clear();
    const c = root.querySelector('.bw-busy');
    if (c) c.hidden = true;
    const s = root.querySelector('.bw-load');
    if (s) s.hidden = true;
  }
  /** Start a job; returns its end function. The card appears only if the job is still running after DELAY ms. */
  function begin(what = 'busy.work', quiet = false) {
    const id = ++seq;
    jobs.set(id, { what, quiet, t0: performance.now() });
    if (jobs.size === 1 && !timer && root.querySelector('.bw-busy')?.hidden !== false) timer = setTimeout(() => { timer = 0; show(); }, DELAY);
    else if (up()) paint(root.querySelector('.bw-busy')?.classList.contains('slow'));
    return () => { jobs.delete(id); if (!jobs.size) hide(false); else if (up()) paint(false); };
  }
  // busy(on): the editor's own calls (export, new document, crawl, print …) keep their .progress bar and gain the card
  const base = busy;
  let ends = [];
  busy = function (on, what) { base(on); if (on) ends.push(begin(what || 'busy.work')); else ends.pop()?.(); };
  // server calls that are slow by nature
  const f0 = window.fetch?.bind(window);
  if (f0) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const kind = KINDS.find(([re]) => re.test(url));
      if (!kind || (init?.method || 'GET').toUpperCase() === 'GET') return f0(input, init);
      const end = begin(kind[1], kind[2] === 'quiet');
      return f0(input, init).finally(end);
    };
  }
  return { begin, hide, active: () => jobs.size, shown: () => { const c = root.querySelector('.bw-busy'); return !!c && !c.hidden; }, screenShown: () => { const c = root.querySelector('.bw-load'); return !!c && !c.hidden; } };
})();
bwExt({ expose: { busy: BUSY } });
