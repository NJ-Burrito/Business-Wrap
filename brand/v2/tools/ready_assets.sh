#!/bin/sh
# Rewrite brand/v2/READY-ASSETS.txt from the files tracked or staged under brand/v2 (run after git add, before commit).
cd "$(dirname "$0")/.." || exit 1
{ echo "READY $(date +%F' '%H:%M): final files, paths relative to brand/v2/. Rules: BRAND.md. Tokens: tokens.json, tokens.css, fonts.css, contrast.md."
  git ls-files --cached -- . | grep -v -e '^tools/' -e '^motion/[^/]*/' -e 'READY-' -e 'CHECKPOINTS' ; } > READY-ASSETS.txt
