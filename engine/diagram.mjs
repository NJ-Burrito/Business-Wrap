// Business-Wrap workflow diagrams: an editable model (nodes + edges + groups) → one drawing.
//
// The look replicates the house SRS workflow figure: the applicant's steps in a soft dashed
// band, staff stages in sage boxes with a person badge, white «إجراء» decision diamonds,
// stadium end states (✓ approval, ⊗ refusal), a heavy solid forward path, dashed brown
// returns, thin red refusals, orthogonal routing with rounded corners, plated edge labels
// and a legend that names every shape and every line on the sheet.
//
// One pure module, no DOM, no imports: Node (engine, harvest, MCP) and the editor (concatenated
// by engine/build-editor.mjs) share it. `resolve()` turns a model into drawing primitives;
// `render()` writes them as SVG with real <text> (selectable in the PDF), and the DOCX builder
// draws the same primitives as native Word shapes.
//
// Model (bible/contracts/diagram.schema.json):
//   { kind:'bw-diagram', version:1, flow:'ltr'|'rtl', nodes:[{id, kind, label, sub?, x?, y?, w?, h?,
//     color?, icons?, icon?}], edges:[{id, from, to, kind?, label?}], legend?:{<key>: text}|false }
// A node without x/y is placed by `layout()`; edges are always routed from the node geometry.
export const DIAGRAM = (() => {
  /* ── vocabulary ─────────────────────────────────────────────────────── */
  const KINDS = ['staff', 'applicant', 'start', 'payment', 'rework', 'system', 'decision', 'ok', 'stop', 'join', 'note', 'group', 'text', 'symbol'];
  const WIRE_KINDS = ['main', 'return', 'stop'];
  const COLORS = ['staff', 'applicant', 'payment', 'rework', 'system', 'ok', 'stop', 'note'];
  const SYMBOLS = ['person', 'people', 'clock', 'check', 'cross', 'cog', 'document', 'mail', 'warning', 'calendar', 'lock', 'flag', 'star'];
  const FREE = new Set(['note', 'group', 'text', 'symbol']); // placed by hand, never by the layout
  const STADIUM = new Set(['start', 'ok', 'stop']);
  const SKIN_OF = { continue: 'applicant', staff: 'staff', applicant: 'applicant', start: 'applicant', payment: 'payment', rework: 'rework', system: 'system', ok: 'ok', stop: 'stop', note: 'note' };
  const BADGES = { staff: ['person'], applicant: ['person'], start: ['person'], payment: ['person', 'clock'], rework: ['person'], system: ['cog'], ok: ['check'], stop: ['cross'] };

  /* house palette (design/ours diagram-* tokens); a design pack overrides them through theme.vars */
  const HOUSE = {
    staff: ['#adcbbe', '#065a44', '#023a2b'], applicant: ['#f3f0e9', '#67655e', '#383732'], payment: ['#f4e7b2', '#8b5a05', '#4e3102'],
    rework: ['#f3b3a2', '#853311', '#571f08'], system: ['#b3e4fa', '#0f648f', '#053b56'], stop: ['#ffc9d2', '#af1f31', '#6f101c'],
    ok: ['#d6e1a0', '#3f680f', '#243e05'], note: ['#f8f7f4', '#9c7e36', '#443717'],
  };
  const TOKEN = { stop: 'end-refused', ok: 'end-approved' };
  function palette(theme) {
    const v = theme?.vars || {};
    const pick = (k, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v[k] || '')) ? v[k] : d);
    const skins = {};
    for (const [k, [f, l, i]] of Object.entries(HOUSE)) {
      const t = k === 'note' ? null : `diagram-${TOKEN[k] || k}`;
      skins[k] = t
        ? { fill: pick(`${t}-fill`, f), line: pick(`${t}-line`, l), ink: pick(`${t}-ink`, i) }
        : { fill: pick('accent-50', f), line: pick('accent-600', l), ink: pick('accent-900', i) };
    }
    return {
      skins,
      wire: { main: pick('diagram-wire-main', '#44433f'), return: pick('diagram-wire-return', '#8a4a12'), stop: pick('diagram-wire-stop', '#af1f31') },
      gate: pick('diagram-decision-line', '#7c7b75'),
      caption: pick('diagram-caption-ink', '#3f3e3a'),
      region: { fill: pick('diagram-region-fill', '#f6f4ee'), line: pick('diagram-region-line', '#dcd6c6') },
      head: pick('diagram-head-ink', '#2c2c2a'),
      paper: '#ffffff',
    };
  }
  const WIRE = { main: { w: 2.1, dash: '' }, return: { w: 1.4, dash: '9 4' }, stop: { w: 1.4, dash: '' } };
  /* 0.15.6 (A6): optional, additive per-arrow keys. Absent = exactly the drawing of 0.15.5.
   *   route   elbow | straight | curved        (absent = elbow)
   *   head    arrow | triangle | diamond | circle | bar | none   (absent = arrow);  tail: same list (absent = none)
   *   line    solid | dashed | dotted           (absent = the kind's own);  weight: thin | normal | thick (absent = the kind's own)
   *   fromAnchor / toAnchor  { side: t|r|b|l, at: 0..1 }  an end that sits at a chosen point of its shape's outline */
  const ROUTES = ['elbow', 'straight', 'curved'];
  const HEADS = ['arrow', 'triangle', 'diamond', 'circle', 'bar', 'none'];
  const LINES = { solid: '', dashed: '9 4', dotted: '1.5 4' };
  const WEIGHTS = { thin: 1, normal: null, thick: 3.4 };
  const SIDES = ['t', 'r', 'b', 'l'];
  /* 0.16.0 (figure lane): everything below is additive. A model without the key draws exactly as before.
   *   model.routing = 2     parallel arrows kept a few units apart, a jump arc where one arrow crosses another, a small shadow under the upper one
   *   node.fs               the lettering size of one shape's label (units; absent = the kind's own)
   *   kind 'join'           a real merge point (a small filled dot); arrows meet on it, no hand-made zero-size group
   *   block.frame           the figure's print frame (mm), as before; the legibility check reads it */
  const ROUTING = 2;
  /** What print really gives an automatic figure (measured in a real PDF, tests/diagram-overlap-0160): the SVG's width is the text width less the figure box's 8.5 mm of padding and rule, its height is capped at 116 mm. */
  const PRINT = { wMm: 255.9, maxHmm: 116, padMm: 8.5 };
  const routing2 = (m) => +m?.routing >= ROUTING;
  const fsOf = (n, d) => (Number.isFinite(+n.fs) && +n.fs >= 8 && +n.fs <= 40 ? +n.fs : d);

  /* legend wording; a model may rename any entry (model.legend[key]) */
  const KEY = {
    ar: { staff: 'مرحلة الموظف', applicant: 'مرحلة مقدم الطلب', rework: 'استكمال من مُقدّم الطلب', payment: 'دفع من مُقدّم الطلب', system: 'خطوة ينفذها النظام', stop: 'نهاية بالإلغاء أو الرفض', ok: 'نهاية بالاعتماد', note: 'ملاحظة', 'wire-main': 'المسار الأساسي للطلب', 'wire-return': 'إرجاع إلى مرحلة سابقة', 'wire-stop': 'مسار الرفض أو الإلغاء', action: 'إجراء', start: 'تقديم الطلب', newStage: 'مرحلة جديدة', newText: 'نص', continueTo: 'يتبع في الشكل {n}', continueFrom: 'تابع من الشكل {n}' },
    en: { staff: 'Staff stage', applicant: 'Applicant step', rework: 'Applicant completes', payment: 'Applicant pays', system: 'System step', stop: 'Ends refused or cancelled', ok: 'Ends approved', note: 'Note', 'wire-main': 'Main path', 'wire-return': 'Back to an earlier stage', 'wire-stop': 'Refusal or cancellation', action: 'Action', start: 'Submit request', newStage: 'New stage', newText: 'Text', continueTo: 'Continued in figure {n}', continueFrom: 'Continued from figure {n}' },
  };
  const words = (locale) => KEY[locale === 'ar' ? 'ar' : 'en'];

  /* ── measured type (units = SVG px; the sheet is scaled onto the page) ── */
  const FS = { title: 17, sub: 13, gate: 13, edge: 13, key: 13, text: 15 };
  const G = { rx: 10, stroke: 1.3, strokeTerm: 1.9, strokeGate: 1.1, padX: 22, lineH: 21, subH: 22, minH: 52, minW: 132, maxW: 300, gap: 54, gate: 34, lane: 15, tip: 4, margin: 34 };
  const arabic = (s) => /[؀-ۿ]/.test(String(s || ''));
  const textW = (s, size) => { const t = String(s ?? '').trim(); return size * ((arabic(t) ? 0.42 : 0.5) * t.length + 1.2); };
  const NL = String.fromCharCode(10); // a hand-made line break inside a label
  function wrap(text, width, size) {
    const out = [];
    // a hand-made line break (Shift+Enter in the editor) always starts a new line
    for (const para of String(text ?? '').split(NL)) {
      let line = '';
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${w}` : w;
        if (textW(next, size) > width && line) { out.push(line); line = w; } else line = next;
      }
      if (line) out.push(line);
    }
    return out.length ? out : [''];
  }
  /** The widest hand-made line (a label without breaks is one line). */
  const longW = (s, size) => Math.max(0, ...String(s ?? '').split(NL).map((l) => textW(l, size)));
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const r1 = (n) => Math.round(n * 10) / 10;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /** The size a node wants for its own text (a node the user resized keeps its size). */
  function measure(n) {
    if (n.kind === 'decision') {
      const fg = fsOf(n, FS.gate);
      const lines = wrap(n.label, 110, fg);
      const wide = Math.max(...lines.map((l) => textW(l, fg)));
      const hw = Math.max(G.gate, Math.ceil(wide * 0.62) + 14);
      const hh = Math.max(G.gate - 4, Math.ceil(lines.length * fg * 0.9) + 18);
      return { w: hw * 2, h: hh * 2 };
    }
    if (n.kind === 'join') return { w: 10, h: 10 };
    if (n.kind === 'symbol') return { w: 36, h: 36 };
    if (n.kind === 'text') return { w: Math.max(40, Math.ceil(longW(n.label, FS.text))), h: Math.max(28, String(n.label ?? '').split(NL).length * 20 + 8) };
    if (n.kind === 'group') return { w: 320, h: 120 };
    const badge = STADIUM.has(n.kind) ? 26 : 0;
    const ft = fsOf(n, FS.title);
    const lineH = ft === FS.title ? G.lineH : (G.lineH * ft) / FS.title;
    const want = Math.max(longW(n.label, ft), n.sub ? longW(n.sub, FS.sub) : 0) + G.padX * 2 + badge;
    const w = Math.min(G.maxW, Math.max(G.minW, Math.ceil(want)));
    const lines = wrap(n.label, w - G.padX * 2 - badge, ft);
    const h = Math.max(G.minH, Math.ceil(lines.length * lineH) + (n.sub ? G.subH : 0) + 20);
    return { w, h };
  }

  /* ── edges: what a line means ─────────────────────────────────────────── */
  function classify(model) {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    const order = spineOf(model);
    const at = new Map(order.map((id, i) => [id, i]));
    for (const e of model.edges) {
      if (e.kind && WIRE_KINDS.includes(e.kind)) continue;
      const t = byId.get(e.to);
      const s = byId.get(e.from);
      if (t?.kind === 'stop') e.kind = 'stop';
      else if (t?.kind === 'rework' || s?.kind === 'rework') e.kind = 'return';
      else if (at.has(e.from) && at.has(e.to) && at.get(e.to) <= at.get(e.from)) e.kind = 'return';
      else e.kind = 'main';
    }
    return model;
  }

  /** The forward chain: depth-first along the first unvisited forward exit, satellites left out. */
  function spineOf(model) {
    const nodes = model.nodes.filter((n) => !FREE.has(n.kind) && n.kind !== 'stop' && n.kind !== 'rework');
    const ids = new Set(nodes.map((n) => n.id));
    const out = new Map();
    for (const e of model.edges) if (ids.has(e.from) && ids.has(e.to)) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e.to);
    const hasIn = new Set(model.edges.filter((e) => ids.has(e.from)).map((e) => e.to));
    const roots = [...nodes.filter((n) => n.kind === 'start'), ...nodes.filter((n) => !hasIn.has(n.id))];
    const seen = new Set();
    const order = [];
    const visit = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      order.push(id);
      const next = (out.get(id) || []).filter((x) => !seen.has(x));
      // approval ends wait until every other branch is drawn, so they close the chain
      next.sort((a, b) => (model.nodes.find((n) => n.id === a)?.kind === 'ok') - (model.nodes.find((n) => n.id === b)?.kind === 'ok'));
      for (const x of next) visit(x);
    };
    for (const r of roots) visit(r.id);
    for (const n of nodes) visit(n.id);
    // an approval end always closes the chain
    return [...order.filter((id) => model.nodes.find((n) => n.id === id)?.kind !== 'ok'), ...order.filter((id) => model.nodes.find((n) => n.id === id)?.kind === 'ok')];
  }

  /* ── auto layout: the reference's chain, wrapped onto the sheet's proportion ── */
  const PAGE_RATIO = 269 / 140;
  /** Auto layout. Options (0.15.0 · F4/F5): `aspect` = the bounding box ratio to land on (±12 %, measured on the drawn sheet,
   *  not estimated), `maxRows` (default 5, 10 with an aspect), `maxNodes` (a graph above it gets a `split` suggestion by phase).
   *  With none of them the layout is exactly the 0.14 one, so saved hand-laid figures never shift. */
  function layout(input, opts = {}) {
    const { force = false, aspect, maxRows, maxNodes } = opts;
    let out;
    if (aspect > 0) {
      const spineN = spineOf(clone(input)).length;
      let best = null;
      const kMax = Math.max(1, Math.min(maxRows || 10, spineN));
      for (let k = 1; k <= kMax; k += 1) {
        const m = layoutOnce(input, { force, aspect, rowsK: k });
        const v = resolve(m).view;
        const miss = Math.abs(Math.log(v.w / v.h / aspect));
        if (!best || miss < best.miss - 0.01) best = { m, miss, k };
        if (best.miss < 0.04) break;
      }
      // one more pass with the sheet spread along its short axis (boxes keep their size, only the gaps grow)
      const v = resolve(best.m).view;
      const ratio = v.w / v.h;
      const grow = Math.min(1.8, Math.max(1, ratio > aspect ? ratio / aspect : aspect / ratio));
      out = grow > 1.04 ? layoutOnce(input, { force, aspect, rowsK: best.k, stretch: ratio > aspect ? { x: 1, y: grow } : { x: grow, y: 1 } }) : best.m;
      const v2 = resolve(out).view;
      if (Math.abs(Math.log(v2.w / v2.h / aspect)) > Math.abs(Math.log(ratio / aspect))) out = best.m;
    } else out = layoutOnce(input, { force });
    // 0.16.0: a drawing that is laid out (again) takes the arrows that never lie on each other; ensure() lays out for display only and leaves the key alone
    if (opts.routing !== false) out.routing = ROUTING;
    if (maxNodes > 0) {
      const sug = splitByPhase(out, { maxNodes, suggestOnly: true });
      if (sug.length > 1) out.split = sug;
    }
    return out;
  }
  function layoutOnce(input, { force = false, aspect, rowsK, stretch } = {}) {
    const model = clone(input);
    model.nodes = model.nodes.filter((n) => !(n.kind === 'group' && n.auto));
    for (const e of model.edges || []) { delete e.via; delete e.fromAnchor; delete e.toAnchor; } // a new layout routes every arrow afresh
    for (const n of model.nodes) {
      if (force || n.w == null || n.h == null) Object.assign(n, measure(n));
    }
    classify(model);
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    const spine = spineOf(model).map((id) => byId.get(id));
    if (!spine.length) return model;
    const f = model.flow === 'rtl' ? -1 : 1;
    const edgeBetween = (a, b) => model.edges.find((e) => e.from === a.id && e.to === b.id);
    const gapAfter = spine.map((n, i) => {
      const e = spine[i + 1] && edgeBetween(n, spine[i + 1]);
      return Math.max(G.gap, e?.label ? longW(e.label, FS.edge) + 34 : 0);
    });
    const total = spine.reduce((s, n, i) => s + n.w + (i < spine.length - 1 ? gapAfter[i] : 0), 0);
    const sats = model.nodes.filter((n) => n.kind === 'stop' || n.kind === 'rework');
    const satH = Math.max(0, ...sats.map((n) => n.h));
    let best = null;
    const target0 = aspect > 0 ? aspect : PAGE_RATIO;
    for (let k = rowsK || 1; k <= (rowsK || Math.min(5, spine.length)); k += 1) {
      const rows = [[]];
      let w = 0;
      const target = total / k;
      spine.forEach((n, i) => {
        // a decision stays with the stage it decides (the reference wraps after the «إجراء»)
        if (rows.at(-1).length && w + n.w > target * 1.06 && rows.length < k && n.kind !== 'decision') { rows.push([]); w = 0; }
        rows.at(-1).push(n);
        w += n.w + gapAfter[i];
      });
      const W = Math.max(...rows.map((r) => r.reduce((s, n) => s + n.w + G.gap, 0))) + 80;
      const H = rows.reduce((s, r) => s + Math.max(...r.map((n) => n.h)), 0) + rows.length * (satH + 150) + 60;
      const score = Math.abs(Math.log(W / H / target0)) + (rows.at(-1).length === 1 && rows.length > 1 ? 0.4 : 0);
      if (!best || score < best.score - 0.02) best = { rows, score };
    }
    const rows = best.rows;
    const rowOf = new Map();
    rows.forEach((r, i) => r.forEach((n) => rowOf.set(n.id, i)));
    // satellites: a refusal sits under the row its first source stands in; a rework above its source
    const srcRow = (n) => {
      const rs = model.edges.filter((e) => e.to === n.id && rowOf.has(e.from)).map((e) => rowOf.get(e.from));
      const ts = model.edges.filter((e) => e.from === n.id && rowOf.has(e.to)).map((e) => rowOf.get(e.to));
      return rs.length ? Math.min(...rs) : ts.length ? Math.min(...ts) : 0;
    };
    const below = rows.map(() => []);
    const above = rows.map(() => []);
    for (const s of sats) (s.kind === 'stop' ? below : above)[srcRow(s)].push(s);
    // vertical stack
    const lane = G.lane;
    const downCount = (ri) => model.edges.filter((e) => rowOf.get(e.from) === ri && e.kind !== 'main').length + 1;
    let y = G.margin;
    const rowTop = [];
    rows.forEach((r, ri) => {
      if (above[ri].length) {
        const h = Math.max(...above[ri].map((n) => n.h));
        for (const n of above[ri]) n.y = y + (h - n.h) / 2;
        y += h + 28 + lane;
      }
      const h = Math.max(...r.map((n) => n.h));
      rowTop.push(y);
      for (const n of r) n.y = y + (h - n.h) / 2;
      y += h + 26 + lane * Math.max(2, downCount(ri) - 1);
      if (below[ri].length) {
        const bh = Math.max(...below[ri].map((n) => n.h));
        for (const n of below[ri]) n.y = y + (bh - n.h) / 2;
        const up = model.edges.filter((e) => rowOf.get(e.from) === ri + 1 && below[ri].some((s) => s.id === e.to)).length;
        y += bh + 32 + lane * (up + 1);
      } else if (ri < rows.length - 1) y += 26 + lane;
    });
    // horizontal: every row starts at the flow's start side, the chain wraps (as the reference)
    const width = Math.max(...rows.map((r) => r.reduce((s, n) => s + n.w, 0) + r.slice(0, -1).reduce((s, n) => s + gapAfter[spine.indexOf(n)], 0)));
    const x0 = G.margin + 30;
    rows.forEach((r) => {
      let x = 0;
      for (const n of r) {
        n.x = f > 0 ? x0 + x : x0 + width - x - n.w;
        x += n.w + gapAfter[spine.indexOf(n)];
      }
    });
    const cx = (n) => n.x + n.w / 2;
    const place = (list, want) => {
      list.forEach((n) => { n.x = want(n) - n.w / 2; });
      list.sort((a, b) => a.x - b.x);
      for (let i = 1; i < list.length; i += 1) list[i].x = Math.max(list[i].x, list[i - 1].x + list[i - 1].w + 40);
    };
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : x0 + width / 2);
    below.forEach((list) => place(list, (s) => mean(model.edges.filter((e) => e.to === s.id && byId.get(e.from) && rowOf.has(e.from)).map((e) => cx(byId.get(e.from))))));
    above.forEach((list) => place(list, (s) => mean([...model.edges.filter((e) => e.to === s.id && rowOf.has(e.from)).map((e) => cx(byId.get(e.from))), ...model.edges.filter((e) => e.from === s.id && rowOf.has(e.to)).map((e) => cx(byId.get(e.to)))])));
    if (stretch && (stretch.x !== 1 || stretch.y !== 1)) {
      for (const n of model.nodes) { n.x = G.margin + (n.x - G.margin) * stretch.x; n.y = G.margin + (n.y - G.margin) * stretch.y; }
    }
    // the applicant's own run of steps stands in one band (common region), one per row
    const mine = (n) => ['start', 'applicant', 'payment'].includes(n.kind);
    const groups = [];
    for (const r of rows) {
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          const pad = 15;
          const l = Math.min(...run.map((n) => n.x)) - pad;
          const t = Math.min(...run.map((n) => n.y)) - pad;
          groups.push({ id: `g${groups.length + 1}`, kind: 'group', auto: true, label: '', x: l, y: t, w: Math.max(...run.map((n) => n.x + n.w)) + pad - l, h: Math.max(...run.map((n) => n.y + n.h)) + pad - t });
        }
        run = [];
      };
      for (const n of r) {
        if (mine(n)) run.push(n);
        else if (n.kind === 'decision' && run.length && mine(run.at(-1))) { run.push(n); flush(); }
        else flush();
      }
      flush();
    }
    for (const n of model.nodes) for (const k of ['x', 'y', 'w', 'h']) if (n[k] != null) n[k] = Math.round(n[k]);
    model.nodes = [...groups.map((g) => ({ ...g, x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h) })), ...model.nodes];
    return model;
  }

  /* ── 0.15.0 · F5: a graph too big for one sheet is cut into phase figures, joined by continuation nodes ── */
  const fill = (tpl, n) => String(tpl).replace('{n}', n);
  /** @returns {{caption: string, nodes: string[], model?: object}[]} Each figure holds at most `maxNodes` nodes (continuations included).
   *  suggestOnly: ids only, no model built (what `layout({maxNodes})` attaches as `split`). */
  function splitByPhase(modelIn, { maxNodes = 20, locale = 'ar', aspect = 1.5, suggestOnly = false, byRole = false } = {}) {
    const m = clone(modelIn);
    m.nodes = (m.nodes || []).filter((n) => n && n.id && !(n.kind === 'group' && n.auto));
    const ids = new Set(m.nodes.map((n) => n.id));
    m.edges = (m.edges || []).filter((e) => e && ids.has(e.from) && ids.has(e.to));
    m.edges.forEach((e, i) => { if (!e.id) e.id = `e${i + 1}`; });
    const byId = new Map(m.nodes.map((n) => [n.id, n]));
    const countable = m.nodes.filter((n) => !FREE.has(n.kind));
    const whole = () => [{ caption: '', nodes: countable.map((n) => n.id), ...(suggestOnly ? {} : { model: m }) }];
    if (countable.length <= maxNodes) return whole();
    const spine = spineOf(m);
    const isSat = (id) => ['stop', 'rework'].includes(byId.get(id)?.kind);
    const satsOf = (id) => [...new Set(m.edges.filter((e) => (e.from === id && isSat(e.to)) || (e.to === id && isSat(e.from))).map((e) => (e.from === id ? e.to : e.from)))];
    const label = (id) => String(byId.get(id)?.label || id).replace(/\s+/g, ' ');
    const w = words(locale);
    for (let cap = Math.max(4, maxNodes - 2); cap >= 3; cap -= 1) {
      const chunks = [];
      let cur = null;
      spine.forEach((id, i) => {
        const add = satsOf(id).filter((x) => !cur?.sats.has(x));
        const cost = 1 + add.length;
        const afterGate = i > 0 && byId.get(spine[i - 1])?.kind === 'decision';
        if (!cur || (cur.size + cost > cap && cur.spine.length && !(afterGate && cur.size + cost <= cap + 1))) { cur = { spine: [], sats: new Set(), size: 0 }; chunks.push(cur); }
        cur.spine.push(id);
        add.forEach((x) => cur.sats.add(x));
        cur.size += cost;
      });
      if (byRole && chunks.length > 1) {
        // 0.15.3 (T7): a cut falls on a phase (after a gate) or role (swimlane: the kind of the stage changes) boundary, within the last third of a figure
        const kindOf = (id) => byId.get(id)?.kind;
        for (let ci = 0; ci < chunks.length - 1; ci += 1) {
          const a = chunks[ci].spine, b = chunks[ci + 1].spine;
          const room = Math.floor(a.length / 3);
          const joined = [...a, ...b];
          let best = a.length;
          for (let k = a.length; k > a.length - room && k > 1; k -= 1) {
            if (kindOf(joined[k - 1]) === 'decision' || kindOf(joined[k]) !== kindOf(joined[k - 1])) { best = k; break; }
          }
          if (best !== a.length) { chunks[ci].spine = joined.slice(0, best); chunks[ci + 1].spine = joined.slice(best); }
        }
        for (const c of chunks) { c.sats = new Set(c.spine.flatMap((id) => satsOf(id))); c.size = c.spine.length + c.sats.size; }
      }
      const chunkOfSpine = new Map();
      chunks.forEach((c, ci) => c.spine.forEach((id) => chunkOfSpine.set(id, ci)));
      const parts = chunks.map(() => ({ nodes: new Map(), edges: [], toFig: new Map(), fromFig: new Map() }));
      chunks.forEach((c, ci) => {
        for (const id of [...c.spine, ...c.sats]) parts[ci].nodes.set(id, clone(byId.get(id)));
      });
      for (const n of m.nodes) if (FREE.has(n.kind)) parts[0].nodes.set(n.id, clone(n));
      let ecount = 0;
      const cont = (ci, dir, other) => {
        const map = parts[ci][dir === 'to' ? 'toFig' : 'fromFig'];
        if (!map.has(other)) {
          const id = `cont-${dir}-${other + 1}`;
          map.set(other, id);
          parts[ci].nodes.set(id, { id, kind: 'continue', label: fill(dir === 'to' ? w.continueTo : w.continueFrom, other + 1) });
        }
        return map.get(other);
      };
      for (const e of m.edges) {
        const fs0 = chunkOfSpine.get(e.from);
        const ts0 = chunkOfSpine.get(e.to);
        const fc = fs0 ?? ts0;
        const tc = ts0 ?? fs0;
        if (fc == null || tc == null) continue;
        if (fc === tc) { if (parts[fc].nodes.has(e.from) && parts[fc].nodes.has(e.to)) parts[fc].edges.push(clone(e)); continue; }
        // an edge between two figures: a continuation leaves one and arrives in the other
        if (parts[fc].nodes.has(e.from)) parts[fc].edges.push({ ...clone(e), id: `${e.id}-o${++ecount}`, to: cont(fc, 'to', tc) });
        if (parts[tc].nodes.has(e.to)) { const c = { ...clone(e), id: `${e.id}-i${++ecount}`, from: cont(tc, 'from', fc) }; delete c.label; parts[tc].edges.push(c); }
      }
      const figs = parts.map((p, ci) => ({ p, ci, caption: `${label(chunks[ci].spine[0])} → ${label(chunks[ci].spine.at(-1))}`, nodes: [...p.nodes.values()].filter((n) => !FREE.has(n.kind)).map((n) => n.id) }));
      if (figs.some((f) => f.nodes.length > maxNodes) && cap > 3) continue;
      return figs.map((f) => {
        const out = { caption: f.caption, nodes: f.nodes };
        if (!suggestOnly) {
          const sub = { ...clone(m), nodes: [...f.p.nodes.values()], edges: f.p.edges.map((e) => { const c = { ...e }; delete c.via; return c; }) };
          for (const n of sub.nodes) { delete n.x; delete n.y; delete n.w; delete n.h; }
          out.model = layout(sub, { force: true, aspect, maxRows: 6 });
        }
        return out;
      });
    }
    return whole();
  }

  /** 0.15.3 (T7) · the fewest figures, cut on phase / role boundaries with continuation stubs, that each print at `minPt` or more.
   *  @returns {{figures: {caption: string, nodes: string[], model: object, minPtPrinted: number}[], minPtPrinted: number, ok: boolean}|null}
   *  null when the figure already prints legibly, or is too small to cut. */
  function splitForLegibility(modelIn, { frameMm = [PRINT.wMm, PRINT.maxHmm], theme, locale = 'ar', minPt = 7, aspect = frameMm[0] / frameMm[1], maxNodes } = {}) {
    const base = ensure(modelIn);
    const count = base.nodes.filter((n) => !FREE.has(n.kind)).length;
    if (count < 6) return null;
    const lg0 = legibility(base, { frameMm, theme, locale, minPt });
    if (lg0.small.length === 0) return null;
    let best = null;
    for (let cap = Math.min(maxNodes || 20, count - 1); cap >= 4; cap -= 1) {
      const figs = splitByPhase(base, { maxNodes: cap, locale, aspect, byRole: true });
      if (figs.length < 2) continue;
      const rated = figs.map((f) => { const lg = legibility(f.model, { frameMm, theme, locale, minPt }); return { ...f, minPtPrinted: lg.minPtPrinted, sharp: lg.small.length === 0 }; });
      const low = Math.min(...rated.map((f) => f.minPtPrinted));
      const sharp = rated.every((f) => f.sharp); // none under minPt, unrounded (a 6.96 pt text prints as 7.0 and is still too small)
      if (!best || (sharp && !best.ok) || (sharp === best.ok && low > best.minPtPrinted)) best = { figures: rated.map(({ sharp: z, ...f }) => f), minPtPrinted: low, ok: sharp, cap };
      if (sharp) break;
    }
    return best;
  }

  /* ── 0.16.0 · autoLayout: from any model to a drawing that prints legibly, in one call ──
   * The sheet's proportion first (the frame it prints in), then a few neighbours; the first drawing with every text at `minPt` or more, no text overlapping
   * and no arrow lying on another wins. A graph that no proportion rescues is cut into the fewest figures that each print legibly (splitForLegibility).
   * Forks (a desk with two exits), excursions (a side branch from a desk with no forward exit) and a return to a later desk in the same row are the
   * graph shapes it must handle; tests/autolayout-0160.test.mjs draws each of them.
   * @returns {{ok: boolean, model: object, legibility: object, frameMm: number[], aspect: number, figures: null|{caption: string, nodes: string[], model: object, minPtPrinted: number}[], minPtPrinted: number}} */
  function autoLayout(modelIn, { aspect, maxNodes = 20, frame, frameMm, theme, locale = 'ar', minPt = 7 } = {}) {
    const fr = frameNorm(frame);
    const box0 = frameMm || (fr ? [fr.wMm, fr.hMm] : [PRINT.wMm, PRINT.maxHmm]);
    const want = aspect > 0 ? aspect : box0[0] / box0[1];
    const rate = (m, a) => {
      const lg = legibility(m, { frameMm: box0, theme, locale, minPt });
      return { m, lg, aspect: a, clean: lg.ok && lg.wireOverlaps === 0, miss: lg.small.length + lg.overlaps.length + lg.wireOverlaps };
    };
    const better = (t, best) => !best || (t.clean && !best.clean) || (t.clean === best.clean && (t.miss < best.miss || (t.miss === best.miss && t.lg.minPtPrinted > best.lg.minPtPrinted)));
    /** The proportion that prints best for one model: the sheet's own first, then neighbours, only while a neighbour could still rescue it. */
    const search = (src) => {
      let best = null;
      const seen = new Set();
      for (const k of [1, 1.3, 0.77]) {
        const a = Math.round(want * k * 100) / 100;
        if (seen.has(a)) continue;
        seen.add(a);
        const t = rate(layout(src, { force: true, aspect: a }), a);
        if (better(t, best)) best = t;
        if (best.clean || best.lg.minPtPrinted < minPt * 0.8) break; // clean, or too far from legible for a different proportion to matter
      }
      return best;
    };
    const base = clone(modelIn || {});
    delete base.split;
    const best = search(base);
    const out = { ok: best.clean, model: best.m, legibility: best.lg, frameMm: box0, aspect: best.aspect, figures: null, minPtPrinted: best.lg.minPtPrinted };
    if (best.clean) return out;
    // too big for one sheet: the fewest figures that each print legibly; a figure that still misses gets the proportion search, then a smaller cut is tried
    const count = best.m.nodes.filter((n) => !FREE.has(n.kind)).length;
    if (count < 6) return out;
    let kept = null;
    const consider = (figs, cap) => {
      const rated = figs.map((f) => {
        const t = search(f.model);
        return { ...f, model: t.m, minPtPrinted: t.lg.minPtPrinted, wireOverlaps: t.lg.wireOverlaps, clean: t.clean };
      });
      const low = Math.min(...rated.map((f) => f.minPtPrinted));
      const all = rated.every((f) => f.clean);
      if (!kept || (all && !kept.all) || (all === kept.all && low > kept.low)) kept = { figs: rated, low, all, cap };
      return all;
    };
    // the existing cut first (splitForLegibility), then smaller ones while a figure still misses
    const sp = splitForLegibility(best.m, { frameMm: box0, theme, locale, minPt, aspect: want, maxNodes });
    let done = sp ? consider(sp.figures, sp.cap) : false;
    for (let cap = (sp ? sp.cap : Math.min(maxNodes || 20, count - 1)) - (sp ? 1 : 0); !done && cap >= 4; cap -= 1) {
      const figs = splitByPhase(best.m, { maxNodes: cap, locale, aspect: want, byRole: true });
      if (figs.length >= 2) done = consider(figs, cap);
    }
    if (kept) Object.assign(out, { ok: kept.all, figures: kept.figs.map(({ clean, ...f }) => f), minPtPrinted: kept.low });
    return out;
  }
  /** The same drawing with the 0.16 arrows (spaced, with jump arcs and shadows); no shape moves. The one-click apply in the diagram tools. */
  function applyRouting(modelIn) {
    const m = clone(modelIn || {});
    m.routing = ROUTING;
    return m;
  }

  /* ── 0.15.0 · F5: is the lettering readable once the sheet is printed into its frame? ── */
  /** Printed size of every text on the sheet when the drawing is fitted into `frameMm` (the figure's frame on the page),
   *  plus the texts that overlap a neighbour or overrun their own shape. Computed from the resolved drawing, never typed.
   *  @returns {{scale: number, minPt: number, minPtPrinted: number, small: string[], overlaps: string[][], ok: boolean}}  scale = mm per drawing unit */
  function legibility(modelIn, { frameMm, frame, theme, locale = 'ar', minPt = 7 } = {}) {
    const r = resolve(modelIn, { theme, locale, stats: true });
    // 0.16.0: ONE frame everywhere = what print gives: the block's own canvas (block.frame) when it has one, else the automatic figure's measured box
    const fr = frameNorm(frame);
    const box0 = frameMm || (fr ? [fr.wMm, fr.hMm] : [PRINT.wMm, PRINT.maxHmm]);
    const scale = Math.min(box0[0] / r.view.w, box0[1] / r.view.h, ...(fr && !frameMm ? [FRAME.cap] : []));
    const pt = (size) => size * scale * (72 / 25.4);
    const texts = r.items.filter((it) => it.t === 'text');
    const nameOf = (t) => t.id || (t.edge ? `edge:${t.edge}` : t.legend ? `legend:${t.legend}` : '?');
    const sizes = texts.map((t) => pt(t.size));
    const small = [...new Set(texts.filter((t) => pt(t.size) < minPt).map(nameOf))];
    const overlaps = [];
    const rect = (b) => ({ l: b.x + 1, t: b.y + 1, r: b.x + b.w - 1, b: b.y + b.h - 1 });
    const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = texts[i];
        const b = texts[j];
        if (a.id && a.id === b.id) continue; // a label and its own sub line sit in one shape
        if (hit(rect(a.box), rect(b.box))) overlaps.push([nameOf(a), nameOf(b)]);
      }
    }
    const shapes = r.items.filter((it) => it.t === 'shape' && it.id && !it.hit && r.model.nodes.find((n) => n.id === it.id)?.kind !== 'group');
    for (const t of texts) {
      const tb = rect(t.box);
      for (const sh of shapes) {
        const sb = { l: sh.x, t: sh.y, r: sh.x + sh.w, b: sh.y + sh.h };
        if (sh.id === t.id) { if (t.box.w > sh.w + 1 || t.box.h > sh.h + 1) overlaps.push([nameOf(t), `overflow:${sh.id}`]); continue; }
        if ((t.plate || t.edge || t.legend) && hit(tb, sb)) overlaps.push([nameOf(t), sh.id]);
      }
    }
    const minPtPrinted = sizes.length ? Math.round(Math.min(...sizes) * 10) / 10 : 0;
    return { scale, view: r.view, frameMm: box0, minPt, minPtPrinted, small, overlaps, wires: r.wires, wireOverlaps: r.wires.overlaps, wireCrossings: r.wires.crossings, ok: small.length === 0 && overlaps.length === 0 };
  }

  /** A model ready to draw: sizes and positions filled in, edge kinds settled. */
  function ensure(model) {
    const m = clone(model || {});
    m.nodes = (m.nodes || []).filter((n) => n && n.id);
    const ids = new Set(m.nodes.map((n) => n.id));
    m.edges = (m.edges || []).filter((e) => e && ids.has(e.from) && ids.has(e.to));
    m.edges.forEach((e, i) => { if (!e.id) e.id = `e${i + 1}`; });
    if (m.nodes.some((n) => !FREE.has(n.kind) && (n.x == null || n.y == null))) return layout(m, { routing: false });
    for (const n of m.nodes) if (n.w == null || n.h == null) Object.assign(n, measure(n));
    for (const n of m.nodes) if (n.x == null || n.y == null) { n.x = G.margin; n.y = G.margin; }
    return classify(m);
  }

  /* ── routing: orthogonal, ports spread along a face, corridors in lanes ── */
  const box = (n) => ({ l: n.x, t: n.y, r: n.x + n.w, b: n.y + n.h, cx: n.x + n.w / 2, cy: n.y + n.h / 2, n });
  function route(model) {
    const f = model.flow === 'rtl' ? -1 : 1;
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    const solids = model.nodes.filter((n) => !['group', 'text'].includes(n.kind)).map(box);
    const hSegs = [];
    const vSegs = [];
    const plan = model.edges.map((e) => {
      const S = box(byId.get(e.from));
      const T = box(byId.get(e.to));
      const sameRow = Math.abs(S.cy - T.cy) < Math.min(S.n.h, T.n.h) / 2 + 4;
      const ahead = (T.cx - S.cx) * f > 0;
      let mode;
      if (sameRow && ahead) {
        const lo = Math.min(S.r, T.r);
        const hi = Math.max(S.l, T.l);
        const y = (S.cy + T.cy) / 2;
        const blocked = solids.some((o) => o.n !== S.n && o.n !== T.n && o.l < Math.max(S.l, T.l) && o.r > Math.min(S.r, T.r) && o.t < y + 4 && o.b > y - 4 && o.r > lo && o.l < hi);
        mode = blocked ? 'over' : 'straight';
      } else if (sameRow) mode = 'under';
      else if (T.t > S.b) mode = e.kind === 'main' && !ahead && T.cy - S.cy > 40 ? 'wrap' : 'down';
      else if (T.b < S.t) mode = 'up';
      else mode = ahead ? 'straight' : 'under';
      const sides = { straight: [f > 0 ? 'r' : 'l', f > 0 ? 'l' : 'r'], over: ['t', 't'], under: ['b', 'b'], down: ['b', 't'], up: ['t', 'b'], wrap: [f > 0 ? 'r' : 'l', f > 0 ? 'l' : 'r'] }[mode];
      return { e, S, T, mode, sides };
    });
    // ports: every edge on one face gets its own point, ordered by where its other end lies
    const faces = new Map();
    const faceKey = (n, side) => `${n.id}|${side}`;
    plan.forEach((p) => {
      for (const [end, node, side, other] of [['s', p.S, p.sides[0], p.T], ['t', p.T, p.sides[1], p.S]]) {
        const k = faceKey(node.n, side);
        if (!faces.has(k)) faces.set(k, []);
        faces.get(k).push({ p, end, other });
      }
    });
    for (const [k, list] of faces) {
      const [id, side] = k.split('|');
      const B = box(byId.get(id));
      const vertical = side === 't' || side === 'b';
      list.sort((a, b) => (vertical ? a.other.cx - b.other.cx : a.other.cy - b.other.cy));
      const n = list.length;
      const diamond = B.n.kind === 'decision';
      list.forEach((it, i) => {
        const u = n === 1 ? 0 : (i / (n - 1) - 0.5) * (diamond ? 0.7 : vertical ? 0.6 : 0.5);
        let x;
        let y;
        if (vertical) {
          x = B.cx + u * B.n.w;
          y = side === 't' ? B.t : B.b;
          if (diamond) { const d = Math.abs(x - B.cx) / (B.n.w / 2); y = side === 't' ? B.t + d * B.n.h / 2 : B.b - d * B.n.h / 2; }
        } else {
          y = B.cy + u * B.n.h;
          x = side === 'l' ? B.l : B.r;
          if (diamond) { const d = Math.abs(y - B.cy) / (B.n.h / 2); x = side === 'l' ? B.l + d * B.n.w / 2 : B.r - d * B.n.w / 2; }
          else if (STADIUM.has(B.n.kind)) { const rr = B.n.h / 2; const dy = Math.abs(y - B.cy); const inset = rr - Math.sqrt(Math.max(0, rr * rr - dy * dy)); x = side === 'l' ? B.l + inset : B.r - inset; }
        }
        it.p[it.end === 's' ? 'a' : 'b'] = [x, y];
      });
    }
    const overlapsX = (a1, a2, b1, b2) => Math.min(a2, b2) > Math.max(a1, b1) - 10;
    const free = (segs, at, lo, hi) => !segs.some((s) => Math.abs(s.at - at) < G.lane * 0.6 && overlapsX(lo, hi, s.lo, s.hi));
    const lanePick = (segs, base, dir, lo, hi, limit) => {
      let at = base;
      for (let k = 0; k < 40; k += 1) {
        at = base + dir * k * G.lane;
        if (limit != null && (dir > 0 ? at > limit : at < limit)) return limit;
        if (free(segs, at, lo, hi)) break;
      }
      return at;
    };
    const spanSolids = (lo, hi) => solids.filter((o) => o.r > lo - 6 && o.l < hi + 6);
    // the long corridors first, so the short hops take the lanes nearest the boxes
    const orderOf = { wrap: 0, under: 1, over: 1, down: 2, up: 2, straight: 3 };
    // 0.15.6 (A5): an end the person placed on the outline keeps that point and its face; the other end stays automatic
    const aprec = routing2(model) ? 3 : 1;
    for (const p of plan) {
      const fa = validAnchor(p.e.fromAnchor);
      const ta = validAnchor(p.e.toAnchor);
      if (fa) { p.a = anchorPoint(p.S.n, fa.side, fa.at, aprec); p.sides[0] = fa.side; p.fa = true; }
      if (ta) { p.b = anchorPoint(p.T.n, ta.side, ta.at, aprec); p.sides[1] = ta.side; p.tb = true; }
      p.anch = !!(fa || ta);
    }
    const routed = [...plan].sort((a, b) => orderOf[a.mode] - orderOf[b.mode] || Math.abs(b.a[0] - b.b[0]) - Math.abs(a.a[0] - a.b[0]));
    for (const p of routed) {
      const [ax, ay] = p.a;
      const [bx, by] = p.b;
      const lo = Math.min(ax, bx);
      const hi = Math.max(ax, bx);
      let pts;
      const rt = ROUTES.includes(p.e.route) ? p.e.route : 'elbow';
      if (rt !== 'elbow') {
        pts = freePath(p);
        if (rt === 'curved') p.bez = curveBez(pts, p.nA, p.nB);
      } else if (p.mode === 'straight') {
        if (Math.abs(ay - by) < 1) pts = [[ax, ay], [bx, ay]];
        else { const mx = (ax + bx) / 2; pts = [[ax, ay], [mx, ay], [mx, by], [bx, by]]; }
      } else if (p.mode === 'under') {
        const band = spanSolids(lo, hi).filter((o) => o.t < Math.max(p.S.b, p.T.b) && o.b > Math.min(p.S.t, p.T.t));
        const base = Math.max(p.S.b, p.T.b, ...band.map((o) => o.b)) + 20;
        const y = lanePick(hSegs, base, 1, lo, hi);
        pts = [[ax, ay], [ax, y], [bx, y], [bx, by]];
      } else if (p.mode === 'over') {
        const band = spanSolids(lo, hi).filter((o) => o.t < Math.max(p.S.b, p.T.b) && o.b > Math.min(p.S.t, p.T.t));
        const base = Math.min(p.S.t, p.T.t, ...band.map((o) => o.t)) - 20;
        const y = lanePick(hSegs, base, -1, lo, hi);
        pts = [[ax, ay], [ax, y], [bx, y], [bx, by]];
      } else if (p.mode === 'down') {
        const between = spanSolids(lo, hi).filter((o) => o.t >= p.S.b - 1 && o.b <= p.T.t + 1 && o.n !== p.T.n);
        const base = Math.max(p.S.b, ...between.map((o) => o.b)) + 20;
        const y = lanePick(hSegs, Math.min(base, p.T.t - 14), 1, lo, hi, p.T.t - 10);
        pts = Math.abs(ax - bx) < 1 ? [[ax, ay], [bx, by]] : [[ax, ay], [ax, y], [bx, y], [bx, by]];
      } else if (p.mode === 'up') {
        const between = spanSolids(lo, hi).filter((o) => o.b <= p.S.t + 1 && o.t >= p.T.b - 1 && o.n !== p.T.n);
        const base = Math.min(p.S.t, ...between.map((o) => o.t)) - 20;
        const y = lanePick(hSegs, Math.max(base, p.T.b + 14), -1, lo, hi, p.T.b + 10);
        pts = Math.abs(ax - bx) < 1 ? [[ax, ay], [bx, by]] : [[ax, ay], [ax, y], [bx, y], [bx, by]];
      } else {
        // wrap: out of the row's far end, down past whatever hangs under the row, across, into the next row
        const L = Math.min(...solids.map((o) => o.l));
        const R = Math.max(...solids.map((o) => o.r));
        const between = solids.filter((o) => o.t >= p.S.b - 1 && o.b <= p.T.t + 1);
        const base = Math.max(p.S.b, ...between.map((o) => o.b)) + 22;
        const y = lanePick(hSegs, Math.min(base, p.T.t - 14), 1, L - 40, R + 40, p.T.t - 10);
        const xo = f > 0 ? lanePick(vSegs, R + 24, 1, Math.min(ay, y), Math.max(ay, y)) : lanePick(vSegs, L - 24, -1, Math.min(ay, y), Math.max(ay, y));
        const xi = f > 0 ? lanePick(vSegs, L - 24, -1, Math.min(y, by), Math.max(y, by)) : lanePick(vSegs, R + 24, 1, Math.min(y, by), Math.max(y, by));
        pts = [[ax, ay], [xo, ay], [xo, y], [xi, y], [xi, by], [bx, by]];
      }
      if (rt !== 'elbow') { /* a straight or curved arrow is the points it was given */ }
      else if (Array.isArray(p.e.via) && p.e.via.length) pts = viaPath(p.a, p.b, p.e.via, p.sides[0], p.sides[1]);
      else if (p.anch) pts = detour(p, solids, hSegs, vSegs) || viaPath(p.a, p.b, [], p.sides[0], p.sides[1]);
      // the corridor shapes above assume the legs they draw are clear; one that runs through a shape
      // that is not its own end is rerouted round every shape on the sheet (a hand-set path is kept)
      else if (crosses(pts, p, solids)) pts = detour(p, solids, hSegs, vSegs) || pts;
      for (let i = 1; i < pts.length; i += 1) {
        const [x1, y1] = pts[i - 1];
        const [x2, y2] = pts[i];
        if (Math.abs(y1 - y2) < 0.5) hSegs.push({ at: y1, lo: Math.min(x1, x2), hi: Math.max(x1, x2) });
        else if (Math.abs(x1 - x2) < 0.5) vSegs.push({ at: x1, lo: Math.min(y1, y2), hi: Math.max(y1, y2) });
      }
      p.pts = pts;
    }
    return plan;
  }

  /** Does a wire leg run through a shape other than its own two ends? (the flow-collisions rule) */
  function crosses(pts, p, solids) {
    const list = (solids || p.solids || []).filter((o) => o.n !== p.S.n && o.n !== p.T.n);
    return pts.slice(1).some((q, i) => {
      const [x1, y1] = pts[i];
      const [x2, y2] = q;
      return list.some((o) => (Math.abs(x1 - x2) < 0.5
        ? x1 > o.l + 2 && x1 < o.r - 2 && Math.max(y1, y2) > o.t + 2 && Math.min(y1, y2) < o.b - 2
        : y1 > o.t + 2 && y1 < o.b - 2 && Math.max(x1, x2) > o.l + 2 && Math.min(x1, x2) < o.r - 2));
    });
  }

  /** An orthogonal path round every shape: out of the source port along its face's normal, through a grid
   *  laid on the shapes' padded edges (plus a spare lane each side), into the target port along its normal.
   *  Cheapest by length + bends, and a leg laid over another wire's lane costs extra. */
  function detour(p, solids, hSegs, vSegs) {
    const PAD = 12;
    const STUB = PAD + 6;
    const BEND = 70;
    const off = (B, side, [x, y]) => (side === 't' ? [x, B.t - STUB] : side === 'b' ? [x, B.b + STUB] : side === 'l' ? [B.l - STUB, y] : [B.r + STUB, y]);
    const s0 = off(p.S, p.sides[0], p.a);
    const t0 = off(p.T, p.sides[1], p.b);
    const obs = solids.map((o) => ({ l: o.l - PAD, r: o.r + PAD, t: o.t - PAD, b: o.b + PAD }));
    const L = Math.min(...obs.map((o) => o.l), s0[0], t0[0]) - 2 * G.lane;
    const R = Math.max(...obs.map((o) => o.r), s0[0], t0[0]) + 2 * G.lane;
    const T = Math.min(...obs.map((o) => o.t), s0[1], t0[1]) - 2 * G.lane;
    const B = Math.max(...obs.map((o) => o.b), s0[1], t0[1]) + 2 * G.lane;
    const axis = (base) => {
      const v = [...new Set(base.map((k) => Math.round(k * 2) / 2))].sort((a, b) => a - b);
      const mids = v.slice(1).map((k, i) => (k + v[i]) / 2).filter((m, i) => v[i + 1] - v[i] > 2 * G.lane);
      return [...new Set([...v, ...mids])].sort((a, b) => a - b);
    };
    const xs = axis([L, R, s0[0], t0[0], ...obs.flatMap((o) => [o.l, o.l - G.lane, o.r, o.r + G.lane])]);
    const ys = axis([T, B, s0[1], t0[1], ...obs.flatMap((o) => [o.t, o.t - G.lane, o.b, o.b + G.lane])]);
    const inside = (x, y) => obs.some((o) => x > o.l && x < o.r && y > o.t && y < o.b);
    const at = (v, arr) => arr.findIndex((k) => Math.abs(k - v) < 0.6);
    const si = at(s0[0], xs); const sj = at(s0[1], ys);
    const ti = at(t0[0], xs); const tj = at(t0[1], ys);
    const nx = xs.length;
    const key = (i, j, d) => (j * nx + i) * 2 + d; // d: 0 horizontal, 1 vertical
    const blocked = (i, j) => !((i === si && j === sj) || (i === ti && j === tj)) && inside(xs[i], ys[j]);
    const busy = (segs, a, lo, hi) => segs.some((s) => Math.abs(s.at - a) < G.lane * 0.6 && Math.min(hi, s.hi) > Math.max(lo, s.lo));
    const flat = (sd) => sd === 'l' || sd === 'r';
    const d0 = flat(p.sides[0]) ? 0 : 1;
    const dEnd = flat(p.sides[1]) ? 0 : 1;
    // Dijkstra on a binary heap of [cost, i, j, d]
    const heap = [];
    const push = (x) => { heap.push(x); let k = heap.length - 1; while (k) { const u = (k - 1) >> 1; if (heap[u][0] <= x[0]) break; heap[k] = heap[u]; k = u; } heap[k] = x; };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c += 1; if (heap[c][0] >= last[0]) break; heap[k] = heap[c]; k = c; } heap[k] = last; } return top; };
    const dist = new Map();
    const prev = new Map();
    const k0 = key(si, sj, d0);
    dist.set(k0, 0);
    push([0, si, sj, d0]);
    let goal = null;
    while (heap.length) {
      const [c, i, j, d] = pop();
      const k = key(i, j, d);
      if (c > dist.get(k)) continue;
      if (i === ti && j === tj) { const fin = c + (d === dEnd ? 0 : BEND); if (!goal || fin < goal.c) goal = { c: fin, k }; continue; }
      if (goal && c >= goal.c) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di; const b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ys.length || blocked(a, b)) continue;
        const nd = dj ? 1 : 0;
        const mx = (xs[i] + xs[a]) / 2; const my = (ys[j] + ys[b]) / 2;
        if (inside(mx, my)) continue;
        const len = Math.abs(xs[a] - xs[i]) + Math.abs(ys[b] - ys[j]);
        const lap = nd ? busy(vSegs, xs[i], Math.min(ys[j], ys[b]), Math.max(ys[j], ys[b])) : busy(hSegs, ys[j], Math.min(xs[i], xs[a]), Math.max(xs[i], xs[a]));
        const nc = c + len + (nd === d ? 0 : BEND) + (lap ? len * 3 : 0);
        const nk = key(a, b, nd);
        if (nc < (dist.get(nk) ?? Infinity)) { dist.set(nk, nc); prev.set(nk, k); push([nc, a, b, nd]); }
      }
    }
    if (!goal) return null;
    const cells = [];
    for (let k = goal.k; k != null; k = prev.get(k)) { const c = Math.floor(k / 2); cells.unshift([xs[c % nx], ys[Math.floor(c / nx)]]); }
    const raw = [p.a, s0, ...cells.slice(1, -1), t0, p.b];
    const pts = [];
    for (const q of raw) {
      const last = pts.at(-1);
      if (last && Math.abs(last[0] - q[0]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5) continue;
      const pre = pts.at(-2);
      if (pre && ((Math.abs(pre[0] - last[0]) < 0.5 && Math.abs(last[0] - q[0]) < 0.5) || (Math.abs(pre[1] - last[1]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5))) pts[pts.length - 1] = q;
      else pts.push(q);
    }
    return pts;
  }

  /* ── 0.16.0 · arrows that never lie on each other (model.routing = 2) ──────────────────────────────
   * Three steps on the routed plan, the same for the editor, the PDF, Word and the HTML (they all draw resolve()'s primitives):
   *  1. arrows that share a line are moved SPACE units apart, the later (upper) one carrying a small shadow;
   *  2. where one arrow crosses another, the upper arrow jumps over it by a small arc with a small shadow under it;
   *  3. counts of what is left (overlaps, crossings) for the check.
   * A hand-set path (via joints, anchors, a straight or curved route) is never moved; it still gets its arcs. */
  const SPACE = 5;
  const HOP = 5;
  const SHADOW = [1.4, 1.8];
  const SHADOW_INK = '#cdccc7';
  const flatBez = (bez) => bez.flatMap((sg, k) => Array.from({ length: k ? 16 : 17 }, (_, j) => bezAt(sg, (k ? j + 1 : j) / 16)));
  const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  /** The straight pieces of every arrow, in drawing order: {p, pi, i, a, b, len, o: 'h'|'v'|'d', first, last}. A curved arrow gives its flattened line. */
  function wireSegs(plan) {
    const out = [];
    plan.forEach((p, pi) => {
      const pts = p.bez ? flatBez(p.bez) : p.pts;
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = lenOf(a, b);
        if (len < 0.5) continue;
        out.push({ p, pi, i, a, b, len, o: Math.abs(a[1] - b[1]) < 0.5 ? 'h' : Math.abs(a[0] - b[0]) < 0.5 ? 'v' : 'd', first: i === 1, last: i === pts.length - 1, curved: !!p.bez });
      }
    });
    return out;
  }
  /** Pairs of pieces (of different arrows) lying on one line: parallel, closer than 1.5 units, sharing more than 2 units of length. A curve is never one of them. */
  function lyingOn(segs) {
    const out = [];
    const lines = segs.filter((q) => !q.curved);
    for (let x = 0; x < lines.length; x += 1) {
      const s = lines[x];
      const ux = (s.b[0] - s.a[0]) / s.len;
      const uy = (s.b[1] - s.a[1]) / s.len;
      for (let y = x + 1; y < lines.length; y += 1) {
        const t = lines[y];
        if (t.pi === s.pi) continue;
        if (Math.abs(ux * ((t.b[1] - t.a[1]) / t.len) - uy * ((t.b[0] - t.a[0]) / t.len)) > 0.02) continue;
        const off = (q) => Math.abs((q[0] - s.a[0]) * uy - (q[1] - s.a[1]) * ux);
        if (off(t.a) >= 1.5 || off(t.b) >= 1.5) continue;
        const ta = (t.a[0] - s.a[0]) * ux + (t.a[1] - s.a[1]) * uy;
        const tb = (t.b[0] - s.a[0]) * ux + (t.b[1] - s.a[1]) * uy;
        if (Math.min(s.len, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > 2) out.push([s, t]);
      }
    }
    return out;
  }
  /** Where two pieces of different arrows cross (a proper crossing: inside both pieces, not a junction). */
  function crossAt(s, t) {
    const d1 = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    const d2 = [t.b[0] - t.a[0], t.b[1] - t.a[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return null;
    const c = [t.a[0] - s.a[0], t.a[1] - s.a[1]];
    const u = (c[0] * d2[1] - c[1] * d2[0]) / den;
    const v = (c[0] * d1[1] - c[1] * d1[0]) / den;
    const es = 1.5 / s.len;
    const et = 1.5 / t.len;
    if (u <= es || u >= 1 - es || v <= et || v >= 1 - et) return null;
    return { x: s.a[0] + d1[0] * u, y: s.a[1] + d1[1] * u };
  }
  function crossings(segs) {
    const out = [];
    for (let x = 0; x < segs.length; x += 1) {
      for (let y = x + 1; y < segs.length; y += 1) {
        const s = segs[x];
        const t = segs[y];
        if (s.pi === t.pi) continue;
        const at = crossAt(s, t);
        if (at) out.push(s.pi < t.pi ? { lo: s, up: t, ...at } : { lo: t, up: s, ...at });
      }
    }
    return out;
  }
  /** Where the ray from `o` (inside, or just off the middle of) shape `n` along unit `u` leaves its outline, or null when the ray misses the shape. */
  function exitPoint(n, o, u) {
    const hw = n.w / 2;
    const hh = n.h / 2;
    const cx = n.x + hw;
    const cy = n.y + hh;
    const inside = (x, y) => {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (n.kind === 'decision') return dx / hw + dy / hh <= 1;
      if (STADIUM.has(n.kind)) { const core = Math.max(0, hw - hh); const ex = Math.max(0, dx - core); return ex * ex + dy * dy <= hh * hh; }
      return dx <= hw && dy <= hh;
    };
    if (!inside(o[0], o[1])) return null;
    let lo = 0;
    let hi = Math.hypot(n.w, n.h);
    for (let i = 0; i < 40; i += 1) { const m = (lo + hi) / 2; if (inside(o[0] + u[0] * m, o[1] + u[1] * m)) lo = m; else hi = m; }
    return [r1(o[0] + u[0] * lo), r1(o[1] + u[1] * lo)];
  }
  /** Step 1: move arrows that share a line apart. Returns Map(plan entry → Set of segment indexes) of the pieces that lie over another arrow (they carry the shadow). */
  function spaceWires(plan, solids) {
    const over = new Map();
    const note = (p, i) => { if (!over.has(p)) over.set(p, new Set()); over.get(p).add(i); };
    const hand = (p) => !!(p.anch || (Array.isArray(p.e.via) && p.e.via.length) || (ROUTES.includes(p.e.route) && p.e.route !== 'elbow'));
    const straightFree = (p) => p.e.route === 'straight' && !p.anch && !(Array.isArray(p.e.via) && p.e.via.length) && p.pts.length === 2;
    const loose = (s) => straightFree(s.p) || (!hand(s.p) && !s.curved && s.i > 1 && s.i < s.p.pts.length - 1);
    for (let pass = 0; pass < 6; pass += 1) {
      const pairs = lyingOn(wireSegs(plan));
      if (!pairs.length) break;
      // groups of pieces on one line (union of the pairs)
      const root = new Map();
      const find = (s) => { let r = s; while (root.get(r) !== r) r = root.get(r); return r; };
      for (const [s, t] of pairs) { if (!root.has(s)) root.set(s, s); if (!root.has(t)) root.set(t, t); root.set(find(t), find(s)); }
      const groups = new Map();
      for (const s of root.keys()) { const r = find(s); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); }
      let moved = 0;
      for (const list of groups.values()) {
        list.sort((a, b) => a.pi - b.pi || a.i - b.i);
        const base = list.find((s) => !loose(s)) || list[0];
        let k = 0;
        for (const s of list) {
          if (s === base) continue;
          note(s.p, s.i);
          if (!loose(s)) continue;
          k += 1;
          const ax = s.o === 'h' ? 1 : 0; // the coordinate that changes
          let done = false;
          if (straightFree(s.p)) {
            // a straight arrow between two shapes: both ends slide along their outlines so the line runs parallel, SPACE further over
            const L0 = lenOf([s.p.S.cx, s.p.S.cy], [s.p.T.cx, s.p.T.cy]) || 1;
            const ux = (s.p.T.cx - s.p.S.cx) / L0;
            const uy = (s.p.T.cy - s.p.S.cy) / L0;
            for (const sign of [1, -1]) {
              const d = sign * k * SPACE;
              const a2 = exitPoint(s.p.S.n, [s.p.S.cx - uy * d, s.p.S.cy + ux * d], [ux, uy]);
              const b2 = exitPoint(s.p.T.n, [s.p.T.cx - uy * d, s.p.T.cy + ux * d], [-ux, -uy]);
              if (a2 && b2 && (!crosses([a2, b2], s.p, solids) || crosses(s.p.pts, s.p, solids))) { s.p.pts = [a2, b2]; s.p.a = a2; s.p.b = b2; done = true; moved += 1; break; }
            }
            if (!done) k -= 1;
            continue;
          }
          for (const sign of [1, -1]) {
            const d = sign * k * SPACE;
            const pts = s.p.pts.map((q) => [...q]);
            pts[s.i - 1][ax] += d;
            pts[s.i][ax] += d;
            // the legs on either side stay legs: same direction, at least 6 units long
            const ok = [[s.i - 2, s.i - 1], [s.i, s.i + 1]].every(([u, v]) => {
              const o0 = s.p.pts[v][ax] - s.p.pts[u][ax];
              const o1 = pts[v][ax] - pts[u][ax];
              return Math.abs(o1) >= 6 && Math.sign(o1) === Math.sign(o0 || o1);
            });
            if (ok && (!crosses(pts, s.p, solids) || crosses(s.p.pts, s.p, solids))) { s.p.pts = pts; done = true; moved += 1; break; }
          }
          if (!done) k -= 1;
        }
      }
      if (!moved) break;
    }
    return over;
  }
  /** Step 2: one jump arc for each crossing, on the upper (later) arrow; on the lower one when the upper has no room. */
  function planHops(plan) {
    const all = crossings(wireSegs(plan));
    const hops = new Map(); // plan entry → [{S, r, x, y}]  (S = distance along that arrow's own line)
    const cums = new Map();
    const cumOf = (p) => {
      if (!cums.has(p)) {
        const pts = p.bez ? flatBez(p.bez) : p.pts;
        const cum = [0];
        for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + lenOf(pts[i - 1], pts[i]));
        cums.set(p, cum);
      }
      return cums.get(p);
    };
    const roomFor = (s, x, y, r) => {
      const da = lenOf(s.a, [x, y]);
      const cum = cumOf(s.p);
      const S = cum[s.i - 1] + da;
      if (s.curved) {
        // a curve has no corners: only the line's own ends (the port, and the arrowhead) must stay clear
        if (S < r + 3 || cum.at(-1) - S < r + 12) return null;
      } else {
        // corners are rounded up to 9 units; the line's ends keep clear of the port and of the arrowhead
        if (da < (s.first ? r + 3 : 15) || s.len - da < (s.last ? r + 12 : 15)) return null;
      }
      if ((hops.get(s.p) || []).some((h) => Math.abs(h.S - S) < 2 * r + 4)) return null;
      return S;
    };
    let hopped = 0;
    for (const c of all) {
      let placed = false;
      for (const r of [HOP, 3.4]) {
        for (const who of [c.up, c.lo]) {
          const S = roomFor(who, c.x, c.y, r);
          if (S == null) continue;
          if (!hops.has(who.p)) hops.set(who.p, []);
          hops.get(who.p).push({ S, r, x: c.x, y: c.y });
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) hopped += 1;
    }
    return { hops, crossings: all.length, hopped };
  }
  /** The polyline a hop-carrying arrow is drawn along: the points, with a window of length 2r cut out at each hop and marked [x, y, {r, sw, nx, ny}] / [x, y, {end}]. */
  function withHops(pts, hops) {
    const cum = [0];
    for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + lenOf(pts[i - 1], pts[i]));
    const at = (S) => {
      let i = 1;
      while (i < pts.length - 1 && cum[i] < S) i += 1;
      const a = pts[i - 1];
      const b = pts[i];
      const t = (S - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const out = [];
    const arcs = [];
    let next = 0;
    for (const h of [...hops].sort((a, b) => a.S - b.S)) {
      const q1 = at(h.S - h.r);
      const q2 = at(h.S + h.r);
      while (next < pts.length && cum[next] < h.S - h.r - 1e-6) { out.push(pts[next]); next += 1; }
      const L = lenOf(q1, q2) || 1;
      const ux = (q2[0] - q1[0]) / L;
      const uy = (q2[1] - q1[1]) / L;
      // the bump goes up the page (to the right on a vertical line); sweep 1 bulges to the left of the way the line runs
      let nx = uy;
      let ny = -ux;
      let sw = 1;
      if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) { nx = -nx; ny = -ny; sw = 0; }
      const info = { r: L / 2, sw, nx, ny };
      out.push([q1[0], q1[1], info], [q2[0], q2[1], { end: true }]);
      arcs.push({ q1, q2, ...info, cx: (q1[0] + q2[0]) / 2, cy: (q1[1] + q2[1]) / 2 });
      while (next < pts.length && cum[next] <= h.S + h.r + 1e-6) next += 1;
    }
    for (let i = next; i < pts.length; i += 1) out.push(pts[i]);
    return { pts: out, arcs };
  }
  /** An arc as points (Word draws polylines): from q1 to q2, bulging along (nx, ny); off = the shadow's offset. */
  const arcPts = (a, off = [0, 0]) => Array.from({ length: 9 }, (_, i) => {
    const th = (Math.PI * i) / 8;
    return [r1(a.cx + off[0] - (Math.cos(th) * (a.q2[0] - a.q1[0])) / 2 + Math.sin(th) * a.nx * a.r), r1(a.cy + off[1] - (Math.cos(th) * (a.q2[1] - a.q1[1])) / 2 + Math.sin(th) * a.ny * a.r)];
  });
  /** The hop-marked polyline as plain points: every window becomes its arc's points (what Word draws). */
  function plainPts(vis) {
    const out = [];
    for (let i = 0; i < vis.length; i += 1) {
      const q = vis[i];
      if (q[2]?.end) continue;
      if (q[2]) {
        const e = vis[i + 1];
        out.push(...arcPts({ q1: q, q2: e, cx: (q[0] + e[0]) / 2, cy: (q[1] + e[1]) / 2, ...q[2] }));
      } else out.push([r1(q[0]), r1(q[1])]);
    }
    return out;
  }
  /** Straight pieces with jump arcs: the SVG path of a hop-marked polyline. */
  function polyD(vis) {
    let d = `M${r1(vis[0][0])} ${r1(vis[0][1])}`;
    for (let i = 1; i < vis.length; i += 1) {
      const q = vis[i];
      const h = vis[i - 1][2];
      d += h?.r ? `A${r1(h.r)} ${r1(h.r)} 0 0 ${h.sw} ${r1(q[0])} ${r1(q[1])}` : `L${r1(q[0])} ${r1(q[1])}`;
    }
    return d;
  }
  /** Steps 1 and 2: the spacing is applied to plan[].pts; an arrow with jump arcs gets plan[].vis (its points with the arc windows marked). */
  function clearWires(plan, solids) {
    const over = spaceWires(plan, solids);
    const { hops, crossings: nCross, hopped } = planHops(plan);
    const arcsBy = new Map();
    for (const p of plan) {
      const h = hops.get(p);
      if (!h) continue;
      const w = withHops(p.bez ? flatBez(p.bez) : p.pts, h);
      p.vis = w.pts;
      arcsBy.set(p, w.arcs);
    }
    return { over, arcsBy, crossings: nCross, hopped };
  }
  /** What is left on the sheet, for the check: pieces on one line, and crossings. */
  function wireCounts(plan) {
    const segs = wireSegs(plan);
    return { overlaps: lyingOn(segs).length, crossings: crossings(segs).length };
  }
  /** The shadow pieces under one arrow: under each piece that lies over another, and under each of its jump arcs. */
  function shadowsOf(p, clear, lw) {
    const out = [];
    const mk = (pts, d) => ({ t: 'line', pts, d, color: SHADOW_INK, lw: r1(lw + 1.2), dash: '', arrow: false, shadow: p.e.id });
    for (const i of clear.over.get(p) || []) {
      const a = p.pts[i - 1];
      const b = p.pts[i];
      if (!a || !b) continue;
      const q = [[r1(a[0] + SHADOW[0]), r1(a[1] + SHADOW[1])], [r1(b[0] + SHADOW[0]), r1(b[1] + SHADOW[1])]];
      out.push(mk(q, `M${q[0][0]} ${q[0][1]}L${q[1][0]} ${q[1][1]}`));
    }
    for (const a of clear.arcsBy.get(p) || []) {
      const s0 = [r1(a.q1[0] + SHADOW[0]), r1(a.q1[1] + SHADOW[1])];
      const s1 = [r1(a.q2[0] + SHADOW[0]), r1(a.q2[1] + SHADOW[1])];
      out.push(mk(arcPts(a, SHADOW), `M${s0[0]} ${s0[1]}A${r1(a.r)} ${r1(a.r)} 0 0 ${a.sw} ${s1[0]} ${s1[1]}`));
    }
    return out;
  }

  /* ── 0.15.6: anchors, free paths, curves ─────────────────────────────── */
  const validAnchor = (a) => (a && SIDES.includes(a.side) && Number.isFinite(+a.at) ? { side: a.side, at: Math.min(1, Math.max(0, +a.at)) } : null);
  /** The point of a shape's outline at (side, at): `at` runs along the face, top to bottom or left to right. */
  function anchorPoint(n, side, at, prec = 1) {
    const rp = prec === 1 ? r1 : (v) => Math.round(v * 10 ** prec) / 10 ** prec; // 0.16.0: a drawing with model.routing keeps three decimals, so a short dashed line has no kink
    const u = Math.min(1, Math.max(0, +at));
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;
    const rr = n.h / 2;
    if (side === 'l' || side === 'r') {
      const y = n.y + u * n.h;
      let x = side === 'l' ? n.x : n.x + n.w;
      if (n.kind === 'decision') { const d = Math.abs(y - cy) / (n.h / 2); x = side === 'l' ? n.x + d * n.w / 2 : n.x + n.w - d * n.w / 2; }
      else if (STADIUM.has(n.kind)) { const dy = Math.abs(y - cy); const inset = rr - Math.sqrt(Math.max(0, rr * rr - dy * dy)); x = side === 'l' ? n.x + inset : n.x + n.w - inset; }
      return [rp(x), rp(y)];
    }
    const x = n.x + u * n.w;
    let y = side === 't' ? n.y : n.y + n.h;
    if (n.kind === 'decision') { const d = Math.abs(x - cx) / (n.w / 2); y = side === 't' ? n.y + d * n.h / 2 : n.y + n.h - d * n.h / 2; }
    else if (STADIUM.has(n.kind)) { const ex = Math.abs(x - cx) - (n.w / 2 - rr); if (ex > 0) { const dy = rr - Math.sqrt(Math.max(0, rr * rr - ex * ex)); y = side === 't' ? n.y + dy : n.y + n.h - dy; } }
    return [rp(x), rp(y)];
  }
  /** The anchor on a shape's outline nearest to a point (the editor's drag of an arrow end). */
  function nearestAnchor(n, pt) {
    let best = null;
    for (const side of SIDES) {
      const along = side === 'l' || side === 'r' ? (pt[1] - n.y) / n.h : (pt[0] - n.x) / n.w;
      const at = Math.min(0.96, Math.max(0.04, along));
      const q = anchorPoint(n, side, at);
      const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
      if (!best || d < best.d) best = { side, at: Math.round(at * 1e6) / 1e6, pt: q, d }; // six decimals (was three: a 0.1-unit offset on a short line)
    }
    return best;
  }
  /** Where a ray from a shape's centre towards a point leaves the shape. */
  function edgePoint(n, toward) {
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;
    let dx = toward[0] - cx;
    let dy = toward[1] - cy;
    if (Math.hypot(dx, dy) < 0.5) { dx = 1; dy = 0; }
    const hw = n.w / 2;
    const hh = n.h / 2;
    let t;
    if (n.kind === 'decision') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    else {
      t = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity);
      if (STADIUM.has(n.kind)) {
        const core = hw - hh;
        if (Math.abs(dx * t) > core) {
          const sx = Math.sign(dx) * core; // the cap's centre
          const a = dx * dx + dy * dy;
          const b = -2 * (dx * sx);
          const c = sx * sx - hh * hh;
          t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
        }
      }
    }
    return [r1(cx + dx * t), r1(cy + dy * t)];
  }
  /** A straight or curved arrow: its two ends (an anchor, else where the line towards its next point leaves the shape) and its joints. */
  function freePath(p) {
    const via = (Array.isArray(p.e.via) ? p.e.via : []).filter((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).map((q) => [+q[0], +q[1]]);
    const A = p.fa ? p.a : edgePoint(p.S.n, via[0] || (p.tb ? p.b : [p.T.cx, p.T.cy]));
    const B = p.tb ? p.b : edgePoint(p.T.n, via.at(-1) || A);
    const out = (pt, c, side) => {
      if (side) return { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] }[side];
      // a curve leaves a shape square to the face it leaves from (the face the line points at), so it bows instead of lying on the straight line
      const dx = pt[0] - c.cx;
      const dy = pt[1] - c.cy;
      return Math.abs(dx) / (c.n.w / 2 || 1) > Math.abs(dy) / (c.n.h / 2 || 1) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
    };
    p.nA = out(A, p.S, p.fa ? p.sides[0] : null);
    p.nB = out(B, p.T, p.tb ? p.sides[1] : null);
    return [A, ...via, B];
  }
  /** Cubic segments [p0, c1, c2, p1] through the joints: smooth in the middle, leaving and entering along the face normals. */
  function curveBez(pts, nA, nB) {
    const P = pts.map((q) => [+q[0], +q[1]]);
    const segs = [];
    for (let i = 0; i + 1 < P.length; i += 1) {
      const p1 = P[i];
      const p2 = P[i + 1];
      const p0 = P[i - 1] || null;
      const p3 = P[i + 2] || null;
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.min(0.45 * L, 90);
      const c1 = p0 ? [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6] : nA ? [p1[0] + nA[0] * k, p1[1] + nA[1] * k] : [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3];
      const c2 = p3 ? [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6] : nB ? [p2[0] + nB[0] * k, p2[1] + nB[1] * k] : [p2[0] - (p2[0] - p1[0]) / 3, p2[1] - (p2[1] - p1[1]) / 3];
      segs.push([p1.map(r1), c1.map(r1), c2.map(r1), p2.map(r1)]);
    }
    return segs;
  }
  const bezAt = (s, t) => {
    const u = 1 - t;
    const f = (k) => u * u * u * s[0][k] + 3 * u * u * t * s[1][k] + 3 * u * t * t * s[2][k] + t * t * t * s[3][k];
    return [f(0), f(1)];
  };
  const curveD = (bez) => `M${r1(bez[0][0][0])} ${r1(bez[0][0][1])}${bez.map((s) => `C${s[1][0]} ${s[1][1]} ${s[2][0]} ${s[2][1]} ${s[3][0]} ${s[3][1]}`).join('')}`;
  /** Move the end `b` of a leg back towards `a` by `len` (any direction; the old orthogonal arithmetic is the special case). */
  function pull(a, b, len) {
    if (Math.abs(a[0] - b[0]) < 0.5) b[1] += b[1] > a[1] ? -len : len;
    else if (Math.abs(a[1] - b[1]) < 0.5) b[0] += b[0] > a[0] ? -len : len;
    else { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); b[0] -= ((b[0] - a[0]) / L) * len; b[1] -= ((b[1] - a[1]) / L) * len; }
  }
  /** The pieces of a resolved wire as small straight steps (a curve is sampled), each tagged with the joint segment it belongs to. */
  function wireSteps(it, n = 14) {
    const steps = [];
    if (it.bez) it.bez.forEach((s, i) => { let prev = bezAt(s, 0); for (let j = 1; j <= n; j += 1) { const q = bezAt(s, j / n); steps.push({ a: prev, b: q, seg: i }); prev = q; } });
    else for (let i = 0; i + 1 < it.route.length; i += 1) steps.push({ a: it.route[i], b: it.route[i + 1], seg: i });
    return steps;
  }
  /** The point of a resolved wire nearest to `pt`: { x, y, seg (the joint segment it lies on), d }. */
  function nearestOnWire(it, pt) {
    let best = null;
    for (const { a, b, seg } of wireSteps(it)) {
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const L2 = vx * vx + vy * vy;
      const u = L2 ? Math.min(1, Math.max(0, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / L2)) : 0;
      const q = [a[0] + vx * u, a[1] + vy * u];
      const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
      if (!best || d < best.d) best = { x: Math.round(q[0]), y: Math.round(q[1]), seg, d };
    }
    return best;
  }
  /** The middle of joint segment i of a resolved wire (on the curve for a curved arrow). */
  const wireMid = (it, i) => (it.bez ? bezAt(it.bez[i], 0.5) : [(it.route[i][0] + it.route[i + 1][0]) / 2, (it.route[i][1] + it.route[i + 1][1]) / 2]);

  /** Hand-set bend points between the two ports, kept orthogonal: where an end (or a point) moved off a
   *  common line an elbow is added — out of a port along its face's normal, into the target along its own. */
  function viaPath(a, b, via, sa, sb) {
    const pts = [a, ...via.filter((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).map((q) => [+q[0], +q[1]]), b];
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i += 1) {
      const prev = out[out.length - 1];
      const q = pts[i];
      if (Math.abs(prev[0] - q[0]) >= 0.5 && Math.abs(prev[1] - q[1]) >= 0.5) {
        const flat = (sd) => sd === 'l' || sd === 'r';
        const across = i === 1 ? flat(sa) : i === pts.length - 1 ? !flat(sb) : true;
        out.push(across ? [q[0], prev[1]] : [prev[0], q[1]]);
      }
      if (Math.abs(prev[0] - q[0]) >= 0.5 || Math.abs(prev[1] - q[1]) >= 0.5 || i === pts.length - 1) out.push(q);
    }
    // 0.15.0 (F5): a last leg that runs ALONG the face it enters (a via point level with a box top or bottom) hides the
    // arrowhead on the outline; step out one lane and come in square, so the head always lands on the face
    if (out.length >= 2 && !(sb === 'l' || sb === 'r')) {
      const [q, e] = [out.at(-2), out.at(-1)];
      if (Math.abs(q[1] - e[1]) < 0.5 && Math.abs(q[0] - e[0]) >= 0.5) {
        const y = e[1] + (sb === 't' ? -G.lane : G.lane);
        out.splice(-1, 0, [q[0], y], [e[0], y]);
      }
    }
    // the arrowhead needs a last leg with a length: drop a zero-length tail point
    while (out.length > 2 && Math.hypot(out.at(-1)[0] - out.at(-2)[0], out.at(-1)[1] - out.at(-2)[1]) < 0.5) out.splice(-2, 1);
    return out;
  }

  /** Rounded orthogonal path; the last leg stops short so the open chevron lands on the outline. */
  function pathD(ptsIn, short = true) {
    const p = ptsIn.map((q) => [...q]);
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    if (short) pull(a, b, G.tip);
    let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
    for (let i = 1; i < p.length; i += 1) {
      const cur = p[i];
      const hp = p[i - 1][2]; // 0.16.0: a jump arc between two marked points
      if (hp?.r) { d += `A${r1(hp.r)} ${r1(hp.r)} 0 0 ${hp.sw} ${r1(cur[0])} ${r1(cur[1])}`; continue; }
      if (i === p.length - 1 || cur[2]) { d += `L${r1(cur[0])} ${r1(cur[1])}`; continue; }
      const prev = p[i - 1];
      const next = p[i + 1];
      const k = Math.min(9, Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / 2, Math.hypot(next[0] - cur[0], next[1] - cur[1]) / 2);
      if (k < 1.5) { d += `L${r1(cur[0])} ${r1(cur[1])}`; continue; }
      const ux = Math.sign(cur[0] - prev[0]);
      const uy = Math.sign(cur[1] - prev[1]);
      const vx = Math.sign(next[0] - cur[0]);
      const vy = Math.sign(next[1] - cur[1]);
      d += `L${r1(cur[0] - ux * k)} ${r1(cur[1] - uy * k)}Q${r1(cur[0])} ${r1(cur[1])} ${r1(cur[0] + vx * k)} ${r1(cur[1] + vy * k)}`;
    }
    return d;
  }
  /** The same path as plain points (DOCX draws polylines). */
  function shortPts(ptsIn) {
    const p = ptsIn.map((q) => [...q]);
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    pull(a, b, G.tip);
    return p.map(([x, y]) => [r1(x), r1(y)]);
  }

  /* ── glyphs: drawn as circles + polylines so SVG and DOCX draw the same thing ── */
  const arc = (cx, cy, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const GLYPHS = {
    person: { c: [[0, -2.1, 1.9]], l: [arc(0, 4.2, 3.6, Math.PI, 2 * Math.PI)] },
    people: { c: [[-2.2, -2.1, 1.7], [2.6, -1.4, 1.4]], l: [arc(-2.2, 4.4, 3.2, Math.PI, 2 * Math.PI), arc(2.8, 4.4, 2.6, 1.25 * Math.PI, 2 * Math.PI, 6)] },
    clock: { c: [[0, 0, 4.1]], l: [[[0, -2.5], [0, 0], [2.3, 0]]] },
    check: { c: [[0, 0, 5.4]], l: [[[-2.6, 0], [-0.7, 2.1], [2.7, -2.1]]] },
    cross: { c: [[0, 0, 5.4]], l: [[[-2.4, -2.4], [2.4, 2.4]], [[2.4, -2.4], [-2.4, 2.4]]] },
    cog: { c: [[0, 0, 2.2], [0, 0, 4.4, '1.8 1.5']], l: [] },
    document: { c: [], l: [[[-3.5, -4.5], [1.5, -4.5], [3.5, -2.5], [3.5, 4.5], [-3.5, 4.5], [-3.5, -4.5]], [[-1.8, -0.5], [1.8, -0.5]], [[-1.8, 1.8], [1.8, 1.8]]] },
    mail: { c: [], l: [[[-4.6, -3.2], [4.6, -3.2], [4.6, 3.2], [-4.6, 3.2], [-4.6, -3.2]], [[-4.6, -3.2], [0, 0.6], [4.6, -3.2]]] },
    warning: { c: [[0, 2.7, 0.35]], l: [[[0, -4.6], [5, 4], [-5, 4], [0, -4.6]], [[0, -1.6], [0, 1.2]]] },
    calendar: { c: [], l: [[[-4.2, -3.4], [4.2, -3.4], [4.2, 4.2], [-4.2, 4.2], [-4.2, -3.4]], [[-4.2, -0.8], [4.2, -0.8]], [[-2, -4.8], [-2, -2.2]], [[2, -4.8], [2, -2.2]]] },
    lock: { c: [], l: [[[-3.6, -0.6], [3.6, -0.6], [3.6, 4.6], [-3.6, 4.6], [-3.6, -0.6]], [[-2.2, -0.6], ...arc(0, -2.4, 2.2, Math.PI, 2 * Math.PI, 6), [2.2, -0.6]]] },
    flag: { c: [], l: [[[-3.6, 4.8], [-3.6, -4.8]], [[-3.6, -4.4], [3.9, -2.8], [-3.6, -0.8]]] },
    star: { c: [], l: [Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 2.2 : 5; return [r * Math.cos(a), r * Math.sin(a)]; })] },
  };
  function glyph(name, x, y, ink, scale = 1, out = []) {
    const g = GLYPHS[name];
    if (!g) return out;
    const lw = 1.15 * Math.max(1, scale * 0.6);
    for (const [cx, cy, r, dash] of g.c) out.push({ t: 'circle', cx: r1(x + cx * scale), cy: r1(y + cy * scale), r: r1(r * scale), color: ink, lw, dash: dash || '' });
    for (const line of g.l) out.push({ t: 'line', pts: line.map(([px, py]) => [r1(x + px * scale), r1(y + py * scale)]), color: ink, lw, dash: '', arrow: false, glyph: true });
    return out;
  }

  /* ── resolve: model → drawing primitives (one list for SVG and DOCX) ── */
  function resolve(modelIn, { theme, locale = 'ar', stats = false } = {}) {
    const model = ensure(modelIn);
    const P = palette(theme);
    const W = { ...words(locale), ...(model.legend && typeof model.legend === 'object' ? model.legend : {}) };
    const rtl = locale === 'ar';
    const back = [];
    const wires = [];
    const fore = [];
    const caps = [];
    const skinOf = (n) => P.skins[COLORS.includes(n.color) ? n.color : SKIN_OF[n.kind] || 'staff'];
    const textItem = (lines, cx, cy, size, color, weight, extra = {}) => {
      const lh = size * 1.3;
      const w = Math.max(...lines.map((l) => textW(l, size)));
      const h = lines.length * lh;
      return { t: 'text', lines, x: r1(cx), y: r1(cy), size, color, weight, lh: r1(lh), anchor: 'middle', rtl: lines.some(arabic), box: { x: r1(cx - w / 2), y: r1(cy - h / 2), w: r1(w), h: r1(h) }, ...extra };
    };
    for (const n of model.nodes) {
      const id = n.id;
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      if (n.kind === 'group') {
        back.push({ t: 'shape', geom: 'round', rx: G.rx + 15, x: n.x, y: n.y, w: n.w, h: n.h, fill: P.region.fill, line: P.region.line, lw: 1, dash: '5 4', id });
        if (n.label) back.push(textItem([n.label], n.x + (rtl ? n.w - 12 - textW(n.label, FS.sub) / 2 : 12 + textW(n.label, FS.sub) / 2), n.y + 14, FS.sub, P.caption, 600, { id }));
        continue;
      }
      if (n.kind === 'text') { fore.push(textItem(wrap(n.label, Math.max(n.w, 40), FS.text), cx, cy, FS.text, P.head, 500, { id, node: true })); continue; }
      if (n.kind === 'symbol') {
        glyph(SYMBOLS.includes(n.icon) ? n.icon : 'person', cx, cy, skinOf(n).line === P.skins.staff.line && !n.color ? P.head : skinOf(n).line, Math.min(n.w, n.h) / 12, fore);
        // the hit area goes ON TOP of the glyph: a press on the drawing's own strokes lands on the symbol (0.14.0 · O2)
        fore.push({ t: 'shape', geom: 'rect', x: n.x, y: n.y, w: n.w, h: n.h, fill: 'none', line: 'none', lw: 0, dash: '', id, hit: true });
        continue;
      }
      if (n.kind === 'decision') {
        fore.push({ t: 'shape', geom: 'diamond', x: n.x, y: n.y, w: n.w, h: n.h, fill: P.paper, line: P.gate, lw: G.strokeGate, dash: '', id });
        const fg = fsOf(n, FS.gate);
        fore.push(textItem(wrap(n.label || W.action, n.w * 0.62, fg), cx, cy, fg, P.caption, 600, { id, node: true }));
        continue;
      }
      if (n.kind === 'join') {
        // a merge point: a small filled dot in the main wire's ink (a real shape, never a zero-size group)
        fore.push({ t: 'shape', geom: 'round', rx: Math.min(n.w, n.h) / 2, x: n.x, y: n.y, w: n.w, h: n.h, fill: P.wire.main, line: P.wire.main, lw: 1, dash: '', id });
        continue;
      }
      const sk = skinOf(n);
      const stadium = STADIUM.has(n.kind);
      if (n.kind === 'note') fore.push({ t: 'shape', geom: 'note', x: n.x, y: n.y, w: n.w, h: n.h, fill: sk.fill, line: sk.line, lw: 1, dash: '', id });
      else fore.push({ t: 'shape', geom: stadium ? 'stadium' : 'round', rx: stadium ? n.h / 2 : G.rx, x: n.x, y: n.y, w: n.w, h: n.h, fill: sk.fill, line: sk.line, lw: stadium ? G.strokeTerm : G.stroke, dash: n.kind === 'continue' ? '6 4' : '', id });
      // badges: a task's in its leading top corner (the start side of the reading direction), a terminator's inside its cap
      const icons = Array.isArray(n.icons) ? n.icons.filter((x) => GLYPHS[x]) : BADGES[n.kind] || [];
      const lead = rtl ? -1 : 1;
      let badgeRoom = 0;
      // the reference keeps every badge on the left (the trailing corner of an Arabic title), in both editions
      if (stadium) {
        if (icons[0]) glyph(icons[0], n.x + 16, cy, sk.line, 1, fore);
        badgeRoom = icons[0] ? 22 : 0;
      } else {
        icons.forEach((g, i) => glyph(g, n.x + 10 + i * 12, n.y + 10, sk.line, 1, fore));
      }
      void lead;
      const tx = cx + (stadium ? badgeRoom / 2 : 0);
      const ft = fsOf(n, FS.title);
      const lineH = ft === FS.title ? G.lineH : (G.lineH * ft) / FS.title;
      const lines = wrap(n.label, n.w - G.padX * 2 - badgeRoom, ft);
      const block = lines.length * lineH + (n.sub ? G.subH : 0);
      const ty = cy - block / 2 + (lines.length * lineH) / 2;
      fore.push({ ...textItem(lines, tx, ty, ft, sk.ink, 500, { id, node: true }), lh: lineH });
      if (n.sub) fore.push(textItem([n.sub], tx, ty + (lines.length * lineH) / 2 + G.subH / 2, FS.sub, sk.line, 400, { id, sub: true }));
    }
    // wires and their captions
    const plan = route(model);
    const solids = model.nodes.filter((n) => !['group', 'text'].includes(n.kind)).map(box);
    // 0.16.0: model.routing = 2 spaces arrows that shared a line and makes the upper one jump over the one it crosses; absent = the drawing of 0.15.x
    const clear = routing2(model) ? clearWires(plan, solids) : null;
    const placed = [];
    const wireRects = plan.flatMap((p) => p.pts.slice(1).map((q, i) => { const a = p.pts[i]; return { l: Math.min(a[0], q[0]) - 1, r: Math.max(a[0], q[0]) + 1, t: Math.min(a[1], q[1]) - 1, b: Math.max(a[1], q[1]) + 1 }; }));
    const hits = (r, list) => list.some((o) => r.x < o.r + 2 && r.x + r.w > o.l - 2 && r.y < o.b + 2 && r.y + r.h > o.t - 2);
    for (const p of plan) {
      const k = WIRE_KINDS.includes(p.e.kind) ? p.e.kind : 'main';
      if (clear) wires.push(...shadowsOf(p, clear, Object.hasOwn(WEIGHTS, p.e.weight) ? WEIGHTS[p.e.weight] ?? WIRE[k].w : WIRE[k].w));
      if (styled(p.e)) wires.push(...styledWire(p, k, P));
      else wires.push({ t: 'line', pts: shortPts(p.vis ? plainPts(p.vis) : p.pts), d: pathD(p.vis || p.pts), color: P.wire[k], lw: WIRE[k].w, dash: WIRE[k].dash, arrow: true, wire: k, id: p.e.id, from: p.e.from, to: p.e.to, route: p.pts.map(([x, y]) => [r1(x), r1(y)]) });
      if (!p.e.label) continue;
      const lw = textW(p.e.label, FS.edge);
      const lh = FS.edge * 1.5;
      const segs = [];
      for (let i = 1; i < p.pts.length; i += 1) {
        const [x1, y1] = p.pts[i - 1];
        const [x2, y2] = p.pts[i];
        if (Math.abs(y1 - y2) < 0.5) segs.push({ h: true, x1, x2, y: y1, len: Math.abs(x2 - x1), i });
        else segs.push({ h: false, y1, y2, x: x1, len: Math.abs(y2 - y1), i });
      }
      const cands = [];
      const freeFar = [];
      const freeWire = ROUTES.includes(p.e.route) && p.e.route !== 'elbow';
      if (freeWire) {
        // a straight or curved arrow has no horizontal leg to sit beside: seats along the line, on both sides of it
        segs.length = 0;
        const D = p.bez ? p.bez.flatMap((sg) => Array.from({ length: 9 }, (_, j) => bezAt(sg, j / 8))) : p.pts;
        const seat = [];
        for (let i = 1; i < D.length; i += 1) seat.push([D[i - 1], D[i]]);
        const seatAt = (at, ring) => {
          const [a, b] = seat[Math.min(seat.length - 1, Math.floor(at * seat.length))];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / L;
          const ny = (b[0] - a[0]) / L;
          const off = Math.abs(nx) * (lw / 2 + 6) + Math.abs(ny) * (lh / 2 + 2) + ring * (Math.abs(nx) * lw * 0.5 + Math.abs(ny) * lh);
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          return [1, -1].map((sg) => ({ x: mx + nx * off * sg, y: my + ny * off * sg, ax: mx, ay: my }));
        };
        for (const at of [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.22, 0.78, 0.08, 0.92]) for (const c of seatAt(at, 0)) cands.push({ x: c.x, y: c.y });
        // no free seat beside the line: seats further out, tied back to the line by a leader (as an elbow's far seats are)
        for (const ring of [1, 2, 3, 4]) for (const at of [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6]) freeFar.push(...seatAt(at, ring));
      }
      const hs = segs.filter((s) => s.h).sort((a, b) => b.len - a.len);
      for (const s of hs) for (const at of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const dy of [-(lh / 2 + 2), lh / 2 + 2]) cands.push({ x: s.x1 + (s.x2 - s.x1) * at, y: s.y + dy });
      for (const s of segs.filter((q) => !q.h)) for (const at of [0.5, 0.25, 0.75]) for (const side of [1, -1]) cands.push({ x: s.x + side * (lw / 2 + 6), y: s.y1 + (s.y2 - s.y1) * at });
      // the same search the router runs: nearest seats first (both sides of every leg), then seats further out tied
      // back to the wire by a leader line; a caption never lands on a shape while any seat is free (D13)
      const far = [];
      for (const ring of [2, 3, 4, 5]) {
        for (const s of hs) for (const at of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const sg of [-1, 1]) { const ax = s.x1 + (s.x2 - s.x1) * at; far.push({ x: ax, y: s.y + sg * (lh * (ring - 0.5) + 2), ax, ay: s.y }); }
        for (const s of segs.filter((q) => !q.h)) for (const at of [0.5, 0.25, 0.75]) for (const sg of [1, -1]) { const ay = s.y1 + (s.y2 - s.y1) * at; far.push({ x: s.x + sg * (lw / 2 + 6 + (ring - 1) * 24), y: ay, ax: s.x, ay }); }
      }
      if (freeWire) far.push(...freeFar);
      const rectOf = freeWire ? (c) => ({ x: c.x - lw / 2, y: c.y - FS.edge * 0.65, w: lw, h: FS.edge * 1.3 }) : (c) => ({ x: c.x - lw / 2, y: c.y - lh / 2 + 3, w: lw, h: lh - 6 });
      // a text box on the page is a thing a straight or curved caption must keep off, too (an elbow route never sees it, so its drawing is unchanged)
      const blockers = freeWire ? solids.concat(model.nodes.filter((n) => n.kind === 'text').map(box)) : solids;
      // a slanted leader is tested as a segment, not by its bounding box (the box of a diagonal always touches the shape the wire starts on)
      const segHits = (c, o) => { const x1 = c.ax; const y1 = c.ay; const dx = c.x - x1; const dy = c.y - y1; let t0 = 0; let t1 = 1; for (const [pp, qq] of [[-dx, x1 - o.l - 1], [dx, o.r - 1 - x1], [-dy, y1 - o.t - 1], [dy, o.b - 1 - y1]]) { if (pp === 0) { if (qq < 0) return false; } else { const t = qq / pp; if (pp < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); } } } return t0 <= t1; };
      const leaderClear = freeWire ? (c) => !blockers.some((o) => segHits(c, o)) : (c) => { const l = { l: Math.min(c.x, c.ax) - 0.5, r: Math.max(c.x, c.ax) + 0.5, t: Math.min(c.y, c.ay) - 0.5, b: Math.max(c.y, c.ay) + 0.5 }; return !solids.some((o) => l.l < o.r && l.r > o.l && l.t < o.b && l.b > o.t); };
      let pick = null;
      for (const [list, strict] of [[cands, true], [cands, false], [far, true], [far, false]]) {
        for (const c of list) {
          const r = rectOf(c);
          if (!hits(r, blockers) && !hits(r, placed) && (!strict || !hits(r, wireRects)) && (c.ax == null || leaderClear(c))) { pick = c; placed.push({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h }); break; }
        }
        if (pick) break;
      }
      if (!pick && freeWire) { // nothing is free: the seat that covers least (never the first one blindly)
        const area = (r) => blockers.concat(placed.map((q) => ({ l: q.l, r: q.r, t: q.t, b: q.b }))).reduce((a, o) => a + Math.max(0, Math.min(r.x + r.w, o.r) - Math.max(r.x, o.l)) * Math.max(0, Math.min(r.y + r.h, o.b) - Math.max(r.y, o.t)), 0);
        let best = Infinity;
        for (const c of cands.concat(far)) { const a = area(rectOf(c)); if (a < best) { best = a; pick = c; } }
        if (pick) { const r = rectOf(pick); placed.push({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h }); }
      }
      pick ||= cands[0] || { x: p.pts[0][0], y: p.pts[0][1] };
      if (pick.ax != null && freeWire) wires.push({ t: 'line', pts: [[pick.ax, pick.ay], [pick.x, pick.y]], d: '', color: P.caption, lw: 0.6, dash: '2 2', arrow: false, leader: p.e.id });
      else if (pick.ax != null) wires.push({ t: 'line', pts: [[pick.ax, pick.ay], pick.ay === pick.y ? [pick.x - Math.sign(pick.x - pick.ax) * (lw / 2), pick.y] : [pick.x, pick.y - Math.sign(pick.y - pick.ay) * (lh / 2 - 3)]], d: '', color: P.caption, lw: 0.6, dash: '2 2', arrow: false, leader: p.e.id });
      caps.push(textItem([p.e.label], pick.x, pick.y, FS.edge, P.caption, 400, { plate: P.paper, edge: p.e.id }));
    }
    // extent of the drawing, then the legend under it
    const xs = [];
    const ys = [];
    for (const it of [...back, ...wires, ...fore, ...caps]) {
      if (it.t === 'shape') { xs.push(it.x, it.x + it.w); ys.push(it.y, it.y + it.h); }
      else if (it.t === 'line') { for (const [x, y] of it.pts) { xs.push(x); ys.push(y); } if (it.bez) for (const sg of it.bez) for (const [x, y] of sg) { xs.push(x); ys.push(y); } }
      else if (it.t === 'circle') { xs.push(it.cx - it.r, it.cx + it.r); ys.push(it.cy - it.r, it.cy + it.r); }
      else if (it.t === 'text') { xs.push(it.box.x, it.box.x + it.box.w); ys.push(it.box.y, it.box.y + it.box.h); }
    }
    let minX = Math.min(...xs, 0) - G.margin;
    let maxX = Math.max(...xs, 200) + G.margin;
    const minY = Math.min(...ys, 0) - G.margin;
    let maxY = Math.max(...ys, 100) + G.margin;
    const legend = [];
    if (model.legend !== false) {
      const used = new Set(model.nodes.map((n) => (COLORS.includes(n.color) ? n.color : n.kind === 'start' ? 'applicant' : n.kind)));
      // 0.15.6 (L1): an entry deleted by hand stays in model.legendHide (by its key), so it stays gone when shapes change
      const hide = new Set(Array.isArray(model.legendHide) ? model.legendHide : []);
      const keys = ['staff', 'applicant', 'rework', 'payment', 'system', 'stop', 'ok', 'note'].filter((k) => used.has(k) && !hide.has(k));
      const wireKeys = ['main', 'return', 'stop'].filter((k) => plan.some((p) => p.e.kind === k) && !hide.has(`wire-${k}`));
      const items = [...keys.map((k) => ({ k, text: W[k] })), ...wireKeys.map((k) => ({ k: `wire-${k}`, wire: k, text: W[`wire-${k}`] }))];
      const chipW = 24;
      const chipH = 16;
      const pitch = 28;
      const width = maxX - minX - 2 * G.margin;
      // the key's own measure: textW() is generous on purpose for boxes; a one-line key wants the set width
      // (Thmanyah measured: Arabic ≈ 0.8 of the estimate, Latin ≈ 0.9), so the house sample keeps one row
      const keyW = (s) => textW(s, FS.key) * (arabic(s) ? 0.82 : 0.92);
      const need = (gap) => items.reduce((sum, it) => sum + chipW + 7 + keyW(it.text) + gap, 0) - gap;
      // one row whenever it fits: the gap between entries shrinks (22 → 10) before a second row is opened
      let gap = 22;
      while (gap > 10 && need(gap) > width) gap -= 2;
      let used0 = 0;
      const rows = [[]];
      for (const it of items) {
        const iw = chipW + 7 + keyW(it.text) + gap;
        if (used0 + iw - gap > width && rows.at(-1).length) { rows.push([]); used0 = 0; }
        rows.at(-1).push({ ...it, iw });
        used0 += iw;
      }
      const ky0 = maxY + 4;
      rows.forEach((row, li) => {
        // a row is centred under the drawing (the reference's key runs across the sheet's middle)
        let pos = Math.max(0, (width - row.reduce((sum, it) => sum + it.iw, 0) + gap) / 2);
        const ky = ky0 + li * pitch;
        for (const it of row) {
          const l0 = legend.length;
          // the key starts at the reading start: the right edge in Arabic
          const chipX = rtl ? maxX - G.margin - pos - chipW : minX + G.margin + pos;
          const textX = rtl ? chipX - 7 : chipX + chipW + 7;
          const tw = keyW(it.text);
          // 0.15.6 (L1): the swatch of an entry can be another shape skin, another wire look, or a symbol (model.legendLook[key] = 'skin:staff' | 'wire:return' | 'sym:clock')
          const lookRaw = model.legendLook && typeof model.legendLook === 'object' ? String(model.legendLook[it.k] || '') : '';
          const [lkKind, lkName] = lookRaw.split(':');
          const lk = (lkKind === 'skin' && P.skins[lkName]) || (lkKind === 'wire' && WIRE_KINDS.includes(lkName)) || (lkKind === 'sym' && GLYPHS[lkName]) ? { kind: lkKind, name: lkName } : null;
          const wireName = lk ? (lk.kind === 'wire' ? lk.name : null) : it.wire;
          const skinName = lk ? (lk.kind === 'skin' ? lk.name : null) : it.wire ? null : it.k;
          if (lk && lk.kind === 'sym') {
            glyph(lk.name, chipX + chipW / 2, ky + chipH / 2, P.caption, 1.5, legend);
          } else if (wireName) {
            // the key's arrows point the way the chain runs (left to right in both editions, as the reference)
            legend.push({ t: 'line', pts: [[chipX, ky + chipH / 2], [chipX + chipW - 2, ky + chipH / 2]], color: P.wire[wireName], lw: WIRE[wireName].w, dash: WIRE[wireName].dash, arrow: true, wire: wireName });
          } else {
            const sk = P.skins[skinName];
            const stadium = skinName === 'ok' || skinName === 'stop';
            legend.push({ t: 'shape', geom: skinName === 'note' ? 'note' : stadium ? 'stadium' : 'round', rx: stadium ? chipH / 2 : 4, x: chipX, y: ky, w: chipW, h: chipH, fill: sk.fill, line: sk.line, lw: stadium ? G.strokeTerm : G.stroke, dash: '' });
            const b = skinName === 'ok' ? 'check' : skinName === 'stop' ? 'cross' : skinName === 'system' ? 'cog' : skinName === 'note' ? '' : 'person';
            if (b) glyph(b, chipX + chipW / 2, ky + chipH / 2, sk.line, b === 'check' || b === 'cross' ? 0.95 : 1, legend);
          }
          legend.push(textItem([it.text], rtl ? textX - tw / 2 : textX + tw / 2, ky + chipH / 2, FS.key, P.caption, 400, { legend: it.k }));
          for (let li2 = l0; li2 < legend.length; li2 += 1) legend[li2].lg = it.k;
          pos += it.iw;
        }
      });
      maxY = ky0 + rows.length * pitch + G.margin / 2;
    }
    const counts = stats || clear ? wireCounts(plan) : null;
    return { model, items: [...back, ...wires, ...fore, ...caps, ...legend], view: { x: r1(minX), y: r1(minY), w: r1(maxX - minX), h: r1(maxY - minY) }, palette: P, ...(counts ? { wires: { overlaps: counts.overlaps, crossings: counts.crossings, hops: clear ? clear.hopped : 0, routing: clear ? ROUTING : 1 } } : {}) };
  }

  /* ── 0.15.6: a styled arrow (route, heads, line, weight) ─────────────── */
  const styled = (e) => (ROUTES.includes(e.route) && e.route !== 'elbow') || (HEADS.includes(e.head) && e.head !== 'arrow') || (HEADS.includes(e.tail) && e.tail !== 'none') || Object.hasOwn(LINES, e.line) || Object.hasOwn(WEIGHTS, e.weight);
  /** The line itself, plus a bar at an end that asks for one. Pieces: the wire (with `head` and `tail` for the marker), then decorations. */
  function styledWire(p, k, P) {
    const e = p.e;
    const head = HEADS.includes(e.head) ? e.head : 'arrow';
    const tail = HEADS.includes(e.tail) ? e.tail : 'none';
    const lw = (Object.hasOwn(WEIGHTS, e.weight) ? WEIGHTS[e.weight] : null) ?? WIRE[k].w;
    const dash = Object.hasOwn(LINES, e.line) ? LINES[e.line] : WIRE[k].dash;
    const mk = (h) => h !== 'none' && h !== 'bar';
    const rt = ROUTES.includes(e.route) ? e.route : 'elbow';
    const route = p.pts.map(([x, y]) => [r1(x), r1(y)]);
    const color = P.wire[k];
    let pts = p.pts.map((q) => [...q]);
    const vis = p.vis ? p.vis.map((q) => [...q]) : null; // 0.16.0: the same line with its jump arcs cut in
    let bez = null;
    if (rt === 'curved' && p.bez) {
      bez = p.bez.map((sg) => sg.map((q) => [...q]));
      const tipAt = (end, tipLen) => {
        const first = end === 0;
        const sg = bez[first ? 0 : bez.length - 1];
        const pt = first ? sg[0] : sg[3];
        const ctl = first ? sg[1] : sg[2];
        const L = Math.hypot(ctl[0] - pt[0], ctl[1] - pt[1]) || 1;
        pt[0] = r1(pt[0] + ((ctl[0] - pt[0]) / L) * tipLen);
        pt[1] = r1(pt[1] + ((ctl[1] - pt[1]) / L) * tipLen);
        if (bez.length > 1) { const nb = bez[first ? 1 : bez.length - 2]; const q = first ? nb[0] : nb[3]; q[0] = pt[0]; q[1] = pt[1]; }
      };
      if (mk(head)) tipAt(1, G.tip);
      if (mk(tail)) tipAt(0, G.tip);
      pts = [bez[0][0], ...bez.map((sg) => sg[3])];
    } else {
      if (mk(tail)) { const a = pts[1]; const b = pts[0]; pull(a, b, G.tip); }
      if (mk(head)) { const a = pts.at(-2); const b = pts.at(-1); pull(a, b, G.tip); }
    }
    if (vis) {
      if (mk(tail)) pull(vis[1], vis[0], G.tip);
      if (mk(head)) pull(vis.at(-2), vis.at(-1), G.tip);
    }
    const d = vis ? (rt === 'elbow' ? pathD(vis, false) : polyD(vis)) : bez ? curveD(bez) : rt === 'elbow' ? pathD(pts, false) : `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}`;
    const out = [{ t: 'line', pts: vis ? plainPts(vis) : pts.map(([x, y]) => [r1(x), r1(y)]), d, ...(bez && !vis ? { bez } : {}), color, lw, dash, arrow: mk(head) || mk(tail), head, tail, wire: k, id: e.id, from: e.from, to: e.to, route, rt }];
    // a bar is real geometry, square to the line at its end: SVG, PDF and Word draw the same thing
    const bar = (at, toward) => {
      const L = Math.hypot(toward[0] - at[0], toward[1] - at[1]) || 1;
      const ux = (toward[0] - at[0]) / L;
      const uy = (toward[1] - at[1]) / L;
      const half = 5 + lw;
      return { t: 'line', pts: [[r1(at[0] - uy * half), r1(at[1] + ux * half)], [r1(at[0] + uy * half), r1(at[1] - ux * half)]], d: '', color, lw: Math.max(lw, 1.6), dash: '', arrow: false, deco: e.id };
    };
    const ends = bez ? [bez[0][1], bez.at(-1)[2]] : [route[1], route.at(-2)];
    if (head === 'bar') out.push(bar(route.at(-1), ends[1]));
    if (tail === 'bar') out.push(bar(route[0], ends[0]));
    return out;
  }

  /* ── SVG ──────────────────────────────────────────────────────────────── */
  function shapeSvg(s) {
    // a symbol's hit area has no paint: pointer-events="all" lets the editor pick and drag it (nothing prints from it)
    const a = `fill="${s.fill}" stroke="${s.line}" stroke-width="${s.lw}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.hit ? ' pointer-events="all"' : ''}`;
    if (s.geom === 'diamond') return `<polygon points="${r1(s.x + s.w / 2)},${r1(s.y)} ${r1(s.x + s.w)},${r1(s.y + s.h / 2)} ${r1(s.x + s.w / 2)},${r1(s.y + s.h)} ${r1(s.x)},${r1(s.y + s.h / 2)}" ${a}/>`;
    if (s.geom === 'note') { const c = Math.min(14, s.w / 4, s.h / 3); return `<path d="M${r1(s.x)} ${r1(s.y)}H${r1(s.x + s.w - c)}L${r1(s.x + s.w)} ${r1(s.y + c)}V${r1(s.y + s.h)}H${r1(s.x)}Z" ${a}/><path d="M${r1(s.x + s.w - c)} ${r1(s.y)}V${r1(s.y + c)}H${r1(s.x + s.w)}" fill="none" stroke="${s.line}" stroke-width="${s.lw}"/>`; }
    const rx = s.geom === 'rect' ? 0 : s.geom === 'stadium' ? s.h / 2 : s.rx ?? G.rx;
    return `<rect x="${r1(s.x)}" y="${r1(s.y)}" width="${r1(s.w)}" height="${r1(s.h)}"${rx ? ` rx="${r1(rx)}"` : ''} ${a}/>`;
  }
  function textSvg(t, editor = false) {
    const first = t.y - ((t.lines.length - 1) * t.lh) / 2;
    const plate = t.plate ? `<rect x="${r1(t.box.x - 3)}" y="${r1(t.box.y + 1)}" width="${r1(t.box.w + 6)}" height="${r1(t.box.h - 2)}" fill="${t.plate}"/>` : '';
    return plate + t.lines.map((l, i) => `<text x="${t.x}" y="${r1(first + i * t.lh + t.size * 0.34)}" text-anchor="middle" font-size="${t.size}"${t.weight && t.weight !== 400 ? ` font-weight="${t.weight}"` : ''} fill="${t.color}"${arabic(l) ? ' direction="rtl"' : ''}${editor && t.legend ? ` data-dg-legend="${esc(t.legend)}"` : ''}${editor && t.edge ? ` data-dg-cap="${esc(t.edge)}"` : ''}>${esc(l)}</text>`).join('');
  }
  /* ── 0.15.9: the canvas (block.frame = { wMm, hMm, mode }) ──
   * The block keeps a canvas size in millimetres. The drawing inside keeps its proportions and is centred; it is scaled to fit the canvas (never stretched,
   * never cut: a shape moved outside shrinks the drawing instead), and never blown up past FRAME.cap mm per drawing unit (lettering then stays near body size).
   * mode: 0 = sized by hand, 1 = «fit to shapes», 2 = «fit to page» (a number, not a word: a string under a block would be read as editable text). */
  const FRAME = { cap: 0.4, min: 20, max: 1200 };
  const q2 = (v) => Math.round(v * 100) / 100;
  /** A saved frame as the engine uses it, or null (absent or unusable = the drawing as before). */
  function frameNorm(f) {
    if (!f || typeof f !== 'object') return null;
    const w = +f.wMm;
    const h = +f.hMm;
    if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
    const c = (v) => q2(Math.min(FRAME.max, Math.max(FRAME.min, v)));
    return { wMm: c(w), hMm: c(h), mode: [0, 1, 2].includes(+f.mode) ? +f.mode : 0 };
  }
  /** The drawing's view grown (never shrunk) to the canvas' proportions, centred, and the scale in mm per unit. */
  function frameView(view, wMm, hMm) {
    const sc = Math.min(wMm / view.w, hMm / view.h, FRAME.cap);
    const w = wMm / sc;
    const h = hMm / sc;
    return { x: q2(view.x - (w - view.w) / 2), y: q2(view.y - (h - view.h) / 2), w: q2(w), h: q2(h), sc };
  }
  /** «Fit to shapes»: the canvas that hugs the drawing (shapes, labels and legend with the drawing's own even margin) at the biggest scale the limits allow. */
  function frameHug(view, maxW, maxH) {
    const sc = Math.min(maxW / view.w, maxH / view.h, FRAME.cap);
    return { wMm: Math.max(FRAME.min, Math.floor(view.w * sc * 10) / 10), hMm: Math.max(FRAME.min, Math.floor(view.h * sc * 10) / 10) };
  }
  function render(model, { theme, locale = 'ar', title = '', editor = false, frame = null } = {}) {
    const r = resolve(model, { theme, locale });
    const fam = [theme?.fonts?.text, 'serif'].filter(Boolean).map((x) => (x === 'serif' ? x : `'${String(x).replace(/[^\w\s-]/g, '')}'`)).join(', ');
    let tips = WIRE_KINDS.map((k) => `<marker id="bwdg-tip-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.6" markerHeight="6.6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="${r.palette.wire[k]}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker>`).join('');
    // 0.15.6: the other head shapes, only the ones this drawing uses (tip at the same place as the chevron's)
    const HEAD_SHAPE = { triangle: 'M1 1L8 5L1 9Z', diamond: 'M0 5L4 1.2L8 5L4 8.8Z', circle: '' };
    const extra = new Set();
    for (const it of r.items) if (it.t === 'line' && it.wire && it.id) for (const h of [it.head, it.tail]) if (h && HEAD_SHAPE[h] !== undefined) extra.add(`${h}|${it.wire}`);
    for (const key of [...extra].sort()) {
      const [h, k] = key.split('|');
      const shape = h === 'circle' ? `<circle cx="4.6" cy="5" r="3.4" fill="${r.palette.wire[k]}"/>` : `<path d="${HEAD_SHAPE[h]}" fill="${r.palette.wire[k]}" stroke="${r.palette.wire[k]}" stroke-width="0.8" stroke-linejoin="round"/>`;
      tips += `<marker id="bwdg-h-${h}-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.6" markerHeight="6.6" orient="auto-start-reverse">${shape}</marker>`;
    }
    const markerOf = (name, h, k) => (h === 'arrow' ? `bwdg-tip-${k}` : `bwdg-h-${h}-${k}`);
    const groups = new Map();
    const out = [];
    const open = (key, attrs) => { if (!groups.has(key)) { groups.set(key, true); return `<g ${attrs}>`; } return ''; };
    let cur = null;
    const close = () => { const s = cur ? '</g>' : ''; cur = null; return s; };
    for (const it of r.items) {
      const key = editor ? (it.deco ? `e:${it.deco}` : it.id && !it.wire ? `n:${it.id}` : it.wire && it.id ? `e:${it.id}` : null) : null;
      if (key !== cur) { out.push(close()); if (key) { cur = key; out.push(key.startsWith('n:') ? `<g data-dg-node="${esc(it.id)}">` : `<g data-dg-edge="${esc(it.id)}">`); } }
      const tag = (str) => (editor && it.lg ? str.replace(/<(rect|path|circle|polygon|text)/g, `<$1 data-dg-lg="${esc(it.lg)}"`) : str);
      if (it.t === 'shape') out.push(tag(it.fill === 'none' && !editor ? '' : shapeSvg(it)));
      else if (it.t === 'circle') out.push(tag(`<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${it.fill || 'none'}" stroke="${it.color}" stroke-width="${r1(it.lw)}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`));
      else if (it.t === 'line') {
        const d = it.d || `M${it.pts.map(([x, y]) => `${x} ${y}`).join('L')}`;
        const styledEnds = it.head !== undefined;
        const mEnd = styledEnds ? (it.head !== 'none' && it.head !== 'bar' ? ` marker-end="url(#${markerOf('end', it.head, it.wire)})"` : '') : it.arrow ? ` marker-end="url(#bwdg-tip-${it.wire || 'main'})"` : '';
        const mStart = styledEnds && it.tail !== 'none' && it.tail !== 'bar' ? ` marker-start="url(#${markerOf('start', it.tail, it.wire)})"` : '';
        out.push(tag(`<path d="${d}" fill="none" stroke="${it.color}" stroke-width="${r1(it.lw)}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"${mStart}${mEnd}/>`));
        if (editor && it.wire && it.id) out.push(`<path d="${d}" fill="none" stroke="transparent" stroke-width="12" class="dg-hit"/>`);
      } else if (it.t === 'text') out.push(tag(textSvg(it, editor)));
    }
    out.push(close());
    void open;
    const v = frame ? frameView(r.view, frame.wMm, frame.hMm) : r.view;
    const wAttr = frame ? `${frame.wMm}mm` : v.w;
    const hAttr = frame ? `${frame.hMm}mm` : v.h;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="bw-dg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="${wAttr}" height="${hAttr}" role="img" aria-label="${esc(title)}" font-family="${esc(fam)}" direction="ltr" style="direction:ltr"><defs>${tips}</defs><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${r.palette.paper}"/>${out.join('')}</svg>`;
  }

  /* ── from a harvested process graph (humanGraph) ───────────────────────── */
  const APPLICANT = /applicant|customer|citizen|requester|requestor|client|مقدم|مُقدّم|المتقدم|العميل|المواطن|المستفيد|طالب الخدمة/i;
  const PAY = /\bpay|payment|fee|دفع|رسوم|سداد/i;
  const REFUSE = /reject|refus|cancel|declin|denied|expired|رفض|مرفوض|إلغاء|الغاء|ملغ|انتهاء/i;
  function fromGraph(graph, { actors = [], locale = 'ar', flow = 'ltr' } = {}) {
    const W = words(locale);
    const nodes = graph.nodes.map((n) => ({ ...n }));
    const edges = graph.edges.map((e) => ({ ...e }));
    const firstOf = (id) => edges.filter((e) => e.from === id).map((e) => nodes.find((n) => n.id === e.to)).filter(Boolean);
    const start = nodes.find((n) => n.type === 'start');
    const firstTask = start ? firstOf(start.id).find((n) => n.type === 'task') : nodes.find((n) => n.type === 'task');
    const applicant = actors.find((a) => APPLICANT.test(a.name))?.id || firstTask?.actor;
    // BFS order: an applicant step met after a staff step is the applicant's rework
    const order = [];
    const seen = new Set();
    const q = start ? [start.id] : nodes.slice(0, 1).map((n) => n.id);
    while (q.length) { const id = q.shift(); if (seen.has(id)) continue; seen.add(id); order.push(id); for (const e of edges.filter((x) => x.from === id)) q.push(e.to); }
    for (const n of nodes) if (!seen.has(n.id)) order.push(n.id);
    let staffSeen = false;
    const kind = {};
    for (const id of order) {
      const n = nodes.find((x) => x.id === id);
      if (n.type === 'task') {
        const mine = applicant && n.actor === applicant;
        kind[id] = mine ? (PAY.test(n.name) ? 'payment' : staffSeen ? 'rework' : 'applicant') : 'staff';
        if (!mine) staffSeen = true;
      } else if (n.type === 'decision') kind[id] = 'decision';
      else if (n.type === 'end') kind[id] = REFUSE.test(n.name) ? 'stop' : 'ok';
      else if (n.type === 'start') kind[id] = 'start';
      else kind[id] = 'system';
    }
    // the start event folds into the applicant's first step, which becomes the start pill (as the reference)
    let drop = null;
    if (start && firstTask && kind[firstTask.id] === 'applicant' && firstOf(start.id).length === 1 && !edges.some((e) => e.to === start.id)) { drop = start.id; kind[firstTask.id] = 'start'; }
    // short ids of our own: the source's raw ids (sid-…, expressions) never travel into the document
    const short = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]));
    const out = {
      kind: 'bw-diagram', version: 1, flow,
      nodes: nodes.filter((n) => n.id !== drop).map((n) => ({ id: short.get(n.id), kind: kind[n.id], label: n.name || (n.type === 'decision' ? W.action : n.type === 'start' ? W.start : n.type === 'end' ? (kind[n.id] === 'stop' ? W.stop : W.ok) : '') })),
      edges: edges.filter((e) => e.from !== drop && e.to !== drop).map((e, i) => ({ id: `e${i + 1}`, from: short.get(e.from), to: short.get(e.to), label: e.label || '' })),
    };
    return layout(out);
  }

  /* ── Mermaid flowchart code ⇄ model ─────────────────────────────────────── */
  const SHAPE_OF = { staff: ['[', ']'], applicant: ['(', ')'], start: ['([', '])'], payment: ['[/', '/]'], rework: ['[\\', '\\]'], system: ['[[', ']]'], decision: ['{', '}'], ok: ['([', '])'], stop: ['([', '])'], note: ['>', ']'], text: ['[', ']'], symbol: ['((', '))'], group: ['[', ']'] };
  const mmQuote = (s) => `"${String(s ?? '').replace(/"/g, '#quot;').replace(/\n/g, ' ')}"`;
  const mmId = (s) => String(s).replace(/[^\w]/g, '_') || 'n';
  function toMermaid(modelIn) {
    const model = ensure(modelIn);
    const lines = [`flowchart ${model.flow === 'rtl' ? 'RL' : 'LR'}`];
    const ids = new Map(model.nodes.map((n) => [n.id, mmId(n.id)]));
    for (const n of model.nodes) {
      if (n.kind === 'group' && n.auto) continue;
      const [a, b] = SHAPE_OF[n.kind] || SHAPE_OF.staff;
      lines.push(`  ${ids.get(n.id)}${a}${mmQuote(n.label || (n.kind === 'symbol' ? n.icon : ''))}${b}:::${n.kind}`);
    }
    for (const e of model.edges) {
      const arrow = e.kind === 'return' ? '-.->' : e.kind === 'stop' ? '--x' : '-->';
      lines.push(`  ${ids.get(e.from)} ${arrow}${e.label ? `|${mmQuote(e.label)}|` : ''} ${ids.get(e.to)}`);
    }
    const P = palette(null);
    for (const k of ['staff', 'applicant', 'payment', 'rework', 'system', 'ok', 'stop', 'note']) lines.push(`  classDef ${k} fill:${P.skins[k].fill},stroke:${P.skins[k].line},color:${P.skins[k].ink}`);
    lines.push(`  classDef start fill:${P.skins.applicant.fill},stroke:${P.skins.applicant.line},stroke-width:2px`);
    lines.push(`  classDef decision fill:#ffffff,stroke:${P.gate}`);
    return lines.join('\n') + '\n';
  }
  const SHAPES_IN = [['([', '])', 'pill'], ['[[', ']]', 'system'], ['((', '))', 'circle'], ['[/', '/]', 'payment'], ['[\\', '\\]', 'rework'], ['{{', '}}', 'decision'], ['[(', ')]', 'staff'], ['{', '}', 'decision'], ['[', ']', 'staff'], ['(', ')', 'applicant'], ['>', ']', 'note']];
  function fromMermaid(code, { locale = 'ar' } = {}) {
    const src = String(code || '').replace(/%%.*$/gm, '');
    const head = /^\s*(flowchart|graph)\s+(\w+)?/im.exec(src);
    if (!head) throw new Error('not a Mermaid flowchart: the code must start with "flowchart" or "graph"');
    const flow = /^(RL)$/i.test(head[2] || '') ? 'rtl' : 'ltr';
    const nodes = new Map();
    const edges = [];
    const unq = (s) => String(s).trim().replace(/^"(.*)"$/s, '$1').replace(/#quot;/g, '"').replace(/<br\s*\/?>/gi, ' ');
    // one node reference: id, optional shape+label, optional :::class
    const NODE = /^([\w.-]+)\s*(?:(\(\[|\[\[|\(\(|\[\/|\[\\|\{\{|\[\(|\{|\[|\(|>)(.*?)(\]\)|\]\]|\)\)|\/\]|\\\]|\}\}|\)\]|\}|\]|\)))?(?::::(\w+))?/;
    const take = (s) => {
      const m = NODE.exec(s.trim());
      if (!m) return null;
      const [, id, open, label, close, cls] = m;
      let n = nodes.get(id);
      if (!n) { n = { id, kind: '', label: id }; nodes.set(id, n); }
      if (open) {
        n.label = unq(label);
        const shape = (SHAPES_IN.find(([a, b]) => a === open && b === close) || [])[2] || 'staff';
        n.shape = shape;
      }
      if (cls && KINDS.includes(cls)) n.kind = cls;
      return { id, rest: s.trim().slice(m[0].length) };
    };
    const LINK = /^\s*(-->|---|-\.->|-\.-|==>|===|--x|--o|<-->|-- (.+?) -->|-\. (.+?) \.->|== (.+?) ==>)\s*(?:\|([^|]*)\|)?/;
    for (const raw of src.split(/\n|;/)) {
      const line = raw.trim();
      if (!line || /^(flowchart|graph|classDef|class |style |linkStyle|click |subgraph|end$|direction )/i.test(line)) continue;
      let cur = take(line);
      if (!cur) continue;
      let rest = cur.rest;
      while (rest) {
        const l = LINK.exec(rest);
        if (!l) break;
        rest = rest.slice(l[0].length);
        const nxt = take(rest);
        if (!nxt) break;
        const arrow = l[1];
        const label = unq(l[5] ?? l[2] ?? l[3] ?? l[4] ?? '');
        const kind = arrow.startsWith('-.') ? 'return' : arrow === '--x' ? 'stop' : undefined;
        edges.push({ id: `e${edges.length + 1}`, from: cur.id, to: nxt.id, label, ...(kind ? { kind } : {}) });
        cur = nxt;
        rest = nxt.rest;
      }
    }
    const hasIn = new Set(edges.map((e) => e.to));
    for (const n of nodes.values()) {
      if (!n.kind) {
        n.kind = n.shape === 'pill' ? (!hasIn.has(n.id) ? 'start' : REFUSE.test(n.label) ? 'stop' : 'ok') : n.shape === 'circle' ? 'start' : n.shape || 'staff';
        if (n.kind === 'staff' && !hasIn.has(n.id) && edges.some((e) => e.from === n.id) && ![...nodes.values()].some((x) => x.kind === 'start')) n.kind = 'start';
      }
      if (n.kind === 'symbol') { n.icon = SYMBOLS.includes(n.label) ? n.label : 'person'; n.label = ''; }
      delete n.shape;
    }
    void locale;
    return layout({ kind: 'bw-diagram', version: 1, flow, nodes: [...nodes.values()], edges });
  }

  /** A starter for «add a new diagram». */
  function starter(locale = 'ar') {
    const W = words(locale);
    const ar = locale === 'ar';
    return layout({
      kind: 'bw-diagram', version: 1, flow: 'ltr',
      nodes: [
        { id: 'n1', kind: 'start', label: W.start },
        { id: 'n2', kind: 'staff', label: ar ? 'مراجعة الطلب' : 'Review the request' },
        { id: 'n3', kind: 'decision', label: W.action },
        { id: 'n4', kind: 'ok', label: ar ? 'مخرج موافقة' : 'Approved' },
        { id: 'n5', kind: 'stop', label: ar ? 'مخرج رفض' : 'Refused' },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: '' },
        { id: 'e2', from: 'n2', to: 'n3', label: '' },
        { id: 'e3', from: 'n3', to: 'n4', label: ar ? 'موافقة' : 'Approve' },
        { id: 'e4', from: 'n3', to: 'n5', label: ar ? 'رفض' : 'Refuse' },
      ],
    });
  }

  return { PRINT, ROUTING, routing2, autoLayout, applyRouting, FRAME, frameNorm, frameView, frameHug, ROUTES, HEADS, LINES: Object.keys(LINES), WEIGHTS: Object.keys(WEIGHTS), anchorPoint, nearestAnchor, edgePoint, nearestOnWire, wireMid, validAnchor, splitByPhase, splitForLegibility, legibility, KINDS, WIRE_KINDS, COLORS, SYMBOLS, FS, G, palette, words, measure, wrap, textW, classify, layout, ensure, route, resolve, render, fromGraph, toMermaid, fromMermaid, starter, glyph };
})();
