// npm run learn [-- <command>]   local learning, deterministic, no network, no model call
//
//   (none) | distill      group the journal into lessons, auto-promote (hits ≥ 3, no conflict), write rules.md/json
//   status                events, lessons, promoted, conflicts, on/off
//   rules                 print rules.md (AR + EN)
//   conflicts             the REVERSAL / CONFLICT pairs, side by side; never auto-resolved
//   promote <id> | retire <id>
//   on | off              learning on / off (default on)
//   export <file.json> | import <file.json>
//   forget --yes          wipe everything learned on this machine
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './store.mjs';

export function run(argv, log = console.log) {
  const [cmd = 'distill', arg] = argv;
  switch (cmd) {
    case 'distill': {
      const r = L.distill();
      log(`learn: ${r.events} events → ${r.lessons} lessons (${r.candidates} candidate, ${r.promoted} promoted, ${r.retired} retired), ${r.conflicts.length} conflict(s)\n  rules: ${r.rules_md}`);
      return r;
    }
    case 'status': { const s = L.status(); log(JSON.stringify(s, null, 1)); return s; }
    case 'rules': { const md = fs.existsSync(path.join(L.dir(), 'rules.md')) ? fs.readFileSync(path.join(L.dir(), 'rules.md'), 'utf8') : 'no rules yet: run npm run learn'; log(md); return md; }
    case 'conflicts': {
      const c = L.conflicts();
      log(c.length ? c.map((x) => `${x.flag}  ${x.point}\n  ${x.a}: ${x.sides[0]}\n  ${x.b}: ${x.sides[1]}`).join('\n') : 'no conflicts');
      return c;
    }
    case 'promote': case 'retire': { const l = L[cmd](arg); log(`${l.id} → ${l.status}`); return l; }
    case 'on': case 'off': { const s = L.setEnabled(cmd === 'on'); log(`learning ${s.enabled ? 'on' : 'off'}`); return s; }
    case 'export': { fs.writeFileSync(path.resolve(arg), JSON.stringify(L.exportBundle(), null, 1) + '\n'); log(`exported → ${arg}`); return arg; }
    case 'import': { const r = L.importBundle(JSON.parse(fs.readFileSync(path.resolve(arg), 'utf8'))); log(`imported ${r.events_added} event(s)`); return r; }
    case 'forget': {
      if (arg !== '--yes') { log('forget wipes every event, lesson and rule on this machine: run again with --yes'); return null; }
      const r = L.forget(); log(`forgotten: ${r.events} event(s), ${r.lessons} lesson(s)`); return r;
    }
    default: throw new Error(`unknown learn command ${cmd}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(process.argv.slice(2)); } catch (e) { console.error(`learn: ${e.message}`); process.exit(1); }
}
