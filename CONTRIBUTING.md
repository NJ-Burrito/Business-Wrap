# Contributing (EN) — pair: CONTRIBUTING.ar.md

**Verdict:** small branches, gates green, both languages updated together, nothing from a client.

## Before the first commit
1. `git config core.hooksPath .githooks` (pre-commit: tree gate; pre-push: full gate with history).
2. `$env:PYTHONUTF8 = "1"`; Python packages via `uv`, never pip.

## Every change
| Rule | Why |
|---|---|
| One topic per branch; PR into `main` | review stays readable |
| AR and EN files change in the same commit | the pair is the unit |
| No hex, pt or mm typed into templates; use tokens | drift starts with one literal |
| No client content, credentials, local paths or font binaries | `security/check.py` fails the build |
| Contract change (`bible/contracts/*`) = version bump + CHANGELOG entry + bible update | the editor and exporters depend on it |
| Deletions to the recycle bin, never `rm -rf` | recoverable |

## Commit message
Imperative, scoped: `palette: add success-wash role`. No client names in messages (the gate scans them).

## Branch protection on `main` (applied by the owner after the first push)
| Setting | Value |
|---|---|
| Require a pull request before merging | on, 1 approval, dismiss stale approvals |
| Require status checks to pass | on: `gates` (the workflow job), branch up to date |
| Require conversation resolution | on |
| Require linear history | on |
| Block force pushes and deletions | on |
| Restrict who can push | owner only |
| Secret scanning + push protection (GitHub) | on, where the plan allows it for private repos |

Apply with `gh api -X PUT repos/<owner>/<repo>/branches/main/protection` and a JSON body of the settings above, or in Settings → Branches.

### On the free plan: hooks + CI are the protection
Checked 2026-10-27: for a private repository on the free plan GitHub refuses both
branch protection and repository rulesets (`gh api repos/<owner>/<repo>/rulesets`
→ 403 "Upgrade to GitHub Pro or make this repository public"). Until the plan
changes, the same guarantees come from:

| Guarantee | Substitute |
|---|---|
| Nothing unsafe is committed | `pre-commit` hook: `security/check.py --tree-only` (enable once: `git config core.hooksPath .githooks`) |
| Nothing unsafe is pushed | `pre-push` hook: full gate, tree + every blob in history + commit messages |
| Checks pass before merge | CI `gates` on every push and pull request: security gate + self-test, gitleaks (pinned, checksum verified, full history), palette gate, `npm test` (editor + accessibility) |
| No force push, linear history | habit: merge with `--ff-only` or a merge commit, never `push --force` to `main`; the Lead merges, workers only commit on branches |
| Review | pull request + one approval by convention |

Hooks are local and can be bypassed with `--no-verify`; CI cannot. A red `gates` run on `main` is fixed before anything else is merged.
