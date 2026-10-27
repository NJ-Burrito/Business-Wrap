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
Integration done on the branches (2026-10-27): `bible/contracts/wrappers.schema.json` + bible 02/04 AR+EN, editor README in the root README pair, Serif Text + Display converted to TTF in `<family>/ttf/` under the font root (originals kept), both manifests search there first, CODEOWNERS = @NJ-Burrito, `.gitignore` union (`out/`). A scratch tree of editor + bible files passed: `npm test` 55/55, `check.py` 0 findings on `--all`, `--selftest` PASS, no tracked font files.
The worker hook refuses the integration and publishing git verbs, so the Lead runs them:
1. On `main` in `Business-Wrap`: fast-forward to `bible`, then bring in `editor`; for conflicts in `.gitignore` and `README.md` take the `bible` side (it already holds both).
2. Re-run on main: `python security/check.py`, `--selftest`, `git ls-files | grep -Ei '\.(otf|ttf|woff2?)$'` (must print nothing), `npm ci && npm test` (55/55).
3. Create the private repo `NJ-Burrito/Business-Wrap` from this source, confirm visibility PRIVATE, apply branch protection (`CONTRIBUTING.md`), tag `v0.1.0`.
4. Remove both worktrees (untracked leftovers to the recycle bin first).
