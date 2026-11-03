// Settings › File icons (0.15.1): GET /api/file-icons/status, POST /api/file-icons/apply | restore. Windows only (any other
// system answers {supported:false}); per-user registry keys only (engine/file-icons.mjs). `makeRoute(deps)` takes the
// injected registry layer (tests); the default export is the real one. `?scope=tree` widens it to every file type of the tree (assets/icons).
import { createFileIcons, realRefresh, scopeOf } from '../file-icons.mjs';

const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export function makeRoute(deps = {}) {
  // ?scope=tree (0.17.0, N16): every file type of the save and download tree; no scope: the three the editor makes (pdf, docx, html)
  const fis = {};
  const feature = (scope) => fis[scope] || (fis[scope] = createFileIcons({ refresh: realRefresh, ...scopeOf(scope), ...deps }));
  return async (req, url, send) => {
    const m = /^\/api\/file-icons\/(status|apply|restore)$/.exec(url.pathname);
    if (!m) return false;
    const act = m[1];
    if (act === 'status' ? req.method !== 'GET' : req.method !== 'POST') { send(405, { error: act === 'status' ? 'GET' : 'POST' }); return true; }
    // the server already refuses a foreign page for every non-GET; repeated here so the route is safe on its own
    if (req.method === 'POST' && req.headers.origin && !LOCAL_ORIGIN.test(req.headers.origin)) { send(403, { error: 'origin' }); return true; }
    try {
      const r = await feature(url.searchParams.get('scope') === 'tree' ? 'tree' : 'core')[act]();
      send(r.supported === false ? 501 : 200, r.supported === false ? { ...r, error: 'unsupported' } : r);
    } catch (e) {
      send(500, { error: String(e?.message || e).slice(0, 300) });
    }
    return true;
  };
}

export default makeRoute();
