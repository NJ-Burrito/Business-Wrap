// Deterministic fixtures for the 0.15.0 render lane (no randomness, so a failure is reproducible).

/** A service-sized workflow like the experience report's service 4: 54 nodes, 79 edges (counts asserted by the test). */
export function bigWorkflow() {
  const nodes = [{ id: 'start', kind: 'start', label: 'إرسال الطلب' }];
  const edges = [];
  const link = (from, to, label) => edges.push({ id: `e${edges.length + 1}`, from, to, ...(label ? { label } : {}) });
  const kinds = ['staff', 'system', 'applicant', 'staff', 'payment'];
  let prev = 'start';
  let stage = 0;
  let stopN = 0;
  let reworkN = 0;
  // 8 phases of four stages and one decision each, then the approval end
  for (let ph = 0; ph < 8; ph += 1) {
    for (let k = 0; k < 4; k += 1) {
      const id = `s${++stage}`;
      nodes.push({ id, kind: kinds[stage % kinds.length], label: `مرحلة ${stage} مراجعة الطلب`, ...(stage % 3 === 0 ? { sub: 'خطوة تفصيلية' } : {}) });
      link(prev, id);
      prev = id;
    }
    const d = `d${ph + 1}`;
    nodes.push({ id: d, kind: 'decision', label: `قرار ${ph + 1}` });
    link(prev, d);
    const stop = `x${++stopN}`;
    nodes.push({ id: stop, kind: 'stop', label: ph % 2 ? 'ملغى' : 'مرفوض' });
    link(d, stop, 'رفض');
    if (ph % 2 === 0 && reworkN < 4) {
      const rw = `r${++reworkN}`;
      nodes.push({ id: rw, kind: 'rework', label: `استكمال ${reworkN}` });
      link(d, rw, 'نقص');
      link(rw, `s${stage - 3}`);
    }
    prev = d;
  }
  nodes.push({ id: 'end', kind: 'ok', label: 'اعتماد الطلب' });
  link(prev, 'end', 'موافقة');
  // extra hand-offs that skip a stage, to reach the report's edge density
  for (let i = 1; edges.length < 79 && i + 2 <= stage; i += 1) link(`s${i}`, `s${i + 2}`);
  return { kind: 'bw-diagram', flow: 'rtl', nodes, edges };
}
