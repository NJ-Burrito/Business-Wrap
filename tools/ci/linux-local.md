# Running the CI tests on Linux locally

CI runs on `ubuntu-latest`; this machine is Windows. Parts of the suites fail only on Linux. These are the ways to
see that before a push. **Status on this machine (2026-10-31): neither WSL nor Docker is installed**, so
`tools/ci/linux-run.ps1` prints "LINUX CHECK NOT RUN" and exits 3. Two cheaper guards work without Linux:

- `tests/platform-guard.test.mjs` (runs in every shard and in `node tests/run.mjs platform-guard`): fails when a test
  calls PowerShell, `Expand-Archive`, `msedge.exe` or a drive/backslash path without a `win32` check.
- `npm run ci:failed` reads what failed on GitHub and re-runs only those suites here.

## Option A: WSL Ubuntu (recommended)

1. Admin PowerShell, once: `wsl --install -d Ubuntu` and reboot. The distribution lands on drive C by default. Rule
   "drive C holds nothing" applies, so move it to O: right after installing:
   `wsl --export Ubuntu O:\DevCache\ubuntu.tar`, `wsl --unregister Ubuntu`,
   `wsl --import Ubuntu O:\DevCache\wsl\Ubuntu O:\DevCache\ubuntu.tar`, then delete the tar with safe-delete.
2. In Ubuntu: `sudo apt-get update && sudo apt-get install -y rsync poppler-utils fonts-noto-core python3 python3-pip curl`.
3. Node 24: `curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs`.
   Python libs the tests use: `pip3 install --user --break-system-packages pymupdf python-docx lxml jsonschema`.
4. The browser the tests drive is whatever the CI runner has (Chrome). In Ubuntu install Chrome or let the tests fall
   back to bundled Chromium if they do (`npx playwright-core install chromium` writes to `~/.cache`, inside WSL, not C:).
5. Check: `pwsh tools/ci/linux-run.ps1 -Check`. Run a CI shard: `pwsh tools/ci/linux-run.ps1 -Shard 2/4`.
   Run the suites that failed on CI: `pwsh tools/ci/linux-run.ps1 -Suites editor,print`.

## Option B: `act` (needs Docker)

`act` runs the workflow in a container. It needs Docker Desktop or Podman, which is a bigger install than WSL, and its
runner image is not identical to GitHub's. Only worth it if you want the workflow file itself exercised:
`winget install nektos.act`, then `act push -j tests --matrix shard:1 -P ubuntu-latest=catthehacker/ubuntu:act-latest`.
Point the Docker data root to drive O:.

## Keeping the shards balanced

`tests/durations.json` holds seconds per suite; the shard split uses it (longest first onto the lightest shard).
Each CI shard uploads `suite-times-<n>` artifacts. To refresh after a run:
`gh run download <run-id> -p "suite-times-*" -D O:\Temp\st` then
`node tests/run.mjs --merge O:\Temp\st\suite-times-1\suite-times.json O:\Temp\st\suite-times-2\suite-times.json ...`
and commit `tests/durations.json`. A suite with no recorded time counts as the median, so new suites need no edit.
