// stellar-polyfill.js
// Normalises browser.* (Firefox) and chrome.* (Chrome) into a single `_browser` global.
// Include this as the FIRST script in every extension page and background.

(function () {
  if (typeof globalThis._browser !== 'undefined') return;

  // Firefox exposes `browser` with native Promises; Chrome exposes `chrome` with callbacks.
  // We unify under `_browser` that always uses callbacks (lowest common denominator),
  // because our background and popup code already uses the callback style.
  globalThis._browser = (typeof browser !== 'undefined') ? browser : chrome;

  // Also make sure `chrome` is always defined (Firefox has it via compat layer in MV2,
  // but we normalise anyway).
  if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
    globalThis.chrome = browser;
  }
})();
