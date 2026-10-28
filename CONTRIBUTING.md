# Contributing (EN) · pair: [CONTRIBUTING.ar.md](CONTRIBUTING.ar.md)

## ⚡ In 10 seconds

🌿 Small branches, one topic each.

✅ Gates green before merge.

🔀 Arabic and English change together.

🔒 Nothing from a client, ever.

**Jump to:** [🏁 Before the first commit](#-before-the-first-commit) · [🧪 Run the checks](#-run-the-checks) · [📋 Every change](#-every-change) · [📝 Commit message](#-commit-message) · [🔰 Branch protection](#-branch-protection-on-main)

## 🏁 Before the first commit

1. `git config core.hooksPath .githooks` (pre-commit: tree gate; pre-push: full gate with history).
2. Turn on UTF-8 for Python: `$env:PYTHONUTF8 = "1"` (PowerShell) or `export PYTHONUTF8=1` (bash). Python packages via `uv`, never pip.
3. `npm ci`.

## 🧪 Run the checks

The same checks CI runs, before you open a pull request:

```bash
npm test                          # every suite: editor, accessibility, MCP, harvest, print, updater
python security/check.py --all    # tree + history + commit messages
python design/build.py            # palette contrast gate + theme
node update/version-sync.mjs      # every file names the same version
```

New to the code? Start at [docs/README.md](docs/README.md) and [docs/architecture.md](docs/architecture.md).

## 📋 Every change

| Rule | Why |
|---|---|
| One topic per branch; PR into `main` | review stays readable |
| AR and EN files change in the same commit | the pair is the unit |
| No hex, pt or mm typed into templates; use tokens | drift starts with one literal |
| No client content, credentials, local paths or font binaries (only the bundled `fonts/nj-fonts/` is allowed) | `security/check.py` fails the build |
| Contract change (`bible/contracts/*`) = version bump + CHANGELOG entry + bible update | the editor and exporters depend on it |
| Deletions to the recycle bin, never `rm -rf` | recoverable |

## 📝 Commit message

Imperative, scoped: `palette: add success-wash role`. No client names in messages (the gate scans them).

## 🔰 Branch protection on `main`

🔓 The repo is public, so GitHub branch protection and rulesets are available. The owner applies these settings:

<details>
<summary>📋 The settings</summary>

| Setting | Value |
|---|---|
| Require a pull request before merging | on, 1 approval, dismiss stale approvals |
| Require status checks to pass | on: `gates` (the workflow job), branch up to date |
| Require conversation resolution | on |
| Require linear history | on |
| Block force pushes and deletions | on |
| Restrict who can push | owner only |
| Secret scanning + push protection (GitHub) | on |

Apply with `gh api -X PUT repos/<owner>/<repo>/branches/main/protection` and a JSON body of the settings above, or in Settings → Branches.

</details>

### 🪝 Hooks + CI back it up
The same guarantees also come from local hooks and CI (while the repo was private on the free plan, these were the only protection):

| Guarantee | Substitute |
|---|---|
| Nothing unsafe is committed | `pre-commit` hook: `security/check.py --tree-only` (enable once: `git config core.hooksPath .githooks`) |
| Nothing unsafe is pushed | `pre-push` hook: full gate, tree + every blob in history + commit messages |
| Checks pass before merge | CI `gates` on every push and pull request: security gate + self-test, gitleaks (pinned, checksum verified, full history), palette gate, `npm test` (editor + accessibility) |
| No force push, linear history | habit: merge with `--ff-only` or a merge commit, never `push --force` to `main`; maintainers merge, contributors push to their own branches |
| Review | pull request + one approval by convention |

Hooks are local and can be bypassed with `--no-verify`; CI cannot. A red `gates` run on `main` is fixed before anything else is merged.
