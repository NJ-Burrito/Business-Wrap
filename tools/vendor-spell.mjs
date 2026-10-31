// Vendors the spell checkers (0.15.0, lane spell): builds the two Hunspell bundles and copies the dictionaries, UNMODIFIED, with their licences.
//
//   node tools/vendor-spell.mjs [--from <dir>] [--ar <dir>]
//
//   --from <dir>  a folder whose node_modules holds hunspell-asm and dictionary-en (default: this repository's node_modules)
//   --ar <dir>    a folder holding the LibreOffice Ayaspell files ar.aff, ar.dic and COPYING.txt
//                 (https://github.com/LibreOffice/dictionaries/tree/master/ar); default: editor/dict/ar (re-checks what is there)
//
// Output (all committed; nothing here runs at install time or in the user's browser):
//   editor/spell-worker.js   the browser Worker: hunspell-asm with its WebAssembly embedded (served by engine/routes/spell.mjs)
//   editor/dict/engine.mjs   the same engine for Node: the host answers /api/spell/check with it when a Worker cannot run
//   editor/dict/ar/*         Ayaspell (LibreOffice build), tri-licence GPL 2.0 / LGPL 2.1 / MPL 1.1: we use it under the MPL 1.1 grant, files unmodified
//   editor/dict/en/*         dictionary-en 4.0.0 (SCOWL en_US), BSD, files unmodified
//   editor/dict/SOURCES.json where each file came from, its version and its sha256 (NOTICE.md says the same in words)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? path.resolve(argv[i + 1]) : d; };
const FROM = opt('--from', REPO);
const AR = opt('--ar', path.join(REPO, 'editor', 'dict', 'ar'));
const DICT = path.join(REPO, 'editor', 'dict');
const nm = path.join(FROM, 'node_modules');
const need = (f) => { if (!fs.existsSync(f)) { console.error(`vendor-spell: missing ${f}`); process.exit(2); } return f; };
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const esbuild = createRequire(path.join(REPO, 'package.json'))('esbuild');

// 1. the dictionaries, byte for byte
const en = path.join(nm, 'dictionary-en');
need(path.join(en, 'index.dic'));
fs.mkdirSync(path.join(DICT, 'en'), { recursive: true });
for (const f of ['index.aff', 'index.dic', 'license']) fs.copyFileSync(need(path.join(en, f)), path.join(DICT, 'en', f));
fs.mkdirSync(path.join(DICT, 'ar'), { recursive: true });
if (AR !== path.join(DICT, 'ar')) for (const f of ['ar.aff', 'ar.dic', 'COPYING.txt']) fs.copyFileSync(need(path.join(AR, f)), path.join(DICT, 'ar', f));
const enPkg = JSON.parse(fs.readFileSync(path.join(en, 'package.json'), 'utf8'));
const hsPkg = JSON.parse(fs.readFileSync(need(path.join(nm, 'hunspell-asm', 'package.json')), 'utf8'));
const files = {};
for (const [d, fs2] of [['ar', ['ar.aff', 'ar.dic', 'COPYING.txt']], ['en', ['index.aff', 'index.dic', 'license']]]) {
  for (const f of fs2) { const p = path.join(DICT, d, f); files[`${d}/${f}`] = { bytes: fs.statSync(p).size, sha256: sha(p) }; }
}
fs.writeFileSync(path.join(DICT, 'SOURCES.json'), JSON.stringify({
  note: 'Dictionary files are shipped unmodified. Regenerate with tools/vendor-spell.mjs.',
  ar: { name: 'Ayaspell (Arabic), as packaged by LibreOffice', upstream: 'http://ayaspell.sourceforge.net/', source: 'https://github.com/LibreOffice/dictionaries/tree/master/ar', libreofficeCommit: '4f1df64b2e8e14751aa7c2205d170ca016071315', lastChangedIn: '10e0418ad6a7e1c519cbcf6b9329f0940bd07c9f (2019-03-07)', licence: 'GPL 2.0 / LGPL 2.1 / MPL 1.1 tri-licence; used here under the MPL 1.1 grant' },
  en: { name: 'dictionary-en (SCOWL en_US)', version: enPkg.version, source: 'https://github.com/wooorm/dictionaries/tree/main/dictionaries/en', licence: 'BSD (SCOWL, Kevin Atkinson) / MIT packaging' },
  engine: { name: 'hunspell-asm', version: hsPkg.version, source: 'https://github.com/kwonoj/hunspell-asm', licence: 'MIT wrapper; Hunspell is MPL 1.1 / GPL 2 / LGPL 2.1' },
  files,
}, null, 2) + '\n');

