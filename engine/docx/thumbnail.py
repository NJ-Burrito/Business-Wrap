"""Business-Wrap badge as the DOCX thumbnail (docProps/thumbnail.jpeg, the part Word and Explorer read).
python-docx's default template already carries a generic thumbnail part and its relationship: that part's bytes are
replaced, so the package keeps exactly one thumbnail. Pure zip work: the body is untouched; a missing badge file
means the file is left as it was (never an error).
"""
from __future__ import annotations
import os, re, zipfile
from pathlib import Path

REL = 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail'
BADGE = Path(__file__).resolve().parent.parent.parent / 'brand' / 'v3' / 'file-icons' / 'docx-256.jpg'
PART = 'docProps/thumbnail.jpeg'


def add_thumbnail(docx: Path, badge: Path = BADGE) -> bool:
    if not badge.exists():
        return False
    data_new = badge.read_bytes()
    src = zipfile.ZipFile(docx)
    had = PART in src.namelist()
    tmp = Path(str(docx) + '.thumb.tmp')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for info in src.infolist():
            data = src.read(info.filename)
            if info.filename == PART:
                data = data_new
            elif not had and info.filename == '[Content_Types].xml' and b'Extension="jpeg"' not in data:
                data = re.sub(rb'(<Types[^>]*>)', rb'\1<Default Extension="jpeg" ContentType="image/jpeg"/>', data, count=1)
            elif not had and info.filename == '_rels/.rels':
                data = data.replace(b'</Relationships>', f'<Relationship Id="rIdBwThumb" Type="{REL}" Target="{PART}"/></Relationships>'.encode(), 1)
            out.writestr(info, data)
        if not had:
            out.writestr(PART, data_new)
    src.close()
    os.replace(tmp, docx)
    return True
