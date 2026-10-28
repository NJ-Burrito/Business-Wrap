// Font file facts read from the file's own tables (OpenType/TrueType "sfnt", TTC, WOFF/WOFF2 header).
// No dependencies: the same code runs in Node (engine/fonts.mjs, export) and in the editor bundle
// (uploads and machine fonts). Only the bytes it needs are read: read(offset, length) → Uint8Array.
//
// fsType (OS/2): bit 1 (0x0002) = Restricted Licence embedding, bit 9 (0x0200) = bitmap embedding only.
// Either one means the font must not travel inside a document; 0, 0x0004 (preview & print) and
// 0x0008 (editable) allow it.

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const tag4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

export const embeddable = (fsType) => fsType != null && !(fsType & 0x0002) && !(fsType & 0x0200);

function utf16be(b) {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(u16(b, i));
  return s;
}

function face(read, base) {
  const head = read(base, 12);
  if (head.length < 12) return null;
  const n = u16(head, 4);
  const dir = read(base + 12, n * 16);
  const tables = {};
  for (let i = 0; i < n && i * 16 + 16 <= dir.length; i += 1) tables[tag4(dir, i * 16)] = { off: u32(dir, i * 16 + 8), len: u32(dir, i * 16 + 12) };
  const out = { outlines: tables.glyf ? 'truetype' : tables['CFF '] || tables.CFF2 ? 'cff' : null, fsType: null, weight: 400, italic: false, family: '', subfamily: '', names: [] };
  if (tables['OS/2']) {
    const os2 = read(tables['OS/2'].off, 64);
    if (os2.length >= 10) { out.weight = u16(os2, 4) || 400; out.fsType = u16(os2, 8); }
    if (os2.length >= 64) out.italic = !!(u16(os2, 62) & 1);
  }
  if (tables.name) {
    const nb = read(tables.name.off, Math.min(tables.name.len, 1 << 20));
    const count = u16(nb, 2);
    const strings = u16(nb, 4);
    const pick = {};
    const all = new Set();
    for (let i = 0; i < count && 6 + i * 12 + 12 <= nb.length; i += 1) {
      const r = 6 + i * 12;
      const [plat, , lang, id, len, off] = [u16(nb, r), u16(nb, r + 2), u16(nb, r + 4), u16(nb, r + 6), u16(nb, r + 8), u16(nb, r + 10)];
      if (![1, 2, 16, 17, 21, 22].includes(id)) continue;
      const raw = nb.subarray(strings + off, strings + off + len);
      const s = (plat === 3 || plat === 0 ? utf16be(raw) : String.fromCharCode(...raw)).replace(/\0/g, '').trim();
      if (!s) continue;
      if ([1, 16, 21].includes(id)) all.add(s);
      const rank = plat === 3 && lang === 0x409 ? 0 : plat === 3 ? 1 : 2; // English Windows names first
      if (!pick[id] || rank < pick[id].rank) pick[id] = { s, rank };
    }
    out.family = (pick[16] || pick[1])?.s || '';
    out.subfamily = (pick[17] || pick[2])?.s || '';
    out.names = [...all];
  }
  return out;
}

/** {format: ttf|otf|ttc|woff|woff2, outlines, fsType, embeddable, family, names, weight, italic, faces?}; null when not a font. */
export function sfntInfo(read) {
  const h = read(0, 12);
  if (h.length < 12) return null;
  const tag = tag4(h, 0);
  if (tag === 'wOFF' || tag === 'wOF2') {
    // the tables are compressed: the flavour is in the header, the licence bits are not read here
    return { format: tag === 'wOFF' ? 'woff' : 'woff2', outlines: tag4(h, 4) === 'OTTO' ? 'cff' : 'truetype', fsType: null, embeddable: false, family: '', names: [], weight: 400, italic: false };
  }
  if (tag === 'ttcf') {
    const n = u32(h, 8);
    const offs = read(12, n * 4);
    const faces = [];
    for (let i = 0; i < n && i * 4 + 4 <= offs.length; i += 1) { const f = face(read, u32(offs, i * 4)); if (f) faces.push({ ...f, embeddable: embeddable(f.fsType) }); }
    return { format: 'ttc', ...(faces[0] || {}), embeddable: false, faces };
  }
  if (tag !== 'OTTO' && tag !== 'true' && u32(h, 0) !== 0x00010000) return null;
  const f = face(read, 0);
  return f && { format: tag === 'OTTO' ? 'otf' : 'ttf', ...f, embeddable: embeddable(f.fsType) };
}

export const sfntFromBytes = (u8) => sfntInfo((o, l) => u8.subarray(o, o + l));
