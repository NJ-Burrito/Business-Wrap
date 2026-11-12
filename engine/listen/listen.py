"""Business-Wrap listen engine (nj-listen): meeting audio/video -> who said what, when.

Local, free and open source: ffmpeg, Silero VAD + pyannote-segmentation-3.0 + CAM++ / ERes2Net (sherpa-onnx,
Apache-2.0 / MIT), Whisper large-v3-turbo int8 on the Intel iGPU through OpenVINO GenAI (MIT / Apache-2.0).
No cloud call. Claude reads the result (dialect clean-up, English terms, facts) in the session that drives Business-Wrap.

  python listen.py run <media> <out_dir> [--prompt TEXT] [--enroll enroll.json] [--device GPU|CPU]
  python listen.py probe <media> <out_dir>          streams, tracks, duration         -> probe.json
  python listen.py prep <media> <out_dir>           16 kHz mono wav per track          -> track-<n>.wav
  python listen.py sweep <out_dir>                  speech regions + chunks (VAD)      -> sweep.json
  python listen.py transcribe <out_dir> [--prompt]  ASR per chunk                      -> transcript.json
  python listen.py speakers <out_dir>               diarization (own process)          -> speakers.json
  python listen.py enroll <out_dir> <enroll.json>   names from intro windows           -> named.json
  python listen.py --selftest                       pure logic, no models (CI)

Every stage writes its checkpoint into <out_dir>; `run` skips a stage whose checkpoint exists (resume after a stop).
Progress: one JSON line per event on stdout, {"stage": ..., "done": n, "total": m, "msg": ...}.
Stop: create <out_dir>/STOP; the running stage ends at the next chunk and exits 3. Pause: <out_dir>/PAUSE (waits).
Measured on an i5-1334U + Iris Xe (2026-11-12): 49.8 min of Jordanian-dialect audio in 18.8 min; 2 h ~ 45 min.
"""
import json, os, re, subprocess, sys, time, urllib.request
from pathlib import Path

SR = 16000
CHUNK_MAX, GAP_MERGE = 28.0, 0.6            # Whisper window; merge VAD gaps under this
MIN_SIM, MARGIN, MIN_LEN = 0.53, 0.08, 1.0  # ERes2Net base: other-person max 0.45, same-person min 0.61 (labelled test)
LOOP_SHARE = 0.35                            # a chunk whose most frequent word is > 35% of its words is a decoding loop
ASR_REPO = 'OpenVINO/whisper-large-v3-turbo-int8-ov'
SHERPA = 'https://github.com/k2-fsa/sherpa-onnx/releases/download'
MODELS = {
    'vad': f'{SHERPA}/asr-models/silero_vad.onnx',
    'seg': f'{SHERPA}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
    'cluster': f'{SHERPA}/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx',
    'name': f'{SHERPA}/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
}
CACHE = Path(os.environ.get('BW_LISTEN_MODELS') or Path.home() / '.cache' / 'business-wrap' / 'listen')


# ── progress, pause, stop ───────────────────────────────────────────────────
def say(stage, done=0, total=0, msg=''):
    print(json.dumps({'stage': stage, 'done': done, 'total': total, 'msg': msg, 't': round(time.time(), 1)}, ensure_ascii=False), flush=True)


def gate(out):
    """Between chunks: wait while PAUSE exists, exit 3 when STOP exists."""
    while (out / 'PAUSE').exists() and not (out / 'STOP').exists(): time.sleep(1)
    if (out / 'STOP').exists(): say('stopped'); sys.exit(3)


def save(out, name, data):
    tmp = out / (name + '.part'); tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8'); tmp.replace(out / name)


def load(out, name): return json.loads((out / name).read_text(encoding='utf-8'))


# ── pure logic (self-tested, no models) ─────────────────────────────────────
def merge_regions(regions, gap=GAP_MERGE, cap=CHUNK_MAX):
    """VAD speech regions -> ASR chunks: join gaps under `gap` while a chunk stays under `cap` seconds."""
    chunks = []
    for a, b in sorted(regions):
        if chunks and a - chunks[-1][1] < gap and b - chunks[-1][0] <= cap: chunks[-1][1] = max(chunks[-1][1], b)
        else: chunks.append([a, b])
    return chunks


def is_loop(text):
    w = text.split()
    return len(w) > 8 and max(w.count(x) for x in set(w)) / len(w) > LOOP_SHARE