// 2. the engine bundles. One small entry per target; hunspell-asm's WebAssembly is embedded in its own JS, so nothing else is fetched.
const common = { bundle: true, nodePaths: [nm], mainFields: ['browser', 'main'], minify: true, legalComments: 'none', target: 'es2020', logLevel: 'warning' };
const workerEntry = `
import { loadModule } from 'hunspell-asm';
let factory = null;
const eng = {};
const bytes = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.op === 'load') {
      if (!eng[m.lang]) {
        factory = factory || (await loadModule());
        const [aff, dic] = await Promise.all([bytes(m.base + m.lang + '.aff'), bytes(m.base + m.lang + '.dic')]);
        eng[m.lang] = factory.create(factory.mountBuffer(new Uint8Array(aff), m.lang + '.aff'), factory.mountBuffer(new Uint8Array(dic), m.lang + '.dic'));
      }
      self.postMessage({ id: m.id, ok: true });
    } else if (m.op === 'check') {
      const h = eng[m.lang];
      self.postMessage({ id: m.id, bad: m.words.filter((w) => !h.spell(w)) });
    } else if (m.op === 'suggest') {
      self.postMessage({ id: m.id, s: eng[m.lang].suggest(m.word).slice(0, 5) });
    } else self.postMessage({ id: m.id, error: 'unknown op' });
  } catch (err) { self.postMessage({ id: m.id, error: String((err && err.message) || err) }); }
};`;
await esbuild.build({ ...common, stdin: { contents: workerEntry, resolveDir: REPO, sourcefile: 'spell-worker-entry.js' }, format: 'iife', platform: 'browser', outfile: path.join(REPO, 'editor', 'spell-worker.js') });

const nodeEntry = `
import { loadModule } from 'hunspell-asm';
import fs from 'node:fs';
let factory = null;
const eng = {};
/** load('ar', dir): the dictionary pair of that language from dir (ar/ar.aff, en/index.aff) */
export async function load(lang, dir) {
  if (eng[lang]) return true;
  factory = factory || (await loadModule());
  const base = lang === 'ar' ? dir + '/ar/ar' : dir + '/en/index';
  eng[lang] = factory.create(factory.mountBuffer(fs.readFileSync(base + '.aff'), lang + '.aff'), factory.mountBuffer(fs.readFileSync(base + '.dic'), lang + '.dic'));
  return true;
}
export const check = (lang, words) => words.filter((w) => !eng[lang].spell(w));
export const suggest = (lang, word) => eng[lang].suggest(word).slice(0, 5);`;
await esbuild.build({
  ...common, stdin: { contents: nodeEntry, resolveDir: REPO, sourcefile: 'spell-node-entry.mjs' }, format: 'esm', platform: 'node', mainFields: ['main'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url); const __filename = import.meta.filename; const __dirname = import.meta.dirname;" }, outfile: path.join(DICT, 'engine.mjs'),
});
const size = (f) => fs.statSync(f).size;
console.log(`vendor-spell: worker ${size(path.join(REPO, 'editor', 'spell-worker.js'))} B, node engine ${size(path.join(DICT, 'engine.mjs'))} B, hunspell-asm ${hsPkg.version}, dictionary-en ${enPkg.version}`);
