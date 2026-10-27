# Secret and client-content scanning

Retrieved 2026-10-27.

## Verdict
`security/gitleaks.toml` holds the rules (extending the gitleaks defaults). `security/check.py` reads the same TOML with Python's `tomllib` and scans the working tree and every blob in git history, so the gate runs where gitleaks is not installed; when gitleaks is on PATH it also runs `gitleaks git` and `gitleaks dir` with the config.

| Claim | Grade | Source |
|---|---|---|
| Current commands: `gitleaks git` (via `git log -p`), `gitleaks dir`, `stdin`; `detect` deprecated since v8.19.0 | V | https://github.com/gitleaks/gitleaks |
| `[extend] useDefault = true` inherits the built-in rules; `[[rules]]` has `id`, `description`, `regex`, `secretGroup`, `entropy`, `path`, `keywords`, `tags` | V | https://github.com/gitleaks/gitleaks |
| Allowlists: `[[allowlists]]` (global, v8.25.0) and `[[rules.allowlists]]` (v8.21.0) with `paths`, `regexes`, `stopwords`, `condition`, `targetRules` | V | https://github.com/gitleaks/gitleaks |
| Exit 0 = no leaks, 1 = leaks or error; `--redact` hides secrets in output | V | https://github.com/gitleaks/gitleaks |
| gitleaks is "feature complete", security patches only | V | https://github.com/gitleaks/gitleaks |
| Gitleaks regex is Go RE2: no look-ahead or look-behind | V (secondary) | https://github.com/bormaxi8080/gitleaks/blob/master/README.md |
| TruffleHog custom detectors (YAML, `keywords` + `regex`) are alpha; `trufflehog filesystem` and `git` subcommands exist | V (fork README) | https://github.com/dmarquero/trufflehog , https://linuxcommandlibrary.com/man/trufflehog |

## Decision
Regexes stay inside the RE2 and Python common subset (no look-around, no backreferences) so one TOML drives both engines. Client words are matched by pattern and the gate never prints the matched text, only rule id, file and line.
