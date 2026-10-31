<h1 align="center">Business-Wrap: bilingual requirements document generator (Arabic + English)</h1>

<p align="center"><img src="https://raw.githubusercontent.com/NJ-Burrito/Business-Wrap/main/site/assets/media/hero.gif" alt="Business-Wrap: evidence in, one Arabic and English requirements document out" width="720"></p>

<h3 align="center">📄 Evidence in. One Arabic and English requirements document out.</h3>

<p align="center">
  <a href="https://nj-burrito.github.io/Business-Wrap/"><img src="https://img.shields.io/badge/website-nj--burrito.github.io-d3c6a6?labelColor=001e3d" alt="Website"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/releases/latest"><img src="https://img.shields.io/github/v/release/NJ-Burrito/Business-Wrap?label=release&color=d3c6a6&labelColor=001e3d" alt="Release"></a>
  <a href="https://www.npmjs.com/package/business-wrap"><img src="https://img.shields.io/npm/v/business-wrap?label=npm&logo=npm&logoColor=be9a41&color=d3c6a6&labelColor=001e3d" alt="npm"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/actions/workflows/gates.yml"><img src="https://github.com/NJ-Burrito/Business-Wrap/actions/workflows/gates.yml/badge.svg" alt="Gates"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-d3c6a6?labelColor=001e3d" alt="License: MIT"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/.claude-plugin/marketplace.json"><img src="https://img.shields.io/badge/Claude%20Code-plugin-d3c6a6?labelColor=001e3d" alt="Claude Code plugin"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/mcp/server.json"><img src="https://img.shields.io/badge/MCP-server-d3c6a6?labelColor=001e3d" alt="MCP server"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/blob/main/README.ar.md"><img src="https://img.shields.io/badge/Arabic%20%2B%20English-first--class-d3c6a6?labelColor=001e3d" alt="Arabic and English"></a>
  <a href="https://github.com/NJ-Burrito/Business-Wrap/stargazers"><img src="https://img.shields.io/github/stars/NJ-Burrito/Business-Wrap?style=social" alt="Stars"></a>
</p>

## ⚡ In 10 seconds

📥 **Evidence in:** a process model (BPMN, draw.io, YAML) or a walk through the live service.

✍️ **Edit on the page that prints:** Arabic right to left, English left to right.

📄 **Out:** PDF and DOCX, fonts embedded as real, selectable text.

🎀 **A ribbon with 12 tabs,** an explanation panel for every tool, offline Arabic and English spell checking, and a dim navy dark mode.

🤖 **Your AI assistant can drive the open editor:** read it, edit it as one undoable step, proofread it, draw a diagram.

📦 Export and import a whole project.

🆓 Free and open source (MIT). Runs on your computer. Nothing is uploaded.

