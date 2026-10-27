// Invented test fixture: a single-page e-service in the style of an Angular + PrimeNG portal.
// Nothing renders at load (it arrives after a delay, like an SPA fetching its data); the form sits
// behind a terms checkbox and a Continue button; controls have no id and no name, only
// formcontrolname on their wrappers; labels are sibling <label>s with an asterisk; required controls
// start ng-invalid; dropdowns and multiselects keep their options in an overlay opened on click.
import fs from 'node:fs';
import path from 'node:path';

const T = {
  en: {
    title: 'Venue hire request', intro: 'Book a community venue for an event.', facts: [['Fee', 'Free'], ['Time to answer', '3 working days']],
    terms: 'I accept the terms of use', go: 'Continue', section: 'Request', start: 'Apply',
    name: 'Organiser name', purpose: 'Purpose', purposes: ['Meeting', 'Workshop', 'Celebration'], guests: 'Guest groups', groups: ['Adults', 'Children'],
    date: 'Event date', kind: 'Booking type', kinds: ['Once', 'Weekly'], weeks: 'Number of weeks', notes: 'Notes', plan: 'Floor plan',
    send: 'Send', req: 'This field is required', done: 'Request received', statuses: ['Submitted', 'Under review', 'Approved', 'Rejected'],
  },
  ar: {
    title: 'طلب حجز قاعة', intro: 'احجز قاعة مجتمعية لفعالية.', facts: [['الرسوم', 'مجاناً'], ['مدة الرد', '3 أيام عمل']],
    terms: 'أوافق على شروط الاستخدام', go: 'متابعة', section: 'الطلب', start: 'تقديم',
    name: 'اسم المنظم', purpose: 'الغرض', purposes: ['اجتماع', 'ورشة عمل', 'احتفال'], guests: 'فئات الضيوف', groups: ['بالغون', 'أطفال'],
    date: 'تاريخ الفعالية', kind: 'نوع الحجز', kinds: ['مرة واحدة', 'أسبوعي'], weeks: 'عدد الأسابيع', notes: 'ملاحظات', plan: 'مخطط القاعة',
    send: 'إرسال', req: 'هذا الحقل مطلوب', done: 'تم استلام الطلب', statuses: ['مقدم', 'قيد المراجعة', 'مقبول', 'مرفوض'],
  },
};

