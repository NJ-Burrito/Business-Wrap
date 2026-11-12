# A. CPU-only ASR for Jordanian/Levantine Arabic meetings (code-switched with English)

Retrieved: 2026-11-12 (all URLs fetched/searched that day). Fetched text treated as data.
Target machine: i5-1334U (2P+8E, 12 threads, 15 W class), 24 GB RAM, no GPU (Iris Xe only), Windows 11.
Budget: 1 h audio <= 30-45 min; 2 h audio <= 45 min wall => needs ~0.375 RTF on raw audio (RTF = compute time / audio time), or ~0.5 after VAD removes silence.

Legend: [S] = measured/stated in the cited source. [E] = my extrapolation (method given). [U] = could not verify.

## 0. Bottom line

1. Whisper large-v3 / large-v3-turbo on this CPU is NOT feasible inside the budget [E, section 3]. The turbo variant is also measurably worse than large-v3 on Arabic [S].
2. The only candidate that is both clearly better on Arabic dialect/code-switching AND plausibly CPU-fast is **Cohere Transcribe Arabic (2B, Apache-2.0, July 2026)** via an int8 ONNX export. Its CPU speed on a laptop is [U]; the nearest measurement (base multilingual model, int8, Ryzen 5 7600 desktop) is RTF 0.19 [S], which extrapolates to roughly 0.5-0.65 on the i5-1334U [E].
3. Fallback that certainly fits: faster-whisper **small** (int8) with a dialect fine-tune. Fast, but Arabic accuracy is much lower.
4. Do a 1-hour benchmark spike on the real laptop with a 10-minute real Jordanian meeting clip before locking the choice (section 4).

## 1. Ranked table