def collapse(text):
    """Decoding loops: a word repeated 3+ times -> once; a stretched tatweel run -> one tatweel."""
    text = re.sub(r'(\S+)(?:\s+\1){2,}', r'\1', text)
    return re.sub('ـ{3,}', 'ـ', text)


def overlap_owner(start, end, spans):
    """spans: [(a, b, label)] -> (label with most overlap or None, labels with > 2 s overlap)."""
    ov = {}
    for a, b, k in spans:
        o = min(b, end) - max(a, start)
        if o > 0: ov[k] = ov.get(k, 0) + o
    if not ov: return None, []
    return max(ov, key=ov.get), [k for k, o in ov.items() if o > 2]


def pick_name(sims, names, min_sim=MIN_SIM, margin=MARGIN):
    order = sorted(range(len(sims)), key=lambda i: -sims[i])
    best = sims[order[0]]; second = sims[order[1]] if len(order) > 1 else -1.0
    return names[order[0]] if best >= min_sim and best - second >= margin else 'Unknown'


def selftest():
    assert merge_regions([[0, 1], [1.2, 2], [5, 6]]) == [[0, 2], [5, 6]]
    assert merge_regions([[0, 20], [20.3, 30]]) == [[0, 20], [20.3, 30]]  # would exceed 28 s
    assert is_loop('على ' * 12) and not is_loop('هذا نص عادي فيه كلمات مختلفة كثيرة جدا بلا تكرار')
    assert collapse('تعمل على على على على') == 'تعمل على'
    assert collapse('الـــــــــــ') == 'الـ'
    assert overlap_owner(0, 10, [(0, 3, 'a'), (3, 10, 'b')]) == ('b', ['a', 'b'])
    assert overlap_owner(0, 1, [(5, 6, 'a')]) == (None, [])
    assert pick_name([0.9, 0.3], ['x', 'y']) == 'x'
    assert pick_name([0.5, 0.3], ['x', 'y']) == 'Unknown'        # under MIN_SIM
    assert pick_name([0.70, 0.66], ['x', 'y']) == 'Unknown'      # margin too small
    print('listen selftest: PASS')


# ── models ──────────────────────────────────────────────────────────────────
def model(key):
    CACHE.mkdir(parents=True, exist_ok=True)
    url = MODELS[key]; f = CACHE / url.rsplit('/', 1)[1]
    if not f.exists():
        say('models', msg=f'download {f.name}')
        urllib.request.urlretrieve(url, str(f) + '.part'); os.replace(str(f) + '.part', f)
    if f.suffix == '.bz2':
        d = CACHE / f.name.replace('.tar.bz2', '')
        if not d.exists(): subprocess.run(['tar', 'xjf', str(f), '-C', str(CACHE)], check=True)
        return str(d / 'model.int8.onnx')
    return str(f)


# ── stages ──────────────────────────────────────────────────────────────────
def probe(media, out):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', media], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    tracks = [{'index': s['index'], 'channels': s.get('channels', 1), 'lang': (s.get('tags') or {}).get('language'),
               'title': (s.get('tags') or {}).get('title')} for s in j['streams'] if s['codec_type'] == 'audio']
    data = {'media': str(media), 'duration': float(j['format'].get('duration', 0)), 'tracks': tracks,
            'video': any(s['codec_type'] == 'video' for s in j['streams'])}
    save(out, 'probe.json', data); say('probe', 1, 1, f"{len(tracks)} audio track(s), {data['duration'] / 60:.1f} min"); return data


def prep(media, out):
    """One 16 kHz mono wav per audio track (multitrack: a track is usually one person or one room)."""
    p = load(out, 'probe.json')
    for n, t in enumerate(p['tracks']):
        wav = out / f'track-{n}.wav'
        if not wav.exists():
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', media, '-map', f"0:{t['index']}", '-ac', '1', '-ar', str(SR),
                            '-af', 'highpass=f=80,loudnorm=I=-18:TP=-2', str(wav) + '.part.wav'], check=True)
            os.replace(str(wav) + '.part.wav', wav)
        say('prep', n + 1, len(p['tracks']))


def audio_of(out, n):
    import soundfile as sf
    return sf.read(str(out / f'track-{n}.wav'), dtype='float32')[0]


