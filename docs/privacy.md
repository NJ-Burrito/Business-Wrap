# Privacy statement (EN) — pair: privacy.ar.md

**Verdict: everything stays on your machine. Business-Wrap uploads nothing.**

- The editor is a local HTML page; it makes no network requests for documents, edits, themes or fonts. Fonts load from your local licensed folder.
- PDF printing runs a local headless Chrome; DOCX building runs locally in Python.
- No telemetry, analytics, crash reporting or account. No cloud storage.
- Browser storage, if used for an unsaved draft, stays in that browser profile on your machine.
- Your documents, edits, logos, fonts and custom designs live in gitignored folders or outside the repo; the security gate blocks them from commits.
- The only network use is what you choose: cloning the private repo, installing packages, and CI on the private repo host running the gates on code (never on your documents).
- If you share an output, you decide who receives it; hand-over guidance: `docs/guide.md` § 5.
