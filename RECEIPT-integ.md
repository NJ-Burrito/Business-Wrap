# RECEIPT integ/0.13.2 (HEAD after 3 commits on bf75c35)
Base is `main` dc22de8; origin/main has 0 commits main lacks.
Full run: BW_JOBS=3 node tests/run.mjs -> 36/43 suites ok before fixes. gate:history ok. Asset rebuilt (3a11666).
list() (21-format.js:117 multi-leaf; 24-cells.js:97 cells) and render.mjs (coveredOf; makeBidi \n->br) both survive.

| check | class | evidence |
|---|---|---|
| plugin "npm test runs every tests/*" ; owner-flows L36 | MERGE REGRESSION, fixed 3d58a27 | run.mjs discovers suites, meta-checks still scanned the script |
| cells formula x9 | MERGE REGRESSION, 5 fixed a4c87d0, 4 open | 27-writing.js keydown: Enter in td inserts \n (B); 24-cells expects plain Enter to leave cell (A). Open: tests/cells.test.mjs 270-279 (type 10 + Enter) -> QUESTION |
| design "every new icon has hover motion" (16 icons cellMerge..pgEm) | LANE (A+B) | editor/ext/40-icon-motion.css has no rules; base 131/131 |
| history-compat "opened in the editor" 0.13.0 + 0.13.1 | LANE history | fails identically on fix/history-migration alone; tests/history-compat.test.mjs:60, log gets 2 extra entries, verdict ok=false |
| owner-flows L29 document control add row/col | LANE B | fails on feat/layout alone; passes on cells and base; tests/owner-flows.test.mjs:343 |
| ux move single/spread ar (free text absent) | LANE B | fails on feat/layout alone (144/146), base 146/146; tests/ux.test.mjs:459-468 (dgText) |
| ux A5 leaving hides card | FLAKE | fails in no run here (passes full + alone) |
| srs security gate (6 findings) | LANE docs | PROPOSAL-governance.md:28,50; RECEIPT-speed.md:4,32; recover-history-report.md:3; tests/writing.test.mjs:182 (local path); base passes |
| owner-flows L22, L16 x2 | PRE-EXISTING | same fails on main |
| editor Save-HTML, 60-page timing, a11y, provenance | PASS in the full run | a11y: axe-core is in main package.json, npm ci done |
First (timeout-killed) run showed provenance "no page errors" once: flake, passes in the full run.