def sweep(out):
    import sherpa_onnx as so
    p = load(out, 'probe.json'); res = []
    for n in range(len(p['tracks'])):
        a = audio_of(out, n)
        cfg = so.VadModelConfig(); cfg.silero_vad.model = model('vad'); cfg.silero_vad.min_silence_duration = 0.4
        cfg.silero_vad.min_speech_duration = 0.25; cfg.silero_vad.max_speech_duration = CHUNK_MAX; cfg.sample_rate = SR; cfg.num_threads = 2
        vad = so.VoiceActivityDetector(cfg, buffer_size_in_seconds=60); regions = []; win = cfg.silero_vad.window_size

        def drain():
            while not vad.empty():
                s = vad.front; regions.append([s.start / SR, (s.start + len(s.samples)) / SR]); vad.pop()
        for i in range(0, len(a), win):
            vad.accept_waveform(a[i:i + win]); drain()
        vad.flush(); drain()
        chunks = merge_regions(regions)
        res.append({'track': n, 'speech_s': round(sum(b - x for x, b in chunks), 1), 'chunks': [[round(x, 2), round(b, 2)] for x, b in chunks]})
        say('sweep', n + 1, len(p['tracks']), f"track {n}: {res[-1]['speech_s'] / 60:.1f} min speech in {len(chunks)} chunks")
    save(out, 'sweep.json', {'tracks': res})


def transcribe(out, prompt='', device='GPU'):
    import openvino_genai as og
    from huggingface_hub import snapshot_download
    sw = load(out, 'sweep.json'); total = sum(len(t['chunks']) for t in sw['tracks']); done = 0
    part = out / 'transcript.partial.json'
    segs = json.loads(part.read_text(encoding='utf-8')) if part.exists() else []  # resume
    have = {(s['track'], s['start']) for s in segs}
    say('transcribe', 0, total, f'loading Whisper on {device}')
    try: pipe = og.WhisperPipeline(snapshot_download(ASR_REPO), device, CACHE_DIR=str(CACHE / 'ov-cache'))
    except Exception:
        if device == 'CPU': raise
        say('transcribe', msg='GPU not available, using CPU'); pipe = og.WhisperPipeline(snapshot_download(ASR_REPO), 'CPU')
    gc = pipe.get_generation_config(); gc.language = '<|ar|>'; gc.task = 'transcribe'
    gc.max_new_tokens = 220; gc.no_repeat_ngram_size = 4; gc.repetition_penalty = 1.1
    if prompt: gc.initial_prompt = prompt
    for t in sw['tracks']:
        a = audio_of(out, t['track'])
        for x, b in t['chunks']:
            done += 1
            if (t['track'], x) in have: continue
            gate(out)
            text = str(pipe.generate(a[int(x * SR):int(b * SR)].tolist(), gc)).strip()
            loop = is_loop(text)
            if loop: text = collapse(text)
            if text: segs.append({'track': t['track'], 'start': x, 'end': b, 'text': text, 'loop': loop})
            if done % 5 == 0: part.write_text(json.dumps(segs, ensure_ascii=False), encoding='utf-8')
            say('transcribe', done, total)
    save(out, 'transcript.json', {'engine': ASR_REPO, 'device': device, 'prompt': prompt, 'segments': segs})
    part.unlink(missing_ok=True)


def speakers(out, threads=6):
    """Diarization per track. Runs as its own process from `run` (sherpa holds the GIL)."""
    import sherpa_onnx as so
    p = load(out, 'probe.json'); res = []
    cfg = so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=model('seg')), num_threads=threads),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=model('cluster'), num_threads=threads),
        clustering=so.FastClusteringConfig(num_clusters=-1, threshold=0.8), min_duration_on=0.3, min_duration_off=0.5)
    sd = so.OfflineSpeakerDiarization(cfg)
    for n in range(len(p['tracks'])):
        gate(out)
        segs = sd.process(audio_of(out, n)).sort_by_start_time()
        res += [{'track': n, 'start': round(s.start, 2), 'end': round(s.end, 2), 'cluster': f't{n}s{s.speaker}'} for s in segs]
        say('speakers', n + 1, len(p['tracks']))
    save(out, 'speakers.json', {'segments': res})


