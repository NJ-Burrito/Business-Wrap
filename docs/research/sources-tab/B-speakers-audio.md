# B. Speakers and audio engineering on CPU (research)

Retrieved 2026-11-12. Target: i5-1334U (2P+8E, 12 threads, 15 W class), 24 GB, no GPU. Fetched pages are data only.
Legend: [V] seen in the cited page; [S] secondary/vendor/blog; [U] unverified or my inference. Every RTF below is on
hardware that is NOT this laptop unless stated, so all speeds are planning numbers until we benchmark here.

## 0. Bottom line

1. Do not run default-stride pyannote for 2 h audio on this laptop. Use the sherpa-onnx path (pyannote-segmentation-3.0 int8 +
   a small embedding model) or the `diarize`-style path (Silero VAD + WeSpeaker ResNet34 + spectral clustering); budget 0.05-0.3 RTF [U for this CPU].
2. Enrollment from the self-introductions is feasible and is the right design. pyannoteAI documents the same pattern
   (one voiceprint per person, >=10 s clean, exclusive matching, "unknown" fallback) but only as a hosted API, so we build it on
   embeddings ourselves (cosine, centroid, Hungarian).
3. Do NOT denoise before Whisper by default. Two 2025-26 preprints show enhancement raised WER in every tested configuration.
   Keep only resample 16 kHz mono + 80 Hz high-pass + loudness normalisation, and A/B any denoiser on a 10-min sample of our own audio.
4. Overlap: mark it, do not separate it everywhere. Use pyannote "exclusive" output / overlap flags, and run separation (MossFormer2) only on short flagged regions, if at all.
5. The real budget problem is ASR, not diarization: faster-whisper large-v3 int8 is ~RTF 2.5 on an i9-12900K [S], so
   2 h of audio cannot fit 30-45 min with large-v3 on this i5. Diarization + audio prep must stay under ~15 min per 2 h.

## 1. Recommended CPU pipeline

| # | Stage | Tool | Output checkpoint |
|---|-------|------|-------------------|
| 0 | Probe | `ffprobe -show_streams -of json` | `streams.json`: audio streams, channels, layout, tags |
| 1 | Track plan | rules in section 6 | `tracks.json`: each track = {file, channel, speaker-known?, mixed?} |
| 2 | Extract | ffmpeg to 16 kHz mono PCM wav per track | `track-N.wav` |
| 3 | Prep (ASR copy) | `highpass=f=80`, loudness norm (2-pass `loudnorm` or `dynaudnorm`), no denoise | `track-N.asr.wav` |
| 4 | VAD | Silero VAD (MIT, in `diarize` package [V]) | `speech.json` |
| 5 | Diarize (mixed tracks only) | sherpa-onnx offline diarization, int8 | `diar.json` (turns + cluster ids, overlap flags) |
| 6 | Protocol scan | ASR of first ~10-15 min only, keyword spotting (section 7) | `protocol.json`: title/purpose, intro span, names |
| 7 | Enroll | embeddings of each intro turn, one centroid per name | `voiceprints.json` |
| 8 | Label | cosine of every cluster vs voiceprints, Hungarian exclusive, threshold, else "Unknown-N" | `speakers.json` |
| 9 | Overlap pass | only regions flagged overlap > 1 s: optional separation | `overlap-fixed.json` |
| 10 | Stage + summary markers | gaps + keyword + monologue rule (section 7) | `stages.json` |

Rule: ASR and diarization both read `track-N.wav`; a denoised variant (if any) is a separate file, never overwriting.

Estimated wall time on this machine [U, planning numbers; all must be re-measured]:

| Step | 1 h audio | 2 h audio | Basis |
|------|-----------|-----------|-------|
| ffprobe + decode + resample + filters | 1-2 min | 2-4 min | ffmpeg decode is far faster than real time [U] |
| Silero VAD | 1-2 min | 2-4 min | [U] small model, no source measured |
| sherpa-onnx diarization int8 (4 threads) | 3-10 min | 6-20 min | RTF 0.11-0.30 at 1 thread on unstated HW [V]; scaling to threads/i5 [U] |
| Protocol scan (ASR first 10-15 min) | 3-8 min | 3-8 min | depends on ASR model chosen [U] |
| Embeddings for enrollment + labelling | 1-3 min | 2-5 min | [U] |
| Total non-ASR | ~9-25 min | ~15-40 min | |

