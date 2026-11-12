# Sources tab, research C: video, images, documents, portals, mobile apps, repos, common evidence model

Retrieved 2026-11-12 (all URLs below fetched or searched that day). `[V]` = read in a fetched page or search result; `[U]` = unverified (own knowledge or a single weak source, test before relying). Web text was treated as data. No code changed.

Machine facts checked locally: Python 3.12 + uv present, ffmpeg 9.0 (Gyan full build) present, poppler per house rule. `tesseract` is NOT on PATH (not installed). No GPU, so every model below is judged on CPU only.

## 0. Bottom line

- Keep the house stack (poppler, own DOCX/XML reader, Playwright, BPMN/draw.io parser) and add only three things: a **frame pipeline** (ffmpeg scene filter + dedupe), **one CPU OCR engine** (RapidOCR with the PP-OCRv5 Arabic recognizer, Tesseract `ara` as the fallback), and **Claude's own vision** as the reasoning step on the few frames that survive.
- OCR alone is weak on Arabic: in KITAB-Bench the classic engines are far behind vision-language models (CER 0.54 Tesseract, 0.58 EasyOCR, 0.79 PaddleOCR on mixed image-to-text) [V]. Use OCR to find and locate text, use Claude vision to read and understand a screen.
- Every extracted fact becomes one row in a single evidence record (section 9) with source, location, confidence and a status the user edits in the preview. Nothing reaches the document without passing the preview.
- Biggest open question for the owner: does the "one voice model, no transcriber/ASR" hard rule cover a free local Whisper used to read a meeting recording? (section 10, Q1).

## 1. Video and screen recordings

| Step | Tool | Why | CPU speed | Arabic | Licence |
|---|---|---|---|---|---|
| Captions first | the platform's .vtt/.srt/.docx transcript if the user has one | exact, speaker-labelled, zero compute | instant | as good as the platform | n/a |
| Scene/slide changes | **ffmpeg** `select='gt(scene,0.3)',showinfo` | already installed; one pass, timestamps in the log | faster than real time [U] | n/a | LGPL/GPL build |
| Same, tunable | **PySceneDetect** `AdaptiveDetector` (rolling-average threshold) or `detect-hash` (perceptual hash, suits static slides) | ContentDetector default threshold 27, min scene 15 frames; adaptive reduces misses on motion [V] | CPU, decodes video once | n/a | BSD-3 [U] |
| Frame dedupe | perceptual hash (`imagehash`) or SSIM on keyframes | a screen share where only the cursor moves yields hundreds of near-identical hits; slide builds/animations trigger false cuts (my inference) | trivial | n/a | BSD [U] |
| On-screen text | **RapidOCR + PP-OCRv5 Arabic rec** (`arabic_PP-OCRv5_mobile_rec`, 81.27% on its own dataset; Arabic, Persian, Urdu, English) [V]; **Tesseract `ara+eng`** as fallback | PaddleOCR docs: 106 languages in PP-OCRv5 [V]; Docling lists a RapidOCR `arabic` script recognizer [V]. Docling advice: "RapidOCR faster but slightly lower accuracy; Tesseract for CPU-only" [V] | mobile models, a few hundred ms per frame [U]; no official CPU figure found | KITAB-Bench ranks Tesseract (0.54 CER) ahead of PaddleOCR (0.79) on Arabic mixed images [V]; PP-OCRv5 Arabic is newer than that benchmark, so test both on 20 real frames | Apache-2.0 (PaddleOCR, RapidOCR) [U]; Tesseract Apache-2.0 [U] |
| Read the frame | **Claude vision** on the surviving keyframes, with OCR text and boxes as hints | handles layout, UI meaning, mixed Arabic/English; KITAB: VLMs beat OCR engines by ~60% CER on average [V] | no local cost; tokens (budget) | best available | service terms |
| Transcript when none | **faster-whisper** `small` int8 | ~7.6x real time on an i7-12700K (13 min in 1:42), batch 8 halves it [V, project-bench summary]; the i5-1334U will be slower (assume 3-5x [U]) | see left | Whisper `small` Arabic WER not found [U]; dialect and code-switching usually poor [U] | MIT [U] |
| Speakers | pyannote diarization | CPU speed and Arabic quality not found [U] | unknown | n/a | MIT code, gated models [U] |
| Align frames to talk | join on timestamps: each transcript segment gets the nearest preceding keyframe; each keyframe gets the segments up to the next keyframe | needs no model | trivial | n/a | n/a |

