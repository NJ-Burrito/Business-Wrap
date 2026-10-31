/* 0.13.1 final pass #4: an icon in house style (Lucide, as every other tool) on every toolbar and panel button that had
 * only words: the check panel's «انتقل إليه», the documents list (new, import, open, tab, copy, template, delete), the
 * Changes drawer (back, forward, checkpoint, compare), provenance (tabs, sign, lock, share), Settings (view, learning,
 * profile picture, report), the share result card (open the file location, copy the path), Design (palette import, example, design export/import, CSS apply), history, find, page setup.
 * One map, applied wherever the button is drawn (the panels re-render, so a MutationObserver keeps them decorated); each
 * icon moves once on hover, keyboard focus and press (42-button-icons.css, the 40-icon-motion.css moves).
 * Left as words on purpose: the language and direction pickers (ع/E, RTL/LTR are the label) and the font picker (its
 * label is the font). tests/ux.test.mjs lists any icon-less toolbar or panel button and fails. */
IC.biJump = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>'; // lucide locate-fixed (ISC)
IC.biNew = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 15h6"/><path d="M12 18v-6"/></svg>'; // lucide file-plus (ISC)
IC.biImport = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/></svg>'; // lucide file-input (ISC)
IC.biOpen = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>'; // lucide folder-open (ISC)
IC.biTab = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/></svg>'; // lucide app-window (ISC)
IC.biDup = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'; // lucide copy-plus (ISC)
IC.biTpl = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/></svg>'; // lucide layout-template (ISC)
IC.biDel = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'; // lucide trash-2 (ISC)
IC.biBack = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.971 4.285A2 2 0 0 1 17 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"/><path d="M21 20V4"/></svg>'; // lucide step-back (ISC)
IC.biFwd = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/><path d="M3 4v16"/></svg>'; // lucide step-forward (ISC)
IC.biCheckpoint = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/></svg>'; // lucide flag (ISC)
IC.biCompare = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>'; // lucide git-compare (ISC)
IC.biLog = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>'; // lucide history (ISC)
IC.biRules = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/></svg>'; // lucide list-checks (ISC)
IC.biExport = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>'; // lucide download (ISC)
IC.biForget = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/></svg>'; // lucide eraser (ISC)
IC.biPicture = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><circle cx="9" cy="9" r="2"/></svg>'; // lucide image-plus (ISC)
IC.biReport = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>'; // lucide chart-column (ISC)
IC.biPalette = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/><path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/><path d="M 7 17h.01"/><path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/></svg>'; // lucide swatch-book (ISC)
IC.biApply = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'; // lucide check (ISC)
IC.biSnap = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6"/><path d="M15 10H9"/><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>'; // lucide bookmark-plus (ISC)
IC.biNext = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/></svg>'; // lucide chevrons-down (ISC)
IC.biReplaceAll = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1"/><path d="M14 4a1 1 0 0 1 1-1"/><path d="M15 10a1 1 0 0 1-1-1"/><path d="M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1"/><path d="M21 4a1 1 0 0 0-1-1"/><path d="M21 9a1 1 0 0 1-1 1"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a2 2 0 0 1 2-2h2"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>'; // lucide replace-all (ISC)
IC.biAllPages = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></svg>'; // lucide files (ISC)
IC.biSection = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'; // lucide file-text (ISC)
IC.biCopy = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'; // lucide copy (ISC)
// UI-CHROME-11 (0.13.3): commands that shared a glyph with another command get their own (the 27-writing.js aliases only fill a key nothing defined, so these win; they also survive a vendor-icons regeneration of icons.json)
const BI_G = (inner) => '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
const BI_DASH = '<path d="M3 17h3"/><path d="M10.5 17h3"/><path d="M18 17h3"/>';
// 0.15.2 note 3: Reading mode had no icon (the command id `reading` found nothing in IC). Lucide book-open (ISC), the house stroke (2 px, round caps) like every other icon; ic('reading') serves the ribbon, the menus, the palette and the exit chip
IC.reading = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>'; // lucide book-open (ISC)
Object.assign(IC, {
  pgBreakAdd: BI_G(BI_DASH + '<path d="M12 3v7"/><path d="M8.5 6.5h7"/>'), // a page-break rule with a plus
  pgBreakDel: BI_G(BI_DASH + '<path d="m9 4 6 6"/><path d="m15 4-6 6"/>'), // the same rule struck out
  pgPullUp: BI_G('<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>'), // pull what follows up to the line
  secDel: BI_G('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m14.5 12.5-5 5"/><path d="m9.5 12.5 5 5"/>'), // lucide file-x (ISC)
  pgEmpty: BI_G('<path d="M20 8 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2z" stroke-dasharray="3 3"/><path d="M9 15h6"/>'), // an empty (dashed) page, taken away
  addStory: BI_G('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>'), // lucide square-plus (ISC)
  storyPoint: BI_G('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'), // lucide circle-check (ISC)
  storyCard: BI_G('<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2z"/><path d="M14 21v-5a1 1 0 0 1 1-1h6"/>'), // lucide sticky-note (ISC)
  exportAll: BI_G('<path d="M12 13V3"/><path d="m7 8 5 5 5-5"/><path d="M4 17h16"/><path d="M6 21h12"/>'), // download onto a stack of rules: every service
  'export.editsAll': BI_G('<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/><path d="M2 7v13a2 2 0 0 0 2 2"/>'), // lucide file-braces + a second page edge (ISC)
  biHere: BI_G('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'), // lucide map-pin (ISC): from this page on
  pfUser: BI_G('<path d="M18 20a6 6 0 0 0-12 0"/><circle cx="12" cy="10" r="4"/><circle cx="12" cy="12" r="10"/>'), // lucide circle-user-round (ISC): the profile card
  both: BI_G('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>'), // the two editions side by side (was the keep-with-next glyph)
});
const BI_MAP = [
  ['[data-go][data-ring]', 'biJump'],
  ['[data-lib="new"]', 'biNew'], ['[data-lib="import"]', 'biImport'], ['[data-lib="open"]', 'biOpen'], ['[data-lib="tab"]', 'biTab'],
  ['[data-lib="dup"]', 'biDup'], ['[data-lib="tpl"]', 'biTpl'], ['[data-lib="del"]', 'biDel'],
  ['[data-tl="back"]', 'biBack'], ['[data-tl="fwd"]', 'biFwd'], ['[data-tl="cp"]', 'biCheckpoint'], ['[data-tl="cmp"]', 'biCompare'],
  ['[data-pv="tab-history"]', 'biLog'], ['[data-pv="tab-prov"]', 'pvOpen'], ['[data-pv="sign"]', 'pvSign'], ['[data-pv="lock"]', 'lkToggle'], ['[data-pv="share"]', 'shShare'],
  ['[data-k="setView"][data-v="continuous"]', 'view.continuous'], ['[data-k="setView"][data-v="single"]', 'view.single'], ['[data-k="setView"][data-v="spread"]', 'view.spread'],
  ['[data-lrn="rules"]', 'biRules'], ['[data-lrn="export"]', 'biExport'], ['[data-lrn="import"]', 'biImport'], ['[data-lrn="forget"]', 'biForget'],
  ['[data-pf="pick"]', 'biPicture'], ['[data-pf="prov"]', 'pvOpen'], ['[data-rp="go"]', 'biReport'], ['[data-rp="open"]', 'biOpen'],
  ['[data-palimp]', 'biPalette'], ['[data-palex]', 'biExport'], ['[data-k="texp"]', 'biExport'], ['[data-k="timp"]', 'biImport'], ['[data-k="dcssApply"]', 'biApply'],
  ['[data-k="snap"]', 'biSnap'], ['[data-k="log"]', 'biExport'], ['.drawer [data-k="next"]', 'biNext'], ['.drawer [data-k="all"]', 'biReplaceAll'],
  ['[data-sh="open"]', 'biOpen'], ['[data-sh="copy"]', 'biCopy'],
  ['[data-w2a="all"]', 'biAllPages'], ['[data-w2a="section"]', 'biSection'], ['[data-w2a="here"]', 'biHere'],
];
/** The buttons left as words on purpose (their label is the value they pick). */
const BI_WORDS = '[data-a="ed"], [data-a="dir"], [data-k="setLang"], [data-k="setDir"], .fp-btn, [data-tl="go"], [data-k="spEd"]';
/** Give the buttons under `scope` (the whole shadow root by default) their icon. 0.15.0 perf booster 5: the mutation observer used to run all 41
 *  selectors over the whole root on every mutation microtask (1.7 ms per key, 6.5 ms per selection, 6 ms per tab switch); now it only asks
 *  the nodes that were added (a button, or the buttons under an added node) with `matches`. */
