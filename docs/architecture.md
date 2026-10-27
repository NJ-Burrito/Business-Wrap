# Architecture / البنية

EN: what lives where, and which way data flows. Folder ownership: `engine/`, `editor/`, `samples/`, `tests/` (editor engine); everything else (bible, tokens, design, fonts, logos, security, docs).

<div dir="rtl">

عربي: ما الذي يقيم أين، وفي أي اتجاه تسير البيانات. ملكية المجلدات: `engine/` و`editor/` و`samples/` و`tests/` (محرك المحرر)؛ وكل ما عداها (المرجع والرموز والتصميم والخطوط والشعارات والأمان والتوثيق).

</div>

```mermaid
flowchart TB
  subgraph Inputs["Inputs / المدخلات"]
    EV["Evidence checkpoints<br/>01-harvest · 02-evidence"]
    DOC["03-document.ar.json / .en.json"]
  end
  subgraph Design["Design / التصميم"]
    PAL["palette/tokens.json"] --> BUILD["design/build.py<br/>contrast gate"]
    TYP["typography/tokens.json"] --> BUILD
    FON["fonts/manifest.json<br/>(local licensed files)"]
    BUILD --> THEME["theme.json"]
  end
  subgraph Editor["Editor engine / محرك المحرر"]
    REN["engine render<br/>HTML = print template"]
    UI["editor UI<br/>(watermark here only)"]
    ED["edits.json<br/>contracts/edits.schema.json"]
  end
  subgraph Outputs["Outputs / المخرجات"]
    PDF["PDF (Chrome print)"]
    DOCX["DOCX (from document JSON)"]
    PACK["theme pack"]
  end
  EV --> DOC --> REN
  THEME --> REN
  FON --> REN
  REN --> UI --> ED --> REN
  REN --> PDF
  DOC --> DOCX
  ED --> DOCX
  THEME --> DOCX
  THEME --> PACK
  SEC["security/check.py<br/>tree + history"] -. gates the repo .-> Inputs
  GATES["output gates<br/>bible/03-gates.md"] -. gate .-> Outputs
```