Rejected: **Surya** (code GPL, weights "modified AI Pubs Open RAIL-M", free only under $2M for companies) [V]; its KITAB CER of 4.95 looks like an artefact [V, unexplained]. **OmniParser** (UI element detector): only GPU numbers (0.6 s/frame on A100) [V], YOLO detector part AGPL in some versions [V, conflicting]; skip, let Claude vision do UI recognition. **EasyOCR**: CER 0.58, slower on CPU [V]; no reason to add a second Python OCR stack.

Budget check (60 min meeting, my estimate [U]): scene pass 3 min, dedupe 1 min, OCR on ~60 frames 2 min, Whisper small 15-20 min, Claude vision on ~25 frames inside the call. Fits 30-45 min only if transcription is bounded by audio length; for recordings over about 90 min offer "captions only" or "frames only".

Practical rules: run the cheap pass first (frame count from the scene filter) and show it as the preview before spending OCR or vision; cap keyframes (say 60); always keep the frame file and timestamp so a fact can be shown back to the user.

## 2. Images and screenshots

- **Method:** OCR (RapidOCR Arabic rec; Tesseract `ara+eng` fallback) for text + boxes; **Claude vision as the reasoning step** (read the screen, name fields, labels, buttons, messages, state). OCR boxes go in as hints so the model quotes exact strings. Evidence: [KITAB-Bench](https://arxiv.org/html/2502.14949v2) [V].
- **Layout/tables:** Docling's layout model scored mAP@0.5 0.750 on the Arabic BCE set vs Surya 0.506 [V], but table extraction on Arabic is poor for every engine tested (TEDS 28-50) [V]. Treat OCR'd tables as "needs review"; let Claude vision rebuild the table from the image.
- **Tesseract Arabic caveats:** digit sets differ between `ara` and `Arabic` traineddata; full-page accuracy collapses unless text is segmented into lines (forum and GitHub reports, not benchmarks) [V: [tesseract-ocr group](https://groups.google.com/g/tesseract-ocr/c/7GRGV9NjFow/m/3OL098PUAAAJ)]. Small UI text: not measured anywhere I found [U].
- **docTR:** Arabic exists only through community models (PARSeq Arabic, FAST Arabic detector on Hugging Face) [V]; not official; skip.

## 3. Documents (PDF, DOCX, XLSX, PPTX, MD)

| Format | Recommended | Why | Arabic RTL | Speed |
|---|---|---|---|---|
| PDF text | **poppler `pdftotext -enc UTF-8`** (already wired; `popplerBin` skips xpdf) | house rule; pymupdf/pdfium drop Arabic words (house measurement 6/9 and 0/9) | correct | ~instant |
| PDF scanned (no text layer) | detect near-empty `pdftotext`, then `pdftoppm -r 200` + OCR (sections 1-2) | otherwise silently empty | as OCR | 1-3 s/page [U] |
| DOCX | existing `unzipEntry` + `docxLines`; extend to tables, headings, comments, tracked changes | no dependency | fine (raw XML) | instant |
| XLSX | `openpyxl` (read-only) via uv, or own zip reader like DOCX | sheet name + cell address = a location | n/a | fast |
| PPTX | `python-pptx` or own zip reader; slide number + notes = location | notes carry intent | fine | fast |
| MD/TXT/HTML | existing `textLines`, `htmlLines` | done | fine | instant |
| Tables / layout in PDFs | **Docling** opt-in only, poppler text as cross-check | MIT code, models carry own licences [V]; ~1.57 pages/s on Xeon per its paper [V]; best-table-accuracy claim is vendor-run [V] | no explicit RTL statement found [V] | 0.3-1.5 s/page [U] |

Not core: **MarkItDown** (MIT; PDF/PPTX/DOCX/XLSX/images/audio/HTML; no built-in OCR, scanned PDFs poor; OCR plugin needs an LLM client) [V, [github](https://github.com/microsoft/markitdown)]; **Unstructured** (Apache-2.0 per aggregators [V weak], optional extras per format [V], heavy install); **marker** (weights licence restricted above $5M revenue [V weak]; 6.1 pages/s on an unclear setup [V vendor]). Our own readers already cover the formats and each tool adds a large Python dependency for little Arabic gain.

## 4. Website portals

Playwright (already in `crawl.mjs`) plus:
- `page.ariaSnapshot()` / `locator.ariaSnapshot()` returns YAML of `role "name" [attr]` nodes with nesting [V, [playwright.dev](https://playwright.dev/docs/aria-snapshots)]. Cheap, language-agnostic, stable across CSS changes; use as a second reading to catch fields the DOM walker missed (custom components). Depth/AI options not documented on that page [V].
- Sitemap: fetch `/sitemap.xml` and `robots.txt` first (robots already honoured); seed routes from it, then follow nav links to depth N.
- Per page record: URL, title, h1, landmarks, forms (label, type, required, pattern/min/max/maxlength, options, conditional visibility), validation messages after an empty submit, nav links, attachments, error/success texts.
- Both locales: crawl once per locale and align by order (what `dump.mjs` does).
- Never file a real request unless the user allows (existing `mayFile` gate).
CPU: dominated by the site, ~2-10 s/page [U]; 30-45 min = about 200-300 pages at a polite delay.

## 5. Mobile apps (no device)

- **APK static:** `aapt2 dump badging` (package, version, SDK, permissions, launcher activity) and `aapt2 dump xmltree` for binary layout XML [V]; **apktool** `d -s` decodes manifest, `res/values*/strings.xml` (Arabic + English labels via `values-ar`), layouts, menus, navigation graphs [V; Apktool 3.x integrates aapt2, release date differs by source]; **jadx** for readable Java (routes, API URLs, feature flags) [V]. Facts: screens (activities), permissions, strings per screen, endpoints, third-party SDKs.
- **Store listing:** Google Play / App Store page (title, description, what's new, screenshots, permissions, data safety). Scraping terms and layout drift [U]; prefer the user pasting or uploading it.
- **Screenshots and screen recordings of the app:** sections 1-2; the main route for behaviour.
- **iOS:** an IPA is a zip; `Info.plist`, localized `.strings` and some storyboards readable, but App Store IPAs are FairPlay-encrypted, so code and often resources are unreadable without a jailbroken device [U]. Treat iOS as screenshots + listing only.
- Java (apktool/jadx) and Android build-tools (aapt2) were not checked locally [U]; offer as optional install on first use.

## 6. Tools, skills and code repos

No new dependency needed:
- **Skill (SKILL.md):** frontmatter (`name`, `description`) and headings; the description's trigger list is the requirement source; bundled `references/` and `scripts/` listed by tree. Frontmatter schema not verified against Anthropic docs [U].
- **Repo:** README + docs/, `package.json` scripts and `bin`, `pyproject` entry points, CLI `--help` output (run only for a repo the user marks safe), directory tree, test names as behaviour statements, CHANGELOG headings, OpenAPI/JSON-schema files, CI workflows. **Gitingest** (Python; tree, token counts) and **Repomix** (Node; XML/MD/JSON, Tree-sitter compression, claims an automatic secret scan) exist [V, secondary reviews]; Business-Wrap needs neither: a ~60-line tree + README + manifest reader yields the same facts and keeps code away from a model unscanned.
- Facts: feature (command/endpoint/screen) | inputs | outputs | preconditions | error messages | config options. Location = file path + line.
- Run the house secret scan (`docs/research/06-secret-scanning.md`) over every repo text before it reaches a preview or model.

## 7. What Business-Wrap already has and can reuse

Read from `engine/harvest/` (2008 lines total):

| File | What it does | Reuse for the Sources tab |
|---|---|---|
| `sources.mjs` (113) | `harvestSources`: files/folders to documents; `unzipEntry` + `docxLines` (own ZIP/DOCX reader), `htmlLines`, `pdfLines` (poppler, `BW_POPPLER`), `textLines`, `linesToProcess` (numbered/bulleted lines become steps); skipped list with reasons | Keep as the text front-end. Gap: only numbered/bullet lines survive; prose requirements, tables, XLSX, PPTX, images, video are dropped. Change `textLines` to return `{text, loc}` instead of strings |
| `previous.mjs` (96) | `popplerBin` (poppler over xpdf), `pdfText(layout)`, earlier-document reader (counts, revisions, preparer, legislation) | Reuse `popplerBin`/`pdfText`; "what it cannot find it leaves out, never guesses" is the right stance for the evidence model |
| `crawl.mjs` (602) | headed Chrome, real-user triggers, delays, robots, OTP/captcha pause, `$env:`/`$secret:` credentials, fields/required/options/conditional/attachments/validations/statuses, language-switcher filter, `mayFile` gate | Portal source as is; add ariaSnapshot reading and sitemap seeding |
| `docs.mjs` (168) | `cleanStep`, `dedupeSteps` (same fields consecutively = one step, richer wins), `requiredByMessage` | Pattern for dedupe/merge of conflicting readings; browser-safe so the preview can use it |
| `model.mjs` (470) | BPMN/draw.io/YAML to IR (actors, steps, flows, timers) to document JSON | Process-model source as is; the IR is the "workflow" fact shape |
| `dump.mjs` (129) | one form dump AR + EN aligned field by field, refused when misaligned | Bilingual alignment pattern |
| `record.mjs`, `output.mjs`, `cli.mjs`, `xml.mjs`, `yaml.mjs`; `workspace.mjs sourcesDir()` | plumbing; each document already has a `Sources\` folder | natural home for per-source evidence files |

Missing entirely: OCR, image handling, video/audio, XLSX/PPTX, APK, repo reader, any fact/provenance schema, any preview state.

## 8. Method notes for every type

- **Cost ladder:** (1) deterministic text/structure readers, (2) OCR, (3) Claude vision/LLM extraction. Show the preview after (1)+(2) so the user can drop sources before (3) spends tokens.
- **Checkpoint files per stage** (frames/, ocr.json, transcript.json, facts.jsonl); a re-run resumes at the first missing file.
- **Never invent:** a field the source does not state stays visibly empty.
- **Language tag per fact** (`ar`/`en`/`mixed`); keep the original string verbatim; a translation is a separate, marked field.
- **Secrets/PII:** recordings and screenshots can show credentials or national IDs; scan OCR text and offer masking before a frame is sent to a model or stored.

## 9. Proposed common fact schema

One JSON object per fact, JSONL per source in `Sources\<source-id>\facts.jsonl`; the preview edits these rows; the document builder reads only `status: "accepted"` rows.

```json
{
  "id": "f-<source>-<n>",
  "kind": "requirement | rule | field | step | actor | screen | message | decision | constraint | term | question",
  "text": "normalised statement",
  "text_orig": "exact source string, original language",
  "lang": "ar | en | mixed",
  "source": { "id": "s3", "type": "video | image | pdf | docx | xlsx | pptx | md | web | apk | repo | model | note", "name": "demo.mp4", "sha256": "..." },
  "loc": { "t": [754.2, 761.0], "page": 4, "frame": "frames/0123.png", "bbox": [0,0,0,0], "url": "...", "cell": "Sheet1!B7", "slide": 6, "file": "src/cli.mjs:112" },
  "who": { "speaker": "Speaker 2", "author": "name", "role": "client | analyst | system" },
  "how": { "method": "pdftotext | ocr:rapidocr-ppocrv5-ar | whisper-small | claude-vision | dom | ariaSnapshot | aapt2 | human", "model": "...", "run": "ISO time" },
  "confidence": 0.0,
  "confidence_basis": "exact text layer | ocr score | llm self-rated | two sources agree | human",
  "corroborated_by": ["f-s1-12"],
  "conflicts_with": ["f-s2-4"],
  "status": "candidate | accepted | rejected | edited",
  "note": ""
}
```

Rules:
- **Confidence is not one number.** Text-layer facts 1.0 ("exact"); OCR = engine score capped by a per-engine ceiling; LLM output capped (e.g. 0.6) unless corroborated by a second source or a human edit. Reason: requirements-mining papers show high recall but weak precision (RECOVER ~76% accuracy tuned for recall; LENS precision 41-50% at temperature extremes, F1 ~84% at 0.7) [V, abstracts only: [RECOVER](https://arxiv.org/abs/2411.19552), [LENS](https://arxiv.org/pdf/2606.25867)]. So the preview must lead with precision controls.
- **Noise filter before the preview:** drop facts under a confidence floor; OCR lines under 3 characters or non-letters; chrome (browser bar, taskbar, cookie banners, headers/footers repeated on more than 60% of pages or frames); greetings/filler in transcripts (rule list plus one LLM pass flagging `kind: noise`); merge identical `text` within a source and across sources after Arabic normalisation (strip tashkeel/tatweel, unify alef/yeh/teh-marbuta, one digit script). Near-duplicate = same kind and token overlap over a threshold; keep the highest-confidence row and list the rest in `corroborated_by` (agreement raises confidence).
- **Conflicts are shown, not resolved:** same subject, different value (two documents give different field lengths) becomes a side-by-side row with both sources; house precedent: contradictions as a table, coworker ledger.
- **Provenance travels:** each sentence in the final document keeps its fact ids so a reviewer can click through to the frame/page. Matches W3C PROV thinking (entity, activity, agent) [U, not read this session].
- **Flaky data:** a fact read by OCR from one frame stays `candidate` until it appears in two frames, or in one frame plus transcript/text.

## 10. Open questions (for the owner, via AskUserQuestion)

1. **Whisper/ASR vs the voice hard rule.** The rule (2026-10-03) forbids any transcriber/ASR in a voice pipeline because of cost. A local faster-whisper on a meeting recording is free but is an ASR model. Allowed for the Sources tab, or captions/VTT + a typed transcript only?
2. **Claude vision on frames/screenshots:** allowed to spend tokens here, with a cap per source (e.g. 25 images)? It is the quality lever for Arabic; usage limits apply.
3. **Default OCR:** RapidOCR with PP-OCRv5 Arabic (new, no independent Arabic benchmark found) or Tesseract `ara` (needs install; best CER among classics in KITAB)? Suggest a 20-frame bake-off on real client screens before deciding.
4. **Dependencies:** OK to add an optional uv-managed Python helper (rapidocr-onnxruntime or tesseract, scenedetect, imagehash, faster-whisper, openpyxl, python-pptx)? Roughly 300-600 MB with models [U], installed on first use.
5. **Mobile apps:** only the user's own APKs, or client APKs too (decompiling)? iOS: screenshots and listing only?
6. **Sensitive material:** mask frames before storing them in the document's `Sources\` folder, or keep raw and mask only on export?
7. **Time cap per source:** hard stop at 45 min with partial results, or let the user extend?
8. **Jordanian-dialect meeting audio with English terms:** accept lower transcript quality, or require a human-corrected transcript?

## 11. Sources (URL, retrieved 2026-11-12)

- KITAB-Bench: https://arxiv.org/html/2502.14949v2
- PP-OCRv5 multilingual: https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html
- PP-OCR ONNX conversions: https://huggingface.co/monkt/paddleocr-onnx , https://docs.rs/crate/oar-ocr/0.6.3/source/docs/models.md
- Docling OCR engines: https://docling-project.github.io/docling/concepts/OCR/ ; paper https://arxiv.org/html/2501.17887v1
- MarkItDown: https://github.com/microsoft/markitdown
- Unstructured: https://docs.unstructured.io/open-source/core-functionality/partitioning
- PySceneDetect: https://www.scenedetect.com/docs/api/detectors.html
- Surya: https://github.com/VikParuchuri/surya , https://pypi.org/project/surya-ocr
- faster-whisper (secondary): https://pypi.org/project/faster-whisper/1.0.0 , https://dev.to/mupromax/how-to-run-whisper-locally-for-real-time-speech-to-text-faster-whisper-35df
- OmniParser: https://github.com/microsoft/OmniParser , https://arxiv.org/abs/2408.00203
- docTR Arabic: https://github.com/mindee/doctr/issues/490 , https://huggingface.co/madskills/parseq_arabic_v1
- Tesseract Arabic reports: https://groups.google.com/g/tesseract-ocr/c/7GRGV9NjFow/m/3OL098PUAAAJ
- Playwright aria snapshots: https://playwright.dev/docs/aria-snapshots
- APK tooling (secondary): https://appsecsanta.com/mobile-security-tools/apktool-vs-jadx
- Repo digest tools (secondary): https://gitingest.com , https://www.stork.ai/en/repomix
- Requirements from conversations: https://arxiv.org/abs/2411.19552 , https://arxiv.org/pdf/2606.25867 , https://werpapers.dimap.ufrn.br/papers/WER2025/wer202511.pdf