Conclusion: for 2 h recordings the non-ASR part alone can eat the 30-45 min budget at the slow end. Mitigations: sherpa int8 with a coarser stride,
skip diarization on per-speaker tracks, run ASR on VAD speech only, pick a smaller/turbo ASR model (open question 1).

## 2. Topic 1: CPU diarization

| Option | CPU speed | Quality | Licence | Verdict |
|--------|-----------|---------|---------|---------|
| sherpa-onnx offline diarization (pyannote-seg-3.0 ONNX + 3D-Speaker or NeMo TitaNet-small) | RTF 0.119 (TitaNet fp32) / 0.110 int8; 0.297 / 0.241 with 3D-Speaker eres2net; 1 thread, 56.9 s file, HW not stated [V: k2-fsa docs] | Same segmentation as pyannote 3; embeddings are zh-cn (3D-Speaker) and English (TitaNet), none Arabic-trained [V names, U effect] | Code Apache-2.0 [U]; seg model ships a LICENSE whose terms are not shown [V]; Reverb variant non-commercial [V] | RECOMMENDED primary. Try swapping in WeSpeaker ResNet34 (multilingual VoxCeleb) if ONNX export works [U] |
| `diarize` pip package (Silero VAD + WeSpeaker ResNet34-LM ONNX + GMM-BIC + spectral clustering) | RTF 0.12 CPU, HW not stated, self-reported [V] | VoxConverse dev ~4.8% DER (own eval, 216 files); AMI preliminary 14.96%; no overlap modelling; speaker count degrades above 7 [V] | Apache-2.0, deps MIT/Apache/BSD [V] | Strong second: easiest drop-in, but v0.1.2 is young, no overlap, label switching on noisy audio [V]. Spike it |
| pyannote.audio community-1 (4.x) | No official CPU RTF [V]. Third-party: pyannote "free" 0.86 on CPU [S: diarize page]; 3.1 on M2 Pro 1.74 [S]; stride-3 trick takes M4 CPU from 1.84 to 0.22 on AMI [V: arXiv 2606.08505] | Best open DER set published: AMI IHM 17.0, AMI SDM 19.9, AliMeeting 20.3, AISHELL-4 11.7, DIHARD3 20.2 (no collar, overlap scored) [V: HF card]. Arabic 15.57% DER in one 5-system real-conversation test [V: soniqo.audio, secondary] | CC-BY-4.0, gated on HF, token needed to download [V] | Quality reference and fallback; too slow at default stride here. Only with the stride-3 + relative-min-cluster recipe [V paper, U on i5] |
| WhisperX diarization | = pyannote community-1 + ASR glue; no CPU number [V] | Overlap "not handled particularly well" [V] | BSD-2 [V]; models gated, HF token [V] | Not as a pipeline (couples us to its ASR). Take the word-to-speaker alignment idea only |
| NVIDIA Sortformer (NeMo) | CPU feasibility not stated in anything I found [U] | 4-speaker cap [V]; Arabic DER 17.9 offline [V: soniqo] | NVIDIA open model licence [V: HF card listing] | Reject: speaker cap (meetings exceed 4), GPU-first |
| NVIDIA Nemotron 3 diarization (8 speakers) | Apple-silicon runtimes only in the benchmark [V] | Arabic DER 16.5-18.2 [V: soniqo] | Not stated [V] | Watch; vendor-page claims [U] |
| diart (streaming) | Per-model latency 11-26 ms on Ryzen 9, not end-to-end [V] | Online is worse than offline [U]; no enrollment [V] | MIT [V]; models gated [V] | Reject: we are offline |
| SpeechBrain ECAPA embeddings + own clustering | Small model, fast [U] | EER 0.73% Vox1-O for the ECAPA/WeSpeaker class [V: VoxSRC23 baseline] | Apache-2.0 [U] | Embedding option, not a diarizer |
| 3D-Speaker toolkit | not measured here | Public checkpoints are Mandarin zh-cn; no Arabic eval found [V] | Apache-2.0 [V] | Reject as embedding for Arabic (training-language mismatch) |
| DiariZen (WavLM + Conformer, pyannote clustering) | WavLM front end is heavy on CPU [U] | Beats pyannote 3.1 on AMI/AliMeeting in paper; 13.3% vs hosted pyannoteAI 11.2% in a 2026 benchmark [V: arXiv 2409.09408, 2509.26177] | Not found [U] | Watch; revisit if a GPU ever appears |