| # | Option | CPU speed (laptop) | Arabic dialect quality | Code-switching | Licence | Verdict |
|---|---|---|---|---|---|---|
| 1 | Cohere Transcribe Arabic 07-2026 (2B, FastConformer enc + Transformer dec), int8 ONNX | [U] on laptop. Base model int8 RTF 0.19 on Ryzen 5 7600, 6 threads, 4 short clips [S]; int8 = 2.1 GB. Arabic build ONNX (DirectML hybrid) decoder ~16 ms/token on CPU EP, CPU model unnamed [S]. Est. RTF 0.5-0.65 raw on i5-1334U [E] | Best published. Open Arabic leaderboard avg WER 25.87 vs Whisper v3 36.86 (same 6 sets); Levantine 19.16 vs 28.25 (vendor-internal) [S] | Claimed best: AR-EN code-switched WER 27.84 vs Whisper v3 36.90 (vendor-internal); but card also says "inconsistent performance on code-switched audio"; needs language tag `ar`, English as embedded language [S] | Apache-2.0 [S] | **Primary candidate, pending spike.** No timestamps, no diarization, no hotword/prompt API documented [S] |
| 2 | Cohere Transcribe 03-2026 (base, 14 languages) int8 ONNX via `onnx-asr` (pip) | Same RTF 0.19 as row 1 (this is the model measured) [S] | Leaderboard avg 30.67 WER (vs 25.87 for Arabic build) [S] | Not published separately [U] | Apache-2.0 [S] | **Easiest spike**: `onnx_asr.load_model("OpenVoiceOS/cohere-transcribe-2b-onnx", quantization="int8")`, clips < ~30 s, no auto-chunking [S] |
| 3 | faster-whisper small int8 + Arabic dialect fine-tune (e.g. Laith05/roma-whisper-small-levantine, NADI-2025 Jordan+Palestine; oddadmix small-dialectal) | small int8 beam5 on i7-12700K 8 thr: 13 min audio in 1m42s = RTF 0.13 [S, derived]. Est. RTF 0.25-0.4 on i5-1334U [E] | Jordan/Palestine small fine-tune: only eval loss 0.5629 published, no WER [S]. oddadmix small: WER 0.428 vs 0.77 zero-shot on its 932-clip set [S] | Weak; Whisper forced to `ar` transliterates English. Bias via prompt (section 5) | Whisper MIT [S]; oddadmix Apache-2.0 [S]; Laith05 licence [U] | **Safe fallback** that fits budget; quality ceiling low |
| 4 | faster-whisper medium-size dialect fine-tune (oddadmix medium, 769M) | [U] no CPU benchmark. Est. RTF ~1 on i5-1334U [E] | WER 0.358 vs 0.717 zero-shot (932 clips, private data, leakage possible) [S] | Weak | Apache-2.0 [S] | Too slow for 2 h; usable only for the low-confidence re-pass |
| 5 | Whisper large-v3-turbo (CT2 int8) incl. oddadmix turbo-dialectal | [U] no Intel-laptop CPU number found. Est. RTF 1.4-2.1 [E] | Zero-shot worse than large-v3: avg WER 40.05 vs 36.86; Common Voice 25.73 vs 17.83 [S, arXiv 2504.12254]. oddadmix FT: 0.344 vs 0.590 zero-shot [S] | Weak | MIT / Apache-2.0 [S] | Not feasible on CPU in budget; fine on any GPU |
| 6 | Whisper large-v3 (and HebArabNlpProject/whisperLevantine, 1,200 h Israeli Levantine, WER 33% on its test set, CT2-converted) | Third-party shootout: faster-whisper large-v3 ~2x real-time on i5-13400F [S, secondary, flagged]. i5-1334U slower [E] | Best of Whisper family on Arabic, still avg WER 36.86 [S] | Weak | MIT / Apache-2.0 [S] | Not feasible in budget. whisperLevantine card is 8 kHz Israeli dialect; the closest-dialect open model but large |
| 7 | whisper.cpp (+OpenVINO encoder, Intel iGPU) | whisper.cpp small fp32 2m05s vs OpenVINO build 1m45s on i7-12700K (device not stated) [S]. README says encoder can run on Intel GPUs incl. integrated [S]; no Iris Xe timing anywhere [U] | Same as Whisper | Same | MIT | Worth a 20-min spike only for the iGPU; expected gain unproven. Windows build needs OpenVINO + CMake (more setup than pip) |
| 8 | OpenVINO GenAI `WhisperPipeline` (HF `OpenVINO/whisper-large-v3-*-ov`), device "GPU"/"CPU" | No Iris Xe benchmark published [U]. Word timestamps need the flag at construction/export [S, docs] | Same as Whisper | Same | Apache-2.0 (card) | Optional spike alongside row 7 |
| 9 | Moonshine tiny-ar (27M) | Very fast (paper claims 5-15x faster than same-size Whisper; baseline unconfirmed [S]) | CER ~25-27% on FLEURS Arabic (CER, not WER) [S]; no dialect data | Claims code-switching support [S] | Moonshine AI Community License: non-commercial / < US$1M revenue [S, HF GGUF card]; another mirror says MIT (conflict) | No: accuracy too low, licence restrictive |
| 10 | NVIDIA FastConformer-Hybrid Large (ar) 115M | Small, should be fast [E] | MASC 16.67 / MCV 25.60 / FLEURS 12.94 WER (mirror page, table ambiguous) [S, unverified] | None | CC-BY-4.0 (mirror, [U]) | Candidate only for MSA-heavy audio; MSA/diacritized output. Canary/Parakeet v2/v3 do NOT cover Arabic (25 European languages) [S] |
| 11 | SeamlessM4T large v2 | 2.3B, slow [E] | avg WER 38.16 vs Whisper v3 36.86 [S] | n/a | [U] (believed non-commercial) | No |
| 12 | Meta MMS | Not researched in depth [U] | Not researched [U] | n/a | [U] | No: not evaluated; Arabic dialect coverage and licence unconfirmed |
| 13 | sherpa-onnx | Runs Whisper ONNX models; Windows x64 wheels exist on PyPI [S, 1.10.x listing] | No Arabic-specific or dialect model found [U] | Same as Whisper | [U] | Skip: no model advantage over faster-whisper |

## 2. Evidence notes (the numbers that drive the ranking)