function biDecorate(scope = root) {
  const buttons = scope.nodeType === 1 && scope.matches('button') ? [scope, ...scope.querySelectorAll('button')] : scope.querySelectorAll('button');
  for (const b of buttons) {
    if (b.querySelector('svg')) continue;
    for (const [sel, key] of BI_MAP) {
      const inDrawer = sel.startsWith('.drawer ');
      if (!b.matches(inDrawer ? sel.slice(8) : sel) || (inDrawer && !b.closest('.drawer'))) continue;
      if (!(IC[key] || IC.biLog)) continue;
      b.insertAdjacentHTML('afterbegin', `<span class="i bi-i">${ic(IC[key] ? key : 'biLog')}</span>`);
      break; // the first map entry that fits, as before (a decorated button is skipped by the svg test on the next entry)
    }
  }
}
/** 0.15.2 hover intent: `.ic-rest` goes on a tool 120 ms after the pointer entered it and comes off when it leaves; the icon part moves (40-icon-motion.css)
 *  play on `.ic-rest:hover`, so sweeping across the ribbon starts no animation at all. */
const IC_REST_MS = 120;
const IC_REST_SEL = 'button, summary, [role="option"], .sc, label.chk, label.set-chk, a.b';
function icIntent() {
  let timer = 0, cur = null;
  const clear = () => { clearTimeout(timer); timer = 0; cur?.classList.remove('ic-rest'); cur = null; };
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target?.closest?.(IC_REST_SEL) || null;
    if (el === cur) return;
    clear();
    if (!el) return;
    cur = el;
    timer = setTimeout(() => { timer = 0; if (cur === el) el.classList.add('ic-rest'); }, IC_REST_MS);
  });
  root.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !root.contains?.(e.relatedTarget)) clear(); });
  root.addEventListener('pointerdown', () => { clearTimeout(timer); timer = 0; cur?.classList.add('ic-rest'); }, true);
}
let biObserver = null;
bwExt({
  on: {
    boot: () => {
      icIntent();
      biDecorate();
      // only what was added is looked at; a removed icon (a morph) re-checks its own button; our own insertions are dropped from the queue
      biObserver = new MutationObserver((recs) => {
        const todo = new Set();
        for (const r of recs) {
          for (const n of r.addedNodes) if (n.nodeType === 1 && !n.classList.contains('bi-i')) todo.add(n);
          if (r.removedNodes.length && r.target.nodeType === 1 && r.target.matches('button')) todo.add(r.target);
        }
        for (const n of todo) if (n.isConnected) biDecorate(n);
        biObserver.takeRecords();
      });
      biObserver.observe(root, { childList: true, subtree: true });
    },
  },
  expose: { buttonIcons: { map: BI_MAP, words: BI_WORDS, decorate: biDecorate } },
});
