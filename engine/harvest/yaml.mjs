// A small YAML subset for step lists: block maps, block lists (of scalars or maps), inline [a, b] lists,
// quoted or plain scalars, numbers, true/false/null, # comments. Anchors, tags and multi-line scalars are not
// supported (JSON is accepted too, and is the safer choice for anything larger).

const scalar = (v) => {
  const s = v.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).replace(/\\"/g, '"');
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map((x) => scalar(x)).filter((x) => x !== null);
  return s;
};
const stripComment = (line) => {
  let q = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
};

export function parseYaml(text) {
  const lines = String(text).split(/\r?\n/).map(stripComment).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '' && l.trim() !== '---');
  let i = 0;
  const indent = (l) => l.match(/^ */)[0].length;
  function block(level) {
    if (i >= lines.length) return null;
    return lines[i].trim().startsWith('- ') || lines[i].trim() === '-' ? list(indent(lines[i])) : map(indent(lines[i]));
  }
  function map(level, first) {
    const out = {};
    if (first) Object.assign(out, first);
    while (i < lines.length && indent(lines[i]) === level && !lines[i].trim().startsWith('- ')) {
      const t = lines[i].trim();
      const k = t.indexOf(':');
      if (k < 0) throw new Error(`yaml: expected "key: value" at line ${i + 1}`);
      const key = t.slice(0, k).trim().replace(/^["']|["']$/g, '');
      const rest = t.slice(k + 1);
      i += 1;
      if (rest.trim() === '') out[key] = i < lines.length && indent(lines[i]) > level ? block(indent(lines[i])) : null;
      else out[key] = scalar(rest);
    }
    return out;
  }
  function list(level) {
    const out = [];
    while (i < lines.length && indent(lines[i]) === level && lines[i].trim().startsWith('-')) {
      const t = lines[i].trim().replace(/^-\s?/, '');
      i += 1;
      if (t === '') { out.push(block(i < lines.length ? indent(lines[i]) : level + 2)); continue; }
      const k = t.indexOf(':');
      if (k > 0 && !/^["'[]/.test(t)) {
        // "- key: value" opens a map whose further keys sit two columns deeper
        const key = t.slice(0, k).trim();
        const rest = t.slice(k + 1);
        const first = {};
        const inner = level + 2;
        if (rest.trim() === '') first[key] = i < lines.length && indent(lines[i]) > inner ? block(indent(lines[i])) : null;
        else first[key] = scalar(rest);
        out.push(i < lines.length && indent(lines[i]) === inner && !lines[i].trim().startsWith('- ') ? map(inner, first) : first);
      } else out.push(scalar(t));
    }
    return out;
  }
  const v = block(0);
  return v;
}
