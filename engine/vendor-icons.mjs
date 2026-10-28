// Copies the editor's icons from lucide-static (ISC licence) into editor/icons.json, so the
// editor ships offline with no icon dependency at run time. Re-run after changing the list.
//
//   node engine/vendor-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'node_modules', 'lucide-static', 'icons');
const MAP = {
  undo: 'undo-2', redo: 'redo-2', duplicate: 'copy', delete: 'trash-2', moveUp: 'arrow-up', moveDown: 'arrow-down',
  addPara: 'pilcrow', rowAdd: 'list-plus', rowDel: 'list-minus', colAdd: 'between-vertical-start', colDel: 'columns-3',
  image: 'image-plus', logo: 'stamp', comment: 'message-square-plus', renumber: 'hash', breakBefore: 'scissors-line-dashed',
  keepNext: 'link-2', find: 'search', outline: 'list-tree', pages: 'file-stack', check: 'badge-check', history: 'history',
  theme: 'palette', save: 'save', saveHtml: 'file-code-2', import: 'upload', exportEdits: 'braces', exportAll: 'braces',
  exportPdf: 'file-down', print: 'printer', zoomIn: 'zoom-in', zoomOut: 'zoom-out', spell: 'spell-check', dark: 'moon',
  side: 'columns-2', uiLang: 'languages', palette: 'command', calm: 'wind', focus: 'focus', webhooks: 'webhook',
  send: 'send', close: 'x', grip: 'grip-vertical', snap: 'magnet', every: 'layers', replace: 'refresh-ccw',
  caption: 'type', ok: 'circle-check', warn: 'triangle-alert', err: 'circle-x', info: 'info', view: 'eye',
  both: 'link-2', ed: 'languages', newdoc: 'file-plus-2', process: 'workflow', crawl: 'globe', add: 'plus', connect: 'route', dir: 'arrow-left-right', styleThis: 'paintbrush', hideBlock: 'eye-off', rowUp: 'arrow-up', rowDown: 'arrow-down',
  // diagrams and the categorised toolbar (0.9.0)
  addDiagram: 'git-fork', dgStaff: 'square', dgApplicant: 'squircle', dgStart: 'pill', dgPayment: 'rectangle-horizontal', dgRework: 'square-dashed', dgSystem: 'circle-dashed',
  dgDecision: 'diamond', dgOk: 'circle-check-big', dgStop: 'circle-x', dgNote: 'sticky-note', dgGroup: 'group', dgText: 'type', dgSymbol: 'shapes',
  dgConnect: 'move-right', dgLabel: 'pencil', dgSub: 'text-cursor-input', dgDup: 'copy', dgDel: 'trash-2', dgFront: 'bring-to-front', dgBack: 'send-to-back',
  dgAlignL: 'align-start-vertical', dgAlignC: 'align-center-vertical', dgAlignR: 'align-end-vertical', dgAlignT: 'align-start-horizontal', dgAlignM: 'align-center-horizontal', dgAlignB: 'align-end-horizontal',
  dgDistH: 'align-horizontal-distribute-center', dgDistV: 'align-vertical-distribute-center', dgWrap: 'group', dgAuto: 'wand-sparkles', dgReset: 'rotate-ccw', dgFlow: 'arrow-left-right',
  dgMermaidIn: 'file-input', dgMermaidOut: 'file-output', dgReverse: 'arrow-right-left', dgFrom: 'unplug', dgTo: 'unplug', dgLegend: 'list', dgEdgeLabel: 'pencil',
  dgBendAdd: 'spline-pointer', dgBendDel: 'circle-minus', dgRouteAuto: 'route', dgZoomIn: 'zoom-in', dgZoomOut: 'zoom-out', dgZoomFit: 'scan', dgZoom100: 'ratio',
  secFile: 'folder', secInsert: 'square-plus', secEdit: 'pen-line', secDocument: 'file-text', secDesign: 'palette', secView: 'eye', secExport: 'file-down', more: 'ellipsis', secSel: 'spline',
  // page view modes (0.10.0)
  // Export & Print centre, View menu (0.11.0)
  'export.menu': 'file-output', 'export.pdf.ar': 'file-text', 'export.pdf.en': 'file-text', 'export.pdf.both': 'files', 'export.docx.ar': 'file-type', 'export.docx.en': 'file-type', 'export.docx.both': 'files',
  'export.html': 'file-code-2', 'export.printHtml': 'code-xml', 'export.edits': 'braces', 'export.editsAll': 'braces', 'export.pack': 'palette', 'export.mermaid': 'git-fork', 'export.svg': 'file-image', 'export.png': 'image',
  'print.refresh': 'refresh-cw', 'print.preview': 'eye', 'print.browser': 'app-window', zoomReset: 'percent', zoomFit: 'move-horizontal',
  'view.continuous': 'scroll-text', 'view.single': 'file', 'view.spread': 'book-open', 'view.left': 'chevron-left', 'view.right': 'chevron-right',
  // settings and updates (0.11.0)
  learning: 'brain', settings: 'settings', updCheck: 'refresh-cw', update: 'download', about: 'info', prefs: 'sliders-horizontal', link: 'external-link', updDone: 'circle-check', updStep: 'circle', updFail: 'circle-x',
};
const out = {};
for (const [k, name] of Object.entries(MAP)) {
  const svg = fs.readFileSync(path.join(SRC, `${name}.svg`), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*class="[^"]*"/, '')
    .replace(/\s*width="24"\s*height="24"/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace('<svg', '<svg aria-hidden="true" focusable="false" class="ic"');
  out[k] = svg;
}
/**
 * Brand v3 icons (brand/v3/icons, Business-Wrap's own, with micro-animations in brand/v3/icons/icons.css) replace the
 * Lucide icon of the commands they name. Title, role and label are dropped: the button carries the name.
 */
export const BRAND = {
  'export.menu': 'export', secExport: 'export',
  exportPdf: 'pdf', 'export.pdf.ar': 'pdf', 'export.pdf.en': 'pdf', 'export.pdf.both': 'pdf',
  'export.docx.ar': 'docx', 'export.docx.en': 'docx', 'export.docx.both': 'docx',
  exportEdits: 'edits-file', exportAll: 'edits-file', 'export.edits': 'edits-file', 'export.editsAll': 'edits-file',
  theme: 'design-pack', secDesign: 'design-pack', 'export.pack': 'design-pack',
  addDiagram: 'diagram', 'export.mermaid': 'diagram', process: 'process-model', crawl: 'walk', newdoc: 'harvest',
  uiLang: 'bilingual', ed: 'bilingual', dir: 'direction', check: 'security-gate', pages: 'print-layout', 'print.preview': 'print-layout',
  secEdit: 'editor', update: 'update', updCheck: 'update', about: 'explainer',
};
const BRAND_DIR = path.join(REPO, 'brand', 'v3', 'icons');
for (const [k, name] of Object.entries(BRAND)) {
  const f = path.join(BRAND_DIR, `${name}.svg`);
  if (!fs.existsSync(f)) continue;
  out[k] = fs.readFileSync(f, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/\s+(class|role|aria-label|width|height)="[^"]*"(?=[^<]*>)/g, (m, a, off, s) => (s.lastIndexOf('<svg', off) === s.lastIndexOf('<', off) ? '' : m))
    .replace(/\s+/g, ' ')
    .trim()
    .replace('<svg', `<svg aria-hidden="true" focusable="false" class="ic bw-i bw-i--${name}"`);
}
const version = JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules', 'lucide-static', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(REPO, 'editor', 'icons.json'), JSON.stringify({ $source: `lucide-static ${version}, ISC licence (https://lucide.dev/license); brand/v3/icons (Business-Wrap brand v3) for ${Object.keys(BRAND).length} commands`, icons: out }, null, 1) + '\n');
console.log(`icons: ${Object.keys(out).length} (lucide-static ${version}, ${Object.keys(BRAND).length} from brand/v3/icons)`);
