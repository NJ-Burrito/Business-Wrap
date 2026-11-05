/* Missing dependencies (0.17.13). A copy of Business-Wrap that arrived without node_modules (a zip, a plugin folder) cannot make PDF or DOCX files:
 * the host's export died with «Cannot find package 'playwright-core' imported from C:\...». Now:
 *   - when the host answers and /api/health says deps.ok is false, ONE persistent notice explains the one-time install, with «Install now» (POST /api/deps/install,
 *     engine/routes/deps.mjs: npm ci --omit=dev) and the manual command as the fallback;
 *   - an export error that is that same missing package (ERR_MODULE_NOT_FOUND / «Cannot find package») opens the same notice instead of the raw path toast (flash() asks EXT.deps.map).
 * Nothing installs without the click. A file:// page has no host, so it never asks. */
const DEPS = (() => {
  const served = () => /^https?:$/.test(location.protocol);
  const MISSING = /ERR_MODULE_NOT_FOUND|Cannot find (package|module) ['"`]?playwright-core/i;
  let shown = null, installing = false;
  const notice = () => {
    if (installing || (shown && shown.isConnected)) return shown;
    shown = toast(t('deps.notice'), 'warn', { persist: true, actions: [[t('deps.install'), install]] });
    return shown;
  };
  async function install() {
    if (installing) return;
    installing = true;
    busy(true);
    const wait = toast(t('deps.installing'), 'info', { persist: true, cls: 'banner' });
    try {
      const r = await fetch('/api/deps/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      wait?.remove();
      if (r.ok && j.ok) { toast(t('deps.done'), 'ok'); document.documentElement.dataset.bwDeps = 'ok'; return; }
      const why = String(j.tail || j.error || r.status).split('\n').slice(-2).join(' ').slice(0, 220);
      installing = false;
      toast(t('deps.failed', { r: why }), 'err', { persist: true, cls: 'banner', actions: [[t('deps.retry'), install]] });
    } catch (e) {
      wait?.remove();
      installing = false;
      toast(t('deps.failed', { r: String(e?.message || e).slice(0, 160) }), 'err', { persist: true, cls: 'banner', actions: [[t('deps.retry'), install]] });
    } finally { installing = false; busy(false); }
  }
  /** The host answered: ask whether its install is complete. */
  async function check() {
    if (!served()) return null;
    try {
      const j = await (await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(4000) })).json();
      if (j?.deps && j.deps.ok === false) { document.documentElement.dataset.bwDeps = 'missing'; notice(); return j.deps; }
      if (j?.deps) document.documentElement.dataset.bwDeps = 'ok';
      return j?.deps || null;
    } catch { return null; }
  }
  /** An error message from an export: true when it was the missing package (the friendly notice replaced the raw toast). */
  function map(msg) {
    if (!MISSING.test(String(msg || ''))) return false;
    notice();
    return true;
  }
  window.addEventListener('bw:server', (e) => { if (e.detail?.online) check(); });
  return { check, install, notice, map };
})();

bwExt({
  on: { boot: () => { if (/^https?:$/.test(location.protocol)) DEPS.check(); } },
  expose: { deps: DEPS },
});
