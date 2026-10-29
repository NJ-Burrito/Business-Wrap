#!/usr/bin/env node
// business-wrap update — the version check and the update, for people and for agents.
// business-wrap <verb> … — any other verb runs engine/cli.mjs (business-wrap help lists them).
//
//   business-wrap update --check [--json] [--lang ar|en] [--force]   one line when an update exists (cached, at most one request a day)
//   business-wrap update --apply --yes                                update this install, keeping .local, design/custom, logos, fonts/custom, drafts, out
//   business-wrap update --notes [--json]                             what's new in the installed version (human summary + migration notes)
//   business-wrap update --hook                                       for the optional SessionStart hook: prints only when enabled and an update exists
//   business-wrap update --enable-hook | --disable-hook | --off | --on
// Exit 0 always for --check/--hook (an unknown answer is not an error); 1 when --apply fails.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkForUpdate, oneLiner, settings, saveSettings, installedNotes, token, ROOT, currentVersion, fromNpx, localInstall, updateCommand, isNewer } from './check.mjs';
import { applyUpdate } from './apply.mjs';

const argv = process.argv.slice(2).filter((a) => a !== 'update');
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const lang = val('--lang', /^ar/i.test(process.env.LANG || process.env.LC_ALL || '') ? 'ar' : 'en');

async function main() {
  if (fromNpx()) {
    // `npx business-wrap update` runs npm's copy from a temporary cache (npm can lag behind GitHub: 0.12.0 under a 0.13
    // install). Inside an install, hand over to that install's own updater; elsewhere never apply into the cache.
    const here = localInstall();
    if (here && path.resolve(here.dir) !== path.resolve(ROOT)) {
      console.error(`Business-Wrap: using the install in ${here.dir} (${here.version}), not the npx copy (${currentVersion()}).`);
      return spawnSync(process.execPath, [path.join(here.dir, 'update', 'cli.mjs'), 'update', ...argv], { stdio: 'inherit', env: { ...process.env, BW_ASSUME_NPX: '' } }).status ?? 1;
    }
    if (has('--apply')) { console.log(`This is a temporary npx copy (${currentVersion()}), not your install: nothing is updated here. In your install run: node update/cli.mjs update --apply --yes · in Claude Code: /plugin marketplace update business-wrap`); return 0; }
  }
  if (has('--enable-hook') || has('--disable-hook') || has('--off') || has('--on')) {
    const s = saveSettings({ ...(has('--enable-hook') ? { hook: true } : {}), ...(has('--disable-hook') ? { hook: false } : {}), ...(has('--off') ? { check: false } : {}), ...(has('--on') ? { check: true } : {}) });
    console.log(JSON.stringify(s));
    return 0;
  }
  if (has('--notes')) {
    const n = installedNotes();
    if (has('--json')) console.log(JSON.stringify(n, null, 1));
    else console.log([`Business-Wrap ${n.version}`, ...n.human.flatMap((s) => s.items.map((i) => `• ${i}`)), ...(n.migration.length ? ['Migration notes:', ...n.migration.map((m) => `- ${m}`)] : [])].join('\n'));
    return 0;
  }
  if (has('--hook')) {
    if (!settings().hook) return 0;
    const r = await checkForUpdate();
    const line = oneLiner(r, lang).split('\n')[0];
    if (line) console.log(line);
    return 0;
  }
  if (has('--apply')) {
    const r = await checkForUpdate({ force: true });
    if (r.status !== 'available') { console.log(r.status === 'current' ? `Business-Wrap ${r.current} is the latest.` : 'Cannot check for updates now (offline, no release published yet, or the GitHub rate limit).'); return 0; }
    if (!isNewer(r.latest, currentVersion())) { console.log(`Business-Wrap ${currentVersion()} is the latest (never a downgrade).`); return 0; }
    if (!has('--yes')) {
      console.log(`${oneLiner(r, lang)}\nRun again with --yes to update (${updateCommand()}). Kept: .local, design/custom, logos, fonts/custom, drafts, out.`);
      return 0;
    }
    const res = await applyUpdate({ dir: ROOT, release: { version: r.latest, zip: r.zip, zipApi: r.zipApi, sha256: r.sha256 }, repo: JSON.parse(fs.readFileSync(path.join(ROOT, 'update', 'source.json'), 'utf8')).repo, token: token(), current: currentVersion() });
    console.log(JSON.stringify(res));
    if (res.ok && r.migration?.length) console.log(`Migration notes:\n${r.migration.map((m) => `- ${m}`).join('\n')}`);
    return res.ok ? 0 : 1;
  }
  const r = await checkForUpdate({ force: has('--force') });
  if (has('--json')) console.log(JSON.stringify(r, null, 1));
  else if (r.status === 'available') console.log(oneLiner(r, lang));
  else if (r.status === 'current') console.log(lang === 'ar' ? `Business-Wrap ${r.current} هو الأحدث.` : `Business-Wrap ${r.current} is the latest.`);
  else if (r.status === 'off') console.log(lang === 'ar' ? 'فحص التحديثات متوقف (--on لتشغيله).' : 'Update checks are off (--on to turn them on).');
  else console.log(lang === 'ar' ? 'تعذر فحص التحديثات الآن.' : "Can't check for updates now.");
  return 0;
}

// set the exit code and let the loop drain: process.exit() with a socket still closing trips a libuv assertion on Windows
// 0.13.0 B1: every verb other than `update` is the script-first CLI (engine/cli.mjs: open, close, status, harvest …)
const FIRST = process.argv[2];
if (FIRST && FIRST !== 'update' && !FIRST.startsWith('-')) import('../engine/cli.mjs').then((m) => m.main(process.argv.slice(2))).then((code) => { process.exitCode = code; });
else main().then((code) => { process.exitCode = code; }, () => { process.exitCode = 0; });
