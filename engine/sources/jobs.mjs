// Sources tab (owner request 2026-11-12): every source a person adds (a meeting recording, a document, a web page, an image,
// an Android app, a tool or skill folder) becomes one folder under <workspace>\Sources\<id>\ with a checkpoint per stage, so a
// person can preview and correct each stage before anything reaches a document. Local only: nothing here calls a network
// service except fetching the web page the person named. The AI pass (clean-up, fact extraction, reading images) is Claude's,
// through the MCP tools, on the facts.jsonl written here.
//
//   <id>\job.json       kind, input, state (queued|running|paused|stopped|done|error), per-stage progress
//   <id>\input\…        the uploaded file (or nothing, when the source is a path or a URL)
//   <id>\work\…         the harvester's checkpoints (listen: probe/sweep/transcript/speakers/result.json)
//   <id>\lines.json     the readable text: [{text, loc, who?, low?}]  ← the preview a person edits (edited copy wins)
//   <id>\facts.jsonl    candidate facts on the schema of docs/research/sources-tab/C-other-sources.md §9
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensure, workspace } from '../workspace.mjs';
import { textLines, htmlLines } from '../harvest/sources.mjs';
import { py } from '../py.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LISTEN = path.join(HERE, '..', 'listen', 'listen.py');
const OCR = path.join(HERE, 'ocr.py');
const OCR_DEPS = ['rapidocr[rtl]', 'onnxruntime', 'pillow'];
const LISTEN_DEPS = ['openvino-genai', 'sherpa-onnx', 'soundfile', 'numpy', 'huggingface_hub'];

export const KINDS = {
  media: /\.(mp3|wav|m4a|ogg|opus|flac|aac|wma|amr|mp4|mkv|mov|webm|avi|m4v)$/i,
  doc: /\.(pdf|docx|xlsx|pptx|html?|txt|md)$/i,
  image: /\.(png|jpe?g|webp|bmp|gif)$/i,
  apk: /\.apk$/i,
  transcript: /\.(vtt|srt)$/i,
};
export const PLAN = {
  media: ['probe', 'prep', 'sweep', 'transcribe', 'speakers', 'enroll', 'facts'],
  doc: ['read', 'facts'], web: ['fetch', 'facts'], image: ['ocr', 'facts'], apk: ['read', 'facts'], folder: ['read', 'facts'], transcript: ['read', 'facts'],
};

