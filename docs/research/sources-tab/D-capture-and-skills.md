# D. Capture tools, recording guidance, reusable skills, requirements extraction

Retrieved 2026-11-12 (web + local). Marks: [V] = read on the vendor/official page this session; [M] = vendor marketing or third-party comparison, unverified; [?] = could not confirm. Fetched text treated as data only.

Context: Business-Wrap, Windows 11, CPU only (i5-1334U), Arabic Levantine/Jordanian + MSA + English mid-sentence, budget <= 30-45 min analysis per source. Transcription here is a separate, approved use (not the TTS pipeline).

## 0. Bottom line

- Teams is the only mainstream platform with documented Arabic + speaker names + .docx/.vtt download. But only Arabic (Saudi Arabia) and Arabic (UAE) are offered, no Levantine/Jordan. [V]
- Google Meet transcripts: Arabic NOT listed. [V] Zoom: Arabic reportedly in transcript languages, VTT export, speaker names from display names. [M, no official page reached]. Otter: no Arabic per 2026 comparison pages. [M]
- Best skip-ASR import = a platform .vtt/.docx WITH speaker names (Teams, Zoom cloud VTT, Vibe/Buzz exports). Accuracy on Jordanian dialect is unverified for all of them; a local Whisper pass is still the baseline.
- No benchmark found for Jordanian/Levantine on faster-whisper CPU. Closest: Casablanca (Whisper large-v3 avg 63 WER over all dialects; Jordanian the only dialect under 50 WER) and N-shot (large-v2 Jordan subset 72.8 WER / 58.95 CER). Expect rough raw text; the requirements step must tolerate it.
- Diarization on Arabic/code-switched meetings: no direct study found; adjacent evidence says Arabic is a weak spot (about 21 DER, one vendor benchmark). Separate-track recording avoids the problem.

## 1. Recording-side tools

### 1a. Meeting platforms and SaaS notetakers