const page = (l) => {
  const x = T[l];
  return `<!doctype html><html lang="${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${x.title}</title>
<style>
.p-dropdown,.p-multiselect{border:1px solid #888;min-width:220px;padding:4px;cursor:pointer;display:inline-block}
.p-overlay{position:absolute;background:#fff;border:1px solid #444;z-index:9}
.p-error{color:#b00;display:block}.hidden{display:none}
.p-checkbox-box,.p-radiobutton-box{display:inline-block;width:14px;height:14px;border:1px solid #333;cursor:pointer}
.p-highlight{background:#333}
</style></head><body><app-root></app-root>
<script>
const X = ${JSON.stringify(x)};
const root = document.querySelector('app-root');
const h = (s) => { const d = document.createElement('div'); d.innerHTML = s.trim(); return d.firstElementChild; };
function field(ctrl, label, inner, required) {
  return '<div class="p-field col-12"><label>' + label + (required ? ' <span class="required">*</span>' : '') + '</label><div formcontrolname="' + ctrl + '" class="' + (required ? 'ng-invalid' : 'ng-valid') + '" data-req="' + (required ? 1 : 0) + '">' + inner + '</div><small class="p-error hidden">' + X.req + '</small></div>';
}
const dropdown = (opts) => '<p-dropdown><div class="p-dropdown" role="combobox" tabindex="0"><span class="p-dropdown-label">—</span></div></p-dropdown>';
const multiselect = () => '<p-multiselect><div class="p-multiselect" role="combobox" tabindex="0"><span class="p-multiselect-label">—</span></div></p-multiselect>';
function card() {
  root.innerHTML = '<main><h1>' + X.title + '</h1><p>' + X.intro + '</p><dl>' + X.facts.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl><button type="button" id="start">' + X.start + '</button></main>';
  document.getElementById('start').onclick = terms;
}
function terms() {
  root.innerHTML = '<main><p-checkbox><div class="p-checkbox"><div class="p-checkbox-box" role="checkbox" aria-checked="false" tabindex="0"></div></div><label>' + X.terms + '</label></p-checkbox> <button type="button" class="go" disabled>' + X.go + '</button></main>';
  const box = root.querySelector('.p-checkbox-box');
  const go = root.querySelector('.go');
  const tick = () => { const on = box.getAttribute('aria-checked') !== 'true'; box.setAttribute('aria-checked', String(on)); box.classList.toggle('p-highlight', on); go.disabled = !on; };
  box.onclick = tick;
  box.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tick(); } };
  go.onclick = () => { root.innerHTML = '<main><p>…</p></main>'; setTimeout(form, 700); };
}
function form() {
  root.innerHTML = '<main><form novalidate><fieldset><legend>' + X.section + '</legend>'
    + field('organiser', X.name, '<input type="text" class="p-inputtext">', true)
    + field('purpose', X.purpose, dropdown(), true)
    + field('guests', X.guests, multiselect(), false)
    + field('eventDate', X.date, '<p-calendar><span class="p-calendar"><input type="text" class="p-inputtext" placeholder="dd/mm/yyyy"></span></p-calendar>', true)
    + '<div class="p-field col-12"><label>' + X.kind + ' <span class="required">*</span></label><div class="p-field">'
    + X.kinds.map((k, i) => '<p-radiobutton formcontrolname="kind" value="' + i + '"><div class="p-radiobutton"><div class="p-radiobutton-box"></div></div></p-radiobutton><label>' + k + '</label>').join('') + '</div></div>'
    + '<div class="weeks hidden">' + field('weeks', X.weeks, '<input type="number" class="p-inputtext">', false) + '</div>'
    + field('notes', X.notes, '<textarea class="p-inputtextarea"></textarea>', false)
    + field('plan', X.plan, '<input type="file" accept=".pdf,image/*">', true)
    + '</fieldset><button type="submit">' + X.send + '</button></form></main>';
  const state = {};
  const mark = (ctrl, ok) => { const w = root.querySelector('[formcontrolname="' + ctrl + '"]'); if (!w) return; w.classList.toggle('ng-invalid', !ok && w.dataset.req === '1'); w.classList.toggle('ng-valid', ok || w.dataset.req !== '1'); };
  root.querySelectorAll('[formcontrolname] input, [formcontrolname] textarea').forEach((i) => i.addEventListener('input', () => mark(i.closest('[formcontrolname]').getAttribute('formcontrolname'), !!i.value)));
  root.querySelector('input[type=file]').addEventListener('change', () => mark('plan', true));
  const overlay = (host, opts, multi, ctrl) => {
    document.querySelectorAll('.p-overlay').forEach((o) => o.remove());
    const r = host.getBoundingClientRect();
    const o = h('<div class="p-overlay"><ul>' + opts.map((t) => '<li class="' + (multi ? 'p-multiselect-item' : 'p-dropdown-item') + '" role="option">' + t + '</li>').join('') + '</ul></div>');
    o.style.left = r.left + 'px'; o.style.top = (r.bottom + window.scrollY) + 'px';
    document.body.appendChild(o);
    o.querySelectorAll('li').forEach((li) => li.onclick = () => { host.querySelector('span').textContent = li.textContent; state[ctrl] = li.textContent; mark(ctrl, true); if (!multi) o.remove(); });
  };
  root.querySelector('.p-dropdown').onclick = (e) => overlay(e.currentTarget, X.purposes, false, 'purpose');
  root.querySelector('.p-multiselect').onclick = (e) => overlay(e.currentTarget, X.groups, true, 'guests');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.p-overlay').forEach((o) => o.remove()); });
  root.querySelectorAll('p-radiobutton').forEach((rb) => rb.querySelector('.p-radiobutton-box').onclick = () => {
    root.querySelectorAll('p-radiobutton .p-radiobutton-box').forEach((b) => b.classList.remove('p-highlight'));
    rb.querySelector('.p-radiobutton-box').classList.add('p-highlight');
    root.querySelector('.weeks').classList.toggle('hidden', rb.getAttribute('value') !== '1');
    state.kind = rb.getAttribute('value');
  });
  root.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const bad = [...root.querySelectorAll('[formcontrolname].ng-invalid')];
    root.querySelectorAll('.p-error').forEach((m) => m.classList.add('hidden'));
    bad.forEach((w) => w.parentElement.querySelector('.p-error').classList.remove('hidden'));
    if (bad.length || state.kind === undefined) return;
    root.innerHTML = '<main><h1>' + X.done + '</h1><ul class="statuses">' + X.statuses.map((s) => '<li>' + s + '</li>').join('') + '</ul></main>';
  };
}
setTimeout(card, 900);
</script></body></html>`;
};

export function buildSpa(dir) {
  fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'ar'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /private/\n');
  for (const l of ['en', 'ar']) fs.writeFileSync(path.join(dir, l, 'index.html'), page(l));
  return dir;
}
