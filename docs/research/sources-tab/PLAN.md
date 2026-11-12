# Sources tab: plan (2026-11-12)

Reads: A-asr-cpu.md, B-speakers-audio.md, C-other-sources.md, D-capture-and-skills.md.
Machine: i5-1334U, 12 threads, 24 GB, no GPU. Budget: one source analysed in 30–45 min wall time.
Client data: local workspace only (git-ignored, security gate blocks it).

## Principle

Business-Wrap does the machine stages (cut, clean, transcribe, label speakers, OCR, crawl).
Claude, driving Business-Wrap through its MCP tools, does the reading: facts, decisions, open questions.
No model API key inside Business-Wrap. Every stage writes a checkpoint and shows a preview the user can edit before the next stage reads it.

## Stages (all source types)

| # | Stage | Output (checkpoint) | Preview the user edits |
|---|---|---|---|
| 1 | Add source (file, folder, URL, repo, APK, screen recording) | `source.json` | type, title, language, people expected |
| 2 | Sweep: probe, split by stage (tracks, scenes, silence, protocol markers) | `sweep.json` | stage list, names, cut points |
| 3 | Engineer: 16 kHz mono, high-pass, loudnorm (denoise only if A/B on real audio wins) | `audio/*.wav` | before/after player |
| 4 | Transcribe + speakers (audio/video) · OCR (frames/images) · read (docs/web/repo/APK) | `transcript.json`, `ocr.json`, `text.json` | per-speaker transcript, low-confidence spans highlighted |
| 5 | Facts: requirements, decisions, actions, open questions, each with source + location + speaker + confidence | `facts.json` | fact cards: keep / edit / drop / merge |
| 6 | Hand-off to the document (evidence pack) | `02-evidence.json` | fill counts, untraced items |

Progress, pause, stop and parallel tasks are shown live for every stage.

## Audio and video engine (spike decides)

- ASR candidates: Cohere Transcribe Arabic (int8, CPU) · its Jordanian fine-tune · faster-whisper small dialect fine-tune (fallback).
- Speakers: sherpa-onnx diarization + enrollment from the self-introductions; overlap flagged, not separated.
- Multitrack: one track = one speaker when the source gives tracks.
- Skip-ASR import: Teams `.docx`/`.vtt` transcripts with speaker names; Vibe/WhisperX exports.
- **Spike first (≈1 h):** 10 min of real meeting audio, measure real-time factor and errors for each candidate on this laptop. Pick by measurement, not by vendor numbers.

## Other source types

Video/screen: ffmpeg scene cuts + frame dedupe → RapidOCR (PP-OCRv5 Arabic) → Claude vision on key frames.
Images: same OCR + vision. Documents: poppler (PDF), existing DOCX reader, new XLSX/PPTX readers.
Portals: existing crawler. Mobile: screenshots/recordings + store listing; APK static read only if allowed.
Tools/skills/repos: README, CLI help, command list.

## Meeting guide (Business-Wrap theme, nj-multimedia)

Live cue card (facilitator advances) · in-app animated guide · printable AR+EN one-pager.

## Build order

1 spike → 2 fact schema + Sources tab shell with previews → 3 audio/video pipeline → 4 other types → 5 meeting guide → 6 docs (AR+EN), tests, release.

## Decision update (2026-11-12, the owner): Claude models only

- No Gemini / OpenRouter / other AI provider. Claude cannot take audio, so speech-to-text is a LOCAL open model;
  Claude does every reading step (transcript correction of dialect and English terms, facts, questions).
- No existing skill/MCP fits (Arabic dialect + speakers + CPU-only Windows), so a new nj-kit skill **nj-listen**
  is built on existing engines and embedded in Business-Wrap.

## Measured on this laptop (60 s Jordanian tech clip, CPU 51% busy with other apps, on AC)

| Engine | RTF | 1 h audio | Quality |
|---|---|---|---|
| faster-whisper small int8 CPU | 1.27 | 76 min | poor terms |
| faster-whisper medium int8 CPU | 1.85 | 111 min | MSA-ises dialect, invents words |
| faster-whisper large-v3-turbo int8 CPU | 1.33 | 80 min | best text, English kept in Latin |
| OpenVINO large-v3-turbo int8 CPU | 0.97 | 58 min | good dialect, some English in Arabic script |
| **OpenVINO large-v3-turbo int8 iGPU (Iris Xe)** | **0.42** | **25 min** | same as above |

Plan: iGPU lane + CPU lane on alternating chunks (est. RTF ~0.29, 2 h ≈ 35 min), then a Claude pass restores
English terms to Latin script from context. Cohere Transcribe Arabic is gated (needs a Hugging Face login): pending.
