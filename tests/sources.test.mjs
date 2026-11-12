// Sources tab engine (engine/sources/jobs.mjs): kind detection, the scripted fact pass (noise, Arabic-aware dedupe, kind),
// and a document source end to end in the test save folder: job → lines.json → facts.jsonl → a person's edit → rebuilt facts.
//   node tests/sources.test.mjs
import './_isolate.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { kindOf, normKey, isNoise, kindOfFact, factsFrom, newJob, start, getJob, previews, saveLines, setFact, claudeFacts, sceneFrames, cueLines, evidence } from '../engine/sources/jobs.mjs';
import { textLines } from '../engine/harvest/sources.mjs';
import { writeZip } from '../engine/zip.mjs';

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
await t('XLSX and PPTX readers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-zip-'));
  const x = path.join(dir, 'a.xlsx'), p = path.join(dir, 'b.pptx');
  writeZip(x, [
    { name: 'xl/sharedStrings.xml', data: '<sst><si><t>الحقل</t></si><si><r><t>رقم </t></r><r><t>الرخصة</t></r></si></sst>' },
    { name: 'xl/worksheets/sheet2.xml', data: '<worksheet><sheetData><row><c t="inlineStr"><is><t>B &amp; C</t></is></c></row></sheetData></worksheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c><c><v>12</v></c></row><row><c/></row></sheetData></worksheet>' },
  ]);
  writeZip(p, [
    { name: 'ppt/slides/slide10.xml', data: '<p:sld><a:p><a:r><a:t>Last</a:t></a:r></a:p></p:sld>' },
    { name: 'ppt/slides/slide2.xml', data: '<p:sld><a:p><a:r><a:t>Two </a:t></a:r><a:r><a:t>runs</a:t></a:r></a:p><a:p><a:r><a:t>Next</a:t></a:r></a:p></p:sld>' },
  ]);
  assert.deepEqual(textLines(x), ['[sheet 1] الحقل | رقم الرخصة | 12', '[sheet 2] B & C']);
  assert.deepEqual(textLines(p), ['[slide 1] Two runs', '[slide 1] Next', '[slide 2] Last']);
  assert.equal(kindOf('plan.xlsx'), 'doc'); assert.equal(kindOf('deck.pptx'), 'doc');
});
await t('the Claude pass: cleaned facts written back, a person\'s decision kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-src-'));
  const file = path.join(dir, 'n.txt');
  fs.writeFileSync(file, 'The applicant must upload the licnce\nAgreed: two approval stages\n');
  const job = newJob({ input: file, kind: 'doc' });
  start(job.id);
  for (let i = 0; i < 50 && getJob(job.id).state !== 'done'; i += 1) await new Promise((r) => setTimeout(r, 50));
  const [f1, f2] = previews(job.id).facts;
  setFact(job.id, f2.id, { status: 'accepted' });
  assert.equal(claudeFacts(job.id, [{ id: f1.id, text: 'The applicant must upload the licence', kind: 'requirement' }, { id: f2.id, text: f2.text, kind: 'decision' }, { text: 'Applicant', kind: 'actor', loc: 'line 1' }]), 3);
  const p = previews(job.id).facts;
  assert.equal(p[0].text, 'The applicant must upload the licence'); assert.equal(p[0].text_orig, f1.text); assert.equal(p[0].loc, 'line 1');
  assert.equal(p[1].status, 'accepted'); assert.equal(p[2].id, 'c3'); assert.match(p[2].how, /Claude pass/);
  assert.ok(getJob(job.id).claude);
  assert.throws(() => claudeFacts(job.id, [{ text: 'x', kind: 'guess' }]), /kind/);
  assert.throws(() => sceneFrames(job.id), /video/);
});
await t('a Teams / SRT transcript: no speech-to-text, speakers kept, then the evidence pack', async () => {
  assert.equal(kindOf('meeting.vtt'), 'transcript'); assert.equal(kindOf('meeting.SRT'), 'transcript');
  const rows = cueLines('﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:04.500\r\n<v Rana Ali>لازم نضيف حقل الرخصة</v>\r\n\r\n00:00:05.000 --> 00:00:07.000\r\n<v Rana Ali>قبل الدفع</v>\r\n\r\n1\r\n01:01:02,000 --> 01:01:05,000\r\nOmar: we agreed on two approval stages\r\n\r\n2\r\n01:01:06,000 --> 01:01:08,000\r\nno speaker on this subtitle line\r\n');
  assert.deepEqual(rows, [
    { text: 'لازم نضيف حقل الرخصة قبل الدفع', loc: '0:00:01–0:00:07', who: 'Rana Ali' },
    { text: 'we agreed on two approval stages', loc: '1:01:02–1:01:05', who: 'Omar' },
    { text: 'no speaker on this subtitle line', loc: '1:01:06–1:01:08' },
  ]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-vtt-'));
  const file = path.join(dir, 'teams.vtt');
  fs.writeFileSync(file, 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Rana>لازم نضيف حقل رقم الرخصة\n\n00:00:05.000 --> 00:00:09.000\n<v Omar>we agreed on two approval stages\n');
  const job = newJob({ input: file, kind: 'transcript' });
  start(job.id);
  for (let i = 0; i < 50 && getJob(job.id).state !== 'done'; i += 1) await new Promise((r) => setTimeout(r, 50));
  const f = previews(job.id).facts;
  assert.deepEqual(f.map((x) => [x.kind, x.who]), [['requirement', 'Rana'], ['decision', 'Omar']]);
  setFact(job.id, f[0].id, { status: 'accepted' });
  const ev = evidence([job.id]);
  assert.equal(ev.facts.length, 1); assert.equal(ev.facts[0].source_id, job.id); assert.deepEqual(ev.counts, { requirement: 1 }); assert.equal(ev.pending_review, 1);
  assert.ok(fs.existsSync(ev.file));
});
await t('scene frames of a screen recording (ffmpeg)', async () => {
  if (spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status !== 0) { console.log('SKIP  sources: no ffmpeg on PATH'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-vid-'));
  const v = path.join(dir, 'screen.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=320x240:d=1', '-f', 'lavfi', '-i', 'color=blue:s=320x240:d=1', '-filter_complex', '[0][1]concat=n=2:v=1', '-pix_fmt', 'yuv420p', v], { windowsHide: true });
  assert.equal(r.status, 0);
  const job = newJob({ input: v, kind: 'media' });
  const fr = sceneFrames(job.id);
  assert.equal(fr.length, 2, JSON.stringify(fr)); assert.equal(fr[0].at, '0:00:00'); assert.equal(fr[1].at, '0:00:01');
  assert.ok(fs.statSync(fr[1].file).size > 0);
});
process.exit(fail ? 1 : 0);
