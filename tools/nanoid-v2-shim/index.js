// nanoid 2 call shape (`require('nanoid')(size)`), used only by hunspell-asm for a temp file name.
// Replaces nanoid 2.1.11 (CVE-2024-55565 and later advisories): crypto random, integer size only.
'use strict';
const A = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
module.exports = function nanoid(size) {
  const n = Number.isInteger(size) && size > 0 && size <= 256 ? size : 21;
  const b = globalThis.crypto.getRandomValues(new Uint8Array(n));
  let id = '';
  for (let i = 0; i < n; i++) id += A[b[i] & 63];
  return id;
};
