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
  const KINDS = ['staff', 'applicant', 'start', 'payment', 'rework', 'system', 'decision', 'ok', 'stop', 'note', 'group', 'text', 'symbol'];
  const WIRE_KINDS = ['main', 'return', 'stop'];
  const COLORS = ['staff', 'applicant', 'payment', 'rework', 'system', 'ok', 'stop', 'note'];
  const SYMBOLS = ['person', 'people', 'clock', 'check', 'cross', 'cog', 'document', 'mail', 'warning', 'calendar', 'lock', 'flag', 'star'];
  const FREE = new Set(['note', 'group', 'text', 'symbol']); // placed by hand, never by the layout
  const STADIUM = new Set(['start', 'ok', 'stop']);
  const SKIN_OF = { staff: 'staff', applicant: 'applicant', start: 'applicant', payment: 'payment', rework: 'rework', system: 'system', ok: 'ok', stop: 'stop', note: 'note' };
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

  /* legend wording; a model may rename any entry (model.legend[key]) */
  const KEY = {
    ar: { staff: 'مرحلة الموظف', applicant: 'مرحلة مقدم الطلب', rework: 'استكمال من مُقدّم الطلب', payment: 'دفع من مُقدّم الطلب', system: 'خطوة ينفذها النظام', stop: 'نهاية بالإلغاء أو الرفض', ok: 'نهاية بالاعتماد', note: 'ملاحظة', 'wire-main': 'المسار الأساسي للطلب', 'wire-return': 'إرجاع إلى مرحلة سابقة', 'wire-stop': 'مسار الرفض أو الإلغاء', action: 'إجراء', start: 'تقديم الطلب', newStage: 'مرحلة جديدة', newText: 'نص' },
    en: { staff: 'Staff stage', applicant: 'Applicant step', rework: 'Applicant completes', payment: 'Applicant pays', system: 'System step', stop: 'Ends refused or cancelled', ok: 'Ends approved', note: 'Note', 'wire-main': 'Main path', 'wire-return': 'Back to an earlier stage', 'wire-stop': 'Refusal or cancellation', action: 'Action', start: 'Submit request', newStage: 'New stage', newText: 'Text' },
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
      const lines = wrap(n.label, 110, FS.gate);
      const wide = Math.max(...lines.map((l) => textW(l, FS.gate)));
      const hw = Math.max(G.gate, Math.ceil(wide * 0.62) + 14);
      const hh = Math.max(G.gate - 4, Math.ceil(lines.length * FS.gate * 0.9) + 18);
      return { w: hw * 2, h: hh * 2 };
    }
    if (n.kind === 'symbol') return { w: 36, h: 36 };
    if (n.kind === 'text') return { w: Math.max(40, Math.ceil(longW(n.label, FS.text))), h: Math.max(28, String(n.label ?? '').split(NL).length * 20 + 8) };
    if (n.kind === 'group') return { w: 320, h: 120 };
    const badge = STADIUM.has(n.kind) ? 26 : 0;
    const want = Math.max(longW(n.label, FS.title), n.sub ? longW(n.sub, FS.sub) : 0) + G.padX * 2 + badge;
    const w = Math.min(G.maxW, Math.max(G.minW, Math.ceil(want)));
    const lines = wrap(n.label, w - G.padX * 2 - badge, FS.title);
    const h = Math.max(G.minH, lines.length * G.lineH + (n.sub ? G.subH : 0) + 20);
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
  function layout(input, { force = false } = {}) {
    const model = clone(input);
    model.nodes = model.nodes.filter((n) => !(n.kind === 'group' && n.auto));
    for (const e of model.edges || []) delete e.via; // a new layout routes every arrow afresh
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
    for (let k = 1; k <= Math.min(5, spine.length); k += 1) {
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
      const score = Math.abs(Math.log(W / H / PAGE_RATIO)) + (rows.at(-1).length === 1 && rows.length > 1 ? 0.4 : 0);
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

  /** A model ready to draw: sizes and positions filled in, edge kinds settled. */
  function ensure(model) {
    const m = clone(model || {});
    m.nodes = (m.nodes || []).filter((n) => n && n.id);
    const ids = new Set(m.nodes.map((n) => n.id));
    m.edges = (m.edges || []).filter((e) => e && ids.has(e.from) && ids.has(e.to));
    m.edges.forEach((e, i) => { if (!e.id) e.id = `e${i + 1}`; });
    if (m.nodes.some((n) => !FREE.has(n.kind) && (n.x == null || n.y == null))) return layout(m);
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
    const routed = [...plan].sort((a, b) => orderOf[a.mode] - orderOf[b.mode] || Math.abs(b.a[0] - b.b[0]) - Math.abs(a.a[0] - a.b[0]));
    for (const p of routed) {
      const [ax, ay] = p.a;
      const [bx, by] = p.b;
      const lo = Math.min(ax, bx);
      const hi = Math.max(ax, bx);
      let pts;
      if (p.mode === 'straight') {
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
      if (Array.isArray(p.e.via) && p.e.via.length) pts = viaPath(p.a, p.b, p.e.via, p.sides[0], p.sides[1]);
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
    // the arrowhead needs a last leg with a length: drop a zero-length tail point
    while (out.length > 2 && Math.hypot(out.at(-1)[0] - out.at(-2)[0], out.at(-1)[1] - out.at(-2)[1]) < 0.5) out.splice(-2, 1);
    return out;
  }

  /** Rounded orthogonal path; the last leg stops short so the open chevron lands on the outline. */
  function pathD(ptsIn) {
    const p = ptsIn.map((q) => [...q]);
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    if (Math.abs(a[0] - b[0]) < 0.5) b[1] += b[1] > a[1] ? -G.tip : G.tip;
    else if (Math.abs(a[1] - b[1]) < 0.5) b[0] += b[0] > a[0] ? -G.tip : G.tip;
    let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
    for (let i = 1; i < p.length; i += 1) {
      const cur = p[i];
      if (i === p.length - 1) { d += `L${r1(cur[0])} ${r1(cur[1])}`; continue; }
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
    if (Math.abs(a[0] - b[0]) < 0.5) b[1] += b[1] > a[1] ? -G.tip : G.tip;
    else if (Math.abs(a[1] - b[1]) < 0.5) b[0] += b[0] > a[0] ? -G.tip : G.tip;
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
  function resolve(modelIn, { theme, locale = 'ar' } = {}) {
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
        fore.push({ t: 'shape', geom: 'rect', x: n.x, y: n.y, w: n.w, h: n.h, fill: 'none', line: 'none', lw: 0, dash: '', id, hit: true });
        glyph(SYMBOLS.includes(n.icon) ? n.icon : 'person', cx, cy, skinOf(n).line === P.skins.staff.line && !n.color ? P.head : skinOf(n).line, Math.min(n.w, n.h) / 12, fore);
        continue;
      }
      if (n.kind === 'decision') {
        fore.push({ t: 'shape', geom: 'diamond', x: n.x, y: n.y, w: n.w, h: n.h, fill: P.paper, line: P.gate, lw: G.strokeGate, dash: '', id });
        fore.push(textItem(wrap(n.label || W.action, n.w * 0.62, FS.gate), cx, cy, FS.gate, P.caption, 600, { id, node: true }));
        continue;
      }
      const sk = skinOf(n);
      const stadium = STADIUM.has(n.kind);
      if (n.kind === 'note') fore.push({ t: 'shape', geom: 'note', x: n.x, y: n.y, w: n.w, h: n.h, fill: sk.fill, line: sk.line, lw: 1, dash: '', id });
      else fore.push({ t: 'shape', geom: stadium ? 'stadium' : 'round', rx: stadium ? n.h / 2 : G.rx, x: n.x, y: n.y, w: n.w, h: n.h, fill: sk.fill, line: sk.line, lw: stadium ? G.strokeTerm : G.stroke, dash: '', id });
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
      const lines = wrap(n.label, n.w - G.padX * 2 - badgeRoom, FS.title);
      const block = lines.length * G.lineH + (n.sub ? G.subH : 0);
      const ty = cy - block / 2 + (lines.length * G.lineH) / 2;
      fore.push({ ...textItem(lines, tx, ty, FS.title, sk.ink, 500, { id, node: true }), lh: G.lineH });
      if (n.sub) fore.push(textItem([n.sub], tx, ty + (lines.length * G.lineH) / 2 + G.subH / 2, FS.sub, sk.line, 400, { id, sub: true }));
    }
    // wires and their captions
    const plan = route(model);
    const solids = model.nodes.filter((n) => !['group', 'text'].includes(n.kind)).map(box);
    const placed = [];
    const wireRects = plan.flatMap((p) => p.pts.slice(1).map((q, i) => { const a = p.pts[i]; return { l: Math.min(a[0], q[0]) - 1, r: Math.max(a[0], q[0]) + 1, t: Math.min(a[1], q[1]) - 1, b: Math.max(a[1], q[1]) + 1 }; }));
    const hits = (r, list) => list.some((o) => r.x < o.r + 2 && r.x + r.w > o.l - 2 && r.y < o.b + 2 && r.y + r.h > o.t - 2);
    for (const p of plan) {
      const k = WIRE_KINDS.includes(p.e.kind) ? p.e.kind : 'main';
      wires.push({ t: 'line', pts: shortPts(p.pts), d: pathD(p.pts), color: P.wire[k], lw: WIRE[k].w, dash: WIRE[k].dash, arrow: true, wire: k, id: p.e.id, from: p.e.from, to: p.e.to, route: p.pts.map(([x, y]) => [r1(x), r1(y)]) });
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
      const rectOf = (c) => ({ x: c.x - lw / 2, y: c.y - lh / 2 + 3, w: lw, h: lh - 6 });
      const leaderClear = (c) => { const l = { l: Math.min(c.x, c.ax) - 0.5, r: Math.max(c.x, c.ax) + 0.5, t: Math.min(c.y, c.ay) - 0.5, b: Math.max(c.y, c.ay) + 0.5 }; return !solids.some((o) => l.l < o.r && l.r > o.l && l.t < o.b && l.b > o.t); };
      let pick = null;
      for (const [list, strict] of [[cands, true], [cands, false], [far, true], [far, false]]) {
        for (const c of list) {
          const r = rectOf(c);
          if (!hits(r, solids) && !hits(r, placed) && (!strict || !hits(r, wireRects)) && (c.ax == null || leaderClear(c))) { pick = c; placed.push({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h }); break; }
        }
        if (pick) break;
      }
      pick ||= cands[0] || { x: p.pts[0][0], y: p.pts[0][1] };
      if (pick.ax != null) wires.push({ t: 'line', pts: [[pick.ax, pick.ay], pick.ay === pick.y ? [pick.x - Math.sign(pick.x - pick.ax) * (lw / 2), pick.y] : [pick.x, pick.y - Math.sign(pick.y - pick.ay) * (lh / 2 - 3)]], d: '', color: P.caption, lw: 0.6, dash: '2 2', arrow: false, leader: p.e.id });
      caps.push(textItem([p.e.label], pick.x, pick.y, FS.edge, P.caption, 400, { plate: P.paper, edge: p.e.id }));
    }
    // extent of the drawing, then the legend under it
    const xs = [];
    const ys = [];
    for (const it of [...back, ...wires, ...fore, ...caps]) {
      if (it.t === 'shape') { xs.push(it.x, it.x + it.w); ys.push(it.y, it.y + it.h); }
      else if (it.t === 'line') for (const [x, y] of it.pts) { xs.push(x); ys.push(y); }
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
      const keys = ['staff', 'applicant', 'rework', 'payment', 'system', 'stop', 'ok', 'note'].filter((k) => used.has(k));
      const wireKeys = ['main', 'return', 'stop'].filter((k) => plan.some((p) => p.e.kind === k));
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
          // the key starts at the reading start: the right edge in Arabic
          const chipX = rtl ? maxX - G.margin - pos - chipW : minX + G.margin + pos;
          const textX = rtl ? chipX - 7 : chipX + chipW + 7;
          const tw = keyW(it.text);
          if (it.wire) {
            // the key's arrows point the way the chain runs (left to right in both editions, as the reference)
            legend.push({ t: 'line', pts: [[chipX, ky + chipH / 2], [chipX + chipW - 2, ky + chipH / 2]], color: P.wire[it.wire], lw: WIRE[it.wire].w, dash: WIRE[it.wire].dash, arrow: true, wire: it.wire });
          } else {
            const sk = P.skins[it.k];
            const stadium = it.k === 'ok' || it.k === 'stop';
            legend.push({ t: 'shape', geom: it.k === 'note' ? 'note' : stadium ? 'stadium' : 'round', rx: stadium ? chipH / 2 : 4, x: chipX, y: ky, w: chipW, h: chipH, fill: sk.fill, line: sk.line, lw: stadium ? G.strokeTerm : G.stroke, dash: '' });
            const b = it.k === 'ok' ? 'check' : it.k === 'stop' ? 'cross' : it.k === 'system' ? 'cog' : it.k === 'note' ? '' : 'person';
            if (b) glyph(b, chipX + chipW / 2, ky + chipH / 2, sk.line, b === 'check' || b === 'cross' ? 0.95 : 1, legend);
          }
          legend.push(textItem([it.text], rtl ? textX - tw / 2 : textX + tw / 2, ky + chipH / 2, FS.key, P.caption, 400, { legend: it.k }));
          pos += it.iw;
        }
      });
      maxY = ky0 + rows.length * pitch + G.margin / 2;
    }
    return { model, items: [...back, ...wires, ...fore, ...caps, ...legend], view: { x: r1(minX), y: r1(minY), w: r1(maxX - minX), h: r1(maxY - minY) }, palette: P };
  }

  /* ── SVG ──────────────────────────────────────────────────────────────── */
  function shapeSvg(s) {
    const a = `fill="${s.fill}" stroke="${s.line}" stroke-width="${s.lw}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}`;
    if (s.geom === 'diamond') return `<polygon points="${r1(s.x + s.w / 2)},${r1(s.y)} ${r1(s.x + s.w)},${r1(s.y + s.h / 2)} ${r1(s.x + s.w / 2)},${r1(s.y + s.h)} ${r1(s.x)},${r1(s.y + s.h / 2)}" ${a}/>`;
    if (s.geom === 'note') { const c = Math.min(14, s.w / 4, s.h / 3); return `<path d="M${r1(s.x)} ${r1(s.y)}H${r1(s.x + s.w - c)}L${r1(s.x + s.w)} ${r1(s.y + c)}V${r1(s.y + s.h)}H${r1(s.x)}Z" ${a}/><path d="M${r1(s.x + s.w - c)} ${r1(s.y)}V${r1(s.y + c)}H${r1(s.x + s.w)}" fill="none" stroke="${s.line}" stroke-width="${s.lw}"/>`; }
    const rx = s.geom === 'rect' ? 0 : s.geom === 'stadium' ? s.h / 2 : s.rx ?? G.rx;
    return `<rect x="${r1(s.x)}" y="${r1(s.y)}" width="${r1(s.w)}" height="${r1(s.h)}"${rx ? ` rx="${r1(rx)}"` : ''} ${a}/>`;
  }
  function textSvg(t) {
    const first = t.y - ((t.lines.length - 1) * t.lh) / 2;
    const plate = t.plate ? `<rect x="${r1(t.box.x - 3)}" y="${r1(t.box.y + 1)}" width="${r1(t.box.w + 6)}" height="${r1(t.box.h - 2)}" fill="${t.plate}"/>` : '';
    return plate + t.lines.map((l, i) => `<text x="${t.x}" y="${r1(first + i * t.lh + t.size * 0.34)}" text-anchor="middle" font-size="${t.size}"${t.weight && t.weight !== 400 ? ` font-weight="${t.weight}"` : ''} fill="${t.color}"${arabic(l) ? ' direction="rtl"' : ''}>${esc(l)}</text>`).join('');
  }
  function render(model, { theme, locale = 'ar', title = '', editor = false } = {}) {
    const r = resolve(model, { theme, locale });
    const fam = [theme?.fonts?.text, 'serif'].filter(Boolean).map((x) => (x === 'serif' ? x : `'${String(x).replace(/[^\w\s-]/g, '')}'`)).join(', ');
    const tips = WIRE_KINDS.map((k) => `<marker id="bwdg-tip-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.6" markerHeight="6.6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="${r.palette.wire[k]}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></marker>`).join('');
    const groups = new Map();
    const out = [];
    const open = (key, attrs) => { if (!groups.has(key)) { groups.set(key, true); return `<g ${attrs}>`; } return ''; };
    let cur = null;
    const close = () => { const s = cur ? '</g>' : ''; cur = null; return s; };
    for (const it of r.items) {
      const key = editor ? (it.id && !it.wire ? `n:${it.id}` : it.wire && it.id ? `e:${it.id}` : null) : null;
      if (key !== cur) { out.push(close()); if (key) { cur = key; out.push(key.startsWith('n:') ? `<g data-dg-node="${esc(it.id)}">` : `<g data-dg-edge="${esc(it.id)}">`); } }
      if (it.t === 'shape') out.push(it.fill === 'none' && !editor ? '' : shapeSvg(it));
      else if (it.t === 'circle') out.push(`<circle cx="${it.cx}" cy="${it.cy}" r="${it.r}" fill="${it.fill || 'none'}" stroke="${it.color}" stroke-width="${r1(it.lw)}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`);
      else if (it.t === 'line') {
        const d = it.d || `M${it.pts.map(([x, y]) => `${x} ${y}`).join('L')}`;
        out.push(`<path d="${d}" fill="none" stroke="${it.color}" stroke-width="${r1(it.lw)}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"${it.arrow ? ` marker-end="url(#bwdg-tip-${it.wire || 'main'})"` : ''}/>`);
        if (editor && it.wire && it.id) out.push(`<path d="${d}" fill="none" stroke="transparent" stroke-width="12" class="dg-hit"/>`);
      } else if (it.t === 'text') out.push(textSvg(it));
    }
    out.push(close());
    void open;
    const v = r.view;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="bw-dg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" width="${v.w}" height="${v.h}" role="img" aria-label="${esc(title)}" font-family="${esc(fam)}" direction="ltr" style="direction:ltr"><defs>${tips}</defs><rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${r.palette.paper}"/>${out.join('')}</svg>`;
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

  return { KINDS, WIRE_KINDS, COLORS, SYMBOLS, FS, G, palette, words, measure, wrap, textW, classify, layout, ensure, route, resolve, render, fromGraph, toMermaid, fromMermaid, starter, glyph };
})();