- Cohere Transcribe Arabic: 2B params, Arabic+English, Apache-2.0, leaderboard avg WER 25.87 (SADA 37.47, CV 5.82, MASC clean 19.60, MASC noisy 27.07, MGB-2 15.54, Casablanca 49.71). Levantine 19.16 (internal) vs Whisper v3 28.25. RTFx 525 vs 146 (hardware unnamed, vLLM-optimised, so GPU). "Timestamps and speaker diarization are not supported." https://huggingface.co/blog/CohereLabs/cohere-transcribe-arabic-07-2026-release ; https://huggingface.co/CohereLabs/cohere-transcribe-arabic-07-2026 ; https://cohere.com/blog/transcribe-arabic (2026-07-07). All numbers are vendor-reported.
- Independent fine-tune comparison on the same 932-clip held-out set (Lebanese/Syrian included, private, leakage warning in the card): Cohere-Arabic zero-shot 0.457, fine-tuned 0.357; whisper-large-v3-turbo 0.590 -> 0.344; medium 0.717 -> 0.358; small ~0.77 -> 0.428. https://friendli.ai/models/oddadmix/cohere-transcribe-arabic-07-2026-dialectal ; https://huggingface.co/oddadmix/whisper-large-v3-turbo-arabic-dialectal . Takeaway: zero-shot Cohere beats zero-shot Whisper by a wide margin; a fine-tuned Whisper turbo catches up, but turbo does not fit the CPU budget.
- Batching warning: padded batches degrade the Cohere fine-tune (WER 0.45 -> 0.65+); decode one clip at a time. Same card.
- Whisper family on Arabic (greedy, no LM): large-v3 avg WER 36.86, turbo 40.05, SeamlessM4T v2 38.16. https://arxiv.org/html/2504.12254 (arXiv 2025-04).
- No published Jordanian-specific WER found. Open Arabic ASR leaderboard https://arxiv.org/abs/2412.13788 (2024-12) covers dialect sets, SADA is mostly Saudi. The Arab Voices paper (https://arxiv.org/abs/2601.13319) reportedly has a per-dialect table but I could not extract it [U].
- CPU data: faster-whisper README, i7-12700K 8 threads beam 5, 13-min file, small model: faster-whisper int8 1m42s; batch 8 int8 51s; whisper.cpp fp32 2m05s; whisper.cpp OpenVINO fp32 1m45s; openai-whisper fp32 6m58s. https://github.com/SYSTRAN/faster-whisper
- Cohere base int8 ONNX RTF: mean 0.19 (int8) vs 0.30 (fp32), Ryzen 5 7600, OMP_NUM_THREADS=6, 4 clips (6-16 s, English/Portuguese only); int8 files 2.1 GB (encoder 1.91 GB). https://huggingface.co/OpenVoiceOS/cohere-transcribe-2b-onnx
- Cohere Arabic ONNX (community, DirectML-optimised, int8 decoder "dyn" variant faster on CPU): ~16 ms/token on CPU EP vs 3.5 ms/token DirectML on RTX 3080 Ti; encoder-DML + decoder-CPU hybrid; no RTF given. DirectML also targets Intel iGPUs, so the encoder could run on Iris Xe [E, untested]. https://huggingface.co/Masterx/cohere-transcribe-arabic-07-2026-ONNX
- Unofficial PyPI batch package states full-model CPU inference "not validated" for the Arabic release [S via search summary]. https://pypi.org/project/cohere-transcribe-arabic/
- A secondary "shootout" page (June 2026) lists whisper.cpp large-v3 ~15x vs faster-whisper large-v3 ~2x on i5-13400F; the 15x figure is almost certainly not CPU-only (inconsistent), treat as unreliable. https://www.promptquorum.com/power-local-llm/local-whisper-stt-comparison
- Whisper turbo = pruned large-v3, decoder 32 -> 4 layers, 809M, MIT. https://huggingface.co/openai/whisper-large-v3-turbo . Encoder is unchanged, so on CPU (encoder-dominated for short segments) turbo is not ~6x faster than large-v3; the 5-8x GPU headline does not transfer [E].

## 3. How the CPU estimates were made [E]

- Anchor A: faster-whisper small int8, beam 5, i7-12700K = RTF 0.13. Whisper large-v3 encoder is ~7x small's encoder compute; turbo keeps that encoder plus a 4-layer decoder, so turbo ~5-6x small => RTF ~0.7 on the 12700K.
- Machine factor: 15 W i5-1334U (2P+8E) vs 125 W 12700K (8P+4E): I assume 2-3x slower sustained [U, no benchmark fetched; this is the biggest uncertainty].
- Result: small int8 RTF 0.26-0.4; turbo/large-v3 RTF 1.4-2.1; Cohere int8 (0.19 x 2.5-3.5) RTF 0.5-0.65.
- Silence: meeting recordings are typically 20-40% non-speech [U, assumption]; VAD removes it before decoding.

| Pipeline on this laptop [E] | 1 h audio | 2 h audio | Fits 45 min? |
|---|---|---|---|
| Whisper large-v3-turbo int8 | 60-125 min | 2-4 h | No |
| Whisper small-dialect int8, VAD | 10-25 min | 20-50 min | Yes |
| Cohere int8 ONNX, VAD (speech 65%) | 20-40 min | 40-80 min | 1 h yes; 2 h borderline |
| Cohere (VAD) + 2-process split across P/E cores | 15-30 min | 30-60 min | 2 h likely, if scaling holds [U] |

