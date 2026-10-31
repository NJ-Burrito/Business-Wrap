// Spell checking (0.15.0, lane spell). Two things in one route:
//   1. The dictionaries and the Worker, served to the page: GET /api/spell/<ar|en>.aff|.dic (gzip, cached), GET /api/spell/worker.js
//      (the browser engine: hunspell-asm with its WebAssembly embedded, editor/spell-worker.js) with the response header that lets the
//      WebAssembly compile ('wasm-unsafe-eval') and nothing else. The page's own CSP needs `worker-src 'self'` (engine/build-editor.mjs).
//   2. The same engine in Node, for a page whose Worker cannot start (an older CSP, a browser without WebAssembly):
//      POST /api/spell/check {lang, words[]} -> {bad[]}, POST /api/spell/suggest {lang, word} -> {s[]}.
// GET /api/spell/info lists what is bundled (names, versions, licences, sizes) for the Spelling panel and the Settings card.
// Nothing here reaches the network; the dictionaries are the unmodified files under editor/dict/ (NOTICE.md).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJson } from '../workspace.mjs';

const gzip = promisify(zlib.gzip);
export const DICT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'editor', 'dict');
export const WORKER_FILE = path.join(DICT_DIR, '..', 'spell-worker.js');
const FILES = { 'ar.aff': 'ar/ar.aff', 'ar.dic': 'ar/ar.dic', 'en.aff': 'en/index.aff', 'en.dic': 'en/index.dic' };
export const WORKER_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";
const LANGS = new Set(['ar', 'en']);
const MAX_WORDS = 5000;
const MAX_WORD = 80;

const cache = new Map(); // file -> { raw, gz, etag }
async function bytesOf(file) {
  let c = cache.get(file);
  if (!c) {
    const raw = fs.readFileSync(file);
    c = { raw, gz: null, etag: `"${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}"` };
    cache.set(file, c);
  }
  return c;
}
async function serveFile(req, res, file, type, extra = {}) {
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not found"}'); return; }
  const c = await bytesOf(file);
  const head = { 'content-type': type, etag: c.etag, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', ...extra };
  if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, head); res.end(); return; }
  const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && c.raw.length > 1024;
  if (gz) { c.gz ||= await gzip(c.raw, { level: 6 }); head['content-encoding'] = 'gzip'; head.vary = 'Accept-Encoding'; }
  head['content-length'] = (gz ? c.gz : c.raw).length;
  res.writeHead(200, head);
  res.end(req.method === 'HEAD' ? undefined : gz ? c.gz : c.raw);
}

let engine = null; // the Node engine, loaded on the first host-side check
const loaded = new Set();
async function nodeEngine(lang) {
  engine ||= await import(pathToFileURL(path.join(DICT_DIR, 'engine.mjs')).href);
  if (!loaded.has(lang)) { await engine.load(lang, DICT_DIR); loaded.add(lang); }
  return engine;
}

const readInfo = () => {
  let src = {};
  try { src = JSON.parse(fs.readFileSync(path.join(DICT_DIR, 'SOURCES.json'), 'utf8')); } catch { /* no sources file: info says so */ }
  let tech = [];
  try { tech = fs.readFileSync(path.join(DICT_DIR, 'tech.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); } catch { /* none */ }
  const size = (f) => { try { return fs.statSync(path.join(DICT_DIR, f)).size; } catch { return 0; } };
  return {
    ok: fs.existsSync(WORKER_FILE) && fs.existsSync(path.join(DICT_DIR, FILES['ar.dic'])),
    langs: {
      ar: { name: src.ar?.name || 'Ayaspell', licence: src.ar?.licence || '', source: src.ar?.source || '', bytes: size(FILES['ar.dic']) + size(FILES['ar.aff']) },
      en: { name: src.en?.name || 'dictionary-en', version: src.en?.version || '', licence: src.en?.licence || '', source: src.en?.source || '', bytes: size(FILES['en.dic']) + size(FILES['en.aff']) },
    },
    engine: { name: src.engine?.name || 'hunspell-asm', version: src.engine?.version || '', licence: src.engine?.licence || '' },
    tech,
  };
};

export default async (req, url, send, ctx, res) => {
  if (!url.pathname.startsWith('/api/spell/')) return false;
  const name = url.pathname.slice('/api/spell/'.length);
  if ((req.method === 'GET' || req.method === 'HEAD') && name === 'worker.js') {
    await serveFile(req, res, WORKER_FILE, 'text/javascript; charset=utf-8', { 'content-security-policy': WORKER_CSP });
    return true;
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && FILES[name]) {
    await serveFile(req, res, path.join(DICT_DIR, FILES[name]), 'application/octet-stream');
    return true;
  }
  if (req.method === 'GET' && name === 'info') { send(200, readInfo()); return true; }
  if (req.method === 'POST' && (name === 'check' || name === 'suggest')) {
    const b = await readJson(req).catch(() => null);
    if (!b || !LANGS.has(b.lang)) { send(400, { error: 'lang must be ar or en' }); return true; }
    try {
      if (name === 'check') {
        if (!Array.isArray(b.words) || b.words.length > MAX_WORDS || b.words.some((w) => typeof w !== 'string' || w.length > MAX_WORD)) { send(400, { error: `words: an array of at most ${MAX_WORDS} strings of at most ${MAX_WORD} characters` }); return true; }
        const e = await nodeEngine(b.lang);
        send(200, { bad: e.check(b.lang, b.words) });
      } else {
        if (typeof b.word !== 'string' || !b.word || b.word.length > MAX_WORD) { send(400, { error: 'word: a string of at most 80 characters' }); return true; }
        const e = await nodeEngine(b.lang);
        send(200, { s: e.suggest(b.lang, b.word) });
      }
    } catch (e) { send(500, { error: String(e.message || e).slice(0, 200) }); }
    return true;
  }
  send(404, { error: 'not found' });
  return true;
};
