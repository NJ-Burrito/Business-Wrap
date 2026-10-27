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
  both: 'link-2', ed: 'languages',
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