## 4. Recommended pipeline

0. **Spike first (about 1 h of work, decides everything):** take 10 min of real meeting audio with a hand-corrected 2-min reference. Run (a) `onnx-asr` Cohere 03-2026 int8, (b) the Masterx Arabic ONNX on CPU EP and on DirectML (Iris Xe), (c) faster-whisper small dialect fine-tune. Record RTF and WER/term-recall for each. Pick the model by: fits budget at measured RTF x 2 h x (1 - silence) <= 45 min AND beats (c) on WER.
1. **Normalise:** `ffmpeg -i in.* -ac 1 -ar 16000 -af "highpass=f=80,loudnorm" out.wav` (screen recordings: take the single mixed track; tabletop phone audio: loudnorm matters).
2. **VAD (Silero, speech/non-speech):** faster-whisper bundles Silero (`vad_filter=True`, params `min_silence_duration_ms`; default removes silences > 2 s) [S, README]. Use it standalone to cut segments of 5-28 s (cut at pauses, never mid-word; max 30 s for both Whisper and Cohere).
3. **Pass 1, fast:** primary model on all segments, greedy / beam 1 (Whisper) or single-clip greedy decode (Cohere; do not batch with padding). Language tag `ar`. Keep per-segment confidence (Whisper: `avg_logprob`, `no_speech_prob`, `compression_ratio` [S, Groq doc names the same fields]).
4. **Pass 2, selective:** re-decode only low-confidence segments (e.g. avg_logprob < -1.0, compression ratio > 2.4, or segments with > N Latin tokens) with the heavier model (Whisper medium/turbo dialect fine-tune, beam 5). Budget cap: stop pass 2 when total elapsed hits 85% of the budget and flag the rest `low-confidence` [E].
5. **Parallelism:** one model process per ~5 threads (2 processes) rather than one process on 12 threads; E-cores are slower, so give the big segments to the P-cores. Set `OMP_NUM_THREADS`/CT2 `intra_threads` explicitly; CT2 selects AVX2 etc. at runtime [S, CTranslate2 README]. Verify scaling in the spike [U].
6. **Glossary correction (see section 5)**, then merge segments with VAD-derived timestamps (segment-level is enough for requirements; Cohere has no word timestamps. Word-level only on the Whisper path with `word_timestamps=True` [S]).
7. **Checkpointing:** write each segment result to JSONL as soon as it finishes so a crash/resume re-runs only missing segments (project rule: checkpoints are files).

Install (uv, Windows): `uv pip install faster-whisper` (CTranslate2 wheels, no ffmpeg needed by faster-whisper itself, Python 3.9+, MIT) [S]; `uv pip install onnx-asr onnxruntime` for the Cohere ONNX path [S for onnx-asr usage; Windows not stated on the card, U]; HF `transformers` from source is needed for the original PyTorch Cohere weights [S] and PyTorch CPU of a 2B model is much slower than int8 ONNX [E].

## 5. Biasing toward English technical terms

- **Whisper/faster-whisper:** `initial_prompt="..."` conditions the first window only; `hotwords="..."` is placed in the prompt for every window (not a prefix, ignored if `prefix` is set; long text truncated). Both work in `BatchedInferencePipeline` too [S, transcribe.py source]. Prompt ceiling is ~224 tokens [S, Groq doc]. Write the prompt as a natural Jordanian sentence that contains the terms in Latin script, e.g. "اجتماع حول API و backend و workflow و dashboard و sprint" so the decoder keeps Latin script instead of transliterating [E, standard Whisper prompting practice, not benchmarked here].
- Set `multilingual=True` only if whole segments switch language; for intra-sentence code-switching keep `language="ar"` and rely on the prompt [E]. `condition_on_previous_text=False` reduces repetition loops [S].
- **Cohere:** no prompt/hotword interface documented [U]; the English terms come from the model's own code-switching training. Compensate with the post-correction below.
- **Post-ASR glossary pass (works for every model):** build a per-project term list (from the existing documents and the service names), generate Arabic-transliteration variants, fuzzy-match tokens (edit distance on transliterated skeleton) and replace with the canonical Latin term; log every replacement for review. Cheap, deterministic, model-independent [E].
- Diarization is not available in the local models above; if needed, a separate local diarizer (e.g. pyannote) is an open question [U, not researched].

## 6. Cloud fallbacks (OPTIONAL MODE ONLY: client audio leaves the machine; require explicit per-source consent)

