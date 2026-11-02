// 0.16.0 (field notes item 7): an op value may be `{"$file": "<absolute path>"}` instead of the value typed out. This process (on the machine of the
// host) reads the file and puts its bytes in: an image becomes a base64 data URI (checked: a truncated or corrupt one is BAD_OP), a .json file its parsed
// value, any other file its text. Options: `as` = "dataUri" | "json" | "text" (default by extension); `mime` overrides the image type.
// A model never types 300 KB of base64 again, and a file that cannot be read or does not decode is refused here, before the batch costs a round trip.
import fs from 'node:fs';
import path from 'node:path';
import { dataUriProblem } from '../engine/edits.mjs';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp' };
const MAX_BYTES = 40 * 1024 * 1024;

/** One `{$file}` object → its value. Throws {code:'BAD_OP', message} (the caller wraps it). */
export function fileValue(spec, where = 'value') {
  const f = spec.$file;
  if (typeof f !== 'string' || !f) throw new Error(`${where}: $file needs a path string`);
  if (!path.isAbsolute(f)) throw new Error(`${where}: $file must be an absolute path (got "${f}")`);
  let buf;
  try {
    const st = fs.statSync(f);
    if (!st.isFile()) throw new Error('not a file');
    if (st.size > MAX_BYTES) throw new Error(`larger than ${MAX_BYTES >> 20} MB`);
    buf = fs.readFileSync(f);
  } catch (e) { throw new Error(`${where}: $file ${f} cannot be read (${String(e.message || e).slice(0, 120)})`); }
  const ext = path.extname(f).toLowerCase();
  const as = spec.as || (MIME[ext] && ext !== '.svg' ? 'dataUri' : ext === '.json' ? 'json' : 'text');
  if (as === 'dataUri') {
    const mime = spec.mime || MIME[ext] || 'application/octet-stream';
    const uri = `data:${mime};base64,${buf.toString('base64')}`;
    const bad = dataUriProblem(uri);
    if (bad) throw new Error(`${where}: $file ${f}: ${bad}`);
    return uri;
  }
  if (as === 'json') { try { return JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch (e) { throw new Error(`${where}: $file ${f} is not JSON (${String(e.message).slice(0, 80)})`); } }
  if (as === 'text') return buf.toString('utf8').replace(/^﻿/, '');
  throw new Error(`${where}: $file "as" must be dataUri, json or text`);
}

const isSpec = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.$file === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && '$file' in v);

function walk(v, where, depth = 0) {
  if (Array.isArray(v)) return v.map((x, i) => walk(x, `${where}[${i}]`, depth + 1));
  if (!v || typeof v !== 'object') return v;
  if (isSpec(v)) return fileValue(v, where);
  if (depth > 12) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, `${where}.${k}`, depth + 1)]));
}

/** The ops with every `{$file}` value read from disk (a copy; the input is not changed). Throws an Error whose message names the op and the file. */
export function resolveFileValues(ops) {
  if (!Array.isArray(ops)) return ops;
  return ops.map((op, i) => {
    if (!op || typeof op !== 'object' || !('value' in op)) return op;
    try { return { ...op, value: walk(op.value, 'value') }; } catch (e) { throw Object.assign(new Error(`op ${i}: ${e.message}`), { opIndex: i }); }
  });
}