Caveat: DER depends on collar/overlap policy. Community-1's table scores overlap with no collar [V]; many others skip overlap, so cross-source comparison is unsafe.

## 3. Topic 2: speaker identification by enrollment

Design (my synthesis; no source describes self-introduction enrollment end to end [U]):

1. Protocol scan finds the introduction span. Each introduction = one diarized turn (or a run by one cluster) with an extracted name.
2. Enrollment embedding = mean of embeddings of that turn's speech-only windows (VAD, drop overlapped frames). Aim for >=10 s clean; pyannoteAI advises
   clips up to 30 s, >=10 s, no overlap, music or noise [V: pyannote.ai blog]. Our intros may be 4-8 s [U]: ask attendees for ~15 s (protocol change, see open questions).
3. Labelling: cosine between each diarized cluster centroid (not each short turn) and each voiceprint; exclusive one-to-one assignment (Hungarian);
   below threshold keep "Unknown-N", never force a name [V: same blog; `exclusive` default on, absent speakers create low-confidence matches].
4. Threshold is model-specific: sources show 0.75 (one tool) vs 0.25 (an ECAPA tutorial); calibrate on our own pairs, do not hard-code [V: search results, U on the tools].
5. Embedding choice: WeSpeaker ResNet34 EER 0.723 / 0.867 / 1.532% on Vox1-O/E/H with cosine + mean subtraction [V: arXiv 2306.15161]; ECAPA-TDNN 0.728 / 0.929 / 1.721% [V].
   Both trained on VoxCeleb (multilingual celebrities, little Arabic [U]); expect worse on far-field table audio and short clips [U].
   Allow re-enrolment from later clean turns once clusters are trusted.
6. Shared mic, several people: a track is not an identity. Diarize inside the track, match clusters to names the same way.
   Remote speakers on one capture channel are separate clusters, but codec/line-noise shifts embeddings: enroll each remote person from their own intro in the same session [U].
7. Failure modes to log, not hide: two intros matching the same cluster (merge suggestion); a cluster matching no intro (late joiner, "Unknown-N"); a cold or near-field intro.

| Option | CPU speed | Quality | Licence | Verdict |
|--------|-----------|---------|---------|---------|
| Own enrollment on WeSpeaker ResNet34 / ECAPA embeddings, cosine + Hungarian | fast, embedding per few seconds [U] | EER <1% clean VoxCeleb [V], degrades far-field/short [U] | Apache-2.0 (WeSpeaker via diarize page [V]) | RECOMMENDED |
| sherpa-onnx speaker-id manager (extractor + register/search) | fast [U] | same embeddings; Python API names not confirmed in my fetches [U] | Apache-2.0 [U] | Good for storage/search; verify API |
| pyannoteAI voiceprint/identify API | cloud | n/a | commercial hosted; audio leaves the machine | Reject (local-only tool, client data) |
| Order-of-introduction only (nth intro = nth new cluster) | free | brittle (talk-over breaks order) | n/a | Prior for Hungarian only |

## 4. Topic 3: overlap detection and separation

