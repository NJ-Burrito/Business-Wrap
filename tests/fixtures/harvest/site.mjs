// Invented test fixture: a tiny bilingual e-service the crawler walks end to end.
// card → login → OTP (it submits itself after a moment, standing in for the human) → form step 1
// (a select that reveals a field) → form step 2 (attachments) → sent page with the statuses.
import fs from 'node:fs';
import path from 'node:path';

const T = {
  en: {
    dir: 'ltr', title: 'Event permit', intro: 'Ask for a permit to hold a public event.', fee: 'Fee', feeV: '10 dinars', time: 'Completion time', timeV: '5 working days',
    start: 'Start the request', login: 'Sign in', user: 'User name', pass: 'Password', otp: 'One-time code', otpNote: 'Enter the code we sent you.',
    s1: 'Event details', name: 'Event name', date: 'Event date', venue: 'Venue type', indoor: 'Indoor', outdoor: 'Outdoor', permit: 'Land use permit number',
    org: 'Organiser type', person: 'Person', company: 'Company', next: 'Next', req: 'This field is required.',
    s2: 'Attachments', plan: 'Safety plan', map: 'Site map', notes: 'Notes', send: 'Send', sent: 'Request sent',
    st: ['Submitted', 'Under review', 'Approved', 'Rejected'],
  },
  ar: {
    dir: 'rtl', title: 'تصريح فعالية', intro: 'اطلب تصريحاً لإقامة فعالية عامة.', fee: 'الرسوم', feeV: '10 دنانير', time: 'مدة الإنجاز', timeV: '5 أيام عمل',
    start: 'ابدأ الطلب', login: 'تسجيل الدخول', user: 'اسم المستخدم', pass: 'كلمة المرور', otp: 'الرمز المؤقت', otpNote: 'أدخل الرمز المرسل إليك.',
    s1: 'تفاصيل الفعالية', name: 'اسم الفعالية', date: 'تاريخ الفعالية', venue: 'نوع المكان', indoor: 'داخلي', outdoor: 'خارجي', permit: 'رقم تصريح استخدام الأرض',
    org: 'نوع المنظم', person: 'فرد', company: 'شركة', next: 'التالي', req: 'هذا الحقل مطلوب.',
    s2: 'المرفقات', plan: 'خطة السلامة', map: 'مخطط الموقع', notes: 'ملاحظات', send: 'إرسال', sent: 'أُرسل الطلب',
    st: ['مقدم', 'قيد الدراسة', 'مقبول', 'مرفوض'],
  },
};
const page = (l, title, body, script = '') => `<!doctype html><html lang="${l}" dir="${T[l].dir}"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px system-ui;margin:2rem}.hide{display:none}[role=alert]{color:#a81a1f}label{display:block;margin-top:.8rem}</style></head>
<body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
const guard = (next) => `document.querySelector('form').addEventListener('submit',(e)=>{e.preventDefault();
  let ok=true;document.querySelectorAll('[role=alert]').forEach((x)=>x.remove());
  document.querySelectorAll('[required]').forEach((f)=>{const shown=f.offsetParent!==null;const empty=f.type==='radio'?!document.querySelector('input[name="'+f.name+'"]:checked'):f.type==='file'?!f.files.length:!f.value;
    if(shown&&empty){ok=false;const m=document.createElement('div');m.setAttribute('role','alert');m.textContent=(f.closest('fieldset')?.querySelector('legend')||document.querySelector('label[for="'+f.id+'"]'))?.textContent.trim()+': '+MSG;(f.closest('fieldset')||f).after(m);}});
  if(ok)location.href='${next}';});`;

export function buildSite(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /private/\n');
  for (const l of ['en', 'ar']) {
    const t = T[l];
    const d = path.join(dir, l);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), page(l, t.title, `<h1>${t.title}</h1><p>${t.intro}</p><dl><dt>${t.fee}</dt><dd>${t.feeV}</dd><dt>${t.time}</dt><dd>${t.timeV}</dd></dl><a id="start" href="login.html">${t.start}</a>`));
    fs.writeFileSync(path.join(d, 'login.html'), page(l, t.login, `<h1>${t.login}</h1><form><label for="user">${t.user}</label><input id="user" name="user" required><label for="pass">${t.pass}</label><input id="pass" name="pass" type="password" required><button type="submit">${t.login}</button></form>`,
      `document.querySelector('form').addEventListener('submit',(e)=>{e.preventDefault();if(user.value&&pass.value)location.href='otp.html';});`));
    // the stand-in for the human: the code fills itself and the page moves on after 1.5 s
    fs.writeFileSync(path.join(d, 'otp.html'), page(l, t.otp, `<h1>${t.otp}</h1><p>${t.otpNote}</p><label for="otp">${t.otp}</label><input id="otp" name="otp">`,
      `setTimeout(()=>{otp.value='123456';location.href='form1.html';},1500);`));
    fs.writeFileSync(path.join(d, 'form1.html'), page(l, t.s1, `<form novalidate><h2>${t.s1}</h2>
<label for="eventName">${t.name} *</label><input id="eventName" name="eventName" required>
<label for="eventDate">${t.date} *</label><input id="eventDate" name="eventDate" type="date" required>
<label for="venue">${t.venue}</label><select id="venue" name="venue"><option value="">-</option><option value="in">${t.indoor}</option><option value="out">${t.outdoor}</option></select>
<div id="permitBox" class="hide"><label for="permitNo">${t.permit}</label><input id="permitNo" name="permitNo"></div>
<fieldset><legend>${t.org}</legend><input type="radio" id="o1" name="org" value="person" required><label for="o1">${t.person}</label><input type="radio" id="o2" name="org" value="company"><label for="o2">${t.company}</label></fieldset>
<button type="submit">${t.next}</button></form>`,
      `const MSG=${JSON.stringify(t.req)};venue.addEventListener('change',()=>permitBox.classList.toggle('hide',venue.value!=='out'));${guard('form2.html')}`));
    fs.writeFileSync(path.join(d, 'form2.html'), page(l, t.s2, `<form novalidate><h2>${t.s2}</h2>
<label for="plan">${t.plan} *</label><input id="plan" name="plan" type="file" accept=".pdf" required>
<label for="map">${t.map}</label><input id="map" name="map" type="file" accept="image/*">
<label for="notes">${t.notes}</label><textarea id="notes" name="notes"></textarea>
<button type="submit">${t.send}</button></form>`, `const MSG=${JSON.stringify(t.req)};${guard('done.html')}`));
    fs.writeFileSync(path.join(d, 'done.html'), page(l, t.sent, `<h1>${t.sent}</h1><ul class="statuses">${t.st.map((s) => `<li>${s}</li>`).join('')}</ul>`));
  }
}
