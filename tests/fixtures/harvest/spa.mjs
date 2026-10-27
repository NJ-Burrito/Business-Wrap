// Invented test fixture: a single-page e-service in the style of an Angular + PrimeNG portal.
// Nothing renders at load (it arrives after a delay, like an SPA fetching its data); the form sits
// behind a terms checkbox and a Continue button; controls have no id and no name, only
// formcontrolname on their wrappers; labels are sibling <label>s with an asterisk; required controls
// start ng-invalid; dropdowns and multiselects keep their options in an overlay opened on click.
// 0.8.1: a header language switcher (choosing an option switches the page language), a card made of
// divs, a PrimeNG panel and tabs; an asterisk drawn by CSS ::after; a field the site only names in its
// validation summary; a file whose label sits after it inside a captioned panel; a hidden captcha field.
import fs from 'node:fs';
import path from 'node:path';

const T = {
  en: {
    title: 'Venue hire request', intro: 'Book a community venue for an event.', facts: [['Fee', 'Free'], ['Time to answer', '3 working days']],
    terms: 'I accept the terms of use', go: 'Continue', section: 'Request', start: 'Apply',
    name: 'Organiser name', purpose: 'Purpose', purposes: ['Meeting', 'Workshop', 'Celebration'], guests: 'Guest groups', groups: ['Adults', 'Children'],
    date: 'Event date', kind: 'Booking type', kinds: ['Once', 'Weekly'], weeks: 'Number of weeks', notes: 'Notes', plan: 'Floor plan',
    ref: 'Reference number', refMsg: 'Reference number: this field is required', caption: 'Supporting files', about: 'About the service', steps: 'Steps', stepsList: ['Fill in the form', 'Attach the floor plan', 'Send'], langs: ['English', 'العربية'], lang: 'Language',
    send: 'Send', req: 'This field is required', done: 'Request received', statuses: ['Submitted', 'Under review', 'Approved', 'Rejected'],
  },
  ar: {
    title: 'طلب حجز قاعة', intro: 'احجز قاعة مجتمعية لفعالية.', facts: [['الرسوم', 'مجاناً'], ['مدة الرد', '3 أيام عمل']],
    terms: 'أوافق على شروط الاستخدام', go: 'متابعة', section: 'الطلب', start: 'تقديم',
    name: 'اسم المنظم', purpose: 'الغرض', purposes: ['اجتماع', 'ورشة عمل', 'احتفال'], guests: 'فئات الضيوف', groups: ['بالغون', 'أطفال'],
    date: 'تاريخ الفعالية', kind: 'نوع الحجز', kinds: ['مرة واحدة', 'أسبوعي'], weeks: 'عدد الأسابيع', notes: 'ملاحظات', plan: 'مخطط القاعة',
    ref: 'الرقم المرجعي', refMsg: 'الرقم المرجعي: هذا الحقل مطلوب', caption: 'الملفات الداعمة', about: 'عن الخدمة', steps: 'الخطوات', stepsList: ['تعبئة النموذج', 'إرفاق مخطط القاعة', 'الإرسال'], langs: ['English', 'العربية'], lang: 'اللغة',
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
label.req::after{content:' *';color:#b00}
.g-recaptcha textarea{display:none}
</style></head><body><header role="banner"><span>${l === 'ar' ? 'بوابة' : 'Portal'}</span> <p-dropdown class="lang-switch"><div class="p-dropdown" role="combobox" tabindex="0" aria-label="${x.lang}"><span class="p-dropdown-label">${l === 'ar' ? 'العربية' : 'English'}</span></div></p-dropdown></header><app-root></app-root>
<script>
const X = ${JSON.stringify(x)};
const root = document.querySelector('app-root');
const h = (s) => { const d = document.createElement('div'); d.innerHTML = s.trim(); return d.firstElementChild; };
function field(ctrl, label, inner, required) {
  return '<div class="p-field col-12"><label>' + label + (required ? ' <span class="required">*</span>' : '') + '</label><div formcontrolname="' + ctrl + '" class="' + (required ? 'ng-invalid' : 'ng-valid') + '" data-req="' + (required ? 1 : 0) + '">' + inner + '</div><small class="p-error hidden">' + X.req + '</small></div>';
}
const dropdown = (opts) => '<p-dropdown><div class="p-dropdown" role="combobox" tabindex="0"><span class="p-dropdown-label">—</span></div></p-dropdown>';
const multiselect = () => '<p-multiselect><div class="p-multiselect" role="combobox" tabindex="0"><span class="p-multiselect-label">—</span></div></p-multiselect>';
document.querySelector('.lang-switch .p-dropdown').onclick = (e) => {
  document.querySelectorAll('.p-overlay').forEach((o) => o.remove());
  const r = e.currentTarget.getBoundingClientRect();
  const o = h('<div class="p-overlay"><ul>' + X.langs.map((t) => '<li class="p-dropdown-item" role="option">' + t + '</li>').join('') + '</ul></div>');
  o.style.left = r.left + 'px'; o.style.top = (r.bottom + window.scrollY) + 'px';
  document.body.appendChild(o);
  o.querySelectorAll('li').forEach((li, i) => li.onclick = () => { location.href = '../' + (i === 0 ? 'en' : 'ar') + '/index.html'; });
};
function card() {
  root.innerHTML = '<main><h1>' + X.title + '</h1><div class="info">' + X.facts.map(([k, v]) => '<div class="info-item"><span class="info-label">' + k + '</span><span class="info-value">' + v + '</span></div>').join('') + '</div>'
    + '<div class="p-panel"><div class="p-panel-header"><span class="p-panel-title">' + X.about + '</span></div><div class="p-panel-content"><div class="description">' + X.intro + '</div></div></div>'
    + '<div class="p-tabview"><ul class="p-tabview-nav"><li>' + X.steps + '</li></ul><div class="p-tabview-panel"><ul>' + X.stepsList.map((t) => '<li>' + t + '</li>').join('') + '</ul></div></div><button type="button" id="start">' + X.start + '</button></main>';
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
    + field('eventDate', X.date, '<p-calendar><span class="p-calendar"><input type="text" class="p-inputtext" placeholder="dd/mm/yyyy"></span></p-calendar>', true).replace('<label>' + X.date + ' <span class="required">*</span></label>', '<label class="req">' + X.date + '</label>')
    + '<div class="p-field col-12"><label>' + X.ref + '</label><div formcontrolname="ref" class="ng-valid"><input type="text" class="p-inputtext"></div></div>'
    + '<div class="p-field col-12"><label>' + X.kind + ' <span class="required">*</span></label><div class="p-field">'
    + X.kinds.map((k, i) => '<p-radiobutton formcontrolname="kind" value="' + i + '"><div class="p-radiobutton"><div class="p-radiobutton-box"></div></div></p-radiobutton><label>' + k + '</label>').join('') + '</div></div>'
    + '<div class="weeks hidden">' + field('weeks', X.weeks, '<input type="number" class="p-inputtext">', false) + '</div>'
    + field('notes', X.notes, '<textarea class="p-inputtextarea"></textarea>', false)
    + '<div class="p-panel"><div class="p-panel-header"><label class="p-panel-title">' + X.caption + '</label></div><div class="p-panel-content"><div formcontrolname="plan" class="ng-invalid" data-req="1"><p-fileupload><input type="file" accept=".pdf,image/*"></p-fileupload><label>' + X.plan + ' *</label></div><small class="p-error hidden">' + X.req + '</small></div></div>'
    + '<div class="g-recaptcha"><textarea name="g-recaptcha-response" id="g-recaptcha-response"></textarea></div><div role="alert" class="summary hidden"></div>'
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
    const ref = root.querySelector('[formcontrolname="ref"] input');
    const sum = root.querySelector('.summary');
    sum.textContent = ref.value ? '' : X.refMsg;
    sum.classList.toggle('hidden', !!ref.value);
    root.querySelectorAll('.p-error').forEach((m) => m.classList.add('hidden'));
    bad.forEach((w) => w.parentElement.querySelector('.p-error').classList.remove('hidden'));
    if (bad.length || state.kind === undefined || !ref.value) return;
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
