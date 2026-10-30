// Machine settings. Nothing machine-specific is committed: the values come from
// environment variables, else from the gitignored `.local/config.json`:
//
//   { "fontDir": "...", "watermarkDir": "...", "chrome": "...", "poppler": "..." }
//
// env: BW_FONT_DIR, BW_WATERMARK_DIR, BW_CHROME, BW_POPPLER (env wins).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localBase } from './testguard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_FILE = path.join(localBase(REPO), 'config.json');

let cached;
export function config() {
  if (cached) return cached;
  let file = {};
  try { file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* no local config: env and defaults only */ }
  cached = {
    fontDir: process.env.BW_FONT_DIR || file.fontDir || '',
    watermarkDir: process.env.BW_WATERMARK_DIR || file.watermarkDir || '',
    chrome: process.env.BW_CHROME || file.chrome || '',
    poppler: process.env.BW_POPPLER || file.poppler || '',
    brandDir: process.env.BW_BRAND_DIR || file.brandDir || '',
  };
  return cached;
}
