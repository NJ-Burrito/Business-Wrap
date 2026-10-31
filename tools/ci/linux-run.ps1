<#
  Run Business-Wrap tests on Linux before pushing, so a Linux-only failure is found here and not in CI.
  Uses WSL (Ubuntu). If WSL is not installed this says so and exits 3 without touching anything.

    pwsh tools/ci/linux-run.ps1                        all suites in WSL
    pwsh tools/ci/linux-run.ps1 -Shard 2/4             one CI shard
    pwsh tools/ci/linux-run.ps1 -Suites editor,print   named suites only
    pwsh tools/ci/linux-run.ps1 -Check                 only report whether WSL is ready

  The repo is copied (no node_modules, no .git) into the Linux home (~/bw-linux), because Windows-built
  node_modules and the slow /mnt drive would give wrong results. Nothing is written to drive C.
  One-time setup: tools/ci/linux-local.md.
#>
param(
  [string]$Shard = '',
  [string[]]$Suites = @(),
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Stop-NoLinux($why) {
  Write-Host "LINUX CHECK NOT RUN: $why" -ForegroundColor Yellow
  Write-Host "Set it up once (WSL Ubuntu, or act): see tools/ci/linux-local.md. Until then CI is the only Linux check." -ForegroundColor Yellow
  exit 3
}

$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wsl) { Stop-NoLinux 'wsl.exe is not installed on this machine.' }
$raw = (cmd.exe /c "wsl.exe -l -q 2>nul") -join "`n"
$distros = @(($raw -replace "`0", '') -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch 'not installed|--install' })
if ($LASTEXITCODE -ne 0) { $distros = @() }
if (-not $distros.Count) { Stop-NoLinux 'WSL is present but has no Linux distribution installed.' }
Write-Host "WSL distributions: $($distros -join ', ')"

$probe = & wsl.exe -e bash -lc 'command -v node >/dev/null && node -v; command -v python3 >/dev/null && python3 --version; command -v rsync >/dev/null && echo rsync-ok; command -v pdftotext >/dev/null && echo poppler-ok'
Write-Host ($probe -join ' | ')
if (-not ($probe -match '^v2[4-9]\.')) { Stop-NoLinux 'Node 24 or newer is missing inside WSL (see linux-local.md, step 3).' }
if ($Check) { Write-Host 'WSL is ready.'; exit 0 }

$wslRoot = (& wsl.exe -e wslpath -a ($root -replace '\\', '/')).Trim()
$run = if ($Shard) { "node tests/run.mjs --shard $Shard" }
       elseif ($Suites.Count) { "node tests/run.mjs $($Suites -join ' ')" }
       else { 'node tests/run.mjs' }

$script = @"
set -e
mkdir -p ~/bw-linux
rsync -a --delete --exclude node_modules --exclude .git --exclude out '$wslRoot/' ~/bw-linux/
cd ~/bw-linux
npm ci --no-audit --no-fund
export CI=true PYTHONUTF8=1
$run
"@
& wsl.exe -e bash -lc $script
exit $LASTEXITCODE
