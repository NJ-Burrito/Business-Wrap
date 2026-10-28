# Business-Wrap distribution: where it is listed and who does each step

Business-Wrap is independent and not affiliated with Anthropic or any government service. No listing or package name
contains "claude-" or "anthropic-". Privacy policy for every listing: https://nj-burrito.github.io/Business-Wrap/privacy.html
(source `docs/privacy.md`). Listing images: `brand/v2/social/og.png` and `brand/v2/banner/github-banner-still.png`. Social card: `brand/v2/social/social-card.png` (1280x640).

Who: **Lead** = the build session; **The maintainer** = needs his own login or click. Status values: `todo`, `ready`
(files done, waiting for a step), `submitted`, `live`. Update the dated row after each step.

## Order

1. Repo public, MIT `LICENSE` on `main`, site live (`pages.yml`).
2. npm `business-wrap` published (the MCP registry entry starts `npx -y -p business-wrap@<version> business-wrap-mcp`,
   which fails until then). Since 0.11.1 the plugin's `mcpServers` and Smithery start
   `npx -y -p github:NJ-Burrito/Business-Wrap#v<version> business-wrap-mcp`, which works without npm.
3. Official MCP Registry (needs 2).
4. Glama, Smithery (need the public repo; Smithery also needs 2 or a bundle).
5. Anthropic plugin directory (needs 2, because the plugin starts the MCP server from npm).
6. mcprush.

## Status

| Directory | Needs first | Who | Status | Date | Link |
|---|---|---|---|---|---|
| npm `business-wrap` | `"private": true` removed from `package.json`, npm account | The maintainer (once) | todo | 2026-10-28 | |
| Official MCP Registry | npm live | The maintainer (login) | ready (`mcp/server.json`) | 2026-10-28 | |
| Glama | `glama.json` on `main`, repo public | The maintainer (claim) | ready | 2026-10-28 | |
| Smithery | npm live, `mcp/smithery.yaml` | The maintainer (login) | ready | 2026-10-28 | |
| Anthropic plugin directory | npm live, paid claude.ai plan | The maintainer | ready (`.claude-plugin/`) | 2026-10-28 | |
| mcprush | repo public | The maintainer | ready | 2026-10-28 | |
| mcp.so | | | skipped (paid listing; Business-Wrap stays free) | 2026-10-28 | |

## 1. npm (before any MCP listing)

Files: `package.json` (`name: business-wrap`, `bin: business-wrap-mcp`, `files`, `mcpName: io.github.NJ-Burrito/business-wrap`).
**Lead:** remove `"private": true` (it blocks publishing), keep `"license": "MIT"`, run `npm pack --dry-run` and read the list:
no font file, no `.local/`, no `out/`. **The maintainer:** `npm login`, then `npm publish --access public` from a clean
checkout of the release tag. Check after: `npx -y -p business-wrap@<version> business-wrap-mcp` starts and lists its tools
(`npm run test:mcp` does the same from a clone).

## 2. Official MCP Registry

Needs: `business-wrap` live on npm; `package.json` `mcpName` equals `mcp/server.json` `name`
(`io.github.NJ-Burrito/business-wrap`, done); `mcp/server.json` on schema 2025-12-11 with the same version as `package.json`
(checked by `node update/version-sync.mjs`).

**The maintainer** (GitHub login, namespace `io.github.NJ-Burrito/*`), from the repo folder:

```
cd mcp
mcp-publisher login github
mcp-publisher publish
```

Verify: `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.NJ-Burrito/business-wrap"`.
If a command or schema URL has changed, follow https://modelcontextprotocol.io/registry/quickstart .

Listing text: **Business-Wrap.** Bilingual (Arabic RTL / English LTR) requirements documents from evidence: build the
editor, apply edits files, export PDF + DOCX and design packs, harvest from a process model or a live service. Local only,
stdio, MIT.

## 3. Glama

Needs: `glama.json` in the repo root on `main` (done: `$schema` + `maintainers: ["NJ-Burrito"]`).
**The maintainer:** sign in at https://glama.ai with GitHub, add https://github.com/NJ-Burrito/Business-Wrap on
https://glama.ai/mcp/servers if it is not indexed, claim it, paste:

> Business-Wrap turns evidence about an e-service (a BPMN, draw.io or YAML process model, or a walk through the live
> service) into an Arabic and English requirements document. The MCP server builds the single-file HTML editor, validates
> and applies edits files, exports PDF and DOCX with fonts embedded as real text, exports design packs, harvests from a
> model or a crawl (dry run by default) and checks for updates. Local only, no network port. MIT.

## 4. Smithery

Files: `mcp/smithery.yaml` (stdio, launches `npx -y -p github:NJ-Burrito/Business-Wrap#v<version> business-wrap-mcp` (from 0.11.1; switch to `business-wrap@<version>` once npm is published), optional `fontDir`).
A stdio server is published as an MCPB bundle; a URL publish needs a hosted HTTPS server, which Business-Wrap does not run.
**Lead:** build `business-wrap-mcp.mcpb` (`npx @anthropic-ai/mcpb pack` with a `manifest.json`; not in the repo yet).
**The maintainer:** `smithery auth login`, then `smithery mcp publish ./business-wrap-mcp.mcpb -n NJ-Burrito/business-wrap`
(command from https://smithery.ai/docs/build/publish ). The skill (`SKILL.md`) can also go to Smithery skills, as for
Profile-Wrap. Same text as Glama. Not verified: whether Smithery reads `smithery.yaml` for a stdio bundle.

## 5. Anthropic plugin directory (Claude Code)

Needs: paid claude.ai plan; npm live; `.claude-plugin/plugin.json` and `marketplace.json` on `main` (done, MIT).
**Lead** before the maintainer starts: `claude plugin validate --strict .` and `python security/check.py` must pass.
Optional fields the portal asks for: homepage `https://nj-burrito.github.io/Business-Wrap/`, privacy
`https://nj-burrito.github.io/Business-Wrap/privacy.html`, support `https://nj-burrito.github.io/Business-Wrap/support.html`,
terms `https://nj-burrito.github.io/Business-Wrap/terms.html`.
**The maintainer:** open https://claude.ai/directory/manage , submit the repository, paste the Glama text, upload
`brand/v2/social/og.png` and `brand/v2/banner/github-banner-still.png`.
Self-hosted route, no review, works now: `/plugin marketplace add NJ-Burrito/Business-Wrap`, then
`/plugin install business-wrap@business-wrap`.

## 6. mcprush

**The maintainer:** submit https://github.com/NJ-Burrito/Business-Wrap on mcprush's submit page with the Glama text and
the site URL. No repo files needed. Submission rules were not verified.

## Known gaps

- The npm package is not published (404 on 2026-10-28); `package.json` still says `"private": true`.
- No `.mcpb` manifest yet (Smithery).
- Directory rules change; where a screen differs from this file, follow the screen and keep the intent.
