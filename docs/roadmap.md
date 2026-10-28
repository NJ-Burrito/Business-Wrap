# Roadmap (EN) · pair: [roadmap.ar.md](roadmap.ar.md)

## ⚡ In 10 seconds

🗺️ This is the plan written at 0.1.0.

🚢 The releases did not follow these version numbers; each row says what has shipped and in which version.

📝 What every release changed: [CHANGELOG.md](../CHANGELOG.md).

## 📋 The plan and where it stands

| Planned as | Scope | Status |
|---|---|---|
| 0.1.0 | Bible, contracts, tokens, design build, security gate, HTML editor engine, sample, CI | shipped in 0.1.0 |
| 0.2.0 | Harvest adapters as plug-ins (one per source system), evidence ledger tool, edition-parity and watermark-absent gates wired into export | partly shipped: harvest from a process model or a live service (0.7.0), crawl and model merged (0.8.0) |
| 0.3.0 | DOCX builder ported generically (both font slots, rule widths, font embedding by graft), DOCX check | partly shipped: DOCX font embedding without Word (0.8.0) |
| 0.4.0 | Workflow figure renderer with the four figure gates (collisions, fidelity, captions, freeze) | partly shipped: the workflow diagram as an editable block, real text in the PDF, native shapes in the DOCX (0.9.0) |
| 0.5.0 | Consolidation workflow (root cause → devil → 5-viewpoint vote → proof) as a script | not started |
| 1.0.0 | First production release after one real document is delivered end to end | target |

Versioning: semver; tags `vMAJOR.MINOR.PATCH` on `main` (see [CHANGELOG.md](../CHANGELOG.md)).
