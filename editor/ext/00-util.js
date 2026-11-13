/* Shared helpers for the extensions (one copy of what 10-library, 12-session, 13-projects, 14-power, 31-provenance and 48-folder-picker each kept).
 * Loaded first (the files run in name order inside the editor's scope), so every later extension may use BWU. Loose editor/*.js files run BEFORE the
 * extensions and do not reach for it. */
const BWU = (() => {
  const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
  /** SHA-256 of a string as bytes. */
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  /** SHA-256 of a string as lower-case hex. */
  const sha256 = async (s) => hex(await digest(s));
  /** A JSON deep copy (drops undefined and functions, as the copies it replaces did). */
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Opens (version 1) an IndexedDB with one object store; `keyPath` makes in-line keys, `blocked` rejects an upgrade another tab holds back. Rejects when IndexedDB is unavailable. */
  const idbOpen = (name, store, { keyPath, blocked } = {}) => new Promise((ok, no) => {
    try {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(store, keyPath ? { keyPath } : undefined);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
      if (blocked) r.onblocked = () => no(new Error('idb blocked'));
    } catch (e) { no(e); }
  });
  return { hex, digest, sha256, clone, sleep, idbOpen };
})();
