// A small, dependency-free XML reader for process models (BPMN 2.0, draw.io). Browser + Node.
// Elements, attributes, text and CDATA; comments, processing instructions and DOCTYPE are skipped.
// No entity expansion beyond the five XML entities and numeric references (no external entities).

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const unescapeXml = (s) =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });

/** Parse to {name, local, attrs, children, text}. `local` drops the namespace prefix. */
export function parseXml(src) {
  const s = String(src).replace(/^﻿/, '');
  const root = { name: '#root', local: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { top().text += unescapeXml(s.slice(i)); break; }
    if (lt > i) top().text += unescapeXml(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; continue; }
    if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt + 9); top().text += s.slice(lt + 9, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 3; continue; }
    if (s.startsWith('<?', lt)) { const e = s.indexOf('?>', lt + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (s.startsWith('<!', lt)) { const e = s.indexOf('>', lt + 2); i = e < 0 ? s.length : e + 1; continue; }
    if (s[lt + 1] === '/') {
      const e = s.indexOf('>', lt);
      const name = s.slice(lt + 2, e).trim();
      while (stack.length > 1 && top().name !== name) stack.pop(); // tolerate unclosed tags
      if (stack.length > 1) stack.pop();
      i = e + 1;
      continue;
    }
    // start tag: read up to the closing '>' outside quotes
    let j = lt + 1;
    let q = null;
    for (; j < s.length; j += 1) {
      const c = s[j];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
    }
    const raw = s.slice(lt + 1, j);
    const self = raw.endsWith('/');
    const body = self ? raw.slice(0, -1) : raw;
    const m = /^([^\s/>]+)/.exec(body);
    const name = m ? m[1] : '';
    const attrs = {};
    for (const a of body.slice(name.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescapeXml(a[3] ?? a[4] ?? '');
    const el = { name, local: name.includes(':') ? name.split(':').pop() : name, attrs, children: [], text: '' };
    top().children.push(el);
    if (!self) stack.push(el);
    i = j + 1;
  }
  return root;
}

export function* walk(el) {
  yield el;
  for (const c of el.children) yield* walk(c);
}
export const find = (el, local) => [...walk(el)].filter((x) => x.local === local);
export const child = (el, local) => el.children.find((x) => x.local === local);
export const kids = (el, local) => el.children.filter((x) => x.local === local);
/** Attribute by local name, whatever the prefix (flowable:, camunda:, activiti:). */
export const attr = (el, local) => {
  if (local in el.attrs) return el.attrs[local];
  const k = Object.keys(el.attrs).find((x) => x.split(':').pop() === local);
  return k ? el.attrs[k] : undefined;
};
export const textOf = (el) => (el ? [el.text, ...el.children.map(textOf)].join('').trim() : '');
