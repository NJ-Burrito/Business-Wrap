# Design tokens (W3C DTCG format)

Retrieved 2026-10-27.

## Verdict
`palette/`, `typography/` and design packs use the DTCG Format Module 2025.10 shape: `$value`, `$type`, `$description`, groups, `{alias}` references.

| Claim | Grade | Source |
|---|---|---|
| First stable DTCG format, version 2025.10, released 2025-10-28 | V | https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/ |
| It is a Final Community Group Report, not a W3C Standard | V | https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/ |
| A token is an object with `$value`; `$type` may be inherited from the group; tools must not guess type from value | V | https://www.designtokens.org/tr/drafts/format/ |
| Aliases: `{group.token}`; JSON Pointer `$ref` also allowed | V | https://www.designtokens.org/tr/drafts/format/ |
| `dimension` is `{ "value": n, "unit": "px" or "rem" }` | V | https://www.designtokens.org/tr/drafts/format/ |
| `color` is an object `{ colorSpace, components, alpha?, hex? }` | V | https://www.designtokens.org/tr/drafts/format/ |

## Decision
Print units (pt, mm) are not DTCG units. Tokens carry a spec-valid `px` value for screen (1pt = 4/3 px, 1mm = 96/25.4 px) and the exact print value in `$extensions["business-wrap"].print` (for example `"14pt"`), which the renderer prefers. One file serves both media.
