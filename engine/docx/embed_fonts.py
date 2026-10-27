"""Embed TrueType fonts in a DOCX (ECMA-376 Part 1, 17.8.1), so it renders without the fonts installed.

Each font a run names is written as an obfuscated part word/fonts/fontN.odttf (the first 32 bytes
XOR-ed with the 16-byte key of a fresh GUID, byte order reversed), linked from word/fontTable.xml
by <w:embedRegular|embedBold r:id w:fontKey/>, typed in [Content_Types].xml, and switched on in
word/settings.xml (<w:embedTrueTypeFonts/>). Pure Python, no Word: the document body is untouched.
The font licence used here allows embedding in documents you create.

    python engine/docx/embed_fonts.py --selftest
"""
from __future__ import annotations
import json, re, sys, uuid, zipfile
from pathlib import Path

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R_FONT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font'
ODTTF = 'application/vnd.openxmlformats-officedocument.obfuscatedFont'
SUFFIX = {'light': 300, 'regular': 400, 'med': 500, 'medium': 500, 'semibold': 600, 'bold': 700, 'black': 900, 'heavy': 900}


def obfuscate(font: bytes, guid: str) -> bytes:
    key = bytes.fromhex(guid.strip('{}').replace('-', ''))[::-1]
    head = bytes(b ^ key[i % 16] for i, b in enumerate(font[:32]))
    return head + font[32:]


deobfuscate = obfuscate  # XOR is its own inverse


def names_in(xml: str) -> set[str]:
    return set(re.findall(r'w:(?:ascii|hAnsi|cs|eastAsia)="([^"]+)"', xml))


def pick(name: str, cuts: list[dict]) -> dict[str, dict]:
    """The cuts for one font name the document uses: {'Regular': cut, 'Bold': cut}."""
    low = name.lower().strip()
    out: dict[str, dict] = {}
    for c in cuts:
        fam = c['family'].lower()
        if low == fam:
            if c['weight'] == 400: out['Regular'] = c
            if c['weight'] == 700: out['Bold'] = c
        elif low.startswith(fam + ' ') and SUFFIX.get(low[len(fam) + 1:]) == c['weight']:
            out['Regular'] = c
    return out


def embed(docx: Path, cuts: list[dict]) -> str:
    z = zipfile.ZipFile(docx)
    parts = {n: z.read(n) for n in z.namelist()}
    z.close()
    used = set()
    for n, b in parts.items():
        if re.match(r'word/(document|styles|header\d*|footer\d*|numbering)\.xml$', n):
            used |= names_in(b.decode('utf-8'))
    ft = parts.get('word/fontTable.xml', f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts xmlns:w="{W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></w:fonts>'.encode()).decode('utf-8')
    if 'xmlns:r=' not in ft[:600]:
        ft = ft.replace('<w:fonts ', '<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
    rels_name = 'word/_rels/fontTable.xml.rels'
    rels = parts.get(rels_name, b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>').decode('utf-8')
    n_font = 0
    embedded = []
    for name in sorted(used):
        found = pick(name, cuts)
        if not found:
            continue
        tags = ''
        for slot in ('Regular', 'Bold'):
            c = found.get(slot)
            if not c:
                continue
            n_font += 1
            guid = '{' + str(uuid.uuid4()).upper() + '}'
            target = f'fonts/font{n_font}.odttf'
            parts[f'word/{target}'] = obfuscate(Path(c['file']).read_bytes(), guid)
            rid = f'rIdBwFont{n_font}'
            rels = rels.replace('</Relationships>', f'<Relationship Id="{rid}" Type="{R_FONT}" Target="{target}"/></Relationships>')
            tags += f'<w:embed{slot} r:id="{rid}" w:fontKey="{guid}"/>'
        esc = re.escape(name)
        m = re.search(rf'<w:font w:name="{esc}"\s*(/>|>(.*?)</w:font>)', ft, re.S)
        if m:
            inner = re.sub(r'<w:embed(Regular|Bold|Italic|BoldItalic)[^>]*/>', '', m.group(2) or '')
            ft = ft[:m.start()] + f'<w:font w:name="{name}">{inner}{tags}</w:font>' + ft[m.end():]
        else:
            ft = ft.replace('</w:fonts>', f'<w:font w:name="{name}">{tags}</w:font></w:fonts>')
        embedded.append(name)
    if not n_font:
        return 'NO_MATCHING_FONTS'
    parts['word/fontTable.xml'] = ft.encode('utf-8')
    parts[rels_name] = rels.encode('utf-8')
    ct = parts['[Content_Types].xml'].decode('utf-8')
    if 'Extension="odttf"' not in ct:
        ct = ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="odttf" ContentType="{ODTTF}"/>', 1)
    parts['[Content_Types].xml'] = ct.encode('utf-8')
    if 'word/settings.xml' in parts:
        st = parts['word/settings.xml'].decode('utf-8')
        if '<w:embedTrueTypeFonts' not in st:
            m = re.search(r'<w:zoom[^>]*/>', st)
            st = st[:m.end()] + '<w:embedTrueTypeFonts/>' + st[m.end():] if m else re.sub(r'(<w:settings[^>]*>)', r'\1<w:embedTrueTypeFonts/>', st, count=1)
            parts['word/settings.xml'] = st.encode('utf-8')
    tmp = docx.with_suffix('.embed.tmp')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for n, b in parts.items():
            out.writestr(n, b)
    tmp.replace(docx)
    return f'EMBEDDED {n_font} parts for {len(embedded)} fonts'


def selftest() -> int:
    import tempfile
    d = Path(tempfile.mkdtemp(prefix='bw-embed-test-'))
    try:
        font = bytes(range(256)) * 4
        (d / 'f.ttf').write_bytes(font)
        docx = d / 't.docx'
        with zipfile.ZipFile(docx, 'w') as z:
            z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
            z.writestr('word/document.xml', f'<w:document xmlns:w="{W}"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Probe Sans" w:cs="Probe Sans"/></w:rPr><w:t>x</w:t></w:r></w:p></w:body></w:document>')
            z.writestr('word/settings.xml', f'<w:settings xmlns:w="{W}"><w:zoom w:percent="100"/></w:settings>')
        r = embed(docx, [{'family': 'Probe Sans', 'weight': 400, 'file': str(d / 'f.ttf')}])
        z = zipfile.ZipFile(docx)
        ft = z.read('word/fontTable.xml').decode()
        key = re.search(r'w:fontKey="(\{[^"]+\})"', ft).group(1)
        back = deobfuscate(z.read('word/fonts/font1.odttf'), key)
        ok = back == font and back[:32] != z.read('word/fonts/font1.odttf')[:32] and 'odttf' in z.read('[Content_Types].xml').decode() and '<w:embedTrueTypeFonts/>' in z.read('word/settings.xml').decode() and R_FONT in z.read('word/_rels/fontTable.xml.rels').decode()
        z.close()
        print(('PASS' if ok else 'FAIL') + f'  embed_fonts selftest: {r}')
        return 0 if ok else 1
    finally:
        import shutil
        shutil.rmtree(d, ignore_errors=True)


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        sys.exit(selftest())
    print(embed(Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))))
