// Business-Wrap brand v3 · the ribbon's category icons (0.17.0, owner notes N5 and N6).
// Drawn in the v3 house style (brand/v3/BRAND.md: rounded 24-unit line icons, one gold part: a seal / tab as a fill (.hl) or The Rule
// as a stroke (.hl.rl), a part on the gold drawn in the ink that sits on gold (.on-hl)). Every moving part carries a letter class
// (.a .b .c .d .e) that editor/ext/40-icon-motion.css gives its own move; the parts without a class never move.
// The ribbon's "View" tab (rbt.view) is a page under a lens, so it no longer looks like the top bar's eye (view), owner note N4.
//   node brand/v3/tools/build_ribbon_icons.mjs           writes the drawings into editor/icons.json (other keys and their order untouched)
//   node brand/v3/tools/build_ribbon_icons.mjs --check   exits 1 when editor/icons.json differs from these drawings
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FILE = path.join(REPO, 'editor', 'icons.json');
const svg = (body) => `<svg aria-hidden="true" focusable="false" class="ic bw-r" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const RIBBON = {
  // File «ملف»: the folder's front flap swings open and a gold sheet rises out of it
  'rbt.file': svg('<path d="M3 9V5.5A1.5 1.5 0 0 1 4.5 4h3.8l2 2h8.2A1.5 1.5 0 0 1 20 7.5V9"/><rect class="hl a" x="6.5" y="6.8" width="11" height="4.2" rx=".8" stroke="none"/><path class="b" d="M2.6 10.8h18.8l-1.5 7.9a1.6 1.6 0 0 1-1.6 1.3H5.7a1.6 1.6 0 0 1-1.6-1.3z"/>'),
  // Export «تصدير»: the arrow crouches, launches out of the tray and comes back in from below; the gold rule on the tray flexes
  'rbt.export': svg('<path d="M4 13.5v5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-5"/><path class="hl rl c" d="M8.5 16.8h7"/><g class="a"><path d="M12 14V3.8"/><path d="m7.8 8 4.2-4.2L16.2 8"/></g>'),
  // Home / edit «تحرير»: the pencil scribbles and its gold line writes itself
  'rbt.home': svg('<path class="hl rl a" pathLength="1" d="M3 21h8.5"/><g class="b"><path d="M15.2 3.8a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L9.4 19.6 4 20.5l.9-5.4z"/><path d="m13.5 5.5 5 5"/></g>'),
  // Font «الخط»: the big A squashes and stretches, the small a hops after it, the gold baseline draws
  'rbt.font': svg('<g class="a"><path d="M2.8 18.5 7.8 5.5l5 13"/><path d="M4.7 14h6.2"/></g><g class="b"><circle cx="17.6" cy="15.6" r="2.9"/><path d="M20.5 12.6v5.9"/></g><path class="hl rl c" d="M2.5 21.3h19"/>'),
  // Paragraph «الفقرة»: the gold indent mark pops, the lines run out one after the other
  'rbt.para': svg('<rect class="hl a" x="3" y="4" width="4.2" height="3.2" rx=".7" stroke="none"/><path class="b" d="M10 5.6h11"/><path class="c" d="M3 10.6h18"/><path class="d" d="M3 15.6h18"/><path class="e" d="M3 20.6h11"/>'),
  // Insert «إدراج»: a gold badge pops onto the page and its plus spins in
  'rbt.insert': svg('<path d="M12.5 3.5h-6A1.5 1.5 0 0 0 5 5v14.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8"/><path d="M8.5 12.5h6M8.5 16.5h6"/><circle class="hl a" cx="18" cy="6" r="4.3" stroke="none"/><path class="on-hl b" d="M18 3.9v4.2M15.9 6h4.2"/>'),
  // Layout «التخطيط»: the gold block drops into its slot, the column lines slide in, the side block swaps sides and back
  'rbt.layout': svg('<rect x="3.5" y="3.5" width="17" height="17" rx="1.8"/><rect class="hl a" x="6.5" y="6.5" width="11" height="3.6" rx=".7" stroke="none"/><path class="b" d="M6.5 13.6h4.6M6.5 17.2h4.6"/><rect class="c" x="13.6" y="13" width="3.9" height="4.6" rx=".7"/>'),
  // Header and footer «الترويسة والتذييل»: the gold header band drops into the top, the footer rule rises into the foot
  'rbt.hf': svg('<rect x="4" y="3" width="16" height="18" rx="1.8"/><rect class="hl a" x="6.5" y="5.5" width="11" height="2.8" rx=".6" stroke="none"/><path d="M7 11.6h10M7 14.6h6.5"/><path class="b" d="M7 18.4h10"/>'),
  // Design «التصميم»: the palette winds up and swings, its swatches pop in turn (the first one gold)
  'rbt.design': svg('<path class="a" d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z"/><circle class="hl b" cx="7.6" cy="11.4" r="1.7" stroke="none"/><circle class="c" cx="10.2" cy="7.2" r="1.3"/><circle class="d" cx="15.2" cy="7.6" r="1.3"/>'),
  // Review «المراجعة»: the bubble bounces on its tail and the gold tick writes itself
  'rbt.review': svg('<path class="a" d="M20 15.5a1.5 1.5 0 0 1-1.5 1.5H8.2L4 20.5V5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5z"/><path class="hl rl b" pathLength="1" d="m8.4 10.6 2.6 2.6 4.9-5"/>'),
  // View «عرض» (the ribbon tab): a page under a lens that sweeps across it; the gold glint rides on the lens
  'rbt.view': svg('<path d="M13.5 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3h11A1.5 1.5 0 0 1 18 4.5V9"/><path d="M7 7.5h8M7 11h4.5"/><g class="a"><circle cx="15.6" cy="15.6" r="3.9"/><path d="m18.4 18.4 2.8 2.8"/><path class="hl rl" d="M13.9 14.3a2.2 2.2 0 0 1 1.7-.9"/></g>'),
  // Tools «أدوات»: the wrench winds up and twists, a gold spark spins off it
  'rbt.tools': svg('<path class="a" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1c.3-.3.9-.2 1 .2a6 6 0 0 1-8.3 7.1l-7.9 7.9a2.1 2.1 0 0 1-3-3l7.9-7.9a6 6 0 0 1 7.1-8.3c.4.1.5.7.2 1z"/><path class="hl b" stroke="none" d="m19 14.2.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  // Table «الجدول»: the gold header row drops on, the rows draw across, the column drops down
  'rbt.table': svg('<rect x="3.5" y="4" width="17" height="16" rx="1.8"/><rect class="hl a" x="5" y="5.5" width="14" height="3" rx=".5" stroke="none"/><path class="b" d="M3.5 12.6h17"/><path class="c" d="M3.5 16.3h17"/><path class="d" d="M10 9.6V20"/>'),
  // Picture «الصورة»: the gold sun rises over the hills, which settle under it
  'rbt.picture': svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle class="hl a" cx="15.6" cy="9.2" r="2.1" stroke="none"/><path class="b" d="m3.6 18.2 5.4-6 4 4 2.5-2.5 4.9 4.4"/>'),
  // Diagram «المخطط»: the first step pops, the connector draws to the gold step, which pops in its turn
  'rbt.diagram': svg('<rect class="a" x="3" y="3.5" width="7.4" height="6.2" rx="1.6"/><path class="b" pathLength="1" d="M6.7 9.7v3.9a2 2 0 0 0 2 2h5"/><rect class="hl c" x="13.7" y="14.4" width="7.3" height="6.2" rx="1.6" stroke="none"/>'),
  // Shape and arrow «الشكل والسهم»: the decision diamond turns a quarter, the gold head runs along the arrow
  'rbt.diagram2': svg('<path class="a" d="M8 3.2 12.8 8 8 12.8 3.2 8z"/><path d="M8 12.8v3.7a2 2 0 0 0 2 2h7.6"/><path class="hl rl b" d="m15.2 15.6 2.9 2.9-2.9 2.9"/>'),
  // Spelling «الإملاء»: the letter hops, the gold squiggle wiggles under it, the tick writes itself
  'rbt.spelling': svg('<g class="a"><path d="m3.5 15.5 4.8-11 4.8 11"/><path d="M5.3 11.6h6"/></g><path class="hl rl b" d="M2.5 20q1.6-2 3.2 0t3.2 0 3.2 0 3.2 0"/><path class="c" pathLength="1" d="m15.6 8.4 2.2 2.2 3.9-4.4"/>'),
  // Fold the ribbon: the chevron springs
  'rbt.collapse': svg('<path class="a" d="m18 15-6-6-6 6"/>'),
};

const raw = fs.readFileSync(FILE, 'utf8');
const json = JSON.parse(raw);
const missing = Object.keys(RIBBON).filter((k) => !(k in json.icons));
if (missing.length) { console.error(`not in icons.json: ${missing.join(' ')}`); process.exit(1); }
if (process.argv.includes('--check')) {
  const diff = Object.keys(RIBBON).filter((k) => json.icons[k] !== RIBBON[k]);
  console.log(diff.length ? `differs: ${diff.join(' ')}` : `ribbon icons up to date (${Object.keys(RIBBON).length})`);
  process.exit(diff.length ? 1 : 0);
}
for (const [k, v] of Object.entries(RIBBON)) json.icons[k] = v;
if (!/brand v3 ribbon/.test(json.$source)) json.$source += '; brand/v3/tools/build_ribbon_icons.mjs (Business-Wrap brand v3 ribbon category icons, 0.17.0)';
fs.writeFileSync(FILE, JSON.stringify(json, null, 1) + (raw.endsWith('\n') ? '\n' : ''));
console.log(`wrote ${Object.keys(RIBBON).length} ribbon icons into editor/icons.json`);
