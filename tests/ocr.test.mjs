// Local OCR for image sources (engine/sources/ocr.py + the image job in jobs.mjs): the pure rules through --selftest
// (low flag, digit loss, reading order; no models, no network), and how those rows travel through the job store.
//   node tests/ocr.test.mjs
import './_isolate.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO } from '../engine/export.mjs';
import { PLAN, kindOf, factsFrom, newJob, saveLines, previews } from '../engine/sources/jobs.mjs';

let fail = 0;
const t = async (name, f) => { try { await f(); console.log(`PASS  ocr: ${name}`); } catch (e) { fail += 1; console.log(`FAIL  ocr: ${name} — ${e.message}`); } };

await t('selftest: low flag, digit loss, reading order', () => {
  const r = spawnSync('python', ['-X', 'utf8', path.join(REPO, 'engine', 'sources', 'ocr.py'), '--selftest'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.ok(r.status === 0 && /ocr selftest: PASS/.test(r.stdout), (r.stderr || r.stdout || r.error?.message || '').trim().slice(-400));
});
await t('an image source has an ocr stage then facts', () => {
  assert.deepEqual(PLAN.image, ['ocr', 'facts']);
  assert.equal(kindOf('shot.png'), 'image');
  assert.deepEqual(Object.keys(newJob({ input: 'x.png', kind: 'image' }).stages), ['ocr', 'facts']);
});
await t('a low OCR line keeps low confidence and shows its second reading; saveLines keeps alt', () => {
  const rows = [{ text: 'رقم الطلب-41 بتاريخ/1/', loc: 'line 3', low: true, alt: '13/11/2026 0451-2026' }, { text: 'Payment gateway status: Approved', loc: 'line 7' }];
  const f = factsFrom(rows, { source: 'a.png', how: 'image text (local OCR, Claude reads the picture)', base: 0.7 });
  assert.equal(f[0].confidence, 0.3); assert.match(f[0].note, /13\/11\/2026 0451-2026/); assert.match(f[0].confidence_basis, /digits/);
  assert.equal(f[1].confidence, 0.7); assert.equal(f[1].note, '');
  const job = newJob({ input: path.join(os.tmpdir(), 'a.png'), kind: 'image' });
  saveLines(job.id, rows);
  const p = previews(job.id);
  assert.equal(p.lines[0].alt, '13/11/2026 0451-2026'); assert.ok(p.lines[0].low); assert.equal(p.lines[1].alt, undefined);
});
await t('the sample picture is in the fixtures', () => assert.ok(fs.statSync(path.join(REPO, 'tests', 'fixtures', 'ocr', 'sample.png')).size > 1000));
process.exit(fail ? 1 : 0);
