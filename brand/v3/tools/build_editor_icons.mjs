// Business-Wrap brand v3 · every other editor icon in editor/icons.json (0.17.0, owner note N5: "rework ALL icons").
// The same language as the ribbon's category icons (build_ribbon_icons.mjs): a 24-unit grid, the toolbar's 2 px round stroke, frames
// inset to 2.5-21.5 with 1.5-2 radius, and ONE gold accent where it carries the meaning: the thing added, the result, the target, the
// part that changes (.hl = a gold fill, .hl.rl = a gold stroke, The Rule; .on-hl = ink drawn on gold). Plain glyphs (chevrons, close,
// grip, add) and the state icons (ok, warn, err, info: their colour is the state) stay ink only.
// Glyphs that shared one drawing for two meanings now differ (dgFrom / dgTo, dgLabel / dgEdgeLabel, dgGroup / dgWrap, caption / dgText,
// hideBlock / spellIgnore, renumber / spellCount, connect / dgRouteAuto, saveHtml / export.html, dgSub / zoomPct, delete / dgDel,
// duplicate / dgDup, err / dgStop, history / dgReset / zoomReset, replace / print.refresh, focus / dgZoomFit).
// Kept on purpose: undo and redo are exact mirrors (editor.js IC_SWAP swaps them in a right-to-left UI); rowUp / rowDown keep their part
// order (stem, head, three lines) and keepNext (top block, bottom block, link) for their part moves in 40-icon-motion.css.
// Every move in 40-icon-motion.css animates `> *`, so a redrawn icon keeps its move. Icons the ext files add (Object.assign(IC, …)),
// the 31 brand .bw-i icons and the ribbon's rbt.* are not drawn here.
//   node brand/v3/tools/build_editor_icons.mjs           writes the drawings into editor/icons.json (other keys and order untouched)
//   node brand/v3/tools/build_editor_icons.mjs --check   exits 1 when editor/icons.json differs from these drawings
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FILE = path.join(REPO, 'editor', 'icons.json');
const svg = (body) => `<svg aria-hidden="true" focusable="false" class="ic bw-v" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const G = 'stroke="none"';
// shared parts
const PAGE = '<path d="M5 10V4.5A1.5 1.5 0 0 1 6.5 3H14l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M14 3v5h5"/>';
const PAGE_FULL = '<path d="M17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3H14l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5z"/><path d="M14 3v5h5"/>';
const FOLDER = '<path d="M3 18.5V5.5A1.5 1.5 0 0 1 4.5 4h4l2 2h9A1.5 1.5 0 0 1 21 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>';
const LENS = '<circle cx="10.5" cy="10.5" r="7"/><path d="m20.5 20.5-5-5"/>';
const EYE = '<path d="M2.1 12.3a1 1 0 0 1 0-.6 10.5 10.5 0 0 1 19.8 0 1 1 0 0 1 0 .6 10.5 10.5 0 0 1-19.8 0"/>';
const EYE_OFF = '<path d="M10.7 5.1a10.7 10.7 0 0 1 11.2 6.6 1 1 0 0 1 0 .6 10.7 10.7 0 0 1-1.4 2.5"/><path d="M14.1 14.2a3 3 0 0 1-4.3-4.3"/><path d="M17.5 17.5a10.7 10.7 0 0 1-15.4-5.2 1 1 0 0 1 0-.6 10.7 10.7 0 0 1 4.4-5.1"/>';
const CORNERS = '<path d="M3 7.5V5a2 2 0 0 1 2-2h2.5"/><path d="M16.5 3H19a2 2 0 0 1 2 2v2.5"/><path d="M21 16.5V19a2 2 0 0 1-2 2h-2.5"/><path d="M7.5 21H5a2 2 0 0 1-2-2v-2.5"/>';
const LOOP_BACK = '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>';
const CIRCLE = '<circle cx="12" cy="12" r="9.5"/>';
const BIN = '<path d="M4 6.5h16"/><path d="M9 6.5V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8v1.7"/><path d="m6 6.5.9 12.7A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.8L18 6.5"/><path d="M10 11v5.5M14 11v5.5"/>';
const PEN = '<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/><path d="m15 5 4 4"/>';
const BRIDGE = '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/>';
const WINDOW = '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="M2.5 8.5h19"/>';
const STAR = (x, y, r = 1) => `<path class="hl" ${G} d="M${x} ${y - 3 * r}l${0.8 * r} ${2.2 * r} ${2.2 * r} ${0.8 * r}-${2.2 * r} ${0.8 * r}-${0.8 * r} ${2.2 * r}-${0.8 * r}-${2.2 * r}-${2.2 * r}-${0.8 * r} ${2.2 * r}-${0.8 * r}z"/>`;

export const ICONS = {
  // ── editing ─────────────────────────────────────────────────────────────
  undo: svg('<path d="M8.5 14.5 3.5 9.5l5-5"/><path d="M3.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/><circle class="hl" cx="9.5" cy="20.5" r="1.6" ' + G + '/>'),
  redo: svg('<path d="m15.5 14.5 5-5-5-5"/><path d="M20.5 9.5H10a5.5 5.5 0 0 0 0 11h3"/><circle class="hl" cx="14.5" cy="20.5" r="1.6" ' + G + '/>'),
  duplicate: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 5V4.5A1.5 1.5 0 0 0 14.5 3h-10A1.5 1.5 0 0 0 3 4.5v10A1.5 1.5 0 0 0 4.5 16H5"/><path class="hl rl" d="M14.5 11.5v6M11.5 14.5h6"/>'),
  delete: svg(BIN),
  moveUp: svg('<path d="M12 21V7.5"/><path d="m6 13 6-6 6 6"/><path class="hl rl" d="M6 3h12"/>'),
  moveDown: svg('<path d="M12 3v13.5"/><path d="m6 11 6 6 6-6"/><path class="hl rl" d="M6 21h12"/>'),
  addPara: svg('<path d="M10 4v16M14 4v16"/><path d="M16.5 4h-9a4.5 4.5 0 0 0 0 9H10"/><path class="hl rl" d="M19.5 15v6M16.5 18h6"/>'),
  rowAdd: svg('<path d="M3 5h13"/><path d="M3 12h8"/><path d="M3 19h13"/><path class="hl rl" d="M18 9v6M15 12h6"/>'),
  rowDel: svg('<path d="M3 5h13"/><path d="M3 19h13"/><path d="M3 12h7"/><circle cx="17.5" cy="12" r="4"/><path class="hl rl" d="M15.5 12h4"/>'),
  colAdd: svg('<rect x="3" y="8.5" width="7" height="12.5" rx="1.5"/><rect x="14" y="8.5" width="7" height="12.5" rx="1.5"/><path class="hl rl" d="M12 2.5v5.5M9.5 5.5 12 8l2.5-2.5"/>'),
  colDel: svg('<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M9 3v18M15 3v18" stroke-dasharray="2 2.6"/><path class="hl rl" d="m10.5 10.5 3 3M13.5 10.5l-3 3"/>'),
  image: svg('<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><path d="m3.5 18 5-5 3.5 3.5 2.5-2.5 6 5.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path class="hl rl" d="M18.5 2.5v6M15.5 5.5h6"/>'),
  logo: svg('<path d="M14 12.5V9c0-1.4.9-1.6.9-3.5a2.9 2.9 0 0 0-5.8 0C9.1 7.4 10 7.6 10 9v3.5"/><path d="M4 15.5A2.5 2.5 0 0 1 6.5 13h11a2.5 2.5 0 0 1 2.5 2.5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path class="hl rl" d="M6 21.5h12"/>'),
  comment: svg('<path d="M20.5 15.5a2 2 0 0 1-2 2H8l-4.5 3.5V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path class="hl rl" d="M12 7.5v6M9 10.5h6"/>'),
  renumber: svg('<path d="M4 9h16M4 15h16"/><path d="M10 3 8 21"/><path class="hl rl" d="m16 3-2 18"/>'),
  breakBefore: svg('<circle cx="5.5" cy="7" r="2.5"/><circle cx="5.5" cy="17" r="2.5"/><path d="m7.7 8.3 7.3 7.2M7.7 15.7 15 8.5"/><path class="hl rl" d="M17.5 12h1M21.5 12h.5"/>'),
  keepNext: svg('<rect x="4" y="3" width="16" height="6.5" rx="1.5"/><rect x="4" y="14.5" width="16" height="6.5" rx="1.5"/><path class="hl rl" d="M10 9.5v5M14 9.5v5"/>'),
  find: svg(LENS + '<path class="hl rl" d="M7.5 9.2a3.3 3.3 0 0 1 3-2.6"/>'),
  outline: svg('<circle class="hl" cx="3.5" cy="4" r="1.8" ' + G + '/><path d="M3.5 7.5V16a2 2 0 0 0 2 2H8"/><path d="M3.5 11H8"/><path d="M8.5 4h12.5"/><path d="M12 11h9"/><path d="M12 18h9"/>'),
  history: svg(LOOP_BACK + '<path class="hl rl" d="M12 7.5V12l3.2 2"/>'),
  // ── files ───────────────────────────────────────────────────────────────
  save: svg('<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v3.5a1 1 0 0 0 1 1h6"/><rect class="hl" x="7" y="12.5" width="10" height="6.5" rx="1" ' + G + '/>'),
  saveHtml: svg(PAGE + '<path class="hl rl" d="m6 14-3.5 3.5L6 21M10 14l3.5 3.5L10 21"/>'),
  import: svg('<path d="M12 3v11"/><path d="m7.5 9.5 4.5 4.5 4.5-4.5"/><path d="M3.5 14.5v4A2.5 2.5 0 0 0 6 21h12a2.5 2.5 0 0 0 2.5-2.5v-4"/><path class="hl rl" d="M8.5 17.5h7"/>'),
  print: svg('<path d="M6.5 17.5h-2a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2"/><path d="M6.5 9V3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V9"/><rect class="hl" x="6.5" y="14" width="11" height="7.5" rx="1" ' + G + '/>'),
  projExport: svg(FOLDER + '<path class="hl rl" d="M12 9.5v6.5M9 13l3 3 3-3"/>'),
  projImport: svg(FOLDER + '<path class="hl rl" d="M12 16.5V10M9 13l3-3 3 3"/>'),
  // ── zoom and view ───────────────────────────────────────────────────────
  zoomIn: svg(LENS + '<path class="hl rl" d="M10.5 7.5v6M7.5 10.5h6"/>'),
  zoomOut: svg(LENS + '<path class="hl rl" d="M7.5 10.5h6"/>'),
  zoomReset: svg(LOOP_BACK + '<path class="hl rl" d="M10.5 9.5 12.5 8v8"/>'),
  zoomFit: svg('<path d="M6.5 12h11"/><path d="M9 8.5 5.5 12 9 15.5M15 8.5l3.5 3.5-3.5 3.5"/><path class="hl rl" d="M2.5 4.5v15M21.5 4.5v15"/>'),
  zoomHeight: svg('<path d="M12 6.5v11"/><path d="M8.5 9 12 5.5 15.5 9M8.5 15l3.5 3.5 3.5-3.5"/><path class="hl rl" d="M4.5 2.5h15M4.5 21.5h15"/>'),
  zoomPct: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="m9.5 15 5-6"/><circle class="hl" cx="9.3" cy="9.5" r="1.4" ' + G + '/><circle class="hl" cx="14.7" cy="14.5" r="1.4" ' + G + '/>'),
  view: svg(EYE + '<circle class="hl" cx="12" cy="12" r="3.2" ' + G + '/>'),
  secView: svg(EYE + '<circle class="hl" cx="12" cy="12" r="3.2" ' + G + '/>'),
  side: svg('<rect x="3" y="3.5" width="18" height="17" rx="2"/><path d="M12 3.5v17"/><path d="M5.5 8h4M5.5 11.5h4"/><path class="hl rl" d="M14.5 8h4M14.5 11.5h4"/>'),
  both: svg(BRIDGE + '<path class="hl rl" d="M8 12h8"/>'),
  focus: svg(CORNERS + '<circle class="hl" cx="12" cy="12" r="3.2" ' + G + '/>'),
  dark: svg('<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.5 6.5 0 0 0 10 10z"/>' + STAR(17.5, 6)),
  calm: svg('<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path class="hl rl" d="M9.8 4.4A2 2 0 1 1 11 8H2"/>'),
  'view.continuous': svg('<path class="hl rl" d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>'),
  'view.single': svg(PAGE_FULL + '<path class="hl rl" d="M8.5 13h7M8.5 16.5h4.5"/>'),
  'view.spread': svg('<path class="hl rl" d="M12 5.5v15"/><path d="M20 19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4a5 5 0 0 0-4 2 5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4a5 5 0 0 1 4 2 5 5 0 0 1 4-2z"/>'),
  'view.left': svg('<path d="m15 18-6-6 6-6"/>'),
  'view.right': svg('<path d="m9 18 6-6-6-6"/>'),
  // ── spelling ────────────────────────────────────────────────────────────
  spell: svg('<path d="m3.5 17 5.5-12 5 10.5"/><path d="M5.5 12.5h7"/><path class="hl rl" d="m13.5 18.5 2.5 2.5 5-5.5"/>'),
  spellNext: svg('<path d="m6 8.5 6 6 6-6"/><path class="hl rl" d="M9 19.5h6"/>'),
  spellPrev: svg('<path d="m18 15.5-6-6-6 6"/><path class="hl rl" d="M9 4.5h6"/>'),
  spellFix: svg('<path d="m4 12.5 5 5L20 6.5"/><circle class="hl" cx="19.5" cy="17.5" r="1.9" ' + G + '/>'),
  spellFixAll: svg('<path d="m2 12.5 5 5L18 6.5"/><path class="hl rl" d="m13 16 1.5 1.5L22 10"/>'),
  spellIgnore: svg('<path d="m5 19 5-12.5L15 19"/><path d="M7 14.5h6"/><path class="hl rl" d="m4 4 16 16"/>'),
  spellIgnoreAll: svg('<path d="M3 6h13"/><path d="M3 12h8"/><path d="M3 18h13"/><path class="hl rl" d="m15 10 4.5 4.5M19.5 10 15 14.5"/>'),
  spellAdd: svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 1 0-5H20"/><path class="hl rl" d="M12 6.5v6M9 9.5h6"/>'),
  spellCount: svg('<path d="M5 5v14"/><path d="M9 5v14"/><path d="M13 5v14"/><path d="M17 5v14"/><path class="hl rl" d="m3 16 18-8"/>'),
  spellLang: svg('<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path class="hl rl" d="m22 22-5-10-5 10M14 18h6"/>'),
  hideBlock: svg(EYE_OFF + '<path class="hl rl" d="m3 3 18 18"/>'),
  // ── tools, panels, settings ─────────────────────────────────────────────
  palette: svg('<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/><rect class="hl" x="10.2" y="10.2" width="3.6" height="3.6" rx=".6" ' + G + '/>'),
  webhooks: svg('<path d="M18 17h-6c-1.1 0-1.9.9-2.5 1.9A4 4 0 0 1 2 17c0-.7.2-1.4.6-2"/><path d="m6 17 3.1-5.8c.5-1 .1-2.2-.5-3.1a4 4 0 1 1 6.9-4.1"/><path class="hl rl" d="m12 6 3.1 5.7c.5 1 1.8 1.3 2.9 1.3a4 4 0 0 1 0 8"/>'),
  send: svg('<path d="M21.5 2.5 14.8 21.2a.6.6 0 0 1-1.1 0l-3.2-7.7-7.7-3.2a.6.6 0 0 1 0-1.1z"/><path class="hl rl" d="M21.5 2.5 10.5 13.5"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  grip: svg('<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>'),
  snap: svg('<path class="hl rl" d="m12 15 4 4"/><path d="M2.4 10.6a1.2 1.2 0 0 0 0 1.7l2.3 2.3a1.2 1.2 0 0 0 1.7 0l6-6a1 1 0 1 1 3 3l-6 6a1.2 1.2 0 0 0 0 1.7l2.3 2.3a1.2 1.2 0 0 0 1.7 0l6.4-6.4A1 1 0 0 0 8.7 4.3z"/><path class="hl rl" d="m5 8 4 4"/>'),
  every: svg('<path class="hl rl" d="M12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8z"/><path d="M2 12a1 1 0 0 0 .6.9l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .6.9l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9A1 1 0 0 0 22 17"/>'),
  replace: svg('<rect x="2.5" y="3" width="8" height="8" rx="1.5"/><rect class="hl" x="13.5" y="13" width="8" height="8" rx="1.5" ' + G + '/><path d="M14 4.5h3a2.5 2.5 0 0 1 2.5 2.5v3"/><path d="m17.5 8 2 2 2-2"/><path d="M10 19.5H7A2.5 2.5 0 0 1 4.5 17v-3"/><path d="m6.5 16-2-2-2 2"/>'),
  caption: svg('<path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M12 4v12"/><path class="hl rl" d="M7 20h10"/>'),
  styleThis: svg('<path d="m14.6 17.9-10.7-2.9"/><path d="M18.4 2.6a1 1 0 1 1 3 3l-4 4a.5.5 0 0 0 0 .7l.9.9a2.4 2.4 0 0 1 0 3.4l-.9.9a.5.5 0 0 1-.7 0L8.4 7.3a.5.5 0 0 1 0-.7l.9-.9a2.4 2.4 0 0 1 3.4 0l.9.9a.5.5 0 0 0 .7 0z"/><path class="hl rl" d="M9 8c-1.8 2.7-4 3.5-6.6 3.9a.5.5 0 0 0-.3.8l7.3 8.9a1 1 0 0 0 1.2.2c1.9-1.4 5.4-5 5.4-6.8"/>'),
  rowUp: svg('<path d="M7 20V5"/><path d="m3 9 4-4 4 4"/><path class="hl rl" d="M14 7h7"/><path d="M14 12h7"/><path d="M14 17h7"/>'),
  rowDown: svg('<path d="M7 4v15"/><path d="m3 15 4 4 4-4"/><path d="M14 7h7"/><path d="M14 12h7"/><path class="hl rl" d="M14 17h7"/>'),
  connect: svg('<circle cx="6" cy="19" r="2.8"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle class="hl" cx="18" cy="5" r="2.8" ' + G + '/>'),
  add: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  more: svg('<circle cx="5" cy="12" r="1.2"/><circle class="hl" cx="12" cy="12" r="1.7" ' + G + '/><circle cx="19" cy="12" r="1.2"/>'),
  learning: svg('<path class="hl rl" d="M12 18V5"/><path d="M15 13a4.2 4.2 0 0 1-3-4 4.2 4.2 0 0 1-3 4"/><path d="M17.7 6.3A3 3 0 1 0 12 5a3 3 0 1 0-5.7 1.3"/><path d="M18 5.1a4 4 0 0 1 2.5 5.8"/><path d="M18 18a4 4 0 0 0 2-7.5"/><path d="M20 17.5a4 4 0 1 1-8 .5 4 4 0 1 1-8-.5"/><path d="M6 18a4 4 0 0 1-2-7.5"/><path d="M6 5.1a4 4 0 0 0-2.5 5.8"/>'),
  settings: svg('<path d="M9.7 4.1a2.3 2.3 0 0 1 4.6 0 2.3 2.3 0 0 0 3.3 1.9 2.3 2.3 0 0 1 2.3 4 2.3 2.3 0 0 0 0 3.8 2.3 2.3 0 0 1-2.3 4 2.3 2.3 0 0 0-3.3 1.9 2.3 2.3 0 0 1-4.6 0 2.3 2.3 0 0 0-3.3-1.9 2.3 2.3 0 0 1-2.3-4 2.3 2.3 0 0 0 0-3.8 2.3 2.3 0 0 1 2.3-4 2.3 2.3 0 0 0 3.3-1.9"/><circle class="hl" cx="12" cy="12" r="3" ' + G + '/>'),
  prefs: svg('<path d="M10 5H3"/><path d="M12 19H3"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 12H3"/><g class="hl rl"><path d="M14 3v4"/><path d="M16 17v4"/><path d="M8 10v4"/></g>'),
  link: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path class="hl rl" d="M15 3h6v6M10 14 21 3"/>'),
  // ── states (ink only: the context colours them) ─────────────────────────
  ok: svg(CIRCLE + '<path d="m7.5 12.3 3 3 6-6.3"/>'),
  warn: svg('<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  err: svg(CIRCLE + '<path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  info: svg(CIRCLE + '<path d="M12 16.5V11"/><path d="M12 7.5h.01"/>'),
  updDone: svg(CIRCLE + '<path d="m7.5 12.3 3 3 6-6.3"/>'),
  updStep: svg('<circle cx="12" cy="12" r="9.5" stroke-dasharray="2 3.2"/><path class="hl rl" d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5"/>'),
  updFail: svg(CIRCLE + '<path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  // ── sections and menus ──────────────────────────────────────────────────
  secFile: svg(FOLDER + '<path class="hl rl" d="M3 9.5h18"/>'),
  secInsert: svg('<path d="M12.5 3.5h-6A1.5 1.5 0 0 0 5 5v14.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8"/><path d="M8.5 12.5h6M8.5 16.5h6"/><circle class="hl" cx="18" cy="6" r="4.3" ' + G + '/><path class="on-hl" d="M18 3.9v4.2M15.9 6h4.2"/>'),
  secDocument: svg(PAGE_FULL + '<path d="M8.5 13h7M8.5 16.5h4.5"/><path class="hl rl" d="M8.5 9.5h2.5"/>'),
  secSel: svg('<circle class="hl" cx="19" cy="5" r="2.2" ' + G + '/><circle cx="5" cy="19" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/>'),
  'export.html': svg(WINDOW + '<path class="hl rl" d="m9 12.5-2.5 2.5L9 17.5M15 12.5l2.5 2.5-2.5 2.5"/>'),
  'export.printHtml': svg('<path d="M6.5 9V3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V9"/><path d="M6.5 17h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path class="hl rl" d="m9.5 14.5-2 2.5 2 2.5M14.5 14.5l2 2.5-2 2.5"/>'),
  'export.svg': svg(PAGE_FULL + '<path class="hl rl" d="M8.5 17c1.8-3.8 5.2-3.8 7 0"/><circle cx="8.5" cy="17" r="1.1"/><circle cx="15.5" cy="17" r="1.1"/>'),
  'export.png': svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3.5 17.5 5-5 4 4 3-3 5 4.5"/><rect class="hl" x="13.5" y="6" width="4.5" height="4.5" rx=".8" ' + G + '/>'),
  'print.refresh': svg('<path d="M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/><path class="hl rl" d="M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16M8 16H3v5"/>'),
  'print.browser': svg(WINDOW + '<path class="hl rl" d="M10 16.5 15 11.5M11 11.5h4v4"/>'),
  // ── the diagram ─────────────────────────────────────────────────────────
  dgStaff: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><rect class="hl" x="15" y="6" width="3" height="3" rx=".6" ' + G + '/>'),
  dgApplicant: svg('<path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9"/><circle class="hl" cx="12" cy="12" r="2.6" ' + G + '/>'),
  dgStart: svg('<rect x="2.5" y="7" width="19" height="10" rx="5"/><path class="hl" ' + G + ' d="M10.2 9.6v4.8l4-2.4z"/>'),
  dgPayment: svg('<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path class="hl rl" d="M2.5 10h19"/><path d="M6 14.5h3"/>'),
  dgRework: svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><path class="hl rl" d="M15.5 12a3.5 3.5 0 1 1-1-2.5M15 6.8v2.8h-2.8"/>'),
  dgSystem: svg('<circle cx="12" cy="12" r="9.5" stroke-dasharray="3 2.6"/><circle class="hl" cx="12" cy="12" r="3" ' + G + '/>'),
  dgDecision: svg('<path d="M2.7 10.3a2.4 2.4 0 0 0 0 3.4l7.6 7.6a2.4 2.4 0 0 0 3.4 0l7.6-7.6a2.4 2.4 0 0 0 0-3.4l-7.6-7.6a2.4 2.4 0 0 0-3.4 0z"/><circle class="hl" cx="12" cy="12" r="2.2" ' + G + '/>'),
  dgOk: svg('<path d="M21 10.5A9.5 9.5 0 1 1 16.5 4"/><path class="hl rl" d="m8.5 11 3 3L21.5 4"/>'),
  dgStop: svg('<circle cx="12" cy="12" r="9.5"/><circle class="hl" cx="12" cy="12" r="5" ' + G + '/>'),
  dgNote: svg('<path d="M21 9.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9.5z"/><path class="hl" ' + G + ' d="M14.5 3.5V8a1 1 0 0 0 1 1H20z"/><path d="M7 13h8M7 16.5h5"/>'),
  dgGroup: svg('<rect x="2.5" y="2.5" width="19" height="19" rx="2.5" stroke-dasharray="3 2.5"/><rect x="6" y="6.5" width="6.5" height="5" rx="1"/><rect class="hl" x="11.5" y="12.5" width="6.5" height="5" rx="1" ' + G + '/>'),
  dgWrap: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10"/><path class="hl rl" d="M7 13h7.5a2 2 0 0 1 0 4H12"/><path d="m13.5 15.5-1.5 1.5 1.5 1.5"/>'),
  dgText: svg('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2.5"/><path d="M8 8.5h8"/><path class="hl rl" d="M12 8.5v8"/>'),
  dgSymbol: svg('<path d="M8.3 10a.7.7 0 0 1-.6-1.1L11.4 3a.7.7 0 0 1 1.2 0l3.7 5.9a.7.7 0 0 1-.6 1.1z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle class="hl" cx="17.5" cy="17.5" r="3.5" ' + G + '/>'),
  dgConnect: svg('<path d="M2.5 12h18"/><path class="hl rl" d="m16 7.5 4.5 4.5-4.5 4.5"/>'),
  dgLabel: svg(PEN + '<path class="hl rl" d="M13 21h8"/>'),
  dgEdgeLabel: svg('<path d="M2.5 18h18"/><path d="m16.5 14 4 4-4 4"/><rect x="5.5" y="3.5" width="11" height="7.5" rx="1.5"/><path class="hl rl" d="M8.5 7.3h5"/>'),
  dgSub: svg('<rect x="3" y="3.5" width="18" height="15" rx="2"/><rect class="hl" x="9.5" y="14" width="5" height="5" rx="1" ' + G + '/><path class="on-hl" d="M12 15v3M10.5 16.5h3"/>'),
  dgDup: svg('<circle cx="8" cy="8" r="5"/><rect x="10" y="10" width="11" height="11" rx="2"/><path class="hl rl" d="M15.5 13v5M13 15.5h5"/>'),
  dgDel: svg('<rect x="3" y="3" width="12" height="12" rx="2" stroke-dasharray="2.5 2.5"/><path class="hl rl" d="m14.5 14.5 6 6M20.5 14.5l-6 6"/>'),
  dgFront: svg('<rect class="hl" x="8" y="8" width="8" height="8" rx="2" ' + G + '/><path d="M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2"/><path d="M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2"/>'),
  dgBack: svg('<rect x="14" y="14" width="8" height="8" rx="2"/><rect class="hl" x="2" y="2" width="8" height="8" rx="2" ' + G + '/><path d="M7 14v1a2 2 0 0 0 2 2h1"/><path d="M14 7h1a2 2 0 0 1 2 2v1"/>'),
  dgAlignL: svg('<rect x="6" y="14" width="9" height="6" rx="2"/><rect x="6" y="4" width="15" height="6" rx="2"/><path class="hl rl" d="M2.5 2v20"/>'),
  dgAlignC: svg('<path class="hl rl" d="M12 2v20"/><path d="M8 10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"/><path d="M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"/><path d="M8 20H7a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1"/><path d="M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1"/>'),
  dgAlignR: svg('<rect x="3" y="4" width="15" height="6" rx="2"/><rect x="9" y="14" width="9" height="6" rx="2"/><path class="hl rl" d="M21.5 22V2"/>'),
  dgAlignT: svg('<rect x="4" y="6" width="6" height="15" rx="2"/><rect x="14" y="6" width="6" height="9" rx="2"/><path class="hl rl" d="M22 2.5H2"/>'),
  dgAlignM: svg('<path class="hl rl" d="M2 12h20"/><path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/><path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4"/><path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1"/><path d="M14 8V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1"/>'),
  dgAlignB: svg('<rect x="4" y="3" width="6" height="15" rx="2"/><rect x="14" y="9" width="6" height="9" rx="2"/><path class="hl rl" d="M22 21.5H2"/>'),
  dgDistH: svg('<rect x="4" y="5" width="6" height="14" rx="2"/><rect class="hl rl" x="14" y="7" width="6" height="10" rx="2"/><path d="M17 22v-5M17 7V2M7 22v-3M7 5V2"/>'),
  dgDistV: svg('<path d="M22 17h-3M22 7h-5M5 17H2M7 7H2"/><rect x="5" y="14" width="14" height="6" rx="2"/><rect class="hl rl" x="7" y="4" width="10" height="6" rx="2"/>'),
  dgAuto: svg('<path d="m21.6 3.6-1.2-1.2a1.2 1.2 0 0 0-1.8 0L2.4 18.6a1.2 1.2 0 0 0 0 1.8l1.2 1.2a1.2 1.2 0 0 0 1.8 0L21.6 5.4a1.2 1.2 0 0 0 0-1.8"/><path d="m14 7 3 3"/><g class="hl rl"><path d="M5 6v4M3 8h4"/><path d="M19 14v4M17 16h4"/><path d="M10 2v2M9 3h2"/></g>'),
  dgReset: svg(LOOP_BACK + '<rect class="hl" x="9.5" y="9.5" width="5" height="5" rx="1" ' + G + '/>'),
  dgMermaidIn: svg('<path d="M4 10.5V4.5A1.5 1.5 0 0 1 5.5 3H14l5.5 5.5v11A1.5 1.5 0 0 1 18 21H5.5A1.5 1.5 0 0 1 4 19.5v-1"/><path d="M14 3v5.5h5.5"/><path class="hl rl" d="M2 14.5h10M9 11.5l3 3-3 3"/>'),
  dgMermaidOut: svg('<path d="M4 18.5v1A1.5 1.5 0 0 0 5.5 21H18a1.5 1.5 0 0 0 1.5-1.5v-11L14 3H5.5A1.5 1.5 0 0 0 4 4.5v6"/><path d="M14 3v5.5h5.5"/><path class="hl rl" d="M12 14.5H2M5 11.5l-3 3 3 3"/>'),
  dgReverse: svg('<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path class="hl rl" d="m8 21-4-4 4-4M4 17h16"/>'),
  dgFrom: svg('<path d="M8 12h12.5"/><path d="m16.5 8 4 4-4 4"/><circle class="hl" cx="5" cy="12" r="2.8" ' + G + '/>'),
  dgTo: svg('<path d="M3.5 12H15"/><path d="m11 8 4 4-4 4"/><circle class="hl" cx="19.5" cy="12" r="2.6" ' + G + '/>'),
  dgLegend: svg('<g class="hl rl"><path d="M3.5 5h.01M3.5 12h.01M3.5 19h.01"/></g><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>'),
  dgBendAdd: svg('<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M5 17A12 12 0 0 1 17 5"/><path class="hl rl" d="M16.5 13.5v6M13.5 16.5h6"/>'),
  dgBendDel: svg('<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="m6.5 17.5 11-11"/><path class="hl rl" d="M13.5 17.5h6"/>'),
  dgRouteAuto: svg('<circle cx="5" cy="19" r="2.3"/><path d="M7.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h3"/>' + STAR(18, 5)),
  dgZoomIn: svg(LENS + '<path class="hl rl" d="M10.5 7.5v6M7.5 10.5h6"/>'),
  dgZoomOut: svg(LENS + '<path class="hl rl" d="M7.5 10.5h6"/>'),
  dgZoomFit: svg(CORNERS + '<rect x="8" y="8.5" width="8" height="7" rx="1.5"/><circle class="hl" cx="12" cy="12" r="1.4" ' + G + '/>'),
  dgZoom100: svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M7.5 9.5 9 8.5v7M15 9.5l1.5-1v7"/><g class="hl rl"><path d="M12 10.5h.01M12 14h.01"/></g>'),
};

const raw = fs.readFileSync(FILE, 'utf8');
const json = JSON.parse(raw);
const missing = Object.keys(ICONS).filter((k) => !(k in json.icons));
if (missing.length) { console.error(`not in icons.json: ${missing.join(' ')}`); process.exit(1); }
const left = Object.keys(json.icons).filter((k) => !(k in ICONS) && !k.startsWith('rbt.') && !json.icons[k].includes('bw-i'));
if (process.argv.includes('--check')) {
  const diff = Object.keys(ICONS).filter((k) => json.icons[k] !== ICONS[k]);
  console.log(diff.length || left.length ? `differs: ${diff.join(' ')}${left.length ? `; not drawn in v3: ${left.join(' ')}` : ''}` : `editor icons up to date (${Object.keys(ICONS).length})`);
  process.exit(diff.length || left.length ? 1 : 0);
}
for (const [k, v] of Object.entries(ICONS)) json.icons[k] = v;
if (!/brand v3 editor icons/.test(json.$source)) json.$source += '; brand/v3/tools/build_editor_icons.mjs (brand v3 editor icons, 0.17.0, redrawn after Lucide geometry where the glyph is the convention)';
fs.writeFileSync(FILE, JSON.stringify(json, null, 1) + (raw.endsWith('\n') ? '\n' : ''));
console.log(`wrote ${Object.keys(ICONS).length} editor icons into editor/icons.json${left.length ? `; still not drawn: ${left.join(' ')}` : ''}`);
