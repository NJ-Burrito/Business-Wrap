// The sources_* MCP tools (registered by mcp/server.mjs): the Claude pass over the Sources tab. Local files only.
// Claude lists the sources, reads a source's lines and candidate facts (and, for a picture or a screen recording, the image
// files to look at), then writes back cleaned lines and/or facts; a person still accepts or rejects each fact in the tab.
import { listJobs, getJob, previews, saveLines, claudeFacts, sourceFile, sceneFramesOcr, VIDEO, evidence } from './jobs.mjs';

const need = (id) => { const j = getJob(id); if (!j) throw new Error(`no such source: ${id}`); return j; };

export function registerSourcesTools(server, z, guard) {
  const RO = { readOnlyHint: true, openWorldHint: false };
  const W = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool('sources_list', {
    title: 'List the sources',
    description: 'The sources added in the Sources tab (meetings, documents, web pages, images, apps, tool folders): id, kind, name, state, stage, and whether the Claude pass already ran.',
    inputSchema: {},
    annotations: RO,
  }, guard(() => ({ sources: listJobs().map((j) => ({ id: j.id, kind: j.kind, name: j.name, state: j.state, stage: j.stage || null, claude: j.claude || null, created: j.created })) })));

  server.registerTool('sources_get', {
    title: 'Read one source',
    description: 'One source for the Claude pass: its job, a page of its readable lines (the person\'s edited copy when there is one), its candidate facts, and the file to look at for an image (read it as a picture). For a screen recording call sources_frames. Correct transcription errors and terms, drop noise, then call sources_write.',
    inputSchema: {
      id: z.string().describe('Source id from sources_list'),
      offset: z.number().int().min(0).optional().describe('First line (default 0)'),
      limit: z.number().int().min(1).max(2000).optional().describe('Lines per page (default 400)'),
    },
    annotations: RO,
  }, guard(({ id, offset = 0, limit = 400 }) => {
    const job = need(id), p = previews(id), file = sourceFile(id);
    return { job, lines_total: p.lines.length, offset, lines: p.lines.slice(offset, offset + limit).map((l, i) => ({ i: offset + i, ...l })), edited: p.edited,
      facts: p.facts, speakers: p.speakers, ...(job.kind === 'image' ? { image: file } : {}), ...(file && VIDEO.test(file) ? { video: file, frames_hint: 'call sources_frames' } : {}) };
  }));

  server.registerTool('sources_frames', {
    title: 'Scene frames of a screen recording',
    description: 'Extract one PNG per scene change (plus the first frame) from a video source with the local ffmpeg; returns the files with their times and the text a local OCR found in each (text: [{text, low?, alt?}]; low = doubtful, alt = a second reading that kept digits the first lost). Read each picture and write what it shows (screens, fields, buttons, messages) as lines or facts with sources_write, loc = the time.',
    inputSchema: {
      id: z.string().describe('Source id (a video)'),
      threshold: z.number().min(0.05).max(0.9).optional().describe('Scene-change sensitivity, lower = more frames (default 0.3)'),
      max: z.number().int().min(1).max(200).optional().describe('At most this many frames (default 40)'),
    },
    annotations: W,
  }, guard(async ({ id, threshold, max }) => { need(id); return { frames: await sceneFramesOcr(id, { threshold, max }) }; }));

  server.registerTool('sources_write', {
    title: 'Write the Claude pass back',
    description: 'Write cleaned lines and/or facts for one source. lines (the whole list, same shape as sources_get: text, loc, who?, deleted?, orig? = the text before the correction) replace the preview and rebuild the candidate facts; facts (the whole list: text, kind, loc?, who?, confidence 0..1?, note?, id? = the candidate it refines) then replace the facts. A person\'s accepted / rejected decision on a fact id is kept. Never invent: every fact must come from the source.',
    inputSchema: {
      id: z.string().describe('Source id'),
      lines: z.array(z.object({ text: z.string(), loc: z.string().optional(), who: z.string().optional(), deleted: z.boolean().optional(), orig: z.string().optional(), low: z.boolean().optional(), alt: z.string().optional() })).optional(),
      facts: z.array(z.object({ id: z.string().optional(), text: z.string(), kind: z.enum(['requirement', 'decision', 'question', 'statement', 'rule', 'actor', 'step', 'field', 'term']),
        loc: z.string().optional(), who: z.string().optional(), confidence: z.number().optional(), confidence_basis: z.string().optional(), note: z.string().optional(),
        corroborated_by: z.array(z.string()).optional(), conflicts_with: z.array(z.string()).optional() })).optional(),
    },
    annotations: W,
  }, guard(({ id, lines, facts }) => {
    need(id);
    if (!lines && !facts) throw new Error('give lines, facts or both');
    if (lines) saveLines(id, lines);
    const n = facts ? claudeFacts(id, facts) : previews(id).facts.length;
    return { ok: true, lines: lines ? lines.length : undefined, facts: n };
  }));

  server.registerTool('sources_evidence', {
    title: 'Hand the accepted facts to the document',
    description: 'Stage 6: every fact the user accepted or edited, from the named sources (all when none), as one evidence pack (also written to Sources\\02-evidence.json) with counts per kind and how many candidates still wait for review. Put the facts into the open document with editor_ops, each where it belongs (requirements, decisions, open questions …), and keep the source and location of each. Never add a fact the user has not accepted.',
    inputSchema: { ids: z.array(z.string()).optional().describe('Source ids (default: every source)') },
    annotations: W,
  }, guard(({ ids }) => evidence(ids)));
}
