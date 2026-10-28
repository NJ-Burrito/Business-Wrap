# Privacy statement (EN) · pair: privacy.ar.md

**Verdict: everything stays on your machine. Business-Wrap uploads nothing.**

- The editor is a local HTML page; it makes no network requests for documents, edits, themes or fonts. Fonts load from your own folder or the bundled Thmanyah fallback, both on your machine.
- PDF printing runs a local headless Chrome; DOCX building runs locally in Python.
- No telemetry, analytics, crash reporting or account. No cloud storage.
- Browser storage, if used for an unsaved draft, stays in that browser profile on your machine.
- Your documents, edits, logos, fonts and custom designs live in gitignored folders or outside the repo; the security gate blocks them from commits.
- The only network use is what you choose: cloning the repo, installing packages, the update check (at most one request a day to the public GitHub release list; switch it off in Settings or with `node update/cli.mjs --off`), and webhooks you set up yourself.
- If you share an output, you decide who receives it; hand-over guidance: [guide § 5](guide.md#5-handing-a-document-to-a-colleague).
