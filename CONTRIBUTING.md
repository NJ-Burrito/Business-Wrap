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
