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
const version = JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules', 'lucide-static', 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(REPO, 'editor', 'icons.json'), JSON.stringify({ $source: `lucide-static ${version}, ISC licence (https://lucide.dev/license)`, icons: out }, null, 1) + '\n');
console.log(`icons: ${Object.keys(out).length} from lucide-static ${version}`);