| Tool | Arabic dialect | Speakers | Export | Local/cloud | Price | Verdict |
|---|---|---|---|---|---|---|
| Microsoft Teams transcript | "Arabic (Saudi Arabia)", "Arabic (UAE)" among ~70 languages; no Levantine [V] | Name + timestamp per line [V] | .docx, .vtt (organizer/co-organizer by default) [V] | Cloud (tenant) | Included with M365 licences that allow transcription [?] | BEST skip-ASR candidate if sessions are on Teams. Spoken language must match; Jordanian speech under a Saudi model = expect errors. Test once. |
| Zoom cloud-recording audio transcript | Arabic reported among ~19 transcript languages [M]; user reports say the post-meeting pass may default to English [M] | Labels from account display names [M] | .vtt [M] | Cloud | Paid plan with cloud recording [?] | Importable if Arabic confirmed. Check support.zoom.com before relying. |
| Google Meet transcript | Arabic not listed (EN, FR, DE, IT, JA, KO, PT, ES) [V] | Page silent on names [V] | Saved to Drive "Google Meet" folder [V] | Cloud | Workspace Business Standard+ [V] | Not usable for Arabic. |
| Otter | No Arabic per 2026 comparison pages [M]; official list returned 403 | Yes (English) | [?] | Cloud | [?] | Skip. |
| Fireflies, Notta, tl;dv, Krisp, Tactiq | Official pages 404, not verified. Notta in a 2026 comparison: ~22% MSA, Egyptian ~38%, Gulf ~42% WER [M]. Tactiq lists Arabic (Egypt, UAE) for Meet via extension [M] | [?] | [?] | Cloud | Notta Pro $13.99/mo [M] | Unverified; not worth integration time before Teams / local ASR is tested. |
| Sonix | Arabic, no dialect list [M] | Yes [M] | DOCX/PDF with speakers, SRT/VTT [M] | Cloud | $10/h PAYG; $5/h + $22/mo [M] | Fallback cloud batch; client data leaves the machine. |
| SozAI / Castmagic | MSA + Egyptian, Gulf, Levantine, Maghrebi claimed [M] | Auto diarization [M] | TXT/DOCX/PDF/SRT/VTT [M] | Cloud | [?] | Only one naming Levantine, and it is marketing. Untested. |
| Soniox | MSA, Egyptian, Gulf named; Levantine NOT named; Arabic-English mid-sentence code-switch claimed [M] | Realtime + async diarization [M] | API JSON [?] | Cloud | $0.10/h async, $0.12/h realtime [M] | Cheapest cloud API to trial on a 5 min Jordanian clip; needs client consent for upload. |
| ElevenLabs Scribe v3 | Single "Arabic (ara)" entry, dialects not stated [V] | Up to 32 speakers; realtime diarization in v3 Live [V] | JSON with word times + speaker IDs (we convert to VTT) [V] | Cloud | Per audio hour, tier-based [V] | Code-switching documented (secondary language codes) [V]; cloud. |
| VexaScribe / TurboScribe / Amberscript / Happy Scribe / Rev / Descript | MSA ~18-22% WER, dialect 30-45% (one site's table) [M] | Not stated | Not stated | Cloud (Amberscript EU, Happy Scribe Barcelona) | $2-25/mo; human from $1.25-1.70/min [M] | Self-reported numbers; no Jordanian figure. Human-corrected Arabic is the only high-accuracy route. |

No source reports a Jordanian-specific WER for any commercial tool. [?]

### 1b. Local open-source (CPU, Windows)

| Tool | Arabic | Speakers | Export | Local/cloud | Price/licence | Verdict |
|---|---|---|---|---|---|---|
| Vibe (thewh1teagle/vibe) | "almost every language" (Whisper) [V] | Diarization yes [V] | SRT, VTT, DOCX, JSON, TXT, HTML, PDF [V] | Fully offline [V]; GPU via Vulkan (Intel iGPU possible) | MIT [V] | Best desktop fallback for the owner by hand. CLI/API? [?] |
| Buzz (chidiwilliams/buzz) | Whisper languages | Speaker identification listed, thin [V] | TXT, SRT, VTT [V]; live mic transcription [V] | Offline [V] | MIT [V] | OK for quick live capture; weaker export. |
| noScribe | Whisper (~60 languages) [V] | pyannote diarization [V] | HTML editor; VTT/TXT [?] | Local [V] | GPL-3.0+ [V] | Good diarization UX; GPL, keep as a separate tool, never bundle. |
| WhisperX | Whisper + wav2vec2 alignment; Arabic alignment model not confirmed in README [?] | pyannote, needs Hugging Face token + accepted model terms [V] | SRT, JSON [V] | Local; CPU int8 command documented [V] | BSD-2 [V] | Best programmatic route (Python). CPU slow for 45 min audio; HF token is the owner-side setup. |
| faster-whisper (CTranslate2) | Whisper large-v3; fine-tuned Arabic dialect checkpoints exist on Hugging Face (e.g. oddadmix/whisper-large-v3-arabic-dialectal-v2, 0.32 WER on a balanced multi-dialect set, model card only) [M] | none | JSON/SRT | Local | MIT [?] | Core ASR engine candidate. CPU speed unmeasured here [?]; benchmark before choosing size. |
| WhisperLive / whisper_streaming / WhisperLiveKit | Whisper languages | WhisperLiveKit: Sortformer or Diart, one speaker per frame (no overlap) [V] | WebSocket/REST | Local; CPU Dockerfile; Windows not confirmed [V] | whisper_streaming MIT, "becoming outdated in 2025", successor SimulStreaming [V]; WLK Apache-2.0 [V] | Live captions are not needed for a post-hoc tool. Skip. |
| Minutes (silverstein/minutes) | Not stated [V] | "speaker processing", diarize sidecar [V] | Markdown files + 34 MCP tools [V] | Local-first; macOS/Linux only [V] | MIT, ~1.6k stars [V] | Design reference for a meeting MCP; not runnable on Windows. |

### 1c. Which export can Business-Wrap import directly (skip ASR)?

1. Teams .vtt/.docx with speaker names (best; per-cue speaker syntax unverified [?]).
2. Zoom cloud audio-transcript .vtt (speaker prefix in cue text [?]).
3. Vibe / Buzz / noScribe / WhisperX SRT/VTT/JSON.
4. ElevenLabs Scribe or other cloud JSON (word times + speaker IDs).

Recommendation: one internal `transcript.json` (segments: start, end, speaker, lang, text, source, confidence) plus parsers for VTT, SRT, DOCX table, Scribe JSON, WhisperX JSON. When an imported transcript exists, mark `asr: skipped` but still run a dialect-aware cleanup pass.

## 2. Recording best practice (multi-speaker room)

Evidence is thin and general (far-field research); vendor phone guidance was not reachable. Numbers are practical defaults, [?] where no source.

| Item | Guidance | Evidence |
|---|---|---|
| Distance | Each speaker within ~1 m of a mic; far-field benchmarks use 2-3 m and are much harder | Far-field ASR papers: reverberation and low SNR grow with distance (REVERB 2-3 m) [V via search] |
| Close-talk vs table | Close-talk beats a table mic, but adds cross-talk bleed between channels | CHiME-6: 4 speakers, close-talk + 6 far-field devices; far-field Track 1 about 42-51% WER (approximate, not checked against the paper) [V via search] |
| Several phones as tracks | One phone per speaker or pair, same start clap/beep for sync, each saved as its own file; align later by cross-correlation; channel energy then gives speaker labels | Reasoned from CHiME-6 setup [?]; no direct study found |
| Single phone | Centre of table, mic side toward people, away from laptop fan/keyboard; max 4-6 speakers; ask people not to talk over each other | Overlap is the main error source in meeting benchmarks [V via search] |
| Online meetings | Use the platform recording (per-participant audio if offered), else record system audio via screen recording | [?] |
| Format / sample rate | Record >= 44.1/48 kHz, light or no compression; Whisper-family ASR resamples to 16 kHz mono (the installed watch skill uses `ffmpeg -vn -ac 1 -ar 16000`); never use low-bitrate voice-memo modes | Local skill command [V]; ASR input rate is a model property |
| Separate channels | Keep per-person files; do not mix down before analysis; make a mono copy for ASR only | Reasoned [?] |
| Naming / roll call | Speaker-per-file names, a sync clap, and a spoken roll call so diarization clusters can be named | Reasoned [?] |
| Language | Say English terms and field names clearly; provide a glossary as ASR hint | Scribe supports keyterm prompting [V]; Whisper initial prompt [?] |

## 3. Existing Claude Code skills, MCP servers, plugins, GitHub projects

| Project | What it does | Quality / notes | Reusable? |
|---|---|---|---|
| silverstein/minutes | Meeting recorder/transcriber, Markdown store, 34 MCP tools, 23 Claude Code skills [V] | MIT, ~1.6k stars, 2,754 commits [V]; no Windows [V]; languages unstated | Design reference only |
| Meetey (via Glama listing) | macOS ScreenCaptureKit + whisper.cpp + Claude summary, MCP + /meetey skill [M] | macOS only | No |
| glebis/claude-skills transcript-analyzer | Extracts decisions etc. from transcripts [M] | Analysis only, no ASR | Schema/prompt ideas |
| melodic-software/claude-code-plugins analyze-transcript | Requirements, decisions, action items, risks, speaker attribution by role [M] | Repo page did not show the plugin [V]; verify in `plugins/` | Prompt ideas after verification |
| daymade/claude-code-skills meeting-minutes-taker | Transcript to structured minutes; pairs with transcript-fixer [M] | MIT, ~1.3k stars [M] | Output layout ideas |
| claude-office-skills transcription-automation; seb1n meeting-transcription; rajivpant synthesis-meeting-transcripts | Diarize + SRT/VTT + action-item templates [M] | Generic, unverified | Low |
| RECOVER (arXiv 2411.19552) | LLM pipeline for requirements from stakeholder conversations; turn-level and whole-conversation evaluation; human in the loop [V] | No numeric metrics in abstract [V] | Method template |

Finding: no skill or MCP found that combines Arabic dialect + diarization + requirements, none confirmed on Windows with Arabic. Build our own; borrow schemas only.

## 4. Local look: skills and tools already on this machine

Searched `~/.claude/skills`, `~/.claude/plugins`, `Desktop/nj-plugin/skills` (frontmatter and engine greps only).

| Skill / tool | Does | Engine | Reuse for Business-Wrap? |
|---|---|---|---|
| `watch:watch` (claude-watch 0.2.0) | Downloads video (yt-dlp), frames via ffmpeg, transcript from captions else Whisper API | Groq whisper-large-v3 or OpenAI whisper-1, cloud, key in `~/.config/watch/.env` [V] | Frame extraction and the ffmpeg 16 kHz mono recipe: yes. Cloud upload of client audio only with consent; otherwise swap in local faster-whisper. |
| `media-use` and hyperframes `transcribe` | `npx hyperframes transcribe` (Parakeet or whisper) [V] | Local | Possible zero-install local ASR; Parakeet Arabic support unverified [?]; test. |
| `hyperframes-*`, `embedded-captions`, `captions-overlay` | Video composition and caption overlays | n/a | No (output side) |
| `voice-clean` (nj-plugin) | ffmpeg-only chain: EQ, deesser, denoise, compressor, limiter, loudness | ffmpeg, no model | Yes: pre-clean a COPY before ASR; keep the original; check it does not clip. |
| `bg-music`, `nj-writer`, `nj-director`, `nj-multimedia`, `nj-style-film`, `general-video` | Music, narration, film production | Gemini TTS pipeline (single-model hard rule applies there only) | No |
| `pdf` (document-skills), `nj-kit:pdf-typography` | PDF read/build | local | Yes for exporting the output document. |
| `nj-kit:arabic-english-proofreading` | Arabic/English proofreading rules | none | Yes: apply to cleaned transcript text and requirement wording. |
| `nj-evidence`, `nj-researcher`, `srs-verifier` | Fact gating, source checking, document audit | local scripts | Pattern: every requirement must cite transcript time + speaker. |
| PATH binaries | ffmpeg 9.0 (Gyan), yt-dlp, Python 3.12, Poppler, Pandoc, Ollama | n/a | ffmpeg for split/mix/resample. Ollama present (local LLM possible, CPU-slow). No whisper / faster-whisper installed yet. |

## 5. Requirements extraction from transcripts

| Source | Approach | Arabic | Notes |
|---|---|---|---|
| RECOVER, arXiv 2411.19552 (v2 May 2025) | NLP + LLM: turn-level relevance, then whole-conversation synthesis; humans in control | Not addressed [?] | "Satisfactory" correctness, completeness, actionability [V]; adopt turn-level tagging before synthesis |
| U.P.B. Sci. Bull. C 87(4), 2025 | Multimodal meeting data to user stories, GPT-4o, ASR evaluation [M] | Not stated | ASR quality evaluated alongside extraction |
| arXiv 2507.19113 (2025) | LLM drafts specs from minutes/presentations in an IT consulting firm | No | LLM drafts, analyst reviews [V via search] |
| UFRN WER 2025 | LLM output on elicitation interviews vs human requirement sentences, P/R/F1 | No | Reusable evaluation method |
| Tampere thesis 2025 | Open-source LLMs generate SRS from stakeholder meeting transcripts | No | Relevant to the local/CPU constraint |
| Decision / action-item extraction papers | Not found in this pass | [?] | Needs one more search |
| Arabic-specific meeting requirement extraction | Nothing found | [?] | Gap |

Method to adopt (design inference, not published): transcript -> cleaned segments with speaker + language tag -> turn classification (requirement, business rule, decision, action item, open question, constraint, out of scope, chit-chat) -> group by topic/service -> each item stores quote, timestamp, speaker, confidence, "needs confirmation" flag -> human review in Business-Wrap before it enters the document.

## 6. Recommended recording guidance (feed for the meeting-rules guide)

1. Use Teams with transcription on when the client agrees; set the spoken language to Arabic; still keep the audio.
2. Always keep a raw audio/video file; a platform transcript is a second input, never a replacement.
3. In a room: one phone near each pair of speakers (<= 1 m) plus one in the centre; clap at the start for sync; name files by seat.
4. Roll call at start: each speaker says name and role once.
5. Say English terms and field/service names clearly; spell IDs and codes; summarise decisions aloud ("so we agree that ...") at the end of each topic, because the extractor keys on these.
6. One person at a time when deciding; no overlap, no table tapping, no laptop fan next to the phone.
7. Record >= 44.1 kHz, light or no compression; avoid "voice memo" low-quality modes.
8. Screen recordings of online meetings: capture system audio plus each participant's mic if the app allows; show the screen, since on-screen text (field names) helps.
9. Share a glossary (service names, fields, abbreviations) before the session; use it as ASR hint and review list.
10. Get consent before any cloud upload; client data stays local unless the owner approves.

## 7. Open questions

1. Can the client use Teams, or does NJ record only on its own devices? (Decides whether skip-ASR is possible.)
2. Is cloud transcription (Soniox / Scribe) allowed for client audio, or local only?
3. Is Teams' "Arabic (Saudi Arabia)" good enough on a real 5 min Jordanian clip? One test needed.
4. Real CPU speed of faster-whisper large-v3 int8 on this i5-1334U for 45 min of audio: not measured. Benchmark before choosing large-v3, turbo or a fine-tuned dialect model.
5. Does pyannote hold up on Arabic + English code-switching? Needs one measurement on a real session; otherwise rely on per-speaker tracks.
6. Who creates the Hugging Face token for WhisperX / pyannote? (the owner's hand.)
7. Do Zoom/Teams exports keep speaker names when participants join by phone? [?]
8. Is the melodic-software analyze-transcript plugin real, and its prompt reusable? Verify in repo.
9. Do we need a dialect-normalisation step (Levantine to MSA written form) in requirement wording, and who approves it?
10. Decision/action-item extraction literature: one more search pass if the owner wants a stronger evidence base.

## Sources (retrieved 2026-11-12)

- https://support.microsoft.com/en-us/office/view-live-transcription-in-a-teams-meeting-dc1a8f23-2e20-4684-885e-2152e06a4a8b
- https://support.google.com/meet/answer/12849897
- https://github.com/thewh1teagle/vibe ; https://github.com/chidiwilliams/buzz ; https://github.com/kaixxx/noScribe ; https://github.com/m-bain/whisperX
- https://github.com/QuentinFuxa/WhisperLiveKit ; https://github.com/ufal/whisper_streaming ; https://github.com/silverstein/minutes ; https://github.com/melodic-software/claude-code-plugins
- https://elevenlabs.io/docs/capabilities/speech-to-text ; https://soniox.com/speech-to-text/arabic
- https://vexascribe.com/compare/best-transcription-software-for-arabic-audio ; https://sonix.ai/accurately-transcribe-zoom-meetings-in-arabic ; https://sozai.app/transcription/arabic/index.md
- https://arxiv.org/pdf/2410.04527 (Casablanca) ; https://arxiv.org/pdf/2306.02902 (N-shot Whisper Arabic) ; https://arxiv.org/abs/2411.19552 (RECOVER) ; https://web3.arxiv.org/pdf/2507.19113
- https://arxiv.org/pdf/2004.09249 (CHiME-6) ; https://soniqo.audio/benchmarks/diarization ; https://publications.idiap.ch/attachments/reports/2025/Rangappa_Idiap-RR-09-2025.pdf
- https://huggingface.co/oddadmix/whisper-medium-arabic-dialectal ; https://friendli.ai/models/oddadmix/whisper-large-v3-arabic-dialectal-v2
- Local: <local path> ; <local path> ; <local path>
