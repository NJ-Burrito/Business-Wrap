// Shared test helper for the 0.14 ribbon (editor/ext/25-ribbon.js, BW.EXT.ribbon). The old toolbar sections are hidden;
// a tool lives on one ribbon tab, so a click first opens that tab. The tab is read from the ribbon's own registry
// (BW.EXT.ribbon.tabs() + the panel it draws), never typed into a test. A command that is on no tab goes through the palette (Ctrl+K).
//   import { act, rbBtn, rbTabFor, rbTabs } from './_ribbon.mjs';
const HOST = '#bw-ui-host';

/** The tab id (general or contextual, whichever is drawn now) whose panel holds [data-a=action]; null if none. Leaves that tab open. */
export async function rbTabFor(page, action, d = null) {
  return page.evaluate(async ([a, dd]) => {
    const R = window.BW.EXT.ribbon; const r = document.getElementById('bw-ui-host').shadowRoot;
    const sel = `.ribbon .rb-panel [data-a="${a}"]${dd ? `[data-d="${dd}"]` : ''}`;
    const has = () => !!r.querySelector(sel);
    if (has()) return R.state.tab;
    const cur = R.state.tab;
    for (const t of R.tabs()) { R.setTab(t); await new Promise((q) => setTimeout(q, 0)); if (has()) return t; }
    R.setTab(cur); await new Promise((q) => setTimeout(q, 0));
    return null;
  }, [action, d]);
}
/** The tab ids the ribbon draws now. */
export const rbTabs = (page) => page.evaluate(() => window.BW.EXT.ribbon.tabs());

/** A locator for the ribbon button of an action, after opening the tab that holds it (the first locator even if absent). */
export async function rbBtn(page, action, d = null) {
  await rbTabFor(page, action, d);
  return page.locator(HOST).locator(`.ribbon .rb-panel [data-a="${action}"]${d ? `[data-d="${d}"]` : ''}`).first();
}
/** Run an action like a user: its ribbon tab, then the click ('hover' / 'focus' also allowed); the palette when it is not on the ribbon. */
export async function act(page, action, { how = 'click', d = null, timeout = 8000 } = {}) {
  const tab = await rbTabFor(page, action, d);
  if (tab) {
    const b = page.locator(HOST).locator(`.ribbon .rb-panel [data-a="${action}"]${d ? `[data-d="${d}"]` : ''}`).first();
      return b[how]({ timeout });
  }
  await page.keyboard.press('Control+K');
  const row = page.locator(HOST).locator(`#cmdlist [data-cmd="${action}"]`).first();
  if (await row.waitFor({ timeout: Math.min(timeout, 1500) }).then(() => true, () => false)) return row.click({ timeout });
  await page.keyboard.press('Escape');
  // a core action (no ribbon button, no palette row), e.g. the 0.13 «view» popover: run it as the toolbar's click handler does
  return page.evaluate((a) => { const r = document.getElementById('bw-ui-host').shadowRoot; const tw = r.querySelector(`.island button[data-a="${a}"]`); if (tw) tw.click(); else window.BW.runAction(a); }, action);
}

/** Which of `ids` have a button on SOME ribbon tab drawn now (walks the tabs; restores the open one). */
export function rbHas(page, ids) {
  return page.evaluate(async (list) => {
    const R = window.BW.EXT.ribbon; const r = document.getElementById('bw-ui-host').shadowRoot; const cur = R.state.tab; const seen = new Set();
    for (const t of R.tabs()) { R.setTab(t); await new Promise((q) => setTimeout(q, 0)); r.querySelectorAll('.ribbon .rb-panel [data-a]').forEach((b) => seen.add(b.dataset.a)); }
    R.setTab(cur); await new Promise((q) => setTimeout(q, 0));
    return list.filter((a) => seen.has(a));
  }, ids);
}
