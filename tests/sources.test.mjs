// Sources tab engine (engine/sources/jobs.mjs): kind detection, the scripted fact pass (noise, Arabic-aware dedupe, kind),
// and a document source end to end in the test save folder: job → lines.json → facts.jsonl → a person's edit → rebuilt facts.
//   node tests/sources.test.mjs
import './_isolate.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kindOf, normKey, isNoise, kindOfFact, factsFrom, newJob, start, getJob, previews, saveLines, setFact } from '../engine/sources/jobs.mjs';

let fail = 0;
const t = async (name, f) => { try { await f(); console.log(`PASS  sources: ${name}`); } catch (e) { fail += 1; console.log(`FAIL  sources: ${name} — ${e.message}`); } };

await t('kind of a source', () => {
  assert.equal(kindOf('meeting.m4a'), 'media'); assert.equal(kindOf('screen.MP4'), 'media'); assert.equal(kindOf('srs.pdf'), 'doc');
  assert.equal(kindOf('shot.png'), 'image'); assert.equal(kindOf('app.apk'), 'apk'); assert.equal(kindOf('https://x.jo/a'), 'web');
  assert.equal(kindOf('C:/tools/skill', true), 'folder'); assert.equal(kindOf('data.exe'), null);
});
await t('Arabic-aware key, noise, kind', () => {
  assert.equal(normKey('الطَّلَبُ مُعتمَدة'), normKey('الطلب معتمده'));
  assert.equal(normKey('إضافة'), normKey('اضافة'));
  assert.ok(isNoise('اه يعني')); assert.ok(isNoise('okay')); assert.ok(!isNoise('لازم نضيف حقل رقم الرخصة'));
  assert.equal(kindOfFact('لازم نضيف حقل رقم الرخصة'), 'requirement');
  assert.equal(kindOfFact('اتفقنا على ثلاث مراحل للموافقة'), 'decision');
  assert.equal(kindOfFact('هل الدفع قبل الموافقة؟'), 'question');
  assert.equal(kindOfFact('The payment gateway is ready.'), 'statement');
});
await t('facts: duplicates fold, low confidence kept low', () => {
  const f = factsFrom([
    { text: 'لازم نضيف حقل رقم الرخصة', loc: '0:01:00–0:01:05', who: 'A' },
    { text: 'لازم نُضيف حقل رقم الرّخصة', loc: '0:09:00–0:09:04', who: 'B' },
    { text: 'اه', loc: 'x' },
    { text: 'we need the Docker image for the sprint', loc: '0:02:00–0:02:05', low: true },
  ], { source: 'm.m4a', how: 'local transcript (Whisper)', base: 0.6 });
  assert.equal(f.length, 2);
  assert.deepEqual(f[0].corroborated_by, ['0:09:00–0:09:04']);
  assert.equal(f[1].confidence, 0.3); assert.equal(f[1].kind, 'requirement'); assert.equal(f[0].status, 'candidate');
});
await t('a document source end to end, and a person\'s edit', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-src-'));
  const file = path.join(dir, 'notes.md');
  fs.writeFileSync(file, '# Meeting notes\n- The applicant must upload the licence\n- Agreed: two approval stages\n- ok\n');
  const job = newJob({ input: file, kind: 'doc' });
  start(job.id);
  for (let i = 0; i < 50 && getJob(job.id).state !== 'done'; i += 1) await new Promise((r) => setTimeout(r, 50));
  assert.equal(getJob(job.id).state, 'done', JSON.stringify(getJob(job.id)));
  let p = previews(job.id);
  assert.equal(p.lines.length, 4);
  assert.deepEqual(p.facts.map((x) => x.kind), ['requirement', 'decision']); // a two-word heading is noise
  saveLines(job.id, p.lines.map((l, i) => (i === 1 ? { ...l, deleted: true } : l)));
  p = previews(job.id);
  assert.ok(p.edited); assert.equal(p.facts.length, 1);
  setFact(job.id, p.facts[0].id, { status: 'accepted' });
  assert.equal(previews(job.id).facts[0].status, 'accepted');
});
process.exit(fail ? 1 : 0);