| Option | CPU speed | Quality | Licence | Verdict |
|--------|-----------|---------|---------|---------|
| pyannote segmentation-3.0 / community-1 powerset overlap detection (frame-level, same pass) | no extra cost [V: pyannote blog] | overlap is 9.3% of the benchmark corpus on average, more in the hardest domains [V]; counted in DER [V] | seg-3.0 MIT [U]; community-1 CC-BY-4.0 [V] | RECOMMENDED for detection; keep overlap flags in output |
| `exclusive_speaker_diarization` output (community-1) | free | one speaker per instant, simplifies ASR alignment [V: HF card + blog] | CC-BY-4.0 [V] | Use for word attribution if pyannote is in the pipeline |
| MossFormer2_SS_16K (ClearerVoice-Studio) | RTF 0.053, hardware not named [V: paper summary]; i5 CPU RTF [U] | WSJ0-2mix class results, not Arabic far-field meetings [U] | Apache-2.0 per a mirror; official card not confirmed [V weak] | Candidate for flagged overlap regions only; benchmark first |
| SepFormer (SpeechBrain) | learned-encoder variant >900 ms CPU for a 10 s clip, secondhand [V weak] | 2-speaker training; weak for 3+ speakers [U] | Apache-2.0 [U] | Reject as default |
| CSS front end (TF-GridNet etc.) as in CHiME-8 NOTSOFAR | GPU-class [U] | Top CHiME-8 single-track entries used TF-GridNet CSS then Whisper large-v2 [V: ISCA papers] | research code | Reject: GPU, array geometry |
| Flag "[overlap]" in the transcript, do nothing else | zero | honest; Whisper drops or blends one speaker in overlap [V: pyannote blog] | n/a | DEFAULT. Report overlapped seconds per source |

Evidence note: separation that raises PSNR can still raise WER (next section).

## 5. Topic 4: audio "voice engineering" before ASR

Evidence that enhancement can hurt Whisper:

- arXiv 2512.17562 (Dec 2025): MetricGAN+ denoising before Whisper, Parakeet, Gemini Flash 2.0, Parrotlet-a; the noisy original had lower semWER than enhanced in all 40 configurations, degradation 1.1-46.6 points absolute (medical English) [V].
- arXiv 2603.04710 (Mar 2026): SAM-Audio before Whisper, Bengali + English; WER rose in every model/dataset: Bengali large-v3 65.83 -> 77.35, English base 10.53 -> 21.66, even though PSNR rose [V].
- Counter-evidence: single-channel denoising gave >30% relative WER cut on CHiME-4 with non-Whisper ASR [S: search summary of Kinoshita et al.].
- Neither study covers Arabic or far-field table recordings; both are preprints, peer review not checked [V].
- No controlled benchmark of arnndn vs afftdn vs loudnorm on Whisper WER was found; sources are practitioner posts [V].

