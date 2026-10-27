# Receipt — bible branch (Agent A), 2026-10-27

Governance: nj-governance-v4 (Owner override: Opus workers for this task). delegations: 0 (all items needed judgement or bilingual writing; no mechanical batch worth a helper).

## Gate lines
- `python security/check.py --rev=HEAD` → `0 finding(s); 77 tree files, 111 history blobs, 26 hashed terms, 12 rules` (bible branch, tree + history + commit messages).
- `python security/check.py --selftest` → `selftest: PASS` (9 rules + email allowlist).
- Planted sample (7 files, then 2 force-staged ignored files) → 9 findings, exit 1: denylist, font magic (renamed .bin), image metadata (PNG tEXt), phone shape, >5 MB, local path, password, font extension, .env. Folder `planted/` sent to the Recycle Bin.
- `python security/check.py` (default `--all`, every branch in the shared repo) → **31 findings, all on the `editor` branch** (Agent B): hashed client terms in `engine/docx/build_docx.py`, `engine/docx/theme.py`, `engine/render.mjs`, `samples/event-permit/event-permit.editor.html`; absolute local paths in `engine/build-editor.mjs`, `engine/defaults/fonts.manifest.json`, the sample editor HTML (file:// font URLs). Must be fixed (and history rewritten on that unpushed branch) before the push.
- `python design/build.py` → `all pairs pass` (12 pairs), theme with 95 colour vars.
- skill-creator `quick_validate` on the repo root → `Skill is valid!` (description 732 chars).
- `check-jsonschema --check-metaschema bible/contracts/edits.schema.json` → ok; `design/ours/pack.json` against `design-pack.schema.json` → ok.
- Arabic scan (`arabic-english-proofreading/scan.py`) on all AR files: 622 diacritics/RLM marks stripped; 19 left, all deliberate (لـ before Latin words ×6, Latin commas inside code spans ×12, «قيمة قيمة» meaning value by value ×1). Reading pass: done by the author only, not by a second reader.
- nj-kit: `export.py --zip` → `portable copy: ...\Desktop\nj-kit.zip (7641 KB)`; extracted to `Desktop\nj-kit`, manifest has `project_skills.business-wrap` (line 647); `business-wrap` added to `PROJECT_SKILLS` in `export.py` (repo-resident, linked never copied).

## Brief tasks
| # | Item | Status | Note |
|---|---|---|---|
| T1 | Research, cited, `docs/research/` | DONE | 6 topics, URL per claim, retrieved 2026-10-27; AR+EN summaries |
| T2 | Bible + edits schema first | DONE | schema committed first (72f5e5e); Agent B adopted it (`engine/edits.mjs` header) |
| T3 | Asset folders | DONE | palette (DTCG + swatches + gate), typography tokens, design/ours + custom slot, logos README, fonts manifest |
| T4 | SKILL.md | DONE | validator passes; triggers EN + AR; progressive disclosure into bible/ and docs/ |
| T5 | Security gate | DONE | gitleaks.toml (single rule source) + check.py (tree, history, commit messages, hashed denylist, magic bytes, size, metadata) |

## AMEND items
| # | Item | Status | Note |
|---|---|---|---|
| A1 | Bilingual AR+EN pairs | DONE | bible ×7 pairs, READMEs, research summary, guide, decisions, roadmap, privacy, CONTRIBUTING; glossary/architecture/CHANGELOG/LICENSE/templates bilingual in one file |
| A2 | Watermark rule | DONE (rule) / DEFERRED (allow-list) | rule in bible README, 03-gates, 06-design-system, logos README (AR+EN). `ALLOW_BINARY` in check.py is empty: Agent B has not placed the watermark under `editor/` yet |
| A3.1 | LICENSE, CHANGELOG + tag plan, CONTRIBUTING, CODEOWNERS stub, issue + PR templates | DONE | CODEOWNERS left commented: owner login not given |
| A3.2 | CI workflow, pre-commit hook, branch-protection settings | DONE | `.github/workflows/gates.yml`, `.githooks/pre-commit` + `pre-push`; settings in CONTRIBUTING. CI not run (no remote yet). `npm test` step will fail while B's package.json test script is the npm default |
| A3.3 | quickstart, install, troubleshooting, glossary, architecture (mermaid), decision log, roadmap, privacy | DONE | `docs/guide.md` holds quickstart/install/troubleshooting/backup/hand-over |
| A3.4 | Design-system docs: custom pack, token→PDF/DOCX/HTML, contrast, print geometry as tokens | DONE | `bible/06-design-system`, `design/README`, `typography/tokens.json` page group |
| A3.5 | Backup/restore + hand-over to a colleague | DONE | `docs/guide.md` §4–5 |
| A3.6 | Skill packaging: triggers, disclosure, eval prompts, nj-kit registration | DONE / PARTIAL | 5 eval prompts in `evals/evals.json`; with-skill vs baseline runs NOT executed (owner run-once rule; the owner verifies) |
| A3.7 | Gate covers EXIF/metadata, local paths, personal emails/names, .env/keys, >5 MB | DONE | names and client terms as SHA-256 hashes (never in clear) |
| A3.8 | handoff.md | DONE | in the worktree root (lands at the repo root on merge) |

## Not verified / risks
- gitleaks itself not installed here; only the Python engine ran. Same TOML, RE2-safe regexes, but the gitleaks run is unproven.
- The edits-contract "conflict check on `old`" and the edition-parity / watermark-absent gates are specified in the bible; whether Agent B's engine implements them is for the Lead to check.
- `evals/` and `.gitattributes` are outside the listed owned paths (needed by skill-creator and line endings); no conflict with B's paths.
- Shared git config: I set and then unset `core.hooksPath` (worktrees share config); nothing left set.