/** What kind of source this is, from a file name, a URL or a folder; null when Business-Wrap cannot read it. */
export function kindOf(input, isDir = false) {
  if (/^https?:\/\//i.test(input)) return 'web';
  if (isDir) return 'folder';
  return Object.keys(KINDS).find((k) => KINDS[k].test(input)) || null;
}

/* ── facts: the scripted part (noise, dedupe, a first kind); Claude refines them ─────────── */
const TASHKEEL = /[ً-ٰٟـ]/g;
/** Arabic-aware key for duplicate detection: no tashkeel or tatweel, one alef, ة→ه, ى→ي, Latin lower case, no punctuation. */
export const normKey = (s) => String(s || '').replace(TASHKEEL, '').replace(/[إأآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const FILLER = /^(اه+|آه+|ايوه|اي|يعني|طيب|تمام|اوكي|ok|okay|yes|no|لا|نعم|مرحبا|اهلا|شكرا|thank you|thanks|um+|uh+|hmm+)$/i;
/** A line too short or only filler words carries no fact. */
export const isNoise = (s) => { const k = normKey(s); return !k || k.split(' ').length < 3 || k.split(' ').every((w) => FILLER.test(w)); };
const KIND_RULES = [
  ['decision', /(اتفقنا|قررنا|تم الاتفاق|متفقين|agreed|decided|we will go with)/i],
  ['requirement', /(لازم|يجب|بدنا|بدنا اياه|ضروري|المطلوب|must|should|shall|required|need|needs)/i],
  ['question', /([?؟]\s*$|^(هل|ليش|ليه|شو|كيف|وين|متى|ايش|why|what|how|when|where|who)\b)/i],
];
export const kindOfFact = (s) => (KIND_RULES.find(([, re]) => re.test(normKey(s) + (/[?؟]\s*$/.test(s) ? '?' : ''))) || ['statement'])[0];
/** lines.json rows → candidate facts: noise dropped, duplicates folded into the first (their places kept in corroborated_by). */
export function factsFrom(lines, { source, how, base = 0.8 }) {
  const out = [], seen = new Map();
  for (const l of lines) {
    if (l.deleted || isNoise(l.text)) continue;
    const key = normKey(l.text);
    if (seen.has(key)) { seen.get(key).corroborated_by.push(l.loc); continue; }
    const f = {
      id: `f${out.length + 1}`, kind: kindOfFact(l.text), text: l.text, text_orig: l.orig ?? l.text,
      lang: /[؀-ۿ]/.test(l.text) ? (/[A-Za-z]{3,}/.test(l.text) ? 'mixed' : 'ar') : 'en',
      source, loc: l.loc, who: l.who || null, how, confidence: l.low ? Math.min(base, 0.3) : base,
      confidence_basis: l.low ? (l.alt ? 'low: OCR may have lost digits, see the other reading' : 'low: decoding loop, two voices in one chunk, or a doubtful OCR read') : `${how}, not yet reviewed`,
      corroborated_by: [], conflicts_with: [], status: 'candidate', note: l.alt ? `OCR second reading: ${l.alt}` : '',
    };
    seen.set(key, f); out.push(f);
  }
  return out;
}

/* ── the job store ──────────────────────────────────────────────────────────────────────── */
export const sourcesRoot = (ws = workspace()) => { ensure(ws); const r = path.join(ws.root, 'Sources'); fs.mkdirSync(r, { recursive: true }); return r; };
const dirOf = (id) => { if (!/^[\w-]+$/.test(id)) throw new Error('bad id'); return path.join(sourcesRoot(), id); };
const readJ = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJ = (f, v) => { fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };
const running = new Map(); // id → child process (only this host's own children; nothing else is ever killed)

export function newJob({ input, name, kind, prompt = '' }) {
  const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = dirOf(id);
  fs.mkdirSync(path.join(dir, 'input'), { recursive: true });
  const job = { id, kind, name: name || path.basename(input), input, prompt, created: new Date().toISOString(), state: 'queued',
    stages: Object.fromEntries(PLAN[kind].map((s) => [s, { state: 'waiting', done: 0, total: 0, msg: '' }])) };
  writeJ(path.join(dir, 'job.json'), job);
  return job;
}
export const inputDir = (id) => path.join(dirOf(id), 'input');
export function getJob(id) {
  const job = readJ(path.join(dirOf(id), 'job.json'));
  if (job && job.state === 'running' && !running.has(id)) job.state = 'stopped', job.interrupted = true; // the host restarted under it
  return job;
}
const setJob = (id, f) => { const j = getJob(id); f(j); writeJ(path.join(dirOf(id), 'job.json'), j); return j; };
export const listJobs = () => fs.readdirSync(sourcesRoot()).filter((d) => fs.existsSync(path.join(sourcesRoot(), d, 'job.json'))).sort().reverse().map(getJob);

/** The previews a person reviews: the readable lines (their edited copy when there is one), the facts, and the listen checkpoints. */
export function previews(id) {
  const d = dirOf(id), w = path.join(d, 'work');
  return {
    lines: readJ(path.join(d, 'lines.edited.json')) || readJ(path.join(d, 'lines.json')) || [],
    edited: fs.existsSync(path.join(d, 'lines.edited.json')),
    facts: fs.existsSync(path.join(d, 'facts.jsonl')) ? fs.readFileSync(path.join(d, 'facts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [],
    probe: readJ(path.join(w, 'probe.json')), sweep: readJ(path.join(w, 'sweep.json')),
    speakers: [...new Set((readJ(path.join(w, 'result.json'))?.segments || []).map((s) => s.speaker))],
  };
}
/** A person's correction of the lines (text, speaker, deleted) → lines.edited.json, and the facts are rebuilt from it. */
export function saveLines(id, lines) {
  if (!Array.isArray(lines)) throw new Error('lines: an array');
  const clean = lines.map((l) => ({ text: String(l.text ?? ''), loc: String(l.loc ?? ''), ...(l.who ? { who: String(l.who) } : {}), ...(l.low ? { low: true } : {}), ...(l.alt ? { alt: String(l.alt) } : {}), ...(l.deleted ? { deleted: true } : {}), ...(l.orig != null ? { orig: String(l.orig) } : {}) }));
  writeJ(path.join(dirOf(id), 'lines.edited.json'), clean);
  writeFacts(id, clean, getJob(id));
}
/** A person's decision on one fact: accepted / rejected / edited (with new text). */
export function setFact(id, fid, { status, text, note }) {
  if (!['accepted', 'rejected', 'edited', 'candidate'].includes(status)) throw new Error('status');
  const facts = previews(id).facts.map((f) => (f.id !== fid ? f : { ...f, status, ...(text != null ? { text: String(text) } : {}), ...(note != null ? { note: String(note) } : {}) }));
  fs.writeFileSync(path.join(dirOf(id), 'facts.jsonl'), facts.map((f) => JSON.stringify(f)).join('\n') + '\n');
}
const HOW = { media: 'local transcript (Whisper)', doc: 'document text', web: 'web page text', image: 'image text (local OCR, Claude reads the picture)', apk: 'app manifest', folder: 'tool or skill files', transcript: 'meeting transcript (captions)' };
const BASE = { media: 0.6, doc: 0.9, web: 0.8, image: 0.7, apk: 0.9, folder: 0.9, transcript: 0.8 };
function writeFacts(id, lines, job) {
  const facts = factsFrom(lines, { source: job.name, how: HOW[job.kind], base: BASE[job.kind] });
  fs.writeFileSync(path.join(dirOf(id), 'facts.jsonl'), facts.map((f) => JSON.stringify(f)).join('\n') + (facts.length ? '\n' : ''));
  return facts.length;
}

/* ── control: pause / resume / stop (files the listen engine reads between chunks) ─────── */
export function control(id, verb) {
  const w = path.join(dirOf(id), 'work');
  fs.mkdirSync(w, { recursive: true });
  if (verb === 'pause') { fs.writeFileSync(path.join(w, 'PAUSE'), ''); return setJob(id, (j) => { if (j.state === 'running') j.state = 'paused'; }); }
  if (verb === 'stop') { fs.writeFileSync(path.join(w, 'STOP'), ''); if (!running.has(id)) return setJob(id, (j) => { j.state = 'stopped'; }); return getJob(id); }
  if (verb === 'resume') {
    fs.rmSync(path.join(w, 'PAUSE'), { force: true });
    const j = getJob(id);
    if (j.state === 'paused' && running.has(id)) return setJob(id, (x) => { x.state = 'running'; });
    if (['stopped', 'error', 'queued'].includes(j.state)) { fs.rmSync(path.join(w, 'STOP'), { force: true }); start(id); }
    return getJob(id);
  }
  throw new Error(`unknown verb ${verb}`);
}

/* ── the runners ────────────────────────────────────────────────────────────────────────── */
// ponytail: one media job at a time (the iGPU and the CPU are shared); a queue per kind if documents ever get slow
let mediaBusy = null;
const waitingMedia = [];
export function start(id) {
  const job = getJob(id);
  if (job.kind === 'media' && mediaBusy && mediaBusy !== id) { waitingMedia.includes(id) || waitingMedia.push(id); setJob(id, (j) => { j.state = 'queued'; }); return; }
  if (job.kind !== 'media') running.set(id, null); // a quick job runs in this process: it is alive, not interrupted
  setJob(id, (j) => { j.state = 'running'; delete j.error; delete j.interrupted; });
  (job.kind === 'media' ? runMedia : runQuick)(id, job)
    .catch((e) => setJob(id, (j) => { j.state = 'error'; j.error = String(e.message || e).slice(0, 400); }))
    .finally(() => { if (job.kind !== 'media') running.delete(id); });
}
const stage = (id, name, patch) => setJob(id, (j) => { Object.assign(j.stages[name], patch); j.stage = name; });

function runMedia(id, job) {
  mediaBusy = id;
  const dir = dirOf(id), work = path.join(dir, 'work');
  const media = fs.existsSync(job.input) ? job.input : path.join(inputDir(id), fs.readdirSync(inputDir(id))[0] || '');
  const args = [LISTEN, 'run', media, work, ...(job.prompt ? ['--prompt', job.prompt] : []), ...(fs.existsSync(path.join(dir, 'enroll.json')) ? ['--enroll', path.join(dir, 'enroll.json')] : [])];
  const [cmd, a] = py(args, LISTEN_DEPS);
  const child = spawn(cmd, a, { cwd: dir, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
  running.set(id, child);
  let buf = '', err = '';
  child.stdout.on('data', (d) => {
    buf += d; const rows = buf.split('\n'); buf = rows.pop();
    for (const r of rows) {
      let e; try { e = JSON.parse(r); } catch { continue; }
      if (PLAN.media.includes(e.stage)) stage(id, e.stage, { state: 'running', done: e.done, total: e.total, msg: e.msg });
      else if (e.stage === 'models' || e.stage === 'error') setJob(id, (j) => { j.msg = e.msg; });
      const order = PLAN.media.indexOf(e.stage); // every earlier stage is done once a later one reports
      if (order > 0) setJob(id, (j) => { for (const s of PLAN.media.slice(0, order)) if (j.stages[s].state !== 'done' && !(s === 'speakers' && e.stage === 'transcribe')) j.stages[s].state = 'done'; });
    }
  });
  child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  return new Promise((ok) => child.on('close', (code) => {
    running.delete(id); mediaBusy = null;
    if (code === 0) {
      const res = readJ(path.join(work, 'result.json'), { segments: [] });
      const lines = res.segments.map((s) => ({ text: s.text, loc: `${clock(s.start)}–${clock(s.end)}`, who: s.speaker, ...(s.loop || s.mixed ? { low: true } : {}) }));
      writeJ(path.join(dir, 'lines.json'), lines);
      const n = writeFacts(id, readJ(path.join(dir, 'lines.edited.json')) || lines, job);
      setJob(id, (j) => { for (const s of PLAN.media) if (j.stages[s].state !== 'done') j.stages[s].state = s === 'enroll' && !fs.existsSync(path.join(dir, 'enroll.json')) ? 'skipped' : 'done'; Object.assign(j.stages.facts, { msg: `${n} candidate facts`, done: n, total: n, unit: 'facts' }); j.state = 'done'; });
    } else setJob(id, (j) => { j.state = code === 3 ? 'stopped' : 'error'; if (code !== 3) j.error = err.trim().split('\n').slice(-3).join(' ') || `exit ${code}`; });
    const next = waitingMedia.shift(); if (next) start(next);
    ok();
  }));
}
const clock = (s) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function runQuick(id, job) {
  const dir = dirOf(id), first = PLAN[job.kind][0];
  stage(id, first, { state: 'running' });
  const file = fs.existsSync(job.input) ? job.input : path.join(inputDir(id), fs.readdirSync(inputDir(id))[0] || '');
  let lines;
  if (job.kind === 'doc') lines = textLines(file).map((text, i) => ({ text, loc: `line ${i + 1}` }));
  else if (job.kind === 'web') {
    const r = await fetch(job.input, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${job.input}: HTTP ${r.status}`);
    lines = htmlLines(await r.text()).map((text, i) => ({ text, loc: `line ${i + 1}` }));
  } else if (job.kind === 'image') {
    try { lines = (await ocrFiles([file]))[file] || []; } catch (e) { lines = []; stage(id, first, { msg: `OCR unavailable (${String(e.message).slice(0, 120)}); Claude reads the picture on the Claude pass` }); }
  }
  else if (job.kind === 'apk') lines = await pyLines(['apk', file], ['androguard']);
  else if (job.kind === 'folder') lines = folderLines(file);
  else if (job.kind === 'transcript') lines = cueLines(fs.readFileSync(file, 'utf8'));
  writeJ(path.join(dir, 'lines.json'), lines);
  stage(id, first, { state: 'done', done: lines.length, total: lines.length, ...(lines.length ? { msg: `${lines.length} lines`, unit: 'lines' } : {}) });
  const n = writeFacts(id, readJ(path.join(dir, 'lines.edited.json')) || lines, job);
  stage(id, 'facts', { state: 'done', msg: `${n} candidate facts`, done: n, total: n, unit: 'facts' });
  setJob(id, (j) => { j.state = 'done'; });
}
/** Local OCR (RapidOCR, Arabic + English) of pictures: { file: [{text, loc, low?, alt?}] }. The first run downloads the models. */
export const ocrFiles = (files) => pyLines(['read', ...files], OCR_DEPS, OCR);
function pyLines(args, deps, script = path.join(HERE, 'read.py')) {
  const [cmd, a] = py([script, ...args], deps);
  return new Promise((ok, no) => {
    const c = spawn(cmd, a, { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    c.on('close', (code) => (code === 0 ? ok(JSON.parse(out)) : no(new Error(err.trim().split('\n').slice(-2).join(' ') || `exit ${code}`))));
  });
}
/** A tool or skill folder: its SKILL.md / README / docs as text, and the file list (no code is run). */
export function folderLines(dir) {
  const files = [];
  const walk = (d, rel = '') => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (/^(\.git|node_modules|__pycache__|\.venv)$/.test(e.name)) continue; const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else files.push(r); if (files.length > 2000) return; } };
  walk(dir);
  const docs = files.filter((f) => /(^|\/)(SKILL|README)[^/]*\.md$/i.test(f) || /^docs\/.*\.md$/i.test(f)).slice(0, 30);
  return [
    ...docs.flatMap((f) => textLines(path.join(dir, f)).map((text, i) => ({ text, loc: `${f}:${i + 1}` }))),
    { text: `Files (${files.length}): ${files.slice(0, 200).join(', ')}`, loc: 'file list' },
  ];
}

/* ── the Claude pass (MCP sources_* tools): files to read, scene frames, cleaned lines and facts written back ─── */
/** The source file itself (an uploaded copy or the path the person named); null for a web page or a folder. */
export function sourceFile(id) {
  const job = getJob(id);
  if (job.kind === 'web' || job.kind === 'folder') return null;
  if (fs.existsSync(job.input) && fs.statSync(job.input).isFile()) return job.input;
  const f = fs.readdirSync(inputDir(id))[0];
  return f ? path.join(inputDir(id), f) : null;
}
export const VIDEO = /\.(mp4|mkv|mov|webm|avi|m4v)$/i;
/** A screen recording → one PNG per scene change (and the first frame), at most `max`, ≤ 1280 px wide, with their times. */
export function sceneFrames(id, { threshold = 0.3, max = 40 } = {}) {
  const file = sourceFile(id);
  if (!file || !VIDEO.test(file)) throw new Error('scene frames need a video source');
  const dir = path.join(dirOf(id), 'work', 'frames');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', `select='eq(n\,0)+gt(scene\,${Number(threshold)})',scale='min(1280\,iw)':-2,showinfo`,
    '-fps_mode', 'vfr', '-frames:v', String(Math.max(1, Math.min(200, max | 0))), path.join(dir, 'f%03d.png')], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg: ${r.error?.message || r.stderr.trim().split('\n').slice(-2).join(' ')}`);
  const times = [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  return fs.readdirSync(dir).sort().map((f, i) => ({ file: path.join(dir, f), at: clock(times[i] ?? 0) }));
}
/** sceneFrames + the OCR text of each frame (loc = the frame's time); frames whose OCR failed carry ocr_error. */
export async function sceneFramesOcr(id, opts) {
  const frames = sceneFrames(id, opts);
  let read = {}, ocr_error;
  try { read = await ocrFiles(frames.map((f) => f.file)); } catch (e) { ocr_error = String(e.message || e).slice(0, 200); }
  return frames.map((f) => ({ ...f, ...(ocr_error ? { ocr_error } : { text: (read[f.file] || []).map(({ text, low, alt }) => ({ text, ...(low ? { low: true } : {}), ...(alt ? { alt } : {}) })) }) }));
}
const FACT_KINDS = ['requirement', 'decision', 'question', 'statement', 'rule', 'actor', 'step', 'field', 'term'];
/** Claude's cleaned facts replace facts.jsonl: text and kind required, the rest kept from the candidate of the same id. */
export function claudeFacts(id, facts) {
  if (!Array.isArray(facts)) throw new Error('facts: an array');
  const job = getJob(id), old = new Map(previews(id).facts.map((f) => [f.id, f]));
  const out = facts.map((f, i) => {
    if (!f || !String(f.text || '').trim()) throw new Error(`fact ${i + 1}: text is required`);
    if (!FACT_KINDS.includes(f.kind)) throw new Error(`fact ${i + 1}: kind must be one of ${FACT_KINDS.join(', ')}`);
    const was = old.get(f.id) || {};
    const conf = Number.isFinite(f.confidence) ? Math.max(0, Math.min(1, f.confidence)) : was.confidence ?? BASE[job.kind];
    return { ...was, id: was.id || `c${i + 1}`, kind: f.kind, text: String(f.text).trim(), text_orig: was.text_orig ?? f.text_orig ?? String(f.text),
      lang: /[؀-ۿ]/.test(f.text) ? (/[A-Za-z]{3,}/.test(f.text) ? 'mixed' : 'ar') : 'en', source: job.name, loc: String(f.loc ?? was.loc ?? ''),
      who: f.who ?? was.who ?? null, how: `${HOW[job.kind]}, Claude pass`, confidence: conf, confidence_basis: String(f.confidence_basis || 'Claude pass, not yet reviewed'),
      corroborated_by: f.corroborated_by ?? was.corroborated_by ?? [], conflicts_with: f.conflicts_with ?? was.conflicts_with ?? [],
      status: ['accepted', 'rejected', 'edited'].includes(was.status) ? was.status : 'candidate', note: String(f.note ?? was.note ?? '') };
  });
  fs.writeFileSync(path.join(dirOf(id), 'facts.jsonl'), out.map((f) => JSON.stringify(f)).join('\n') + (out.length ? '\n' : ''));
  setJob(id, (j) => { j.claude = new Date().toISOString(); });
  return out.length;
}

const secs = (t) => { const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(t) || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) + Number(`0.${m[4] || 0}`); };
/** A WebVTT or SRT transcript (Teams, Zoom, subtitles) → lines with their times, no speech-to-text needed.
 *  A Teams <v Name> voice or a leading "Name:" becomes who; one speaker's consecutive cues join into one line. */
export function cueLines(text) {
  const out = [];
  for (const block of String(text).replace(/^﻿/, '').replace(/\r/g, '').split(/\n{2,}/)) {
    const rows = block.split('\n'), at = rows.findIndex((r) => r.includes('-->'));
    if (at < 0) continue;
    const [a, b] = rows[at].split('-->').map((t) => clock(secs(t)));
    let body = rows.slice(at + 1).join(' ').trim(), who;
    const v = /<v(?:\.[\w.-]+)?\s+([^>]+)>/.exec(body);
    if (v) who = v[1].trim();
    body = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const named = !who && /^([^:：]{2,40})[:：]\s+(.+)$/.exec(body);
    if (named) { who = named[1].trim(); body = named[2]; }
    if (!body) continue;
    const prev = out[out.length - 1];
    if (who && prev?.who === who) { prev.text += ` ${body}`; prev.loc = `${prev.loc.split('–')[0]}–${b}`; continue; }
    out.push({ text: body, loc: `${a}–${b}`, ...(who ? { who } : {}) });
  }
  return out;
}

/** Stage 6, the hand-off: every accepted or edited fact of the chosen sources (all when none named) as one evidence pack in
 *  <workspace>\Sources\02-evidence.json. Claude puts it into the open document with the editor tools. */
export function evidence(ids) {
  const jobs = ids?.length ? ids.map((id) => getJob(id)).filter(Boolean) : listJobs();
  const all = jobs.map((j) => [j, previews(j.id).facts]);
  const facts = all.flatMap(([j, fs_]) => fs_.filter((f) => f.status === 'accepted' || f.status === 'edited').map((f) => ({ ...f, source_id: j.id, source_kind: j.kind })));
  const counts = facts.reduce((m, f) => ((m[f.kind] = (m[f.kind] || 0) + 1), m), {});
  const pending_review = all.reduce((n, [, fs_]) => n + fs_.filter((f) => f.status === 'candidate').length, 0);
  const pack = { made: new Date().toISOString(), sources: jobs.map((j) => ({ id: j.id, kind: j.kind, name: j.name })), counts, pending_review, facts };
  const file = path.join(sourcesRoot(), '02-evidence.json');
  writeJ(file, pack);
  return { file, ...pack };
}

