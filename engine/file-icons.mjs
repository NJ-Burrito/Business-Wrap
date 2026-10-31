// "Use Business-Wrap icons on this PC" (0.15.1, owner ask): makes Windows Explorer show the Business-Wrap badges
// (brand/v3/file-icons: pdf, docx, html) for every .pdf / .docx / .html file of THIS Windows account.
//
//   apply:   copy the .ico files to a stable per-user folder, find the ProgID each extension really uses
//            (HKCU ...\FileExts\.<ext>\UserChoice, else the .<ext> default), back up that ProgID's current
//            HKCU\Software\Classes\<ProgID>\DefaultIcon (or its absence) into file-icons-backup.json, write ours, tell
//            Explorer, read it back.
//   restore: put back exactly the backed-up state (delete what was absent).
//
// Per-user only: HKCU, never HKLM, no admin. The registry layer is injected (`reg`), so tests run on a fake and never
// touch the real registry; the real layer is one PowerShell call per batch with a FIXED script, the batch passed in an
// environment variable (nothing is ever spliced into a command line).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { isTestMode, testSandbox, pluginData, isPluginInstall } from './testguard.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ICON_DIR = path.join(REPO, 'brand', 'v3', 'file-icons');
export const EXTS = ['pdf', 'docx', 'html'];
export const BACKUP_NAME = 'file-icons-backup.json';

const PROGID = /^[A-Za-z0-9_.\-{}]+(\\[A-Za-z0-9_.\-{}]+)?$/; // "Word.Document.12", "ChromeHTML", "Applications\foo.exe"
const classes = (progId) => `HKCU\\Software\\Classes\\${progId}`;
const iconKey = (progId) => `${classes(progId)}\\DefaultIcon`;

/** Where the icons and the backup live: a per-user folder that survives updates and is never the repo or the documents
 *  folder. BW_LOCAL_DIR / the plugin data folder when there is one, else %LOCALAPPDATA%\Business-Wrap. */
export function iconsStateDir() {
  if (isTestMode()) return testSandbox('file-icons');
  if (process.env.BW_LOCAL_DIR) return path.join(path.resolve(process.env.BW_LOCAL_DIR), 'file-icons');
  const data = process.env.CLAUDE_PLUGIN_DATA || isPluginInstall(REPO) ? pluginData(REPO) : null;
  if (data) return path.join(data, 'file-icons');
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Business-Wrap', 'file-icons');
}

