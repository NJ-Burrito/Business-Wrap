# goals
Business-Wrap: a client-neutral, bilingual (AR RTL / EN LTR) requirements-document skill and bible, private repo `NJ-Burrito/Business-Wrap`. Branch `bible` (this worktree) holds the method, tokens, design packs, fonts manifest, logos slot, security gate, docs, CI and repo hygiene; branch `editor` holds the HTML editor engine.

## current state
- `bible` branch: all brief and AMEND items done (status table in `docs/receipt-bible.md`). Gate on this branch: `python security/check.py --rev=HEAD` → 0 findings.
- Whole-repo gate (`--all`) → 31 findings, all on the `editor` branch (client terms in the copied DOCX builder and renderer, absolute local paths in the font manifest stub and the sample HTML).
- Nothing pushed, nothing merged, no GitHub repo created.

## files in flight
- `security/check.py` `ALLOW_BINARY`: empty until the editor watermark files exist under `editor/`.
- `.github/CODEOWNERS`: commented stub, needs the owner's login.

## changed
- New: `bible/` (7 AR+EN pairs, `contracts/edits.schema.json`, `contracts/design-pack.schema.json`), `palette/`, `typography/`, `design/` (`build.py`, `ours/`, `custom/`), `fonts/` (manifest + READMEs), `logos/` (READMEs only), `security/` (`gitleaks.toml`, `check.py`, `denylist.sha256`), `docs/` (research, guide, glossary, architecture, decisions, roadmap, privacy, receipt), `SKILL.md`, `evals/evals.json`, `README`, `CONTRIBUTING`, `CHANGELOG`, `LICENSE`, `.github/`, `.githooks/`, `.gitignore`, `.gitattributes`.
- Outside the repo: nj-kit `scripts/export.py` (`PROJECT_SKILLS` += business-wrap), nj-kit `manifest.json` (`project_skills.business-wrap`), zip re-exported and extracted to the Desktop copy.

## failed attempts
- Bash heredocs with backslashes or Arabic were mangled on this machine; write such files with the Write tool or a script file.
- A Write of a regex with `\u` escapes landed as literal characters, and the later tashkeel strip broke it; the regex is now built from `chr()` codepoints.
- First commit containing an Arabic word that is also a client term was caught by the history scan; amended before any push.

## next step
1. Agent B (editor branch): remove the hashed client terms and local paths flagged by `python security/check.py --rev=editor`, rewrite that unpushed branch's history, place the watermark under `editor/` and tell the Lead its path.
2. Lead: add the watermark path to `ALLOW_BINARY` in `security/check.py` if the gate flags it (size or metadata), merge `bible` + `editor` into `main`, run `python security/check.py` (must be 0 on `--all`), create the private repo, push, apply branch protection (`CONTRIBUTING.md`), tag `v0.1.0`.
3. Fill `.github/CODEOWNERS`; make `npm test` real in `package.json` so the CI step passes.