| Option | CPU speed | Quality for Whisper | Licence | Verdict |
|--------|-----------|---------------------|---------|---------|
| Resample 16 kHz mono (Whisper's native rate) | trivial | neutral, required | ffmpeg LGPL/GPL | Always |
| High-pass 80 Hz (`highpass=f=80`) | trivial | cuts rumble/handling noise; practitioner default [S: blogs] | n/a | Always |
| Loudness: 2-pass `loudnorm` (linear) or `dynaudnorm` | 1-2 min/h [U] | single-pass loudnorm can pump and hurt ASR [S: guide]; helps quiet far-field speakers [U] | n/a | Default ON, 2-pass; A/B vs off on our audio |
| ffmpeg `arnndn` (RNNoise, needs a model file) | very fast [U] | blog says "works better" than afftdn but unmeasured on WER [S: pyvideotrans]; aggressive settings may hurt [S] | RNNoise BSD [U] | Off by default; A/B candidate for table-mic audio |
| ffmpeg `afftdn` (nr 12, nf -50, `tn` tracking) | fast | milder, artefacts at high nr [V: ffmpeg docs param list] | n/a | Off by default; fallback if the arnndn model is missing |
| DeepFilterNet | DFN2 RTF 0.04 on a notebook i5; DFN1 0.19 on i5-8250U single thread [V: papers]; CLI binary takes 48 kHz wav only [V] | speech-oriented 48 kHz; could remove cues Whisper needs (by analogy to 2512.17562) [U] | MIT or Apache-2.0 [V] | A/B candidate only; needs resample to 48 kHz and back |
| Demucs (htdemucs) | M1 Ultra CPU 11.5x real time on a Core ML port; generic-CPU rule of thumb 1.5x duration [S weak]; ~1-2 h per 1 h audio on this i5 [U] | music stem separation, not speech enhancement; SAM-Audio result suggests no gain [U] | MIT [U] | Reject |
| De-reverb (WPE) | CPU-heavy per minute [U] | helps far-field ASR in literature [U]; no Whisper evidence found | MIT for common impls [U] | Not default; test only on very reverberant recordings |
| Silero VAD before ASR (cut silence) | fast | reduces Whisper silence hallucination [U] | MIT [V] | ON; also feeds diarization |

Policy: keep raw and processed copies. Build a 10-minute labelled sample per recording type and measure WER and DER before turning any denoiser on.

## 6. Topic 5: multitrack with ffmpeg/ffprobe

Standard ffmpeg/ffprobe behaviour from my knowledge; I could not fetch the filter-doc sections (page truncated), so re-check option names before coding [U]:

- Probe: `ffprobe -v error -show_streams -select_streams a -of json file` gives per stream `index`, `channels`, `channel_layout`, `sample_rate`, `duration`, `tags.title|language|handler_name`. Recorder exports sometimes name tracks after participants [U].
- Per-stream extract: `-map 0:a:N -ac 1 -ar 16000`. Per channel of a stereo stream: `channelsplit=channel_layout=stereo[L][R]` or `pan=mono|c0=c0` / `c0=c1`.
- Check that a track really is one person:
  1. Fake stereo: L/R correlation above ~0.98 means one mono mix duplicated, treat as one track [U threshold].
  2. Per-person tracks: speech energy of track X dominates the others inside its VAD spans (bleed ratio); if dominance exceeds ~10 dB for >90% of spans, track = identity [U thresholds].
  3. A mix in disguise (all tracks active together): diarize the mix.
- Use track identity only after that test passes. Label = track tag name, else the name from the intro whose time span overlaps the track's VAD.
- Mixed case (room mic + remote tracks): diarize the room track, trust the others.
- Video with several audio streams: choose by tags, then channel count, then energy; keep all as sources and report which were used.
- Always `-vn`; use pcm_s16le wav intermediates, no lossy re-encode.

## 7. Topic 6: detecting protocol markers

No published work on this protocol was found; the design is mine [U]. Cheap signals, so it fits the budget:

| Marker | Signals (combine) | Notes |
|--------|-------------------|-------|
| Start: title / purpose / type by the company leader | First speech turns; ASR of the first 3-5 min; AR cues "اجتماع", "عنوان", "هدف", "نناقش", "جلسة"; EN "meeting", "purpose", "agenda" | Normalise alef/hamza/tashkeel/tatweel before matching |
| Introductions | Run of short turns (5-20 s) by distinct clusters in the first ~10% of the recording; cues "أنا", "اسمي", "معكم", role words, EN "my name is", "I am ... from" | ASR misspells spoken Arabic names: keep ASR spelling and ask the user to confirm [U] |
| Stage pause | Silence/gap >= N s (suggest 8-15 s, calibrate) with no turn, often followed by a long monologue [U] | Rooms differ: use a per-recording percentile, not a fixed value |
| Client summary | Longest single-speaker turn after a pause, low overlap, speaker = the client's enrolled voice; cues "ملخص", "خلاصة", "اتفقنا", "النقاط", EN "to summarise", "so we agreed" | Exclusive diarization helps |
| Interruptions inside a summary | Overlap flags inside the span | Report them, do not silently clean |

Protocol change recommendation (cheap, large gain) [U]: say a fixed phrase at the start and end of each pause/summary ("بداية الملخص" / "نهاية الملخص"), add a one-second beep or clap at each stage boundary if possible,
and ask each attendee for a full-sentence introduction of about 15 s, name said once in Arabic and once in English.

## 8. Open questions

1. ASR budget: which Whisper size/backend fits 2 h in the remaining ~15-30 min on this CPU? large-v3 int8 at ~RTF 2.5 on an i9-12900K [S] is out of reach; test turbo / medium / small and ASR-on-speech-only. Outside this brief but it drives everything above.
2. Measure RTF here: sherpa-onnx (int8, 4-6 threads), `diarize`, pyannote community-1 at stride 1 and 3, on one 30-min real recording. No number in this document comes from this laptop.
3. Which embedding for Arabic: WeSpeaker ResNet34, ECAPA, TitaNet or 3D-Speaker? Needs a small Arabic-dialect same/different-speaker test; I found no public Arabic-dialect speaker-ID benchmark.
4. Is the sherpa-onnx `pyannote-segmentation-3-0` conversion MIT like the original? The docs show a LICENSE file only [V]; read it before bundling.
5. Gated pyannote weights: download with the user's token at first run vs bundling (community-1 is CC-BY-4.0 but gated) [V]. Business-Wrap must not ship weights in a public repo.
6. Can we ask attendees for >=15 s clean self-introductions? It sets enrollment quality directly.
7. Far-field table audio: nearest proxies are AMI SDM 19.9% and AliMeeting ch.1 20.3% DER [V] and Arabic 15.6% on conversation data [V weak]; none match our rooms.
8. Is separation worth running on flagged overlaps at all? Needs a WER A/B on 5-10 real overlapped clips; CHiME-8 wins used arrays and GPU [V].
9. Online-meeting recordings with a shared mic: is remote audio a separate channel in our files or already mixed? It decides diarization vs track identity.
10. DiariZen and Nemotron 3 diarization: licence and CPU speed unknown; re-check in a later pass.

## 9. Sources (retrieved 2026-11-12)

- pyannote community-1 card: https://huggingface.co/pyannote/speaker-diarization-community-1
- pyannote overlap/separation blog: https://www.pyannote.ai/blog/overlapping-speech-and-speaker-separation-the-hardest-problem-in-diarization
- pyannoteAI speaker identification: https://www.pyannote.ai/blog/speaker-identification-system-recurring-meetings
- sherpa-onnx diarization models/RTF: https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/models.html
- sherpa-onnx speaker identification: https://k2-fsa.github.io/sherpa/onnx/speaker-identification/index.html
- diarize package: https://pypi.org/project/diarize/
- Fast on-device diarization (stride, CPU RTF): https://arxiv.org/html/2606.08505
- Multilingual diarization benchmark (Arabic DER): https://soniqo.audio/benchmarks/diarization
- Benchmarking Diarization Models: https://arxiv.org/html/2509.26177v1
- DiariZen paper: https://arxiv.org/pdf/2409.09408
- WhisperX: https://github.com/m-bain/whisperX
- diart: https://github.com/juanmc2005/diart
- NVIDIA Sortformer card: https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1
- 3D-Speaker: https://github.com/modelscope/3D-Speaker
- WeSpeaker VoxSRC2023 baselines: https://arxiv.org/html/2306.15161v1
- Short-segment speaker verification: https://arxiv.org/pdf/2509.19721
- MossFormer2 / ClearerVoice-Studio: https://huggingface.co/alibabasglab/MossFormer2_SS_16K , https://arxiv.org/html/2506.19398v1
- DeepFilterNet: https://github.com/Rikorose/DeepFilterNet , https://arxiv.org/abs/2205.05474 , https://arxiv.org/pdf/2305.08227.pdf
- Enhancement hurts ASR: https://arxiv.org/abs/2512.17562 , https://arxiv.org/abs/2603.04710
- CHiME-8 NOTSOFAR-1 systems: https://arxiv.org/html/2409.02041v2
- ffmpeg preprocessing practice: https://en.pyvideotrans.com/blog/ffmpeg-nosie , https://steeman.be/posts/local-whisper-transcription-with-speaker-diarization/
- ffmpeg filters (afftdn only read): https://ffmpeg.org/ffmpeg-filters.html
- faster-whisper CPU RTF (blog): https://dev.to/jovan_chan_9500711396d4e6/self-host-whisper-large-v3-as-a-transcription-server-in-2026-faster-whisper-fastapi-3d9g
- Demucs CPU notes: https://huggingface.co/slaughters85j/htdemucs-coreml