**Jump to:** [▶️ Quick start](#️-quick-start) · [✅ Before you start](#-before-you-start) · [🧩 Install](#-install) · [🚀 Commands](#-commands) · [🔁 Updates](#-updates) · [🧰 What it does](#-what-it-does) · [🔤 Fonts](#-fonts) · [🤖 For AI agents](#-for-ai-agents) · [🔒 Is it safe?](#-is-it-safe) · [❓ Questions](#-questions) · [🆘 Problems?](#-problems)

## ▶️ Quick start

📂 Open a terminal in the Business-Wrap folder: `cd Business-Wrap`

📦 Install once: `npm ci`

▶️ Start the local server: `npm run serve` (the first time it builds the sample editor)

🌐 Open the address it prints, `http://127.0.0.1:4317/`, in Chrome or Edge.

⚠️ Always open the editor **through the local server**, not by double-clicking the HTML file. Export, print, the printers list and updates need the server.

## ✅ Before you start

| You need | Check it | Why |
|---|---|---|
| 🟢 Node 20 or newer | `node --version` | runs everything |
| 🐍 uv | `uv --version` | runs the Python steps (PDF finishing, DOCX) with their packages; no pip installs |
| 🌐 Chrome or Edge | open it once | prints the PDF |
| 🌱 git | `git --version` | cloning the repo and the plugin marketplace |

📌 No uv? Install it: https://docs.astral.sh/uv/getting-started/installation/ (without it Business-Wrap falls back to plain `python` and tells you which packages it needs).

🧪 Optional, tests only: poppler (`pdffonts -v`).

## 🧩 Install

🧩 **Claude Code plugin** (the skill, the MCP server and the `/business-wrap:` commands together; they run from the plugin's own files with Node, no npm install and no registry):
```
/plugin marketplace add NJ-Burrito/Business-Wrap
/plugin install business-wrap@business-wrap
```
💬 Then say **"build the requirements document for …"** or **"open it in the editor"**.

🔌 **MCP server only** (any MCP client, stdio, local; 0.15.5 from the GitHub tag; npm still serves 0.12.0):
```
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.15.5 business-wrap-mcp
```

💻 **From source:** `git clone https://github.com/NJ-Burrito/Business-Wrap`, then the [Quick start](#️-quick-start).

<details>
<summary>📦 Other ways: release zip, MCP from a clone, tool list</summary>

- Release zip: `business-wrap-<version>.zip` + `.sha256` from https://github.com/NJ-Burrito/Business-Wrap/releases/latest. In that folder: `npm ci`.
- MCP from a clone: `claude mcp add business-wrap -- node <path-to>/Business-Wrap/mcp/cli.mjs` (no `npm ci` needed)
- Core tools (15): `build_editor`, `validate_edits`, `apply_edits`, `export_document`, `export_design_pack`, `check_fonts`, `harvest_model`, `harvest_crawl`, `harvest_merge`, `harvest_sources`, `open_in_editor`, `close_editor`, `diagram_mermaid`, `check_update`, `apply_update`, plus the `learning_*` tools. The live editor tools (`editor_list_documents`, `editor_get`, `editor_outline`, `editor_ops`, `editor_action`, `editor_new`, `editor_import`) and `host_health` need an open editor tab. A harvest tool given `open: true` opens its result in the editor. See [mcp/README.md](mcp/README.md).

</details>

## 🚀 Commands

```powershell
npm ci                 # install
npm run serve          # http://127.0.0.1:4317/ : builds the sample the first time; one-click PDF + DOCX
npm run sample         # rebuild out/sample/event-permit.editor.html
npm test               # every suite, one after another
```

<details>
<summary>📝 Your own documents</summary>

```powershell
node engine/build-editor.mjs <doc.json | folder>... --out out/my.editor.html [--theme design/ours/theme.json] [--embed-fonts] [--ui ar|en]
node engine/export.mjs --doc <document.json> [--edits edits.json] [--locale ar|en] [--out dir]
```
Opened from disk (file://), «PDF + DOCX» downloads the edited document JSON and shows the `export.mjs` command; through `npm run serve` it exports in one click. The ready-made editor is `assets/editor/business-wrap.html`.

</details>

<details>
<summary>⌨️ "/" commands in Claude Code (0.15.2)</summary>


Installed as a plugin, Business-Wrap adds these commands; type `/` in Claude Code to see them. Each runs `engine/cli.mjs` (the same `business-wrap <verb>` you can run yourself, with no AI and no network) and says in one line what it did.

| Command | What it does |
|---|---|
| `/business-wrap:open [doc.json\|folder\|editor.html]` | Start the local host and open the editor in Edge (a blank document when no file is given) |
| `/business-wrap:close` | Stop every host and close every Edge window this install started |
| `/business-wrap:status` | Version, running hosts, how many steps were healed, any MCP problem |
| `/business-wrap:doctor` | What is installed, where state lives, the last MCP server starts, and whether a plugin update left the server on the previous version |
| `/business-wrap:new ["Title"]` | A new blank document pair (Arabic + English), opened in the editor |
| `/business-wrap:harvest <url\|crawl.json\|model\|PDF/DOCX/HTML\|folder>` | Harvest a live site (never submits), a process model or a document, then open it |
| `/business-wrap:import <file\|folder ...>` | Your own sources (BPMN, draw.io, YAML, PDF, DOCX, HTML) into documents |
| `/business-wrap:build <doc.json\|folder> --out <editor.html>` | Build the editor file |
| `/business-wrap:export <doc.json> [ar\|en]` | PDF + DOCX, then the render and export gates |
| `/business-wrap:verify-history <file>` | Check the tamper-evident history |
| `/business-wrap:report <from> <to>` | Work report for a date range |
| `/business-wrap:reset --dry-run` | List every library, Edge profile and plugin-data folder this program keeps; with `--yes` (only after you agree) send them to the Recycle Bin so an old library cannot come back (`--all`: whole workspaces too) |
| `/business-wrap:update [--check\|--notes\|--apply --yes]` | Check, read what is new, or install (only after you agree) |
| `/business-wrap:tabs [project]` | The documents open in the live editor and the host health (needs the editor open) |
| `/business-wrap:outline [doc-id] [ar\|en]` | The outline of the open document: chapters, sections, blocks |
| `/business-wrap:edit <instruction>` | Change the open document as ONE undoable batch signed as the agent; keeps the Arabic and English editions in step; Ctrl+Z undoes it all |
| `/business-wrap:proofread [ar\|en\|both] [--apply]` | Proofread the open document (hamza, taa marbuta, Latin punctuation, English typos, AR/EN mismatch); fixes only with `--apply` |
| `/business-wrap:check [doc-id]` | Run the editor's Check panel on the open document and summarise the problems |
| `/business-wrap:diagram <description>` | Draft a diagram, render it to PNG, insert it into the open document |
| `/business-wrap:explain <tool or feature>` | Explain an editor feature from the docs and where it is on the ribbon |
| `/business-wrap:action <name>` | Run one safe editor action: `check`, `renumber`, `saveHtml`, `exportPdf`, `share`, zoom, theme, reading mode, find, save, outline, next and previous page. Anything that deletes, closes or stops something is refused |

The last 8 commands (`tabs` to `action`) talk to the open editor and need it open: without a tab they say so instead of guessing.

🧹 **Reset (a clean start).** An uninstall does not remove your libraries: older versions kept them outside the program (`DocumentsBusiness-Wrap`, `DownloadsBusiness-Wrap`) and a new start imports them again. `business-wrap doctor` lists every known workspace, Edge profile and plugin-data path. `business-wrap reset --dry-run` prints what a reset would send away; `business-wrap reset --yes` sends the machine state (the editor's Edge profile, every `.system` folder, local settings) to the Recycle Bin; `--all` also sends whole workspaces (your documents and exports) and the plugin data. It never hard-deletes, so everything can be restored from the Recycle Bin, and without `--yes` in a non-interactive shell it refuses.

Without Claude Code the same verbs run as `npm run cli -- <verb>` (for example `npm run cli -- open samples/event-permit`, `npm run host:close`). Every verb works offline, with no AI.

</details>

<!-- reset: section added by the cli lane -->

## 🔁 Updates

✨ **In the editor:** open it through `npm run serve`. A newer release shows a popup with **Update now**, **Later** and **Skip this version**.

🛡️ Update now backs up first, replaces program files only, and puts the old version back on any failure.

🧩 **Claude Code plugin:** `/plugin marketplace update business-wrap`, then `/plugin update business-wrap`, then `/reload-plugins` (an MCP client without it: restart the client). The plugin is never updated in place; until you reload, the running MCP server answers `RESTART_REQUIRED`, and a stale "not connected" can stay cached for 15 minutes. `/business-wrap:doctor` shows what is loaded.

⌨️ **Terminal or agent:** `node update/cli.mjs --check` (at most one request a day), `--apply --yes` to install, `--notes` for what changed.

🔓 The repo is public: no token, no sign-in. Nothing updates without your consent.

<details>
<summary>📖 How the in-editor update works</summary>

At launch the editor (served by `npm run serve -- <editor.html>` or `node engine/serve.mjs <editor.html>`) checks for a newer release, at most once a day and without blocking anything. Update now downloads the release, checks its fingerprint, backs up, replaces the program files only, verifies the new version, restarts the server and reopens your document where you were. Your documents, edits and their history, design packs, fonts, logos, `out/` and `.local/` are never touched. **Settings** (toolbar View section, or Ctrl+K) shows About, the update state with **Check now** and the auto-check switch, and your preferences. Opened from disk (`file://`), the page cannot check: Settings says how to update. Every release: https://github.com/NJ-Burrito/Business-Wrap/releases. Details: [bible/07-updates.md](bible/07-updates.md).

</details>

## 🧰 What it does

🌾 **Harvest:** a process model gives roles, workflow, rules and statuses; a crawl of the live service gives the card, form, attachments and messages. The merge keeps both.

📝 **Editor:** one HTML file. The page you edit is the page that prints. Every change is undoable and recorded.

🎀 **Ribbon:** 12 tabs (File, Export, Home, Font, Paragraph, Insert, Layout, Header and footer, Design, Review, Spelling, View), plus 4 that appear when you select a table, a picture or a diagram. Each tab has its own icon and colour, every tool has its name under it, nothing scrolls sideways, and it opens and closes with a smooth glide.

💡 **Explanation panel:** rest on a tool for a moment and a panel on the right shows a small drawing of what it does. It floats over the pages and moves nothing.

🔤 **Spelling:** offline Arabic and English checking with one switch. A Spelling tab (next, previous, fix, fix all, ignore, add to dictionary, a count) and a side panel with suggestions when you click a misspelt word.

📦 **Projects:** export every document of a project as HTML, PDF, DOCX or edits, in one folder or one zip with an index page. Import a project, a folder, a zip or a pile of PDF, DOCX and HTML files as one project.

🤖 **Live editor tools:** your AI assistant can list the open documents, read one, get its outline, apply a batch of edits as one undo step signed as the agent, and run a safe editor action. Eight `/business-wrap:` commands wrap them (see Commands).

🔍 **Zoom:** 25% to 400%, with Fill width, Fill height and Ctrl plus the mouse wheel. 100% is true size.

🌙 **Look:** a dim navy dark mode, a calm drafting-grid background behind the pages, and a watermark that reacts now and then without a sound.

🔌 **Server switch:** one toggle in the top bar. Turn the server off and the editor stays open with a Turn on card.

🗂️ **File and folder icons (Windows):** in Settings, use Business-Wrap icons for your PDF, Word and web page files; Restore puts the Windows icons back. File icons follow the app record Windows 11 keeps for each file type, and your document folders get an icon that matches what is inside (PDF, Word or web page), set automatically.

🔀 **Two languages, one layout:** «ع» / «E» switches language; RTL / LTR switches word direction. The toolbar and the page stay where they are.

🧭 **Diagrams:** the workflow figure is editable on the page. Mermaid in and out.

🎨 **Design:** colours, sizes, template parts, any font. Labels say what they do, in Arabic and English.

📤 **Exports:** PDF, DOCX, edits JSON, design pack, Save HTML, webhooks.

🔐 **Safety:** a security gate keeps client content, credentials and local paths out of the repo.

<details>
<summary>🔍 Full feature table</summary>

| Area | What you get |
|---|---|
| **Harvest** | Two ways in, and a merge: a process model (BPMN, draw.io, YAML) gives roles, workflow, rules and statuses; a crawl of the live service gives the card, the form, attachments and messages. The merge keeps both, never picks. |
| **Editor** | One HTML file, opened from disk. The page you edit is the page that prints. Every printed word, table, label and design property is editable, undoable and recorded. |
| **Ribbon** | 12 tabs, plus a Table, Picture or Diagram tab when you select one. Tools sit on an even grid with a name under each. Select something and its own tools come first and **stay** while you work in panels, menus and pickers; a click on empty space or Esc brings the general tools back. Press the open tab again to fold it. |
| **Explainers** | Rest on any tool for a moment (or reach it with the keyboard): a panel on the right names it, shows its shortcut, says what it does in one sentence and shows a small drawing of it. Arabic and English. |
| **Spelling** | Offline Arabic and English, checked by script so a mixed paragraph gets the right dictionary. A Spelling tab and a side panel with suggestions. Dictionaries are not stored in a saved HTML file: a file opened from disk uses the browser's own checker. |
| **Projects** | Export a whole project (HTML, PDF, DOCX or edits; a folder or a zip with an index) and import a project, folder, zip or pile of files, with progress and a summary. |
| **Layout** | The layout never flips. «ع» / «E» changes the language and the edition; RTL / LTR changes the direction of the words. Toolbar, panels, page and watermark stay where they are. |
| **Page views** | Continuous, Single page, or Book (the cover alone, then two pages side by side in the document's reading direction). Remembered; print and export are untouched. |
| **Diagrams** | Shapes, arrows with bends, labels in place, alignment, auto layout, zoom, legend. Mermaid in and out. |
| **Design** | Colours (swatch + hex), sizes (slider + number + unit), template parts, labels, per-block style, advanced CSS. **Any font**: the project's, this computer's or an uploaded file. |
| **Exports** | PDF and DOCX (fonts always embedded as real, selectable text), the edits JSON, a design pack, Save HTML (the editor with your edits). |
| **Automation** | Webhooks on save and export; an MCP server; a Claude Code plugin; `node update/cli.mjs` to stay current. |
| **Safety** | A security gate keeps client content, credentials and local paths out of the repository; the crawler never files a real request unless you ask twice. |

🔤 Every chosen font is embedded as real text in PDF and DOCX; the font's licence is your responsibility.

</details>

<details>
<summary>🌾 Start a document (harvest)</summary>

> **The crawler never files a request unless you ask.** A crawl is a dry run: it reads every step and stops before the final action (Send, Submit, Confirm, Pay; «إرسال»، «تقديم»، «تأكيد»، «دفع»). Filing a real request needs `submit: true` in the config **and** `--yes-file-real-request`.

```powershell
npm run harvest:model -- <process.bpmn | .drawio | .yaml>   # roles, workflow, rules, statuses
npm run harvest:crawl -- <crawl.json>                        # card, form, attachments, messages
npm run harvest:merge -- <harvest.json> <process.json>       # the union of both
```
Each gives the Arabic and English document JSON and an editor. In the editor: **New document**. See [bible/08-harvest.md](bible/08-harvest.md).

</details>

<details>
<summary>📝 The editor, diagrams, design and exports</summary>

- **Sticky selection tools.** A block, a table cell, a logo, an image, a diagram shape or an arrow puts its own section first in the toolbar. It stays while you use menus, the Design panel, colour pickers or inline editors. A click on empty space, or Esc, returns the general tools.
- **Sections that fold the same way in both languages.** Every word keeps the width of the longer of its Arabic and English forms, so «ع» and «E» show the same tools in the same places.
- **«ع» / «E»** switch the interface language and the edition you edit; **RTL / LTR** switch the direction of the words.
- **Commands** (`Ctrl+K`): every action, searchable. **Focus mode** (`F`) hides the tools; **Calm mode** turns motion off (also on when the system asks for reduced motion).

**Zoom** runs from 25% to 400%: type a number, use Ctrl plus the wheel, or press Fill width or Fill height.

**Page views** (View → Pages): *Continuous* is the long sheet; *Single* shows one page at a time; *Book* opens on the cover alone, then pairs pages in the document's reading direction (Arabic: first page of a pair on the right).

**Diagrams:** click a shape for shape tools, an arrow for arrow tools, the empty drawing for diagram tools. Drag to move, drag a corner to resize, drag an arrow's segment to bend it, double-click to edit a label, Ctrl + wheel to zoom. **Import / Export Mermaid** (`npm run diagram:mermaid`, MCP `diagram_mermaid`).

**Design:** colours by role, sizes and spacing, template parts (show, hide, order), printed labels, one block's own style (**Style this**) and sanitised advanced CSS.

| Output | How |
|---|---|
| PDF + DOCX | «PDF + DOCX» through `npm run serve`, or `node engine/export.mjs` |
| Edits JSON | «Save»: every change, with its old value, reviewable in History |
| Design pack | Design panel → Export design (import it into another document) |
| Save HTML | the editor with your edits, one file, opens anywhere |
| Webhooks | Document → Webhooks: your URL is told on save and export (sent through `npm run serve`) |

**Export & Print:** one Export menu and one Print entry; PDF and DOCX per language or both, HTML, print HTML, edits, design pack, Mermaid / SVG / PNG of diagrams; page range and cover option.

**Template packs:** e-service, e-commerce, call-centre, approval, SaaS, generic IEEE 29148, plus your own (`templates/_example-custom`). Every requirement cites its evidence. See [bible/09-template-packs.md](bible/09-template-packs.md).

**Local learning:** a journal of your edits in `.local/learning/` on this machine only; `npm run learn` turns repeated corrections into rules for your AI agent. Settings → "Local learning" to switch it off or forget everything. See [bible/10-learning.md](bible/10-learning.md).

</details>

<details>
<summary>🆕 New in 0.15</summary>

- 🎀 **Ribbon (0.15.0):** tabs with icons and colours, tools on a grid with names, no sideways scroll. **Spelling** joined in 0.15.2.
- 💡 **Explanation panel:** a drawing for every tool; since 0.15.2 it opens after a short rest on a tool and floats over the pages.
- 🌙 **Dark mode is a dim navy;** the page sits on a soft giant NJ logo (0.15.0), then a drafting-grid background (0.15.2).
- 🔌 **One server switch;** a lost connection with many tabs open is fixed.
- ✍️ **Offline spell checking** in Arabic and English (0.15.0), with the Spelling tab and side panel (0.15.2).
- 📦 **Project export and import** (0.15.0).
- 🤖 **Live editor tools and 8 slash commands** (0.15.0 and 0.15.2).
- 🔍 **Zoom 25% to 400%** and Fill height (0.15.0); 100% is true size (0.15.2).
- 🗂️ **File icons** (0.15.1) and **folder icons per file type**, set automatically (0.15.3).
- 📋 **The user-story ID card is a real table** (0.15.1).
- ⚡ **Lighter on your PC** (0.15.2). Details: [CHANGELOG.md](CHANGELOG.md).

</details>

<details>
<summary>🆕 New in 0.13.0</summary>

- **Documents** («المستندات», Ctrl+O): every Save is a document of its own (a template is never overwritten); open here or in a new tab, duplicate, delete and restore, import PDF, DOCX or HTML.
- **Changes** («تغييرات», Ctrl+Shift+H): a timeline of every edit with back, forward and checkpoints; the counter starts again at each Save HTML.
- **Save folder** (asked once on the first Save or export; «Open folder» in Settings shows it): see *Where your files go* below.
- **Background host:** closing the last tab saves every tab and stops the server; the next launch offers to resume everything or start new work.
- **Header and Footer** toolbar sections: text, fields, logos, page numbers; each item for every page, this page only, or from this page on; edited on each page in the page views.
- **Page setup:** A3, A4, A5, Letter, Legal; portrait or landscape for the whole document or one section, shown on the editor canvas as it will print (0.13.1); page breaks at a chosen section.
- **Tables (0.13.2):** cells select, merge, split, wrap and hold lists; copy and paste from Excel; formulas (SUM, AVERAGE, MIN, MAX, COUNT); drag to resize; Enter is a new line, Tab moves to the next cell. Insert › User story, and «Gaps and pages» tools for empty space.
- **Objects:** tables, sections and chapters anywhere; copy and paste a whole block; free text boxes; images with Word's seven wrap modes.
- **Format bar:** colour, size, font, alignment, lists to six levels, quote, link, code; Ctrl+B / I / U.
- **Everything editable:** TOC entries, the document-control table, revisions; they get the table tools.
- **Trust:** profile, provenance per change, sign, share, lock and unlock, a tamper-evident history, a work report as PDF.
- **Tooling:** the `business-wrap` CLI (offline, no AI), "/" commands, MCP harvest → editor, healers and per-stage gates.
- **Design:** import a colour palette (with the contrast gate), logo motion, calmer side panels (groups collapsed), short click-to-dismiss toasts.

### Where your files go / أين تُحفظ ملفاتك

```
Business-Wrap\
  اقرأني - README.txt                 what each folder is, in Arabic and English
  المستندات - Documents\
    <Document title>\                 one folder per document (the Arabic title, else the English one)
      <Document title>.html           the editable file: Save HTML overwrites it
      Exports\                        <YYYY-MM-DD HH-MM> <Document title> - العربية.pdf | - English.pdf | .docx | - both.pdf
      Sources\                        what a harvest or an import collected for this document
      Versions\                       the previous saves (kept, never deleted)
    _غير مصنف - Unsorted\             old files whose document could not be told
  .system\                            hidden: history\ (the work log), backups\, sessions\, library\, cache\
```

Every export and every save toast names the real path. Nothing is written anywhere else (`business-wrap new|harvest|import|export` without `--out` use the same folders; `--out` is for builds and tests). A folder from 0.13.0-0.13.2 (`PDF`, `DOCX`, `HTML`, `HISTORY`) is moved in on the first start of 0.13.3: nothing is deleted, every move is logged in `.system\migration-0.13.3.json`, and the history stays found by document id. `business-wrap tidy --dry-run` prints the plan, `business-wrap tidy` applies it.

</details>

## 🔤 Fonts

🎯 Documents use the Thmanyah families. **Cairo is banned**, also as a fallback.

🏠 **Your own copy wins:** `BW_FONT_DIR`, `.local/config.json`, then the system font folder.

🎁 **No copy on this machine?** A bundled fallback in `fonts/nj-fonts/` is used, so the PDF prints right out of the box.

⚖️ `fonts/nj-fonts/` is under the Thmanyah licence, **not** MIT. Details: [fonts/README.md](fonts/README.md).

## 🤖 For AI agents

📘 Read [AGENTS.md](AGENTS.md) and [SKILL.md](SKILL.md) (Claude Code, Claude Desktop, Codex, Cursor, Gemini CLI or any MCP client).

🎛️ **Live editor tools (MCP):** `editor_list_documents`, `editor_get`, `editor_outline`, `editor_ops` (a batch of edits, one undo step, signed as the agent), `editor_action`, `editor_new`, `editor_import`, and `host_health`. They need an open editor tab.

🛑 **`editor_action` is an allow-list:** `renumber`, `check`, `saveHtml`, `share`, `exportPdf`, and safe view actions (zoom, theme, reading mode, find, save, outline, page turns). Anything that deletes, closes, clears or stops is refused (`REFUSED`).

🚦 **Errors to expect:** `NO_TAB` (no editor tab is open: open the editor first), `TAB_TIMEOUT` (the tab did not answer in 15 seconds: call `host_health`), `REFUSED` (a locked document or a destructive action). Details: [docs/automation.md](docs/automation.md).

🔔 At the start of a task run `node update/cli.mjs --check` (or MCP `check_update`); tell the user about a newer release in one line; never update without consent.

<details>
<summary>⚙️ Machine settings, security gate, folders</summary>

**Machine settings** (never committed): `.local/config.json` (gitignored) or environment variables; env wins.

| key | env | what |
|---|---|---|
| `fontDir` | `BW_FONT_DIR` | font root (searched recursively); TrueType preferred |
| `watermarkDir` | `BW_WATERMARK_DIR` | the tool's watermark images, editor UI only |
| `chrome` | `BW_CHROME` | Chrome or Edge executable |
| `poppler` | `BW_POPPLER` | poppler `bin` folder (pdftotext / pdffonts in the tests) |
| `brandDir` | `BW_BRAND_DIR` | the tool's logo folder (default `brand/v3/logo/`), UI only |

Browser support: Chrome and Edge, latest stable (Chromium 120+).

**Security gate:**
```powershell
$env:PYTHONUTF8 = "1"
python security/check.py --all   # tree + history + commit messages: no client content, secrets or local paths
python design/build.py           # palette contrast gate + theme
git config core.hooksPath .githooks
```

| Folder | Holds |
|---|---|
| `bible/` | the method, AR + EN, and the machine contracts |
| `engine/` | renderer, edits contract, editor build, PDF/DOCX export, harvest, MCP-facing CLIs |
| `editor/` | the editor app: shell, toolbar, explainers, page views, diagrams, Design panel, fonts |
| `samples/event-permit/` | the anonymised sample service, AR + EN |
| `tests/` | one suite per area, all run by `npm test` |
| `design/`, `palette/`, `typography/` | design packs and DTCG tokens with their gates |
| `fonts/` | the font manifest and the bundled Thmanyah fallback (`fonts/nj-fonts/`, its own licence) |
| `security/` | the gate that keeps client content and secrets out |
| `docs/` | guide, architecture, decisions, roadmap, privacy, glossary |

</details>

## 🔒 Is it safe?

🏠 **Local only:** the editor, the PDF printer and the DOCX builder run on your computer. Nothing is uploaded ([docs/privacy.md](docs/privacy.md)).

🔁 **One automatic request:** the update check, at most once a day, to the public GitHub release list. Webhooks send only to an address you set.

🌾 **The crawler is a dry run:** it stops before Send, Submit, Confirm or Pay unless you ask twice.

🔏 **Tamper-evident history (0.13.0), and its honest limit:** every edit, save, export, sign, lock and unlock is an entry in a hash-chained, signed log (`bwlog` v1, a frozen format) that travels inside the shared HTML, with a mirror in your save folder's `HISTORY`. A removed or edited entry, or an edit that was never logged, is detected and shown. The log is encrypted only against casual reading: Business-Wrap is MIT and open source, so the key is in the code. Someone with the source can rebuild a whole chain with new keys; that is caught only where a mirror or a pinned key from the real author exists (another machine, the `HISTORY` store, an earlier shared copy). There is no trusted timestamp. Removing the log and the `bwlog` mark is not enough to pass a file off as "made before 0.13": since 0.13.1 a Save-HTML also carries independent traces (the timeline marks in each edition, a `bw-ledger` meta tag with the document id and state hash, an attribute on `<html>`, a second hash in the CSP, the file's own version), and any one of them with no valid log reads «stripped». Someone who finds and removes every trace by hand can still make a file look pre-0.13; where the local `HISTORY` mirror knows the document, it still flags it «stripped» on this machine. Lock blocks accidental edits; it is not access control ([bible/11-trust-ledger.md](bible/11-trust-ledger.md)).

🛡️ **A security gate** (`security/check.py`, plus gitleaks in CI) keeps client content, credentials and local paths out of the repo. Found a problem? [SECURITY.md](SECURITY.md).

## ❓ Questions

<details>
<summary>🆓 Is it free?</summary>

Yes. MIT licence, no paid plan, no account.

</details>

<details>
<summary>🏠 Does my document leave my computer?</summary>

No. The editor, the PDF printer and the DOCX builder run locally.

The one automatic request is the update check: at most once a day, to the public GitHub release list. Webhooks send only to an address you set.

</details>

<details>
<summary>🤖 Do I need Claude?</summary>

No. The editor and the command line work on their own. The plugin and the MCP server are optional.

</details>

<details>
<summary>🔄 What goes in, what comes out?</summary>

In: a process model (BPMN, draw.io, YAML) or a crawl of a live service.

Out: PDF, DOCX, the edits JSON, a design pack, and the editor saved as HTML.

</details>

<details>
<summary>🌾 Will the crawler file a real request?</summary>

Not unless you ask twice: `submit: true` in the config and `--yes-file-real-request`. Otherwise it stops before Send, Submit, Confirm or Pay.

</details>

<details>
<summary>🔤 Which fonts can I use?</summary>

Thmanyah by default: your own copy wins, and a bundled fallback (under the Thmanyah licence, not MIT) makes the PDF right out of the box. Any font on your computer, or a file you upload, also works; its licence is your responsibility.

</details>

<details>
<summary>💻 What does it run on?</summary>

Tested on Windows 11 with Node 24 and Chrome. It needs Node 20+, Chrome or Edge, and Python with uv for DOCX. macOS and Linux are untested.

</details>

## 🆘 Problems?

🆘 **[Support page](https://nj-burrito.github.io/Business-Wrap/support.html):** the common fixes.

📖 **[The guide](docs/guide.md):** install, quick start, troubleshooting, backup.

🐞 **[Open an issue](https://github.com/NJ-Burrito/Business-Wrap/issues/new/choose):** pick Bug or Feature; include the version (`node update/cli.mjs --check`).

🔒 **Security problem?** Report it privately: [SECURITY.md](SECURITY.md).

## 🌐 More from NJ
[Portfolio](https://nj-burrito.github.io/) · [NJ-Kit](https://nj-burrito.github.io/NJ-Kit/) · [QA-Wrap](https://nj-burrito.github.io/QA-Wrap/) · [Profile-Wrap](https://nj-burrito.github.io/Profile-Wrap/) · [Story-Wrap](https://nj-burrito.github.io/story-wrap/) · [GitHub](https://github.com/NJ-Burrito)

⚖️ [MIT](LICENSE) · [NOTICE.md](NOTICE.md) (fonts) · [fonts/README.md](fonts/README.md)
