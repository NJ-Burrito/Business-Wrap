/* 0.14.0 A2 · Waiting popup. Whenever an operation outlasts ~300 ms — busy(true) (export, new document, import, crawl …)
 * or a heavy server call (export, import, print job, update, library write, harvest …) — a small card says what is
 * happening, in the UI language, with a spinner; it leaves the moment the work is done. It never blocks the page (no
 * scrim) and never waits for ever: after 25 s it says the work is taking long and offers «إخفاء»; after 120 s it hides
 * itself with a warning toast (the work itself is not cancelled — the card only stops claiming it is running).
 * Calm / reduced motion: the spinner holds still (the words still change). */
const BUSY = (() => {
  const DELAY = 300;
  const lim = () => ({ slow: 25000, giveUp: 120000, ...(window.__bwBusyT || {}) }); // the test shortens the long waits
  const jobs = new Map(); // id → { what, t0 }
  let seq = 0, timer = 0, slowT = 0, giveT = 0, shownAt = 0;
  const KINDS = [
    [/\/api\/export/, 'busy.export'], [/\/api\/import/, 'busy.import'], [/\/api\/print\/job/, 'busy.print'], [/\/api\/update\/apply/, 'busy.update'],
    [/\/api\/library\/(html|blank|mirror)/, 'busy.library'], [/\/api\/harvest/, 'busy.harvest'], [/\/api\/share/, 'busy.share'], [/\/api\/webhook/, 'busy.webhook'],
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
  }
  function show() {
    if (!jobs.size) return;
    const c = card();
    if (!c) return;
    paint(false);
    c.hidden = false;
    shownAt = performance.now();
    slowT = setTimeout(() => { if (jobs.size) paint(true); }, lim().slow);
    giveT = setTimeout(() => { if (jobs.size) { hide(true); toast(t('busy.gaveUp'), 'warn'); } }, lim().giveUp);
  }
  function hide(force) {
    clearTimeout(timer); clearTimeout(slowT); clearTimeout(giveT);
    timer = slowT = giveT = 0;
    if (force) jobs.clear();
    const c = root.querySelector('.bw-busy');
    if (c) c.hidden = true;
  }
  /** Start a job; returns its end function. The card appears only if the job is still running after DELAY ms. */
  function begin(what = 'busy.work') {
    const id = ++seq;
    jobs.set(id, { what, t0: performance.now() });
    if (jobs.size === 1 && !timer && root.querySelector('.bw-busy')?.hidden !== false) timer = setTimeout(() => { timer = 0; show(); }, DELAY);
    else { const c = root.querySelector('.bw-busy'); if (c && !c.hidden) paint(c.classList.contains('slow')); }
    return () => { jobs.delete(id); if (!jobs.size) hide(false); else { const c = root.querySelector('.bw-busy'); if (c && !c.hidden) paint(false); } };
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
      const end = begin(kind[1]);
      return f0(input, init).finally(end);
    };
  }
  return { begin, hide, active: () => jobs.size, shown: () => { const c = root.querySelector('.bw-busy'); return !!c && !c.hidden; } };
})();
bwExt({ expose: { busy: BUSY } });
