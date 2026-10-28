# Security policy (EN) · pair: [SECURITY.ar.md](SECURITY.ar.md)

## ⚡ In 10 seconds

🔒 Found a security problem? **Report it privately.** Never in a public issue.

🆕 Only the latest release gets fixes.

📎 Never attach client documents, credentials or IDs to a report.

**Jump to:** [🆕 Supported versions](#-supported-versions) · [📮 How to report](#-how-to-report) · [🧾 What to include](#-what-to-include) · [🛡️ What the gate covers](#️-what-the-gate-covers)

## 🆕 Supported versions

| Version | Fixes |
|---|---|
| The [latest release](https://github.com/NJ-Burrito/Business-Wrap/releases/latest) | ✅ yes |
| Anything older | ❌ no: update first |

🔎 Your version: `node update/cli.mjs --check` (or `npx business-wrap update --check`).

## 📮 How to report

1️⃣ **GitHub private vulnerability reporting:** the repo's [Security tab](https://github.com/NJ-Burrito/Business-Wrap/security) → **Report a vulnerability**.

2️⃣ **Or the contact on the [portfolio](https://nj-burrito.github.io/#contact).**

🚫 Please do not open a public issue, discussion or pull request for a security problem.

## 🧾 What to include

- 🔢 The version and your OS.
- 🪜 Steps that show the problem, on the [anonymised sample](samples/event-permit/) or a made-up document.
- 📏 What an attacker could do with it.

🚫 No client documents, real e-service data, credentials, tokens or personal IDs. Replace them with made-up values.

## 🛡️ What the gate covers

`security/check.py` keeps these out of the repository:

- 🏢 client content
- 🔑 credentials and secrets
- 📁 local paths
- 🔤 font binaries outside the bundled `fonts/nj-fonts/`

| Where it runs | What |
|---|---|
| `pre-commit` hook | the tree |
| `pre-push` hook | the tree, every blob in history and the commit messages |
| CI `gates` | the security gate and its self-test, plus gitleaks (pinned, checksum verified, full history) |

📖 More: [CONTRIBUTING.md](CONTRIBUTING.md) · 🔒 privacy: [docs/privacy.md](docs/privacy.md)
