// 0.13.3 TSYS-04/05/06: `update --help` and `mcp --help` print usage (no network, no stdin wait), unknown flags error,
// the DOCX carries the document title (both editions), and the edits base check refuses another document / edition.
//
//   node tests/system-cli-0133.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exportDocx, loadTheme, loadEdited, REPO } from '../engine/export.mjs';
import { hashOf } from '../engine/edits-base.mjs';
import { py } from '../engine/py.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  system-cli: ${name}${detail && !ok ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-syscli-'));
// no network can be reached: the feed points at a closed local port, so a stray version check would be visible as the "latest" line
const env = { ...process.env, PYTHONUTF8: '1', BW_UPDATE_FEED: 'http://127.0.0.1:9/none', BW_LOCAL_DIR: path.join(tmp, 'local'), BW_UPDATE_TOKEN: 'none' };
const run = (script, args) => spawnSync(process.execPath, [path.join(REPO, script), ...args], { encoding: 'utf8', env, timeout: 20000, input: '' });

try {
  for (const args of [['--help'], ['-h'], ['update', '--help']]) {
    const r = run('update/cli.mjs', args);
    check(`update ${args.join(' ')}: usage, exit 0, no version check`, r.status === 0 && /--check/.test(r.stdout) && /--apply/.test(r.stdout) && !/is the latest|Can't check/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 80)}`);
  }
  let r = run('update/cli.mjs', ['--bogus']);
  check('update --bogus: exit 2, names the option, prints usage, no version check', r.status === 2 && /unknown option --bogus/.test(r.stderr) && /--check/.test(r.stderr) && !/is the latest/.test(r.stdout), `${r.status} ${r.stderr.slice(0, 80)}`);
  r = run('update/cli.mjs', ['--check', '--lang', 'en', '--json']);
  check('update --check --lang en --json: known flags still run', r.status === 0 && /"status"/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 80)}`);

  for (const args of [['--help'], ['-h']]) {
    r = run('mcp/cli.mjs', args);
    check(`mcp ${args[0]}: usage naming stdio and the config snippet, exit 0`, r.status === 0 && /stdio/.test(r.stdout) && /mcpServers/.test(r.stdout) && /mcp.cli\.mjs/.test(r.stdout), `${r.status} ${r.stdout.slice(0, 80)}`);
  }
  r = run('mcp/cli.mjs', ['--bogus']);
  check('mcp --bogus: exit 2 with usage', r.status === 2 && /unknown option --bogus/.test(r.stderr), `${r.status} ${r.stderr.slice(0, 80)}`);
  r = run('mcp/cli.mjs', ['--version']);
  check('mcp --version prints the package version', r.status === 0 && r.stdout.trim() === JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version, r.stdout);

  // TSYS-06: DOCX dc:title = the document title, per edition (python-docx also writes dc:language)
  const core = (docx) => spawnSync(...py(['-c', 'import sys,zipfile;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("docProps/core.xml").decode("utf-8"))', docx], []), { encoding: 'utf8', env }).stdout || '';
  for (const ed of ['ar', 'en']) {
    const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${ed}.json`), 'utf8'));
    const d = exportDocx(doc, { locale: ed, theme: loadTheme(), docxPath: path.join(tmp, `t.${ed}.docx`) });
    const xml = core(d.docx);
    const title = /<dc:title>([^<]*)<\/dc:title>/.exec(xml)?.[1] || '';
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    check(`DOCX ${ed}: dc:title is the document title`, !!doc.control.title && title === esc(doc.control.title), xml.slice(0, 300));
    check(`DOCX ${ed}: dc:language names the edition`, new RegExp(`<dc:language>${ed === 'ar' ? 'ar-JO' : 'en-US'}</dc:language>`).test(xml), xml.slice(0, 300));
  }

  // the engine paths (export / CLI) refuse the same base mismatches as the MCP tool
  const AR = path.join(REPO, 'samples', 'event-permit', 'document.ar.json');
  const EN = path.join(REPO, 'samples', 'event-permit', 'document.en.json');
  const mk = (name, extra) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify({ version: 1, document: 'X', baseHash: hashOf(fs.readFileSync(AR, 'utf8')), locale: 'ar', ops: [{ op: 'setText', path: '/control/title', value: 'عنوان جديد' }], ...extra })); return f; };
  check('loadEdited: matching base applies', loadEdited(AR, mk('ok.json')).control.title === 'عنوان جديد');
  const refuses = (file, edits, force) => { try { loadEdited(file, edits, { force }); return ''; } catch (e) { return e.message; } };
  check('loadEdited: a wrong baseHash is refused', /baseHash/.test(refuses(AR, mk('bad.json', { baseHash: `sha256:${'0'.repeat(64)}` }))));
  check('loadEdited: edits of another document (AR edits on the EN file) are refused', /baseHash|edition/.test(refuses(EN, mk('ar-on-en.json'))));
  check('loadEdited: an edition mismatch with the right hash is refused', /edition mismatch/.test(refuses(AR, mk('loc.json', { locale: 'en' }))));
  check('loadEdited: force overrides', refuses(EN, mk('ar-on-en2.json'), true) === '');
  check('loadEdited: an empty baseHash is not checked', refuses(AR, mk('nohash.json', { baseHash: '' })) === '');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  system-cli: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
