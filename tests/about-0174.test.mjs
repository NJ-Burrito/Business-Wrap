// lane about: Settings > About looks like the other Settings tabs. Owner (2026-11-04): "the odd colouring in the About, not like the other tabs."
// About must use the same card surface (background, shadow ring), heading colour, label (dt) colour, value (dd) colour and type as another tab, in light and dark, AR and EN: no special band.
// Set BW_SHOT_DIR to also write a screenshot of the Settings drawer per theme / language.
//
//   node tests/about-0174.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { launch, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';
import { suite } from './_harness.mjs';

const S = suite("about-0174");
const { check, results } = S;
const tmp = tmpDir('bw-about174-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const editor = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });
const browser = await launch();
try {
  const server = await serve(editor, 0, { workspace: null });
  const port = server.address().port;
  for (const dark of [false, true]) for (const ui of ['en', 'ar']) {
    const tag = `${dark ? 'dark' : 'light'}/${ui}`;
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1500 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(({ u, d }) => { try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:calm', '1'); } catch { /* none */ } }, { u: ui, d: dark });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.BW?.ready);
    await sleep(600);
    await page.evaluate(() => window.BW.openDrawer('settings'));
    await until(() => shRoot(page, (r) => !!r.querySelector('.drawer .set-about')), 6000);
    await sleep(700);
    const m = await shRoot(page, (r) => {
      const d = r.querySelector('.drawer');
      const cs = (e, p) => getComputedStyle(e)[p];
      const side = (card) => ({
        bg: cs(card, 'backgroundColor'), bgImage: cs(card, 'backgroundImage'), shadow: cs(card, 'boxShadow'), radius: cs(card, 'borderRadius'), pad: cs(card, 'padding'), color: cs(card, 'color'),
        h: cs(card.querySelector('.set-h'), 'color'), hFont: cs(card.querySelector('.set-h'), 'fontFamily') + '|' + cs(card.querySelector('.set-h'), 'fontSize') + '|' + cs(card.querySelector('.set-h'), 'fontWeight'),
        chip: cs(card.querySelector('.set-h .i'), 'backgroundColor'), chipInk: cs(card.querySelector('.set-h .i'), 'color'),
        dt: card.querySelector('dt') ? cs(card.querySelector('dt'), 'color') : null, dd: card.querySelector('dd') ? cs(card.querySelector('dd'), 'color') : null,
      });
      return { about: side(d.querySelector('.set-about')), upd: side(d.querySelector('.set-upd')), prefs: side(d.querySelector('.set-prefs')), ver: cs(d.querySelector('.set-about .set-ver'), 'backgroundColor'), name: cs(d.querySelector('.set-about .set-name'), 'color'), link: cs(d.querySelector('.set-about .set-dl a'), 'color') };
    });
    for (const k of ['bg', 'bgImage', 'shadow', 'radius', 'pad', 'color', 'h', 'hFont', 'chip', 'chipInk']) check(`${tag}: About ${k} equals the Update tab's`, m.about[k] === m.upd[k] && m.about[k] === m.prefs[k], JSON.stringify([m.about[k], m.upd[k], m.prefs[k]]));
    check(`${tag}: About's label and value colours equal the Update tab's (dt ${m.about.dt}, dd ${m.about.dd})`, m.about.dt && m.about.dt === m.upd.dt && m.about.dd === m.upd.dd, JSON.stringify([m.about, m.upd]));
    check(`${tag}: About's name uses the card heading colour, not a light-on-navy ink`, m.name === m.about.h || m.name === m.about.dd, JSON.stringify([m.name, m.about.h, m.about.dd]));
    // every Settings group (built-in and extension cards) against Preferences: same card, title ink and weight, icon tile; a chevron; its own icon
    const g = await shRoot(page, (r) => {
      const cs = (e, p) => getComputedStyle(e)[p];
      return [...r.querySelectorAll('.drawer .set .card')].map((c) => {
        const h = c.querySelector('.set-h') || c.querySelector('h3'); const chip = h?.querySelector('.i');
        return { cls: c.className.split(/\s+/).filter((n) => !['card', 'set-c', 'pgrp'].includes(n)).join(' '), isSet: c.classList.contains('set-c') && !!c.querySelector('.set-h'), bg: cs(c, 'backgroundColor'), shadow: cs(c, 'boxShadow'), radius: cs(c, 'borderRadius'), h: h && cs(h, 'color'), font: h && cs(h, 'fontFamily') + '|' + cs(h, 'fontSize') + '|' + cs(h, 'fontWeight'), chip: chip && cs(chip, 'backgroundColor'), chipInk: chip && cs(chip, 'color'), chipSize: chip && cs(chip, 'width'), icon: chip?.querySelector('svg')?.getAttribute('data-ic') || null, chev: !!c.querySelector('summary') };
      });
    });
    const ref = g.find((x) => x.cls.startsWith('set-prefs'));
    check(`${tag}: Settings has at least 9 groups, all built as one card (${g.length})`, g.length >= 9 && g.every((x) => x.isSet), JSON.stringify(g.map((x) => [x.cls, x.isSet])));
    for (const x of g) {
      const diff = ['bg', 'shadow', 'radius', 'h', 'font', 'chip', 'chipInk', 'chipSize'].filter((k) => x[k] !== ref[k]);
      check(`${tag}: group «${x.cls}» has Preferences' card background, title colour and weight and icon tile`, diff.length === 0, diff.map((k) => `${k}: ${x[k]} vs ${ref[k]}`).join('; '));
      check(`${tag}: group «${x.cls}» has a chevron summary and an icon of its own`, x.chev && !!x.icon && (x.icon !== 'prefs' || x.cls.startsWith('set-prefs')) && g.filter((y) => y.icon === x.icon).length === 1, `${x.icon} ${x.chev}`);
    }
    check(`${tag}: no page error`, errors.length === 0, errors.join(' | '));
    if (process.env.BW_SHOT_DIR) { fs.mkdirSync(process.env.BW_SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.BW_SHOT_DIR, `about-${dark ? 'dark' : 'light'}-${ui}.png`) }); }
    await ctx.close();
  }
  await new Promise((ok) => server.close(ok));
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
S.finish();
