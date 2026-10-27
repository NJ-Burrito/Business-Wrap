"""Business-Wrap security gate. Exit 0 = clean, 1 = findings, 2 = gate error.

Scans the working tree (tracked + untracked, minus .gitignore) AND every blob and commit
message in git history, with:
  - the regex/path rules of security/gitleaks.toml (same file gitleaks uses)
  - hashed denylist terms (security/denylist.sha256): client and personal names, never stored in clear
  - font binaries by magic bytes, files over 5 MB, image metadata (EXIF / XMP / PNG text chunks)
Prints rule id, place and line number only; the matched text is never printed.
Also runs gitleaks (git + dir) with the same config when it is on PATH.

  python security/check.py                 # full gate
  python security/check.py --tree-only     # skip history (pre-commit; pre-push and CI run the full gate)
  python security/check.py --rev=HEAD      # history of one ref instead of every branch (default: --all)
  python security/check.py --add-term      # read one term per line on stdin, append its hash
  python security/check.py --selftest      # prove each rule fires on a planted sample
Inline escape for documentation lines: put `bw-allow:<rule-id>` (or `gitleaks:allow`) on the line.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import tomllib
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CONFIG = HERE / "gitleaks.toml"
DENY = HERE / "denylist.sha256"
MAX_BYTES = 5 * 1024 * 1024
SELF = {"security/gitleaks.toml", "security/check.py", "security/denylist.sha256"}
# Paths whose binary images may carry metadata or size by design. Add the editor watermark here
# once it is placed under editor/ (never a document logo slot).
ALLOW_BINARY = [re.compile(p) for p in []]
FONT_MAGIC = (b"OTTO", b"\x00\x01\x00\x00", b"wOFF", b"wOF2", b"ttcf", b"true")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".gif", ".heic")


def git(*args: str, input: bytes | None = None) -> bytes:
    return subprocess.run(["git", "-C", str(ROOT), *args], input=input, capture_output=True, check=True).stdout


def norm(text: str) -> str:
    # casefold, drop Arabic diacritics and tatweel, unify alef/yeh/teh-marbuta forms
    t = unicodedata.normalize("NFKC", text).casefold()
    t = re.sub("[" + chr(0x64B) + "-" + chr(0x65F) + chr(0x670) + chr(0x640) + "]", "", t)  # tashkeel + tatweel
    return t.translate(str.maketrans("أإآٱىة", "اااايه"))


def term_hash(term: str) -> str:
    return hashlib.sha256(" ".join(re.findall(r"\w+", norm(term))).encode()).hexdigest()


def load_rules():
    cfg = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    rules = []
    for r in cfg.get("rules", []):
        allow = []
        for a in r.get("allowlists", []):
            allow += [re.compile(x) for x in a.get("regexes", [])]
        rules.append({
            "id": r["id"],
            "regex": re.compile(r["regex"]) if "regex" in r else None,
            "path": re.compile(r["path"]) if "path" in r else None,
            "allow": allow,
        })
    gallow = [re.compile(p) for a in cfg.get("allowlists", []) for p in a.get("paths", [])]
    return rules, gallow


def load_deny():
    if not DENY.exists():
        return {}, 0
    hashes = {}
    longest = 1
    for line in DENY.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            h, n = line.split()[:2]
            hashes[h] = int(n)
            longest = max(longest, int(n))
    return hashes, longest


def allowed_line(line: str, rid: str) -> bool:
    return f"bw-allow:{rid}" in line or "gitleaks:allow" in line


def scan_text(place: str, text: str, rules, deny, longest, findings, path_for_rules: str):
    lines = text.splitlines()
    for rule in rules:
        if rule["regex"] is None or path_for_rules in SELF:
            continue
        for i, line in enumerate(lines, 1):
            if allowed_line(line, rule["id"]):
                continue
            for m in rule["regex"].finditer(line):
                if any(a.search(m.group(0)) for a in rule["allow"]):
                    continue
                findings.add((rule["id"], place, i))
                break
    if deny and path_for_rules not in SELF:
        for i, line in enumerate(lines, 1):
            if allowed_line(line, "bw-denylist"):
                continue
            words = re.findall(r"\w+", norm(line))
            hit = False
            for n in range(1, longest + 1):
                for s in range(0, len(words) - n + 1):
                    if hashlib.sha256(" ".join(words[s:s + n]).encode()).hexdigest() in deny:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                findings.add(("bw-denylist", place, i))


def image_meta(data: bytes) -> bool:
    if data[:2] == b"\xff\xd8":
        return b"Exif\x00\x00" in data[:65536] or b"http://ns.adobe.com/xap/1.0/" in data[:65536]
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        i = 8
        while i + 8 <= len(data):
            n = int.from_bytes(data[i:i + 4], "big")
            kind = data[i + 4:i + 8]
            if kind in (b"eXIf", b"tEXt", b"iTXt", b"zTXt"):
                return True
            if kind == b"IEND":
                break
            i += 12 + n
        return False
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return b"EXIF" in data or b"XMP " in data
    return False


def scan_blob(path: str, data: bytes, place: str, rules, gallow, deny, longest, findings):
    if any(g.search(path) for g in gallow):
        return
    binary_ok = any(a.search(path) for a in ALLOW_BINARY)
    for rule in rules:
        if rule["path"] is not None and rule["regex"] is None and rule["path"].search(path):
            findings.add((rule["id"], place, 0))
    if data[:4] in FONT_MAGIC and not path.endswith((".txt", ".md")):
        findings.add(("bw-font-binary", place, 0))
    if len(data) > MAX_BYTES and not binary_ok:
        findings.add(("bw-large-file", place, 0))
    if path.lower().endswith(IMAGE_EXT) and not binary_ok and image_meta(data):
        findings.add(("bw-image-metadata", place, 0))
    if b"\x00" in data[:8192]:
        return
    scan_text(place, data.decode("utf-8", "replace"), rules, deny, longest, findings, path)


def tree_files():
    out = git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
    return [p for p in out.decode("utf-8").split("\0") if p and (ROOT / p).is_file()]


def history_blobs(revs):
    seen = set()
    for line in git("rev-list", *revs, "--objects").decode("utf-8", "replace").splitlines():
        parts = line.split(" ", 1)
        if len(parts) == 2 and parts[0] not in seen:
            seen.add(parts[0])
            yield parts[0], parts[1]


def run_gitleaks() -> int:
    exe = shutil.which("gitleaks")
    if not exe:
        print("gitleaks: not on PATH, skipped (the Python engine above applies the same rules)")
        return 0
    rc = 0
    for mode in (["git", str(ROOT)], ["dir", str(ROOT)]):
        r = subprocess.run([exe, *mode, "--config", str(CONFIG), "--redact", "--no-banner", "-v"], capture_output=True, text=True)
        print(f"gitleaks {mode[0]}: exit {r.returncode}")
        rc |= r.returncode
    return rc


def gate(tree_only: bool, revs=("--all",)) -> int:
    rules, gallow = load_rules()
    deny, longest = load_deny()
    findings: set = set()
    files = tree_files()
    for p in files:
        scan_blob(p, (ROOT / p).read_bytes(), p, rules, gallow, deny, longest, findings)
    nblobs = 0
    if not tree_only:
        objs = list(history_blobs(revs))
        types = git("cat-file", "--batch-check=%(objecttype)", input="\n".join(o for o, _ in objs).encode()).decode().split()
        for (oid, path), kind in zip(objs, types):
            if kind != "blob":
                continue
            nblobs += 1
            scan_blob(path, git("cat-file", "blob", oid), f"history:{oid[:8]}:{path}", rules, gallow, deny, longest, findings)
        msgs = git("log", *revs, "--format=%H%x00%B%x01").decode("utf-8", "replace")
        for chunk in msgs.split("\x01"):
            if "\x00" in chunk:
                sha, body = chunk.strip("\n").split("\x00", 1)
                scan_text(f"commit-message:{sha[:8]}", body, rules, deny, longest, findings, "<message>")
    for rid, place, line in sorted(findings):
        print(f"FAIL {rid:<22} {place}" + (f":{line}" if line else ""))
    gl = run_gitleaks()
    summary = f"security/check: {len(findings)} finding(s); {len(files)} tree files, {nblobs} history blobs, {len(deny)} hashed terms, {len(rules)} rules"
    print(summary)
    return 1 if findings or gl else 0


def add_terms() -> int:
    existing = DENY.read_text(encoding="utf-8") if DENY.exists() else "# sha256 <word-count> — normalised terms, see check.py norm()\n"
    have = set(existing.split())
    added = 0
    for raw in sys.stdin.read().splitlines():
        if raw.strip():
            h = term_hash(raw)
            if h not in have:
                existing += f"{h} {len(re.findall(chr(92) + 'w+', norm(raw)))}\n"
                have.add(h)
                added += 1
    DENY.write_text(existing, encoding="utf-8", newline="\n")
    print(f"added {added} term hash(es)")
    return 0


def selftest() -> int:
    rules, _ = load_rules()
    k = "".join  # samples are assembled so this file never carries a literal hit
    samples = {
        "bw-password-assignment": k(["pass", "word: ", "Xy12345!"]),
        "bw-generic-api-key": k(["api_", "key = ", "A" * 24]),
        "bw-openrouter-key": k(["sk-or-", "v1-", "a" * 64]),
        "bw-private-key": k(["-----BEGIN ", "RSA PRIVATE", " KEY-----"]),
        "bw-staging-host": k(["https://", "staging", ".corp-example", ".io/x"]),
        "bw-email": k(["someone", "@", "mail-host.io"]),
        "bw-jo-national-id": k(["id ", "2", "000000001"]),
        "bw-jo-phone": k(["call ", "07", "79", "000000"]),
        "bw-local-path": k(["C:", "\\", "Users", "\\someone\\file"]),
    }
    bad = 0
    for rid, s in samples.items():
        rule = next(r for r in rules if r["id"] == rid)
        hit = bool(rule["regex"].search(s)) and not any(a.search(rule["regex"].search(s).group(0)) for a in rule["allow"])
        print(f"{'ok ' if hit else 'XX '} {rid}")
        bad += not hit
    for rid, s in {"bw-email": k(["a", "@example.com"])}.items():
        rule = next(r for r in rules if r["id"] == rid)
        m = rule["regex"].search(s)
        ok = m is not None and any(a.search(m.group(0)) for a in rule["allow"])
        print(f"{'ok ' if ok else 'XX '} {rid} allowlist")
        bad += not ok
    print("selftest:", "PASS" if not bad else f"{bad} FAIL")
    return 1 if bad else 0


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    try:
        if "--add-term" in sys.argv:
            sys.exit(add_terms())
        if "--selftest" in sys.argv:
            sys.exit(selftest())
        revs = tuple(a.split("=", 1)[1] for a in sys.argv if a.startswith("--rev=")) or ("--all",)
        sys.exit(gate("--tree-only" in sys.argv, revs))
    except (subprocess.CalledProcessError, tomllib.TOMLDecodeError, re.error) as e:
        print(f"security/check: gate error: {e}")
        sys.exit(2)
