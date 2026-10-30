// The edits contract's base check (bible/04-edits-contract.md: "replay refuses on mismatch"):
// an edits file belongs to ONE edition of ONE document, named by baseHash (sha256 of the document JSON text,
// line endings normalised to \n, as engine/build-editor.mjs hashes it) and by `locale`.
import crypto from 'node:crypto';
import path from 'node:path';

export const hashOf = (rawText) => `sha256:${crypto.createHash('sha256').update(String(rawText).replace(/\r\n/g, '\n')).digest('hex')}`;

/** The edition a document file is: the .ar.json / .en.json name when it has one, else the script of its title; '' when unknown. */
export function editionOfFile(file, doc) {
  if (/\.en\.json$/i.test(file)) return 'en';
  if (/\.ar\.json$/i.test(file)) return 'ar';
  const t = doc?.control?.title || '';
  return /[؀-ۿ]/.test(t) ? 'ar' : t ? 'en' : '';
}

/**
 * Throws when `edits` (already migrated) was made for another document or another edition than `rawText` (the file's text).
 * An empty baseHash (hand-written or pre-contract edits) is not checked; `force` skips both checks on purpose.
 * `bare` = the edits file was a bare op array (no locale of its own): the edition is not checked.
 */
export function assertBase({ file, rawText, doc, edits, bare = false, force = false }) {
  if (force) return;
  const name = path.basename(file);
  if (edits.baseHash && edits.baseHash !== hashOf(rawText)) throw new Error(`edits do not belong to this document: baseHash ${edits.baseHash.slice(0, 19)}… differs from ${name} (${hashOf(rawText).slice(0, 19)}…); pass force: true only if you mean it`);
  const ed = editionOfFile(file, doc);
  if (!bare && ed && edits.locale && edits.locale !== ed) throw new Error(`edition mismatch: the edits are for "${edits.locale}", ${name} is the "${ed}" edition; pass force: true only if you mean it`);
}
