// bwlog v1 — the tamper-evident history format of Business-Wrap (design.md §3 A17). FROZEN since 0.13.0.
//
// One file, two hosts: Node imports it (`import { BWLOG1 } from './ledger-v1.mjs'`), and engine/build-editor.mjs
// concatenates it into the editor's script with the `export` stripped (like edits.mjs). So: no imports, no Node-only
// API; crypto is WebCrypto (`globalThis.crypto.subtle`, present in Node ≥ 20 and every browser), injectable by `use()`.
//
// FROZEN (never change, only append): APP_KEY_V1, KDF_INFO, the envelope fields, the entry fields, canonical() (RFC 8785
// JCS), entryHash(), the signature input. A v2 is a new module and a new `v`; a v1 log is never rewritten.
// Golden vectors: tests/fixtures/bwlog-v1/ (checked by tests/ledger.test.mjs in every later version).
//
// Honest limit: Business-Wrap is MIT, so APP_KEY_V1 is public. The encryption only keeps the log unreadable to a person
// who opens the file by hand. Tamper-evidence comes from the hash chain, the signatures and the mirror (bible/11).
export const BWLOG1 = (() => {
  const APP_KEY_V1 = 'ace2275efb605532c67c8accc166b936cd77f3bb5b6a2bd183134fae43cd4ea4';
  const KDF_INFO = 'business-wrap/bwlog/v1';
  const KINDS = ['open', 'op', 'save', 'saveHtml', 'export', 'checkpoint', 'share', 'lock', 'unlock', 'sign', 'import', 'merge', 'actor-key'];
  let subtle = globalThis.crypto?.subtle;
  const use = (s) => { subtle = s; };
  const rnd = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

  const utf8 = (s) => new TextEncoder().encode(s);
  const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

  /** RFC 8785 JSON Canonicalization: keys sorted by UTF-16 code units, ES number form, no whitespace, undefined dropped. */
  function canonical(v) {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('bwlog: non-finite number');
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  const sha256 = async (u8) => new Uint8Array(await subtle.digest('SHA-256', u8));
  /** hash = SHA-256(canonical(entry without hash and sig)), hex. */
  async function entryHash(e) { const { hash, sig, ...rest } = e; return hex(await sha256(utf8(canonical(rest)))); }
  /** The document state a log vouches for: per edition the base hash and the op list. */
  const stateOf = (editions) => ({ eds: Object.fromEntries(Object.entries(editions).sort().map(([ed, e]) => [ed, { base: e.hash, ops: e.ops || [] }])) });
  const docHash = async (editions) => `sha256:${hex(await sha256(utf8(canonical(stateOf(editions)))))}`;
  /** kid = first 8 bytes of SHA-256(raw P-256 public key 0x04‖x‖y), hex16. */
  async function kidOf(jwk) {
    const raw = new Uint8Array(65); raw[0] = 4; raw.set(unb64url(jwk.x), 1); raw.set(unb64url(jwk.y), 33);
    return hex((await sha256(raw)).subarray(0, 8));
  }
  const pub = (jwk) => ({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
  async function newKeys(extractable = false) {
    const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, extractable, ['sign', 'verify']);
    const jwk = pub(await subtle.exportKey('jwk', k.publicKey));
    return { privateKey: k.privateKey, jwk, kid: await kidOf(jwk) };
  }
  const importPub = (jwk) => subtle.importKey('jwk', { ...pub(jwk), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const ALG = { name: 'ECDSA', hash: 'SHA-256' };

  /* ── envelope: AES-256-GCM under HKDF-SHA256(APP_KEY_V1, salt, KDF_INFO); AAD = "bwlog/v1/" + doc ── */
  async function aesKey(salt) {
    const ikm = await subtle.importKey('raw', unhex(APP_KEY_V1), 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(KDF_INFO) }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(log) {
    const salt = rnd(16), iv = rnd(12);
    const plain = { fmt: 'bwlog-plain', v: 1, doc: log.doc, entries: log.entries };
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(`bwlog/v1/${log.doc}`), tagLength: 128 }, await aesKey(salt), utf8(JSON.stringify(plain))));
    return JSON.stringify({ fmt: 'bwlog', v: 1, alg: 'A256GCM', kdf: 'HKDF-SHA256', salt: b64(salt), iv: b64(iv), ct: b64(ct) });
  }
  async function unseal(envelope, doc) {
    const env = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
    if (env.fmt !== 'bwlog' || env.v !== 1 || env.alg !== 'A256GCM' || env.kdf !== 'HKDF-SHA256') throw new Error(`bwlog: not a v1 envelope (${env.fmt}/${env.v})`);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: utf8(`bwlog/v1/${doc}`), tagLength: 128 }, await aesKey(unb64(env.salt)), unb64(env.ct));
    const plain = JSON.parse(new TextDecoder().decode(pt));
    if (plain.fmt !== 'bwlog-plain' || plain.v !== 1 || plain.doc !== doc) throw new Error('bwlog: plaintext header mismatch');
    return { doc: plain.doc, entries: plain.entries };
  }

  /* ── writing ── */
  /** Appends one signed entry (and, the first time this key signs in this log, its actor-key entry). Mutates log.entries. */
  async function append(log, { kind, data = {}, actor, keys, docHash: dh = '', at = new Date().toISOString() }) {
    const who = { id: actor.id, name: String(actor.name || '').slice(0, 80), kid: keys.kid };
    const one = async (k, d) => {
      const last = log.entries.at(-1);
      const e = { seq: log.entries.length, prev: last ? last.hash : '', at, actor: who, kind: k, data: d, docHash: dh };
      e.hash = await entryHash(e);
      e.sig = b64(new Uint8Array(await subtle.sign(ALG, keys.privateKey, unhex(e.hash))));
      log.entries.push(e);
      return e;
    };
    if (!log.entries.some((e) => e.kind === 'actor-key' && e.actor.kid === keys.kid)) await one('actor-key', { jwk: pub(keys.jwk) });
    return one(kind, data);
  }

  /* ── reading ── */
  /**
   * Checks a log. opts.mirror = { head: {seq, hash}, hashes: [hash by seq], pins: {actorId: kid} } from this machine;
   * opts.editions = the document state the file carries (per edition {hash, ops}).
   * opts.saved = the log came out of a Save-HTML file: its last entry must be that «saveHtml» (else the tail was cut).
   * Returns { ok, issues: [{seq, reason}], pins, keys } — reasons: seq, link, hash, sig, nokey, tofu, truncated, fork, unlogged, stripped.
   */
  async function verify(log, opts = {}) {
    const issues = [];
    const keys = {}; // kid → CryptoKey
    const pins = { ...(opts.mirror?.pins || {}) };
    const E = log?.entries || [];
    for (let i = 0; i < E.length; i += 1) {
      const e = E[i];
      if (e.seq !== i) issues.push({ seq: i, reason: 'seq' });
      if (e.prev !== (i ? E[i - 1].hash : '')) issues.push({ seq: i, reason: 'link' });
      if ((await entryHash(e)) !== e.hash) issues.push({ seq: i, reason: 'hash' });
      const kid = e.actor?.kid;
      if (e.kind === 'actor-key' && e.data?.jwk && (await kidOf(e.data.jwk)) === kid && !keys[kid]) keys[kid] = await importPub(e.data.jwk);
      if (!keys[kid]) issues.push({ seq: i, reason: 'nokey' });
      else {
        let good = false;
        try { good = await subtle.verify(ALG, keys[kid], unb64(e.sig || ''), unhex(e.hash)); } catch { good = false; }
        if (!good) issues.push({ seq: i, reason: 'sig' });
      }
      const id = e.actor?.id;
      if (id) { if (pins[id] && pins[id] !== kid) issues.push({ seq: i, reason: 'tofu' }); else pins[id] = pins[id] || kid; }
    }
    const head = opts.mirror?.head;
    if (head && head.seq >= 0) {
      const lastSeq = E.length - 1;
      if (lastSeq < head.seq) {
        const same = lastSeq < 0 || opts.mirror.hashes?.[lastSeq] === E[lastSeq].hash;
        issues.push({ seq: Math.max(0, lastSeq), reason: same ? 'truncated' : 'fork' });
      } else if (E[head.seq].hash !== head.hash) issues.push({ seq: head.seq, reason: 'fork' });
    }
    if (opts.editions) {
      const withOps = Object.values(opts.editions).some((e) => (e.ops || []).length);
      const lastDh = [...E].reverse().find((e) => e.docHash)?.docHash;
      if (!E.length) { if (withOps || head) issues.push({ seq: 0, reason: 'stripped' }); }
      else if (lastDh !== (await docHash(opts.editions))) issues.push({ seq: E.length - 1, reason: 'unlogged' });
    }
    // a Save-HTML seals the log right after its own «saveHtml» entry: any other last entry means the tail was cut
    if (opts.saved && E.length && E.at(-1).kind !== 'saveHtml' && !issues.some((i) => i.reason === 'truncated')) issues.push({ seq: E.length - 1, reason: 'truncated' });
    return { ok: !issues.length, issues, pins, kids: Object.keys(keys) };
  }

  /** Mirror record of a log: head, every hash by seq, merged pins. `prev` (the old record) never moves the head back. */
  function mirrorOf(log, prev, pins = {}) {
    const last = log.entries.at(-1);
    const mine = { head: last ? { seq: last.seq, hash: last.hash } : null, hashes: log.entries.map((e) => e.hash) };
    const keep = prev?.head && (!mine.head || prev.head.seq > mine.head.seq) ? prev : mine;
    return { doc: log.doc, head: keep.head, hashes: keep.hashes, pins: { ...pins, ...(prev?.pins || {}) } };
  }

  /* ── metrics (A12): derived from the log only ── */
  const words = (s) => (typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean).length : 0);
  /**
   * Per actor: edits (by op kind), words added/removed, sessions (open), saves, exports, signs, active ms
   * (sum of gaps ≤ idleMs between that actor's consecutive timestamps: entries and x-active pings), first/last.
   */
  function metrics(entries, { from = '', to = '￿', idleMs = 5 * 60e3 } = {}) {
    const by = {};
    const lastVal = {}; // op id → the words it held at its previous entry (typing re-logs the same op)
    for (const e of entries) {
      if (e.at < from || e.at > to || e.kind === 'actor-key') continue;
      const p = (by[e.actor.id] ||= { id: e.actor.id, name: e.actor.name, names: [], kid: e.actor.kid, edits: 0, kinds: {}, added: 0, removed: 0, sessions: 0, saves: 0, exports: 0, signs: 0, locks: 0, activeMs: 0, first: e.at, last: e.at, ts: [] });
      if (e.actor.name) { p.name = e.actor.name; if (!p.names.includes(e.actor.name)) p.names.push(e.actor.name); } // one profile key, every name it used
      p.last = e.at;
      if (e.kind === 'op' && e.data?.op) {
        // a typed op is re-logged after each pause under the same id: it counts once
        if (!e.data.typed || !(e.data.op.id in lastVal)) { p.edits += 1; p.kinds[e.data.op.op] = (p.kinds[e.data.op.op] || 0) + 1; }
        if (e.data.op.op === 'setText') {
          const id = e.data.op.id;
          const d = words(e.data.op.value) - (id in lastVal ? lastVal[id] : words(e.data.op.old));
          lastVal[id] = words(e.data.op.value);
          if (d > 0) p.added += d; else p.removed -= d;
        }
      }
      if (e.kind === 'open') p.sessions += 1;
      if (e.kind === 'save' || e.kind === 'saveHtml') p.saves += 1;
      if (e.kind === 'export' || e.kind === 'saveHtml') p.exports += 1; // a file written: PDF, DOCX, print HTML, report; an HTML save or share
      if (e.kind === 'sign') p.signs += 1;
      if (e.kind === 'lock' || e.kind === 'unlock') p.locks += 1;
      p.ts.push(Date.parse(e.at));
      if (e.kind === 'x-active') for (const t of e.data?.pings || []) p.ts.push(Date.parse(t));
    }
    for (const p of Object.values(by)) {
      p.ts.sort((a, b) => a - b);
      for (let i = 1; i < p.ts.length; i += 1) { const g = p.ts[i] - p.ts[i - 1]; if (g <= idleMs) p.activeMs += g; }
      delete p.ts;
    }
    return by;
  }

  /* ── 0.13 traces (review2 #17): logic only, no format change. Besides its log and `bwlog` mark, a 0.13+ Save-HTML carries
   * independent traces: the timeline's marks/epochIds in every edition, a <meta name="bw-ledger"> (document id + state
   * hash), a `data-bw-ledger` attribute on <html>, and a second hash source in the CSP script-src. Any one of them with no
   * valid log means «stripped», never «made before 0.13». `html` = the file text (or the page's outerHTML) up to </head>. */
  const TRACE_META = 'bw-ledger';
  function traces(data, svcId, html = '', { version = false } = {}) {
    const t = [];
    if (data?.bwlog) t.push('mark');
    const s = (data?.services || []).find((x) => x.id === svcId) || (svcId == null ? data?.services?.[0] : null);
    if (Object.values(s?.editions || {}).some((e) => (e.marks || []).length || (e.epochIds || []).length)) t.push('timeline');
    const head = String(html).split(/<\/head>/i)[0];
    if (new RegExp(`<meta[^>]*name=["']${TRACE_META}["']`, 'i').test(head)) t.push('meta');
    if (/<html[^>]*\sdata-bw-ledger=/i.test(head)) t.push('root');
    const csp = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/i.exec(head)?.[1] || '';
    if (((/script-src([^;]*)/.exec(csp)?.[1] || '').match(/'sha256-/g) || []).length > 1) t.push('csp');
    // the file's own version: only where the file is read as written (a served editor is re-wrapped with the installed one)
    const v = /^(\d+)\.(\d+)/.exec(String(data?.version || ''));
    if (version && v && (+v[1] > 0 || +v[2] >= 13)) t.push('version');
    return t;
  }
  /** The document id a <meta name="bw-ledger"> names (to ask HISTORY about it when the log is gone). */
  const traceDoc = (html = '') => /<meta[^>]*name=["']bw-ledger["'][^>]*content=["'][^"']*doc=([\w.:-]+)/i.exec(String(html).split(/<\/head>/i)[0])?.[1] || '';

  return { TRACE_META, traces, traceDoc, APP_KEY_V1, KDF_INFO, KINDS, use, canonical, entryHash, stateOf, docHash, kidOf, newKeys, seal, unseal, append, verify, mirrorOf, metrics, hex, b64 };
})();
