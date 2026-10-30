// Shared test helper: import it FIRST in every suite (`import './_isolate.mjs';`). It switches on test mode
// (engine/testguard.mjs), so the suite can never read or write the owner's real save folder or the real .local/.
// tests/hygiene-0133.test.mjs checks that every suite imports it.
process.env.BW_TEST_MODE = '1';
