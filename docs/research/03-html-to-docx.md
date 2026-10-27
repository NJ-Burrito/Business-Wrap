# Document JSON to DOCX fidelity

Retrieved 2026-10-27.

## Verdict
Build the DOCX from the document JSON with a DOCX library (python-docx), never by converting the HTML or the PDF. The source pipeline did this and reached a near-replica; generic converters do not carry CSS.

| Claim | Grade | Source |
|---|---|---|
| Pandoc uses only the styles and document properties (margins, page size, header, footer) of `--reference-doc`; its contents are ignored | V | https://pandoc.org/MANUAL.html |
| Pandoc `--css` affects only HTML and EPUB output | V | https://pandoc.org/MANUAL.html |
| python-docx builds and edits DOCX; it is not an HTML converter, so the mapping is yours | V (secondary) | https://medium.com/@diogofernandesop/how-to-convert-html-to-docx-with-python-4d25595cdd51 |
| html-to-docx libraries are best effort for arbitrary HTML | V (vendor) | https://pypi.org/project/docwow/ |
| LibreOffice headless conversion output changes between versions and platforms; pin and test | V | https://www.libreoffice.org/bugzilla/show_bug.cgi?id=40186 , https://bugs.libreoffice.org/show_bug.cgi?id=62336 |

## Lessons carried from the source pipeline (internal, generalised)
- Arabic runs need the face in BOTH font slots: ASCII (`w:ascii` / `w:hAnsi`) and complex script (`w:cs`, size `w:szCs`), or Word substitutes.
- Border sizes in WordprocessingML are eighths of a point (`w:sz`): a 1.2pt rule is 10, not 24.
- A font gate checks rendering and embedding, not only the declared font name.
- Embedding fonts: let Word save a copy and graft only the font parts back; never let Word re-save the body (it stripped RTL run properties).
- Table text uses the table size token, not the body size.
