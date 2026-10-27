# Business-Wrap (EN) — pair: README.ar.md

**Governed, bilingual requirements documents: evidence in, an editable HTML replica of the PDF and DOCX in the middle, PDF + DOCX + edits + theme out. Every rule has a gate.**

| Start here | |
|---|---|
| What it is and the rules | `bible/README.md` |
| Install and first run (Windows) | `docs/guide.md` |
| The skill entry point (for Claude) | `SKILL.md` |
| Architecture diagram | `docs/architecture.md` |
| Decisions, roadmap, privacy | `docs/decisions.md`, `docs/roadmap.md`, `docs/privacy.md` |
| Glossary AR/EN | `docs/glossary.md` |
| Research behind the choices | `docs/research/README.md` |

## Folders
| Folder | Holds |
|---|---|
| `bible/` | the method, AR + EN, and the machine contracts |
| `engine/`, `editor/`, `samples/`, `tests/` | the HTML editor engine, renderer, sample document, tests |
| `palette/`, `typography/` | DTCG design tokens + gates |
| `design/` | design packs (`ours/`, `custom/` upload slot) and `build.py` |
| `fonts/` | font manifest only (licence: no binaries) |
| `logos/` | empty: your logos go here, gitignored |
| `security/` | the gate that keeps client content and secrets out of the repo |

## Three commands
```powershell
$env:PYTHONUTF8 = "1"
python design/build.py        # palette contrast gate + theme
python security/check.py      # tree + history + commit messages
git config core.hooksPath .githooks
```

Private and proprietary: see `LICENSE`. Nothing is uploaded: see `docs/privacy.md`.