| Service | Price / audio hour | Arabic dialect quality | Diarization | Notes |
|---|---|---|---|---|
| ElevenLabs Scribe v2/v3 | $0.20/h; keyterm prompting +$0.05/h [S, https://elevenlabs.io/pricing/api] | Vendor claim FLEURS Arabic WER 11.1% (Scribe v1) vs Whisper v3 17.0%, Gemini Flash 2 13.2% (other localised pages say 3.1%, unexplained) [S, https://elevenlabs.io/speech-to-text/arabic]; no Levantine number [U] | Page says v3 has the lowest diarization error tested [S]; speaker cap [U] | Retention terms for the standard tier not stated [U] |
| Groq Whisper | large-v3 $0.111/h, turbo $0.04/h; speed factor 189/216 [S, https://console.groq.com/docs/speech-to-text] | Same as Whisper (36.86 avg WER, turbo worse) | None | 25 MB / 100 MB file limit (chunk or URL), prompt <= 224 tokens, word timestamps, returns confidence fields |
| Deepgram Nova-3 | Multilingual $0.31/h pay-go, $0.26/h Growth; keyterms +$0.078/h (0.0013/min) [S, https://deepgram.com/pricing] | Arabic not named on the pricing page [U] | Included for pre-recorded [S] | Confirm Arabic/ar-JO in the language docs |
| Gemini audio | ~25 tokens/s => 90k tokens/h; at $1/1M ~ $0.09/h [E from search summary, https://ai.google.dev/gemini-api/docs/pricing]; a "Gemini 3.5 Transcribe" listing shows $0.003-0.005/min (conflicting, aggregator) [U] | Vendor claim FLEURS 13.2% (Gemini Flash 2, via ElevenLabs page); no Levantine data [U] | Prompt-driven, unreliable [U] | Up to ~8.4 h per prompt on Vertex docs [S via search]; prompt-based glossary is strong |
| Google Chirp 3 | ~$0.016/min = ~$0.96/h (third-party; primary page row not confirmed) [U, https://cloud.google.com/speech-to-text/pricing/] | [U] | Yes, BatchRecognize [S via search] | Check ar-JO support |
| Azure Speech | Not found [U]; one aggregator quotes $0.30/h per add-on feature (diarization etc.), streaming context | ar-JO exists as a locale [U, not verified] | Add-on | Check batch price page |
| Cohere hosted | Not researched [U] | Same model as row 1 | None | Would not need local CPU but still leaves the machine |

Recommendation for the tool: default local; optional cloud switch off by default, with a warning that audio leaves the machine and a per-source "allow cloud" flag.

## 7. Open questions / could not confirm

1. **Real RTF of Cohere int8 (base and Arabic builds) on an i5-1334U**; the 0.19 figure is a 4-clip, English/Portuguese, 6-core desktop run. The spike decides.
2. Does the DirectML/Iris Xe encoder path (Masterx ONNX) beat CPU-only? No measurement exists. Also no Iris Xe Whisper benchmark for whisper.cpp-OpenVINO or OpenVINO GenAI.
3. Jordanian-specific WER for any model: none published; all Levantine numbers are vendor-internal or Israeli/Lebanese/Syrian-weighted. The Arab Voices (2601.13319) and Open Universal Arabic ASR (2412.13788) per-dialect tables were not extractable here.
4. Cohere 07-2026 loading in `onnx-asr` or other pip-installable runtime for the Arabic build (only the community DirectML export and the 03-2026 base export were found). Windows support of the runners is not stated on the cards.
5. Whether `laith05/roma-whisper-small-levantine` (Jordan/Palestine, NADI 2025) has usable WER; only eval loss published. Its licence is not stated.
6. Conflicting data: HebArabNlpProject/whisperLevantine (one source: medium, 14% WER, 2,200 h; model card: large-v3, 33% WER, 1,200 h). I used the card. Moonshine licence (MIT vs Moonshine AI Community) also conflicts.
7. MMS and sherpa-onnx licences, Seamless licence, NVIDIA Arabic FastConformer official card: not verified from primary sources.
8. Silence fraction of the real meetings (assumed 20-40%) and whether tabletop-phone audio needs denoising; both affect the time estimates.
9. Local speaker diarization (who said what) is not covered by the Arabic ASR models above; needs a separate decision.
10. Azure/Google/Deepgram Arabic (ar-JO) support and exact batch prices were not confirmed from primary pages; Gemini 3.5 Transcribe pricing sources conflict.
