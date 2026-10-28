// The learning_* MCP tools (registered by mcp/server.mjs). Local files only, no network.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './store.mjs';
import { rulesMarkdown } from './core.mjs';

export function registerLearningTools(server, z, guard) {
  const local = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool('learning_rules', {
    title: 'Learned rules (read before generating)',
    description: 'The rules this machine learned from the user\'s own edits, notes and exports (promoted lessons, AR + EN). Read them before harvesting, authoring or generating and apply them; tell the user in one line which learned rules were applied. Stays on this machine.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(() => { const r = L.rules(); return { ...L.status(), rules: r, markdown: rulesMarkdown(r) }; }));

  server.registerTool('learning_distill', {
    title: 'Distil the learning journal',
    description: 'Group the local journal (edits, notes, exports, undos) into lessons; auto-promote a lesson with ≥ 3 hits and no conflict; rewrite rules.md / rules.json. Run after the user\'s edits and after an export. Deterministic, no model call.',
    inputSchema: {},
    annotations: local,
  }, guard(() => L.distill()));

  server.registerTool('learning_promote', {
    title: 'Promote a lesson to a rule',
    description: 'Promote one lesson (by id) to a rule, on the user\'s say-so.',
    inputSchema: { id: z.string().describe('Lesson id (L…)') },
    annotations: local,
  }, guard(({ id }) => L.promote(id)));

  server.registerTool('learning_retire', {
    title: 'Retire a rule',
    description: 'Retire one lesson or rule (by id): it stops applying and is never auto-promoted again.',
    inputSchema: { id: z.string().describe('Lesson id (L…)') },
    annotations: local,
  }, guard(({ id }) => L.retire(id)));

  server.registerTool('learning_conflicts', {
    title: 'Learning conflicts',
    description: 'Lessons that contradict each other: REVERSAL (A→B and B→A) or CONFLICT (A→B and A→C). Show them to the user side by side; never resolve them yourself.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(() => ({ conflicts: L.conflicts() })));

  server.registerTool('learning_export', {
    title: 'Export what was learned',
    description: 'Write the journal and the lessons as one bw-learning JSON file, to move them to another machine.',
    inputSchema: { out: z.string().describe('Output .json path') },
    annotations: local,
  }, guard(({ out }) => {
    const f = path.resolve(out);
    if (!f.toLowerCase().endsWith('.json')) throw new Error(`output must end in .json: ${out}`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const b = L.exportBundle();
    fs.writeFileSync(f, JSON.stringify(b, null, 1) + '\n', 'utf8');
    return { file: f, events: b.events.length, lessons: b.lessons.length };
  }));

  server.registerTool('learning_import', {
    title: 'Import what was learned',
    description: 'Merge a bw-learning JSON file (from learning_export or the editor) into this machine\'s journal and lessons, then distil.',
    inputSchema: { file: z.string().describe('bw-learning .json path') },
    annotations: local,
  }, guard(({ file }) => L.importBundle(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')))));

  server.registerTool('learning_forget', {
    title: 'Forget everything learned',
    description: 'Wipe the journal, lessons and rules on this machine. Only with confirm: true after the user asked for it.',
    inputSchema: { confirm: z.boolean().optional().describe('true only after the user asked to forget') },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, guard(({ confirm }) => (confirm === true ? L.forget() : { forgotten: false, needs_confirmation: true, would_remove: L.status() })));
}