// ── the real registry layer: ops in, results out ────────────────────────────────────────────────────────────────
// op: {op:'get', key, name} -> {key, value, data, kind}   {op:'set', key, name, data, kind?}   {op:'delValue', key, name}
//     {op:'delKey', key, ifEmpty}  ('' name = the key's (Default) value; keys are HKCU\... or HKCR\... (reads only))
const PS_REG = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$ops=$env:BW_REG_OPS | ConvertFrom-Json
$out=@()
foreach($o in $ops){
  try{
    $i=$o.key.IndexOf('\\'); $h=$o.key.Substring(0,$i); $sub=$o.key.Substring($i+1)
    if($h -eq 'HKCU'){$root=[Microsoft.Win32.Registry]::CurrentUser}elseif($h -eq 'HKCR' -and $o.op -eq 'get'){$root=[Microsoft.Win32.Registry]::ClassesRoot}else{throw 'hive'}
    $n=[string]$o.name
    if($o.op -eq 'get'){
      $k=$root.OpenSubKey($sub)
      if($null -eq $k){$r=@{key=$false;value=$false;data=$null}}
      else{
        if($k.GetValueNames() -contains $n){$r=@{key=$true;value=$true;data=[string]$k.GetValue($n,$null,'DoNotExpandEnvironmentNames');kind=[string]$k.GetValueKind($n)}}else{$r=@{key=$true;value=$false;data=$null}}
        $k.Close()
      }
    }elseif($o.op -eq 'set'){
      $k=$root.CreateSubKey($sub); $kind=[Microsoft.Win32.RegistryValueKind]::String; if($o.kind -eq 'ExpandString'){$kind=[Microsoft.Win32.RegistryValueKind]::ExpandString}; $k.SetValue($n,[string]$o.data,$kind); $k.Close(); $r=@{ok=$true}
    }elseif($o.op -eq 'delValue'){
      $k=$root.OpenSubKey($sub,$true)
      if($null -ne $k){ if($k.GetValueNames() -contains $n){$k.DeleteValue($n)}; $k.Close() }
      $r=@{ok=$true}
    }elseif($o.op -eq 'delKey'){
      $k=$root.OpenSubKey($sub)
      if($null -ne $k){
        $empty=($k.ValueCount -eq 0 -and $k.SubKeyCount -eq 0); $k.Close()
        if((-not $o.ifEmpty) -or $empty){$root.DeleteSubKeyTree($sub,$false)}
      }
      $r=@{ok=$true}
    }else{throw 'op'}
  }catch{$r=@{error=[string]$_.Exception.Message}}
  $out+=,$r
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4
`;
const PS_NOTIFY = `
Add-Type -Namespace BW -Name Sh -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b);'
[BW.Sh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
`;
const psArgs = (script) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
function runPs(script, env = {}, ms = 20000) {
  return new Promise((ok, bad) => {
    let out = '';
    let err = '';
    const c = spawn('powershell.exe', psArgs(script), { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { try { c.kill(); } catch { /* gone */ } bad(new Error('powershell timed out')); }, ms);
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', (e) => { clearTimeout(timer); bad(e); });
    c.on('close', (code) => { clearTimeout(timer); code === 0 ? ok(out) : bad(new Error((err || out || `powershell exit ${code}`).trim().slice(0, 300))); });
  });
}
const SAFE_KEY = /^(HKCU|HKCR)\\[A-Za-z0-9_.\-{}\\ ]+$/;
export function realReg() {
  return {
    async ops(list) {
      for (const o of list) {
        if (!SAFE_KEY.test(o.key) || /\\\.\.?(\\|$)/.test(o.key) || (o.op !== 'get' && !o.key.startsWith('HKCU\\'))) throw new Error(`refused registry key: ${o.key}`);
      }
      const out = await runPs(PS_REG, { BW_REG_OPS: JSON.stringify(list) });
      const j = JSON.parse(out.trim());
      if (!Array.isArray(j) || j.length !== list.length) throw new Error('registry layer returned an unexpected answer');
      return j;
    },
  };
}
/** Tells Explorer the associations changed (SHChangeNotify SHCNE_ASSOCCHANGED), so icons redraw without a sign-out. Never throws. */
export async function realRefresh() {
  try { await runPs(PS_NOTIFY, {}, 20000); return true; } catch { return false; }
}

// ── the feature, on an injected registry ────────────────────────────────────────────────────────────────────────
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const readBackup = (file) => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && j.entries ? j : { version: 1, entries: {} }; } catch { return { version: 1, entries: {} }; } };
const writeAtomic = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };
const valueOf = (ico) => `${ico},0`;
const sameValue = (a, b) => String(a || '').replace(/,0$/, '').toLowerCase() === String(b || '').replace(/,0$/, '').toLowerCase();

/**
 * @param {{reg?: {ops: (list: object[]) => Promise<object[]>}, refresh?: () => Promise<boolean>, platform?: string,
 *   stateDir?: string, srcDir?: string}} d   every part injectable; the defaults are the real ones.
 */
export function createFileIcons({ reg, refresh, platform = process.platform, stateDir, srcDir = ICON_DIR } = {}) {
  const R = reg || realReg();
  const dir = () => stateDir || iconsStateDir();
  const backupFile = () => path.join(dir(), BACKUP_NAME);
  const icoFile = (ext) => path.join(dir(), `${ext}.ico`);
  const unsupported = () => ({ supported: false, reason: 'windows-only' });

  /** The ProgID each extension resolves to: UserChoice, else HKCU .<ext>, else HKCR .<ext>; null when none. */
  async function resolve() {
    const list = EXTS.flatMap((e) => [
      { op: 'get', key: `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.${e}\\UserChoice`, name: 'ProgId' },
      { op: 'get', key: `HKCU\\Software\\Classes\\.${e}`, name: '' },
      { op: 'get', key: `HKCR\\.${e}`, name: '' },
    ]);
    const r = await R.ops(list);
    return EXTS.map((ext, i) => {
      const pick = [r[i * 3], r[i * 3 + 1], r[i * 3 + 2]].map((x) => x?.data).find((v) => v && PROGID.test(v));
      return { ext, progId: pick || null };
    });
  }

  async function status() {
    if (platform !== 'win32') return unsupported();
    const bk = readBackup(backupFile());
    const entries = Object.entries(bk.entries);
    const cur = entries.length ? await R.ops(entries.map(([p]) => ({ op: 'get', key: iconKey(p), name: '' }))) : [];
    const rows = entries.map(([progId, e], i) => ({ ext: e.ext, progId, ours: !!cur[i]?.value && sameValue(cur[i].data, icoFile(e.ext)) }));
    return { supported: true, applied: rows.length > 0 && rows.every((x) => x.ours), rows };
  }

  async function apply() {
    if (platform !== 'win32') return unsupported();
    const missing = EXTS.filter((e) => !exists(path.join(srcDir, `${e}.ico`)));
    if (missing.length) return { supported: true, ok: false, error: `missing icon files: ${missing.join(', ')}` };
    fs.mkdirSync(dir(), { recursive: true });
    for (const e of EXTS) fs.copyFileSync(path.join(srcDir, `${e}.ico`), icoFile(e));
    const found = await resolve();
    const bk = readBackup(backupFile());
    const todo = []; // one entry per distinct ProgID (two extensions sharing one keep the first)
    const results = [];
    for (const f of found) {
      if (!f.progId) { results.push({ ext: f.ext, ok: false, reason: 'no-association' }); continue; }
      if (todo.some((x) => x.progId === f.progId)) { results.push({ ext: f.ext, progId: f.progId, ok: false, reason: 'shared-progid' }); continue; }
      todo.push(f);
    }
    // 1) back up what is there now (never overwrite an earlier backup: that one is the real original)
    const need = todo.filter((f) => !bk.entries[f.progId]);
    if (need.length) {
      const r = await R.ops(need.flatMap((f) => [
        { op: 'get', key: classes(f.progId), name: '' }, // is the ProgID key in HKCU at all (its default value may be unset: key=true)
        { op: 'get', key: iconKey(f.progId), name: '' },
      ]));
      need.forEach((f, i) => {
        const prog = r[i * 2];
        const icon = r[i * 2 + 1];
        bk.entries[f.progId] = { ext: f.ext, progKey: !!prog.key, iconKey: !!icon.key, value: icon.value ? icon.data : null, kind: icon.value ? icon.kind || 'String' : null, at: new Date().toISOString() };
      });
      writeAtomic(backupFile(), JSON.stringify(bk, null, 1)); // written BEFORE the first change
    }
    // 2) write ours
    const w = await R.ops(todo.map((f) => ({ op: 'set', key: iconKey(f.progId), name: '', data: valueOf(icoFile(f.ext)) })));
    // 3) read back: the value is there and the extension still resolves to the same ProgID
    const again = await resolve();
    const back = await R.ops(todo.map((f) => ({ op: 'get', key: iconKey(f.progId), name: '' })));
    todo.forEach((f, i) => {
      const same = again.find((a) => a.ext === f.ext)?.progId === f.progId;
      const took = !w[i]?.error && !!back[i]?.value && sameValue(back[i].data, icoFile(f.ext));
      results.push(took && same ? { ext: f.ext, progId: f.progId, ok: true } : { ext: f.ext, progId: f.progId, ok: false, reason: w[i]?.error ? 'write-failed' : !took ? 'not-read-back' : 'association-changed' });
    });
    const refreshed = refresh ? await refresh() : false;
    results.sort((a, b) => EXTS.indexOf(a.ext) - EXTS.indexOf(b.ext));
    return { supported: true, ok: results.some((x) => x.ok), results, refreshed };
  }

  async function restore() {
    if (platform !== 'win32') return unsupported();
    const bk = readBackup(backupFile());
    const entries = Object.entries(bk.entries);
    const results = [];
    for (const [progId, e] of entries) {
      const ops = e.value !== null && e.value !== undefined
        ? [{ op: 'set', key: iconKey(progId), name: '', data: e.value, kind: e.kind }]
        : e.iconKey
          ? [{ op: 'delValue', key: iconKey(progId), name: '' }] // the key was there with no (Default): keep it, drop our value
          : [{ op: 'delKey', key: iconKey(progId), ifEmpty: false }, ...(e.progKey ? [] : [{ op: 'delKey', key: classes(progId), ifEmpty: true }])];
      const r = await R.ops(ops);
      results.push({ ext: e.ext, progId, ok: !r.some((x) => x?.error), ...(r.find((x) => x?.error) ? { reason: 'restore-failed' } : {}) });
    }
    if (results.every((x) => x.ok)) { try { fs.rmSync(backupFile(), { force: true }); } catch { /* a stale backup is harmless: restore is idempotent */ } }
    const refreshed = refresh ? await refresh() : false;
    return { supported: true, ok: results.every((x) => x.ok), results, refreshed };
  }

  return { status, apply, restore, resolve, backupFile };
}
