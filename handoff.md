# goals
Business-Wrap: client-neutral, bilingual (AR RTL / EN LTR) requirements-document skill, bible and HTML editor. Private repo `NJ-Burrito/Business-Wrap`, `main` at v0.1.0. This pass (branch `finish`) closes the ten "finish everything" items for v0.2.0.

## current state
- Branch `finish` (worktree `Business-Wrap-wt-finish`): all ten items done or documented — status table in `docs/receipt-editor.md` § v0.2.0. Committed, not merged, not pushed, not tagged.
- Gates on `finish`: `security/check.py --all` 0 findings, `--selftest` PASS, gitleaks 8.30.1 no leaks, `npm test` 69/69 + 18/18.
- CI not yet re-run: the fix is on `finish` and runs on the Lead's push.

## files in flight
- none open. Machine-local, gitignored: `.local/config.json` (font root, watermark dir, Chrome, poppler), `.local/tools/gitleaks.exe`.

## changed
- CI: uv, poppler, Noto, Python libs, pinned gitleaks; tests SKIP the Thmanyah-only checks when the fonts are absent.
- Editor: structural conflict prompt, page thumbnails (`/api/pages`), accessibility fixes; tests for columns, design pack, structure, thumbnails; `tests/a11y.test.mjs` in `npm test`.
- DOCX: chapter-level landscape, numbered section headings; `tests/docx_fidelity.py` (Word, read-only export).
- Docs (AR + EN): CHANGELOG 0.2.0, CONTRIBUTING free-plan substitute, bible/04 pair rules, eval results; SKILL quick reference; `palette/check.py --help`.

## failed attempts
- Docker Desktop was not running, so the Linux CI path was simulated on Windows (no-font run: 63/63, 6 SKIP) instead of in a container.
- Repository rulesets: 403 on the free plan for a private repo (checked with a read-only GET).

## next step
1. Lead: merge `finish` into `main`, push, watch the `gates` run; tag `v0.2.0` when green.
2. Owner decision: commit author/committer identities are not scanned by the gate (eval 4).
3. DOCX: tables run taller in Word than in the PDF (AR one page longer); next cheapest gap is cell padding/line height in `engine/docx/theme.py`.
4. Watermark: when images land in `NJ-Avatar`, rebuild; no code change needed.

<div dir="rtl">

## خلاصة بالعربية
الفرع `finish` يغلق البنود العشرة للإصدار 0.2.0، والبوابات كلها خضراء محلياً. الخطوة التالية: يدمج القائد ويرفع ويراقب CI ثم يضع الوسم `v0.2.0`. قرار للمالك: هوية كاتب الالتزامات لا تُفحص. والعلامة المائية ما زالت بلا صور.

</div>