def enroll(out, enroll_file):
    """enroll.json: {"name": [[start, end], ...]} on track 0 (or {"name": {"track": n, "windows": [...]}})."""
    import numpy as np, sherpa_onnx as so
    ex = so.SpeakerEmbeddingExtractor(so.SpeakerEmbeddingExtractorConfig(model=model('name'), num_threads=8))
    tracks = {}

    def emb(n, a, b):
        au = tracks.setdefault(n, audio_of(out, n)); a, b = max(0, int(a * SR)), min(len(au), int(b * SR))
        if b - a < int(MIN_LEN * SR): return None
        st = ex.create_stream(); st.accept_waveform(SR, au[a:b]); st.input_finished()
        v = np.array(ex.compute(st)); return v / (np.linalg.norm(v) + 1e-9)
    spec = json.loads(Path(enroll_file).read_text(encoding='utf-8')); prints = {}
    for name, w in spec.items():
        n, wins = (w.get('track', 0), w['windows']) if isinstance(w, dict) else (0, w)
        vs = [v for v in (emb(n, a, b) for a, b in wins) if v is not None]
        if vs: m = np.mean(vs, 0); prints[name] = m / np.linalg.norm(m)
    names = list(prints); P = np.stack([prints[x] for x in names])
    dia = load(out, 'speakers.json')['segments']; total = len(dia); named = []
    for i, s in enumerate(dia):
        if i % 20 == 0: gate(out); say('enroll', i, total)
        v = emb(s['track'], s['start'], s['end'])
        named.append({**s, 'name': pick_name(list(P @ v), names) if v is not None else None})
    maj = {}  # short segments inherit their cluster's majority name
    for s in named:
        if s['name']: maj.setdefault(s['cluster'], {}).setdefault(s['name'], 0); maj[s['cluster']][s['name']] += s['end'] - s['start']
    for s in named:
        if not s['name']: s['name'] = max(maj[s['cluster']], key=maj[s['cluster']].get) if s['cluster'] in maj else 'Unknown'
    save(out, 'named.json', {'enrolled': names, 'segments': named}); say('enroll', total, total)


def assemble(out):
    """transcript + speakers (+ names) -> result.json, the file the Sources preview edits."""
    tr = load(out, 'transcript.json')['segments']
    who = load(out, 'named.json')['segments'] if (out / 'named.json').exists() else load(out, 'speakers.json')['segments']
    key = 'name' if who and 'name' in who[0] else 'cluster'
    for s in tr:
        spans = [(w['start'], w['end'], w[key]) for w in who if w['track'] == s['track']]
        s['speaker'], many = overlap_owner(s['start'], s['end'], spans)
        s['mixed'] = len(many) > 1
    save(out, 'result.json', {'probe': load(out, 'probe.json'), 'by': key, 'segments': tr})
    say('done', len(tr), len(tr), f"{len(tr)} segments, {sum(s['loop'] for s in tr)} loops, {sum(s['mixed'] for s in tr)} mixed")


def run(media, out, prompt='', enroll_file=None, device='GPU'):
    t0 = time.time(); out.mkdir(parents=True, exist_ok=True)
    if not (out / 'probe.json').exists(): probe(media, out)
    prep(media, out)
    if not (out / 'sweep.json').exists(): sweep(out)
    diar = None
    if not (out / 'speakers.json').exists():  # its own process: sherpa holds the GIL
        diar = subprocess.Popen([sys.executable, __file__, 'speakers', str(out)])
    if not (out / 'transcript.json').exists(): transcribe(out, prompt, device)
    if diar and diar.wait() != 0: say('error', msg='speakers stage failed'); sys.exit(1)
    if enroll_file and not (out / 'named.json').exists(): enroll(out, enroll_file)
    assemble(out)
    say('done', msg=f'wall {(time.time() - t0) / 60:.1f} min')


def main(a):
    if a[:1] == ['--selftest']: return selftest()
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    cmd = a[0]
    if cmd == 'run': return run(a[1], Path(a[2]).resolve(), opt('--prompt', ''), opt('--enroll'), opt('--device', 'GPU'))
    out = Path(a[2] if cmd in ('probe', 'prep') else a[1]).resolve(); out.mkdir(parents=True, exist_ok=True)
    if cmd == 'probe': probe(a[1], out)
    elif cmd == 'prep': prep(a[1], out)
    elif cmd == 'sweep': sweep(out)
    elif cmd == 'transcribe': transcribe(out, opt('--prompt', ''), opt('--device', 'GPU'))
    elif cmd == 'speakers': speakers(out)
    elif cmd == 'enroll': enroll(out, a[2]); assemble(out)
    else: sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
